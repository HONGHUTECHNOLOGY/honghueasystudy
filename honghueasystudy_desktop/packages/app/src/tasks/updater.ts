import { app, dialog, clipboard, shell } from 'electron';
import { gt, rcompare } from 'semver';
import { Logger } from '../logger';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, readdirSync, rm, rmSync, writeFileSync } from 'fs';
import * as fsMod from 'fs';
import { getCurrentWebContents, moveWindowToTop } from '../utils';
import { downloadFromMirrors, hostOf, normalizeUrls } from '../utils/download-source';
import { assertSafeInstallDir, spawnSilentInstaller } from '../utils/installer';
import { HonghuApi, UpdateInformationResource } from '@honghu-desktop/common';

const logger = Logger('updater');

/** 安装包临时目录名（放在系统 temp 下，不污染安装目录） */
const PENDING_DIR_NAME = 'honghu-update';

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

export interface UpdateDownloadResult {
	ok: boolean;
	/** 失败原因，供渲染端展示 */
	reason?: 'no-installer' | 'cancelled';
	tag?: string;
	/** 安装包大小（字节） */
	size?: number;
	/** 覆盖安装的目标目录 */
	installDir?: string;
}

/** 已下载完成、等待安装的安装包 */
interface PendingInstaller {
	tag: string;
	exePath: string;
	installDir: string;
	size?: number;
}

let pendingInstaller: PendingInstaller | null = null;

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
 * 更新残留清理。
 *
 * - 旧版就地更新（<=3.2.0）会在 resources/ 下留 `app-old-*`（约 77MB）与 `pending-update`，
 *   现在不再走那条路，升级到本版后一并清掉。
 * - 只在新版本已经跑起来之后（即本次启动）清理，因此不会影响回滚：
 *   若上次替换失败，app 目录仍是旧的，此时残留的 app-old-* 反而可能是唯一可用副本，
 *   所以这里只在 app 目录结构完整时才删。
 */
export function cleanupUpdateResidue() {
	if (!app.isPackaged) return;
	try {
		const appPath = app.getAppPath();
		const parent = dirname(appPath);
		if (existsSync(parent)) {
			const currentIntact = existsSync(join(appPath, 'package.json')) && existsSync(join(appPath, 'lib'));
			if (!currentIntact) {
				logger.warn('当前程序目录结构不完整，跳过更新残留清理');
			} else {
				const legacyPending = join(parent, 'pending-update');
				if (existsSync(legacyPending)) {
					rm(legacyPending, { recursive: true, force: true }, () => {});
					logger.info('已清理旧版就地更新的临时目录');
				}
				for (const name of readdirSync(parent)) {
					if (!name.startsWith('app-old-')) continue;
					rm(join(parent, name), { recursive: true, force: true }, (err) => {
						if (err) logger.warn('清理旧版本目录失败', name, err);
						else logger.info('已清理旧版本备份目录', name);
					});
				}
			}
		}
		// 安装包临时文件：没有待安装任务时清掉，避免长期占用 260MB+
		if (!pendingInstaller) {
			const tmp = pendingDir();
			if (existsSync(tmp)) rm(tmp, { recursive: true, force: true }, () => {});
		}
	} catch (e) {
		logger.warn('清理更新残留失败', e);
	}
}

function pendingDir() {
	return join(app.getPath('temp'), PENDING_DIR_NAME);
}

/** 临时盘剩余空间（字节）；拿不到就返回 -1，不阻塞更新 */
function freeSpaceOf(dir: string): number {
	try {
		// statfsSync 是 Node 18.15+ 的 API，Electron 35（Node 22）自带；
		// 但当前 @types/node 版本没声明它，这里按需取用
		const statfsSync = (fsMod as any).statfsSync as ((p: string) => { bavail: number; bsize: number }) | undefined;
		if (typeof statfsSync !== 'function') return -1;
		const s = statfsSync(dir);
		return Number(s.bavail) * Number(s.bsize);
	} catch {
		return -1;
	}
}

function describeError(e: any): string {
	const code = e?.code;
	if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' || code === 'ENOTEMPTY') {
		return '文件被占用或没有写入权限。请先关闭所有浏览器窗口和正在运行的任务后重试；若仍失败，请右键以管理员身份运行本软件再更新。';
	}
	if (code === 'ENOSPC') {
		return '磁盘空间不足。安装包约 260MB，请先清理磁盘。';
	}
	return String(e?.message || e);
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

/**
 * 第一步：下载安装包并校验。
 *
 * 不在这一步退出应用 —— 261MB 的下载期间用户还能继续用，
 * 下完由渲染端弹窗确认，再调 installUpdate() 真正安装。
 */
export async function updateApp(newVersion: UpdateInformationResource): Promise<UpdateDownloadResult> {
	logger.info('开始更新 : ' + JSON.stringify({ tag: newVersion?.tag, installers: newVersion?.installers }));

	if (!newVersion || typeof newVersion.tag !== 'string') {
		throw new Error('更新信息异常：缺少版本号');
	}
	const { tag } = newVersion;

	// mac / linux：下载 exe 没有意义，直接打开对应平台的下载页
	if (process.platform !== 'win32') {
		const platformUrl = (newVersion.app_downloads as Record<string, string | undefined> | undefined)?.[process.platform];
		await shell.openExternal(platformUrl || 'https://easystudy.honghutech.eu.org');
		await dialog.showMessageBox({
			title: '鸿鹄易学更新程序',
			message: `新版本 ${tag} 需要手动安装：已为你打开下载页面，请下载对应系统的最新安装包，覆盖安装后即可完成更新。`,
			type: 'info',
			noLink: true
		});
		return { ok: false, reason: 'cancelled' };
	}

	if (!app.isPackaged) {
		await dialog.showMessageBox({ title: '鸿鹄易学更新程序', message: '开发模式下不支持自动更新。', type: 'info', noLink: true });
		return { ok: false, reason: 'cancelled' };
	}

	// 安装目录 = 当前运行的 exe 所在目录。
	// 不能依赖注册表的 InstallLocation：实测 electron-builder 生成的卸载项里该字段是空的。
	const installDir = dirname(app.getPath('exe'));
	const installer = newVersion.installers?.win32;
	const sources = normalizeUrls(installer?.urls);

	if (!installer || !sources.length) {
		// 清单没带安装包信息：退回「打开下载页手动安装」，绝不让用户点了没反应
		logger.warn('清单缺少 installers.win32，改为打开下载页');
		const page = newVersion.app_downloads?.win32 || 'https://easystudy.honghutech.eu.org';
		await shell.openExternal(page);
		await dialog.showMessageBox({
			title: '鸿鹄易学更新程序',
			message: `新版本 ${tag} 需要下载安装包安装：已为你打开下载页面，下载后覆盖安装即可。`,
			type: 'info',
			noLink: true
		});
		return { ok: false, reason: 'no-installer' };
	}

	// 提前校验安装目录，避免下完 261MB 才发现装不了
	assertSafeInstallDir(installDir);

	const dir = pendingDir();
	const exePath = join(dir, installer.name || `honghu-setup-${tag}.exe`);
	const logPath = join(dir, `update-${tag}.log`);

	try {
		rmSync(dir, { recursive: true, force: true });
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			logPath,
			JSON.stringify({ tag, installDir, exePath, sources, expectSha256: installer.sha256, expectSize: installer.size }, null, 4)
		);

		// 磁盘预检：安装包 + 解压安装（NSIS 会临时占用约两倍）
		const required = (installer.size || 0) * 2.5;
		const free = freeSpaceOf(app.getPath('temp'));
		if (required > 0 && free > 0 && free < required) {
			throw new Error(
				`磁盘空间不足：安装包 ${(required / 1024 / 1024 / 2.5).toFixed(0)}MB，` +
					`临时盘仅剩 ${(free / 1024 / 1024).toFixed(0)}MB。请清理磁盘后重试。`
			);
		}

		logger.info(`安装包来源（${sources.length} 个）：` + sources.map(hostOf).join(' → '));
		logger.info('下载到 : ' + exePath);
		const used = await downloadFromMirrors(sources, exePath, {
			sha256: installer.sha256,
			size: installer.size,
			onLog: (level, msg) => (level === 'warn' ? logger.warn(msg) : logger.info(msg)),
			onProgress: (rate, totalLength, chunkLength) => {
				getCurrentWebContents().send('update-download', rate, totalLength, chunkLength);
			}
		});
		if (!installer.sha256) logger.warn('清单未提供安装包 sha256，跳过完整性校验');
		else logger.info('安装包 SHA256 校验通过（' + hostOf(used) + '）');

		pendingInstaller = { tag, exePath, installDir, size: installer.size };
		getCurrentWebContents().send('update-downloaded', { tag, size: installer.size, installDir });
		return { ok: true, tag, size: installer.size, installDir };
	} catch (e) {
		logger.error('更新包下载失败', e);
		pendingInstaller = null;
		const message = describeError(e);
		const { response } = await dialog.showMessageBox({
			title: '鸿鹄易学更新程序',
			message: '下载新版本失败:\n' + message + '\n\n当前版本未受影响，可继续使用。',
			type: 'error',
			noLink: true,
			defaultId: 1,
			buttons: ['继续使用', '复制错误日志']
		});
		if (response === 1) clipboard.writeText(String(e) + '\n\n' + message);
		rm(dir, { recursive: true, force: true }, () => {});
		throw e;
	}
}

/**
 * 第二步：静默覆盖安装并退出。
 *
 * 用安装包而不是替换 resources/app：安装包会把 Electron 运行时、内置扩展 extension/、
 * bin/chrome、bin/cloudflared、bin/ocr 一起对齐；只换 app 层这些会停在旧版本。
 *
 * 调用前渲染端已关闭浏览器实例（安装器要改写被占用的目录）。
 */
export async function installUpdate(): Promise<{ ok: boolean }> {
	const pending = pendingInstaller;
	if (!pending) throw new Error('没有待安装的更新包，请重新检查更新');
	if (!existsSync(pending.exePath)) {
		pendingInstaller = null;
		throw new Error('安装包已被清理，请重新检查更新');
	}

	// 二次校验：安装包可能被替换或损坏
	assertSafeInstallDir(pending.installDir);

	logger.info(`启动安装程序：${pending.exePath}`);
	logger.info(`覆盖安装目录：${pending.installDir}`);

	await spawnSilentInstaller({
		exePath: pending.exePath,
		installDir: pending.installDir,
		onSpawn: (pid) => logger.info('安装程序已接管（pid=' + pid + '），即将退出本程序')
	});

	logger.info('退出以完成安装');
	// 给渲染端回执一点时间，再退出；安装器是 detached 的，不受影响
	setTimeout(() => {
		app.quit();
	}, 400);

	return { ok: true };
}
