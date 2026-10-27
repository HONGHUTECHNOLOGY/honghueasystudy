import { app, dialog, clipboard, shell } from 'electron';
import { gt, rcompare } from 'semver';
import { Logger } from '../logger';
import { join, dirname } from 'path';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rm, rmSync, statSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { downloadFile, getCurrentWebContents, moveWindowToTop, unzip } from '../utils';
import { HonghuApi, UpdateInformationResource } from '@honghu-desktop/common';

const logger = Logger('updater');

export interface UpdateCheckResult {
	/** 是否成功完成检测（false 表示网络/解析失败，不能据此判断版本高低） */
	ok: boolean;
	/** 当前运行的版本 */
	current: string;
	/** 远程清单里的最新版本号（无新版本时即当前版本） */
	latest?: string;
	hasUpdate: boolean;
	error?: 'network' | 'unknown';
}

/**
 * 从版本清单里挑出比当前版本更高的最新一条。
 *
 * 原实现用 versions.find(...) 取「第一个」更高的版本，
 * 清单若不是严格升序（手工追加时很容易乱序）就会漏掉真正的最新版，
 * 这里改为取最大值。
 */
function pickNewest(current: string, versions: UpdateInformationResource[]): UpdateInformationResource | undefined {
	const newer = (versions || []).filter((v) => {
		if (!v || typeof v.tag !== 'string') return false;
		try {
			return gt(v.tag, current);
		} catch {
			// 非法 semver 直接忽略，不能让一条脏数据让整个检测失效
			return false;
		}
	});
	newer.sort((a, b) => {
		try {
			return rcompare(a.tag, b.tag);
		} catch {
			return 0;
		}
	});
	return newer[0];
}

/**
 * 更新残留清理：上次成功更新留下的 app-old-*（约 77MB）与 pending-update 临时目录。
 *
 * 只在新版本已经跑起来之后（即本次启动）清理，因此不会影响回滚：
 * 若上次替换失败，app 目录仍是旧的，此时残留的 app-old-* 反而可能是唯一可用副本，
 * 所以这里只在 app-old-* 目录存在且当前 app 目录结构完整时才删。
 */
export function cleanupUpdateResidue() {
	if (!app.isPackaged) return;
	try {
		const appPath = app.getAppPath();
		// 当前程序目录不完整时（例如上次替换后启动失败），备份目录可能是唯一可用副本，一律不删
		if (!existsSync(join(appPath, 'package.json')) || !existsSync(join(appPath, 'lib'))) {
			logger.warn('当前程序目录结构不完整，跳过更新残留清理');
			return;
		}
		const parent = dirname(appPath);
		const pending = join(parent, 'pending-update');
		rm(pending, { recursive: true, force: true }, () => {});
		for (const name of readdirSync(parent)) {
			if (!name.startsWith('app-old-')) continue;
			rm(join(parent, name), { recursive: true, force: true }, (err) => {
				if (err) logger.warn('清理旧版本目录失败', name, err);
				else logger.info('已清理旧版本目录', name);
			});
		}
	} catch (e) {
		logger.warn('清理更新残留失败', e);
	}
}

/**
 * 检测更新。
 *
 * @param manual 用户手动触发：失败时不再静默，由调用方直接把结果展示给用户
 */
export async function checkUpdate(manual = false): Promise<UpdateCheckResult> {
	const current = app.getVersion();

	// 启动时顺手清理上次更新留下的残留，不阻塞检测
	cleanupUpdateResidue();

	const infos = await HonghuApi.getInfosSafe().catch(() => null);
	if (!infos) {
		logger.warn('检测更新失败：远程配置拉取失败');
		return { ok: false, current, hasUpdate: false, error: 'network' };
	}

	const versions = infos.versions || [];
	const newest = pickNewest(current, versions);

	logger.info('检测更新', { current, count: versions.length, newest: newest?.tag, manual });

	if (newest) {
		moveWindowToTop();
		getCurrentWebContents().send('detect-new-app-version', newest);
	}

	return { ok: true, current, latest: newest?.tag || current, hasUpdate: !!newest };
}

/** 启动时静默检测，保持原有行为 */
export async function updater() {
	await checkUpdate(false);
}

/** 流式计算文件 SHA256（更新包 40–60MB，避免整读进内存） */
function sha256File(file: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const hash = createHash('sha256');
		createReadStream(file)
			.on('data', (chunk) => hash.update(chunk))
			.on('end', () => resolve(hash.digest('hex')))
			.on('error', reject);
	});
}

function describeFsError(e: any): string {
	const code = e?.code;
	if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'ENOTEMPTY') {
		return '程序目录被占用或没有写入权限。请先关闭所有浏览器窗口和正在运行的任务后重试；若仍失败，请右键以管理员身份运行本软件再更新。';
	}
	if (code === 'ENOSPC') {
		return '磁盘空间不足。就地更新需要解压一份完整程序（约 80MB）外加更新包（约 50MB），请先清理磁盘。';
	}
	return String(e?.message || e);
}

/**
 * 校验解压产物是不是一份可运行的 app 目录。
 * 这一步是「先解压后替换」能成立的前提：解压出来是坏的一定要在这里拦下，
 * 否则替换后软件会直接无法启动。
 */
function assertExtractedApp(dir: string) {
	const pkgFile = join(dir, 'package.json');
	if (!existsSync(pkgFile)) {
		throw new Error('更新包内容异常：缺少 package.json');
	}
	let main = './lib/index.js';
	try {
		main = JSON.parse(readFileSync(pkgFile, 'utf8')).main || main;
	} catch (e) {
		throw new Error('更新包内容异常：package.json 无法解析');
	}
	if (!existsSync(join(dir, main))) {
		throw new Error(`更新包内容异常：缺少入口文件 ${main}`);
	}
	if (!existsSync(join(dir, 'lib'))) {
		throw new Error('更新包内容异常：缺少 lib 目录');
	}
}

export async function updateApp(newVersion: UpdateInformationResource) {
	logger.info('更新  : ' + JSON.stringify(newVersion));
	const { tag, url } = newVersion;

	// 就地解压更新只支持 Windows：
	// - versions[].url 指向的 app.zip 是 Windows 构建产物，覆盖后 mac/linux 的原生模块（keytar 等）会失配
	// - Linux AppImage 运行目录只读，无法删除/重写自身
	if (process.platform !== 'win32') {
		const installerUrl = (newVersion.app_downloads as Record<string, string | undefined> | undefined)?.[process.platform];
		await shell.openExternal(installerUrl || 'https://easystudy.honghutech.eu.org');
		dialog.showMessageBox({
			title: '鸿鹄易学更新程序',
			message: `新版本 ${tag} 需要手动安装：已为你打开下载页面，请下载对应系统的最新安装包，覆盖安装后即可完成更新。`,
			type: 'info',
			noLink: true
		});
		return;
	}

	if (!app.isPackaged) {
		dialog.showMessageBox({ title: '鸿鹄易学更新程序', message: '开发模式下不支持就地更新。', type: 'info', noLink: true });
		return;
	}

	/** 更新包与解压产物都放在 resources/ 下（app 目录之外），避免更新过程中删除自己 */
	const appPath = app.getAppPath();
	const parentDir = dirname(appPath);
	const pendingDir = join(parentDir, 'pending-update');
	const zipPath = join(pendingDir, `app-${tag}.zip`);
	const stageDir = join(pendingDir, 'app-staging');
	/** 日志与残留说明放在 app 目录外，更新失败也能留证 */
	const logPath = join(parentDir, `update-${tag}.log`);

	try {
		// 清掉上一次的临时产物（可能是失败的残留）
		rmSync(pendingDir, { recursive: true, force: true });
		mkdirSync(pendingDir, { recursive: true });
		writeFileSync(logPath, JSON.stringify(Object.assign({}, newVersion, { appPath, zipPath, stageDir }), null, 4));

		logger.info('更新包 : ' + zipPath);
		logger.info('解压到 : ' + stageDir);

		await downloadFile(url, zipPath, (rate: any, totalLength: any, chunkLength: any) => {
			getCurrentWebContents().send('update-download', rate, totalLength, chunkLength);
		});

		if (newVersion.size && statSync(zipPath).size !== newVersion.size) {
			throw new Error(`更新包不完整：期望 ${newVersion.size} 字节，实际 ${statSync(zipPath).size} 字节`);
		}

		if (newVersion.sha256) {
			const actual = await sha256File(zipPath);
			if (actual.toLowerCase() !== String(newVersion.sha256).toLowerCase()) {
				throw new Error(`更新包校验失败（SHA256 不匹配）\n期望 ${newVersion.sha256}\n实际 ${actual}`);
			}
			logger.info('更新包 SHA256 校验通过');
		} else {
			logger.warn('清单未提供 sha256，跳过完整性校验');
		}

		await unzip(zipPath, stageDir);
		assertExtractedApp(stageDir);

		/**
		 * 原子替换：先把当前 app 目录改名备份，再把解压产物改名就位。
		 * 任何一步失败都能回滚到原目录 —— 旧实现是先 rm 再解压，zip 损坏就等于把软件删了。
		 */
		const backupDir = join(parentDir, `app-old-${Date.now()}`);
		try {
			renameSync(appPath, backupDir);
		} catch (e) {
			throw new Error('无法替换程序目录：' + describeFsError(e));
		}
		try {
			renameSync(stageDir, appPath);
		} catch (e) {
			try {
				renameSync(backupDir, appPath);
				logger.warn('替换失败，已回滚到原版本');
			} catch (rollbackError) {
				logger.error('回滚失败，请手动把备份目录改回 app：', backupDir, rollbackError);
			}
			throw new Error('替换程序目录失败：' + describeFsError(e));
		}

		logger.info('更新完成，旧版本备份于 ' + backupDir);

		// 清理放到下一步事件循环，不拖慢重启；失败只留日志
		setImmediate(() => {
			rm(zipPath, { force: true }, () => {});
			rm(stageDir, { recursive: true, force: true }, () => {});
			rm(pendingDir, { recursive: true, force: true }, () => {});
			rm(backupDir, { recursive: true, force: true }, (err) => {
				if (err) logger.warn('清理旧版本备份失败', backupDir, err);
			});
		});

		// @ts-ignore
		dialog.showMessageBox(null, {
			title: '鸿鹄易学更新程序',
			message: '更新完毕，即将重启软件...',
			type: 'warning',
			noLink: true
		});
		setTimeout(() => {
			app.relaunch();
			app.quit();
		}, 1000);
	} catch (e) {
		logger.error('更新失败', e);
		const message = describeFsError(e);
		// @ts-ignore
		const { response } = await dialog.showMessageBox(null, {
			title: '鸿鹄易学更新程序',
			message: '鸿鹄易学更新失败:\n' + message + '\n\n当前版本未受影响，可继续使用。',
			type: 'error',
			noLink: true,
			defaultId: 1,
			buttons: ['继续使用', '复制错误日志']
		});
		if (response === 1) {
			clipboard.writeText(String(e) + '\n\n' + message);
		}
		// 失败时立即清掉临时产物，避免占用磁盘（保留日志）
		rm(pendingDir, { recursive: true, force: true }, () => {});
	}
}
