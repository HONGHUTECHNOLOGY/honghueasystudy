import { app, dialog, clipboard, shell } from 'electron';
import { gt, rcompare } from 'semver';
import { Logger } from '../logger';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, readFileSync, readdirSync, rm, rmSync, statSync, writeFileSync } from 'fs';
import * as fsMod from 'fs';
import { getCurrentWebContents, moveWindowToTop } from '../utils';
import { downloadFromMirrors, hostOf, normalizeUrls } from '../utils/download-source';
import { killStaleInstaller, resolveInstallDir, spawnInstallerWizard } from '../utils/installer';
import { progressLogPath } from '../utils/update-window';
import { detectLinuxDistro, pickPlatformInstaller } from '../utils/platform-installer';
import { HonghuApi, ChangelogVersion, UpdateInformationResource } from '@honghu-desktop/common';

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
	/**
	 * 历史字段：旧版在提示更新前会探一遍下载源，全部不可达时置为 'unreachable' 并静默跳过。
	 *
	 * 现在不再探测（见 checkUpdate 里的说明），这个字段恒为 undefined，保留仅为兼容
	 * 仍在读它的渲染端代码。
	 */
	blocked?: 'unreachable';
}

export interface UpdateDownloadResult {
	ok: boolean;
	/** 失败原因，供渲染端展示 */
	reason?: 'no-installer' | 'no-install-dir' | 'manual-download' | 'cancelled';
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

/** 落盘的待安装任务（重启后还能继续装，避免白下 260MB） */
interface PendingMeta {
	tag: string;
	exePath: string;
	installDir?: string;
	size?: number;
	downloadedAt: number;
}

const PENDING_META_NAME = 'pending.json';

/**
 * 安装任务留痕。
 *
 * 之前 `installUpdate()` 调度成功后不留任何记录，重启后 `restorePendingInstaller()`
 * 只会说「上次已经下载完成，随时可以安装」——用户根本分不清是没点安装、点了没生效，
 * 还是装失败了。写一份 job 记录后，重启时能读进度窗口日志，把真实结果告诉用户。
 */
interface InstallJob {
	tag: string;
	startedAt: number;
	waitPid: number;
	logPath: string;
	mode: 'progress-window' | 'silent' | 'wizard';
}

const INSTALL_JOB_NAME = 'install-job.json';

/** 任务记录超过这个时长还遇到「版本没升上去」，就认为上次安装没成功 */
const INSTALL_JOB_STALE_MS = 30 * 60 * 1000;

let pendingInstaller: PendingInstaller | null = null;

/** 主程序名：注册表反推的目录里要确认确实是本程序，防止装进同名残留目录 */
const APP_EXE_NAMES = ['鸿鹄易学.exe'];

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
 * 更新弹窗里最多列出几个版本的日志。
 *
 * 跨大版本的用户（比如 5.0 → 5.4）会同时命中好几段，全列出来就变成长文；
 * 截断后仍保留最新的这些，旧的自然会被用户忽略。
 */
const NOTES_MAX_VERSIONS = 6;
/** 单个小节里的条目上限，防止某次版本刷出几十条把弹窗撑爆 */
const NOTES_MAX_ITEMS = 12;

/**
 * 从官网更新日志里截取「当前版本之后、最新版本之前」的段落。
 *
 * 只挑比 current 新的：已经装过的版本再列一遍没有意义。
 * 版本号解析失败（旧的脏数据）一律跳过，不能让日志把更新流程带崩。
 */
function collectNotes(current: string, newestTag: string, changelog: any): ChangelogVersion[] {
	const list = Array.isArray(changelog?.versions) ? changelog.versions : [];
	const picked: ChangelogVersion[] = [];

	for (const v of list) {
		if (!v || typeof v.version !== 'string') continue;
		try {
			if (!gt(v.version, current)) continue;
			if (newestTag && gt(v.version, newestTag)) continue;
		} catch {
			continue;
		}
		const sections = (Array.isArray(v.sections) ? v.sections : [])
			.map((s: any) => ({
				title: String(s?.title || '').trim() || '更新',
				items: (Array.isArray(s?.items) ? s.items : [])
					.map((x: any) => String(x))
					.filter(Boolean)
					.slice(0, NOTES_MAX_ITEMS)
			}))
			.filter((s: { items: string[] }) => s.items.length);
		if (!sections.length) continue;
		picked.push({ version: v.version, date: typeof v.date === 'string' ? v.date : '', sections });
	}

	picked.sort((a, b) => {
		try {
			return rcompare(a.version, b.version);
		} catch {
			return 0;
		}
	});
	return picked.slice(0, NOTES_MAX_VERSIONS);
}

/** 更新日志的内存缓存：同一次运行里手动点几次「检查更新」不必反复拉 */
let changelogCache: { at: number; data: any } | null = null;
const CHANGELOG_TTL = 10 * 60 * 1000;

async function loadChangelog(): Promise<any> {
	if (changelogCache && Date.now() - changelogCache.at < CHANGELOG_TTL) return changelogCache.data;
	const data = await HonghuApi.getChangelogSafe().catch(() => null);
	// 失败也缓存（空值）：网络不好时不必每次重试都再等一个超时
	changelogCache = { at: Date.now(), data };
	return data;
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

function pendingMetaPath() {
	return join(pendingDir(), PENDING_META_NAME);
}

function installJobPath() {
	return join(pendingDir(), INSTALL_JOB_NAME);
}

function writeInstallJob(job: InstallJob) {
	try {
		mkdirSync(pendingDir(), { recursive: true });
		writeFileSync(installJobPath(), JSON.stringify(job, null, 4));
	} catch (e) {
		logger.warn('写入安装任务记录失败', e);
	}
}

function readInstallJob(): InstallJob | null {
	try {
		if (!existsSync(installJobPath())) return null;
		const job = JSON.parse(readFileSync(installJobPath(), 'utf8')) as InstallJob;
		return job && typeof job.tag === 'string' ? job : null;
	} catch {
		return null;
	}
}

/** 读取进度窗口日志的尾部，写进 updater.log —— 下次启动一眼能看出上次卡在哪一步 */
function reportProgressLog(logPath?: string) {
	if (!logPath || !existsSync(logPath)) {
		logger.warn('上次安装没有留下进度窗口日志（进程可能根本没起来）');
		return '';
	}
	try {
		const lines = readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
		const tail = lines.slice(-30);
		logger.warn('上次安装进度窗口日志（末 ' + tail.length + ' 行）：\n' + tail.join('\n'));
		return tail.slice(-8).join(' | ');
	} catch (e) {
		logger.warn('读取安装日志失败', e);
		return '';
	}
}

function savePendingMeta(pending: PendingInstaller) {
	try {
		mkdirSync(pendingDir(), { recursive: true });
		const meta: PendingMeta = {
			tag: pending.tag,
			exePath: pending.exePath,
			installDir: pending.installDir,
			size: pending.size,
			downloadedAt: Date.now()
		};
		writeFileSync(pendingMetaPath(), JSON.stringify(meta, null, 4));
	} catch (e) {
		// 记录失败不影响本次安装，只是重启后要重新下载
		logger.warn('写入待安装任务记录失败', e);
	}
}

/** 清掉待安装任务（安装包 + 记录） */
export function clearPendingInstaller() {
	pendingInstaller = null;
	try {
		rmSync(pendingDir(), { recursive: true, force: true });
	} catch (e) {
		logger.warn('清理安装包临时目录失败', e);
	}
}

/**
 * 恢复上次已下载但未安装的安装包。
 *
 * NSIS 静默安装完成后不会拉起应用，用户也可能点了「稍后安装」就直接关掉软件；
 * 这两种情况下安装包已经躺在临时目录里，重启后应当直接提示安装而不是重新下 260MB。
 * 只能靠落盘的 pending.json 认出来 —— 内存里的 pendingInstaller 随进程退出就没了。
 */
export async function restorePendingInstaller(): Promise<boolean> {
	if (!app.isPackaged) return false;
	try {
		if (!existsSync(pendingMetaPath())) return false;

		const meta = JSON.parse(readFileSync(pendingMetaPath(), 'utf8')) as PendingMeta;
		if (!meta || typeof meta.exePath !== 'string' || !existsSync(meta.exePath)) {
			logger.info('待安装任务已失效（安装包不存在），清理');
			clearPendingInstaller();
			return false;
		}
		// 大小对不上说明文件被截断或替换过，不敢直接装
		if (meta.size && statSync(meta.exePath).size !== meta.size) {
			logger.warn('安装包大小与记录不符，清理');
			clearPendingInstaller();
			return false;
		}

		const current = app.getVersion();
		let newer = false;
		try {
			newer = typeof meta.tag === 'string' && gt(meta.tag, current);
		} catch {
			newer = false;
		}
		if (!newer) {
			// 版本已经不低了：说明上次装成功了，安装包可以清掉
			logger.info(`待安装版本 ${meta.tag} 不高于当前 ${current}，已安装，清理残留`);
			clearPendingInstaller();
			return false;
		}

		pendingInstaller = {
			tag: meta.tag,
			exePath: meta.exePath,
			installDir: meta.installDir || '',
			size: meta.size
		};
		logger.info(`恢复上次已下载的安装包：${meta.tag}（${meta.exePath}）`);

		/*
		 * 版本仍然低于待装版本，说明上次那次安装没有落盘。
		 * 有 job 记录 = 用户点过「立即安装」，此时不要再笼统地说「已下载待安装」，
		 * 而是把进度窗口日志读出来，并给渲染端一个明确的「上次安装未完成」状态。
		 */
		const job = readInstallJob();
		const attempted = !!job && job.tag === meta.tag && Date.now() - job.startedAt < INSTALL_JOB_STALE_MS;
		const logTail = attempted ? reportProgressLog(job!.logPath) : '';

		getCurrentWebContents().send('update-downloaded', {
			tag: meta.tag,
			size: meta.size,
			installDir: meta.installDir,
			runDir: dirname(app.getPath('exe')),
			restored: true,
			failed: attempted,
			exePath: meta.exePath,
			logPath: attempted ? job!.logPath : undefined,
			logTail
		});
		return true;
	} catch (e) {
		logger.warn('恢复待安装任务失败', e);
		return false;
	}
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

	/*
	 * 更新日志与清单**并行**拉取。
	 *
	 * 两者同站同量级（13KB / 20KB），串行等于白等一倍：先拿清单再拉日志的话，
	 * 网络差时日志那 5s 超时会直接推迟「发现新版本」弹窗。这里先发出去，
	 * 真正要用的时候再 await（多半已经回来了）；日志拉不到也不影响更新本身。
	 */
	const changelogPromise = loadChangelog();

	const infos = await HonghuApi.getInfosSafe().catch(() => null);
	if (!infos) {
		logger.warn('检测更新失败：远程配置拉取失败');
		return { ok: false, current, hasUpdate: false, error: 'network' };
	}

	const versions = infos.versions || [];
	const newest = pickNewest(current, versions);

	logger.info('检测更新', { current, count: versions.length, newest: newest?.tag, manual });

	if (newest) {
		const downloaded = pendingInstaller && pendingInstaller.tag === newest.tag;
		if (downloaded) {
			// 安装包已经在临时目录里：再弹「发现新版本」只会让人重复下载一遍
			logger.info('该版本安装包已下载完成，等待用户安装');
			if (manual) {
				getCurrentWebContents().send('update-downloaded', {
					tag: pendingInstaller!.tag,
					size: pendingInstaller!.size,
					installDir: pendingInstaller!.installDir,
					restored: true
				});
			}
		} else {
			/*
			 * 这里不再做「下载源可达性预检」。
			 *
			 * 清单不是手写的：CI 的 desktop-build 先把安装包传完（GitHub + GitCode 两边），
			 * 再派发 update-manifest，后者用 Range GET 逐条探链、任一不通就 fail-closed 拒绝写清单
			 * （见 .github/workflows/desktop-build.yml 的 Dispatch update manifest）。
			 * 也就是说「清单里有这个 tag」本身已经等于「两边都能下载」，本地再探一遍只会：
			 *   1) 把更新提示白白推迟 0~6 秒（探测是并发 HTTP，但慢源会拖满超时）；
			 *   2) 在代理抖动 / 公司网络临时拦截时，把「有新版本」误判成「下载源不可达」而静默不提示，
			 *      用户反而永远看不到更新。
			 * 真下载失败也不必在这里拦：updateApp 有自己的兜底（打开下载页 / 复制错误日志）。
			 */
			// 附上「面向用户」的更新日志：拉不到就不带，弹窗照样能弹
			const notes = collectNotes(current, newest.tag, await changelogPromise);
			if (notes.length) {
				logger.info(`附带更新日志 ${notes.length} 段：${notes.map((n) => n.version).join(' / ')}`);
			}
			moveWindowToTop();
			getCurrentWebContents().send('detect-new-app-version', { ...newest, notes });
		}
	}

	return { ok: true, current, latest: newest?.tag || current, hasUpdate: !!newest };
}

/**
 * 启动时静默检测。
 *
 * 先恢复上次已下载但没装的安装包（静默安装后应用不会自动启动，用户也可能点了「稍后」），
 * 再检测版本 —— 顺序不能反：cleanupUpdateResidue 在没有待安装任务时会把临时目录整个删掉。
 */
export async function updater() {
	await restorePendingInstaller();
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

	// mac / linux：不做自动安装（mac 未签名会被 Gatekeeper 拦，linux 的 deb/rpm 需要 root），
	// 但按当前平台+架构挑出对应安装包，直接开下载链接，不让用户去 Release 页自己找
	if (process.platform !== 'win32') {
		const pick = pickPlatformInstaller(newVersion.installers, {
			platform: process.platform,
			arch: process.arch,
			distro: process.platform === 'linux' ? detectLinuxDistro() : undefined
		});
		if (pick) {
			logger.info(`下载 ${process.platform}/${process.arch} 安装包：${pick.installer.name}（${pick.installer.ext}）`);
			await shell.openExternal(pick.installer.urls[0]);
			await dialog.showMessageBox({
				title: '鸿鹄易学更新程序',
				message: `新版本 ${tag}\n\n${pick.guide}`,
				type: 'info',
				noLink: true
			});
			return { ok: false, reason: 'manual-download' };
		}

		// 清单里没有对应平台的包（只发了 Windows），或没有匹配当前架构的产物：退回下载页
		const platformUrl = (newVersion.app_downloads as Record<string, string | undefined> | undefined)?.[
			process.platform
		];
		logger.warn(`清单没有 ${process.platform}/${process.arch} 的安装包，改为打开下载页`);
		await shell.openExternal(platformUrl || 'https://easystudy.honghutech.eu.org');
		await dialog.showMessageBox({
			title: '鸿鹄易学更新程序',
			message: `新版本 ${tag} 需要手动安装。\n\n已为你打开下载页面，请下载与当前系统架构（${process.arch}）匹配的安装包，安装后重新打开软件。`,
			type: 'info',
			noLink: true
		});
		return { ok: false, reason: 'manual-download' };
	}

	if (!app.isPackaged) {
		await dialog.showMessageBox({
			title: '鸿鹄易学更新程序',
			message: '开发模式下不支持自动更新。',
			type: 'info',
			noLink: true
		});
		return { ok: false, reason: 'cancelled' };
	}

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

	// 安装目录：可信的当前 exe 目录 → 注册表记录的安装位置。
	// 用户可能在 win-unpacked / 临时目录里跑旧副本，或装了新版但没重启，
	// 这时当前 exe 所在目录并不是真正要覆盖的位置，必须回退到注册表。
	const resolved = await resolveInstallDir({ exePath: app.getPath('exe'), exeNames: APP_EXE_NAMES });
	if (!resolved.dir) {
		logger.warn('无法确定安装目录，改为打开下载页：' + JSON.stringify(resolved.candidates));
		const page = newVersion.app_downloads?.win32 || 'https://easystudy.honghutech.eu.org';
		await shell.openExternal(page);
		await dialog.showMessageBox({
			title: '鸿鹄易学更新程序',
			message: `新版本 ${tag} 需要手动安装。\n\n${resolved.error}\n已为你打开下载页面，下载安装包后覆盖安装即可。`,
			type: 'info',
			noLink: true
		});
		return { ok: false, reason: 'no-install-dir' };
	}
	const installDir = resolved.dir;
	logger.info(`安装目录（来源：${resolved.source === 'registry' ? '注册表' : '当前运行目录'}）：${installDir}`);
	if (resolved.registryDir && resolved.registryDir.toLowerCase() !== installDir.toLowerCase()) {
		logger.warn(`注册表记录的目录（${resolved.registryDir}）与将安装的目录不一致`);
	}

	// 目录合法性已在 resolveInstallDir 里逐个候选校验过（存在性 + 内含主程序 exe）

	const dir = pendingDir();
	const exePath = join(dir, installer.name || `honghu-setup-${tag}.exe`);
	const logPath = join(dir, `update-${tag}.log`);

	try {
		rmSync(dir, { recursive: true, force: true });
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			logPath,
			JSON.stringify(
				{ tag, installDir, exePath, sources, expectSha256: installer.sha256, expectSize: installer.size },
				null,
				4
			)
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
			onProgress: (percent, totalLength, received) => {
				// 对象化：渲染端要同时显示百分比、已下载/总量、速度与剩余时间
				getCurrentWebContents().send('update-download', {
					percent: Math.max(0, Math.min(100, percent)),
					received,
					total: totalLength
				});
			}
		});
		if (!installer.sha256) logger.warn('清单未提供安装包 sha256，跳过完整性校验');
		else logger.info('安装包 SHA256 校验通过（' + hostOf(used) + '）');

		pendingInstaller = { tag, exePath, installDir, size: installer.size };
		savePendingMeta(pendingInstaller);
		getCurrentWebContents().send('update-downloaded', {
			tag,
			size: installer.size,
			installDir,
			runDir: dirname(app.getPath('exe'))
		});
		return { ok: true, tag, size: installer.size, installDir };
	} catch (e) {
		logger.error('更新包下载失败', e);
		pendingInstaller = null;
		const message = describeError(e);
		/*
		 * 下载是最容易「检测到更新但走不下去」的一步：所有源都可能因为
		 * 清单写错、附件被删、公司网络封了 GitCode/GitHub 而全挂。
		 * 这时必须给一条出路 —— 打开下载页手动装，而不是只让用户「继续使用」。
		 */
		const page = newVersion.app_downloads?.win32 || 'https://easystudy.honghutech.eu.org';
		const { response } = await dialog.showMessageBox({
			title: '鸿鹄易学更新程序',
			message:
				'下载新版本失败:\n' + message + '\n\n当前版本未受影响，可以继续使用。\n如需立即升级，可打开下载页手动安装。',
			type: 'error',
			noLink: true,
			defaultId: 1,
			cancelId: 1,
			buttons: ['打开下载页', '继续使用', '复制错误日志']
		});
		if (response === 0) {
			logger.info('下载失败，改为打开下载页：' + page);
			await shell.openExternal(page);
		} else if (response === 2) {
			clipboard.writeText(String(e) + '\n\n' + message);
		}
		rm(dir, { recursive: true, force: true }, () => {});
		throw e;
	}
}

/**
 * 安装专用退出：先通知渲染端同步保存，再用 `app.exit()` 强制结束。
 *
 * 不能用 `app.quit()`：它触发的 `window.on('close')` 会 preventDefault，进程退出
 * 完全依赖渲染端回执；而 `closeAllBrowser()` 只判断 `processes.length`（不看运行状态），
 * 一个残留的浏览器对象就会弹确认框把流程挂死。这时安装进度窗口的 `WaitPid`
 * 永远等不到进程消失，安装器根本不会启动 —— 用户看到的就是「软件退出后没反应」。
 * `app.exit()` 不触发任何 close/before-quit 事件，是最确定的退出方式。
 */
function exitForInstall(delay: number) {
	try {
		const wc = getCurrentWebContents();
		if (wc && !wc.isDestroyed()) wc.send('prepare-exit');
	} catch (e) {
		logger.warn('通知渲染端保存配置失败（不影响安装）', e);
	}
	setTimeout(() => {
		logger.info('安装流程：强制退出本进程（app.exit）');
		app.exit(0);
	}, delay);
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
		clearPendingInstaller();
		throw new Error('安装包已被清理，请重新检查更新');
	}

	// 安装目录重新解析：从下载到现在可能已经变了
	// （用户在别的目录装了新版、或换了启动方式），不能照搬下载时的结论
	const resolved = await resolveInstallDir({ exePath: app.getPath('exe'), exeNames: APP_EXE_NAMES, force: true });
	if (!resolved.dir) {
		throw new Error(resolved.error || '无法确定安装目录');
	}
	if (resolved.dir.toLowerCase() !== (pending.installDir || '').toLowerCase()) {
		logger.warn(`覆盖安装目录已变化：${pending.installDir || '(空)'} → ${resolved.dir}`);
	}
	pending.installDir = resolved.dir;

	logger.info(`启动安装程序：${pending.exePath}`);
	logger.info(
		`覆盖安装目录：${pending.installDir}（来源：${resolved.source === 'registry' ? '注册表' : '当前运行目录'}）`
	);

	const logPath = progressLogPath(pendingDir());

	if (process.platform === 'win32') {
		/*
		 * 可见安装向导：先启动安装器（**不带 /S**），再退出本进程。
		 *
		 * 不再走「静默安装 + 外部进度窗口」那一套：静默安装期间界面为零，安装器又必须由
		 * 「应用退出之后」的进程接力；一旦接力进程出问题（实测 ps1 会把日志自己锁死、也活在
		 * 不了无桌面会话里），整段过程就是黑盒，用户只知道软件退出了。向导模式把界面交还给
		 * 用户，装到哪个目录、装没装完都能当场看到；完成页默认勾选「运行」，装完自动拉起新版本。
		 *
		 * **5.5.0 起不再回退静默安装**：静默失败时用户完全无从判断，宁可明确报错并帮他把
		 * 安装包定位出来，让他手动双击。
		 */
		// 先清掉残留的同名安装器：NSIS 单实例锁会让新安装器直接 Abort（退出码 2 且全静默）
		const killed = await killStaleInstaller(pending.exePath);
		if (killed) {
			logger.warn(`已结束 ${killed} 个残留安装器进程（否则会占住 NSIS 单实例锁）`);
		}
		const launched = spawnInstallerWizard({
			exePath: pending.exePath,
			installDir: pending.installDir,
			onSpawn: (pid) => logger.info('安装向导已启动（pid=' + pid + '），即将退出本程序')
		});
		if (launched.ok) {
			writeInstallJob({
				tag: pending.tag,
				startedAt: Date.now(),
				waitPid: process.pid,
				logPath,
				mode: 'wizard'
			});
			logger.info('退出以完成安装（安装向导接管，装完可在向导里直接启动新版本）');
			// NSIS 要先解压自身再显示向导；退得太早，用户只会看到窗口一闪
			exitForInstall(3000);
			return { ok: true };
		}
		logger.warn('安装向导启动失败，不再回退静默安装：' + (launched.error || '未知原因'));
		try {
			shell.showItemInFolder(pending.exePath);
		} catch (e) {
			logger.warn('定位安装包失败', e);
		}
		throw new Error('无法启动安装向导，已在文件夹中定位安装包，请手动双击安装');
	}

	/*
	 * 非 Windows 平台走不到这里：mac / linux 在 updateApp 里就改为打开下载页了。
	 * 保留一个明确报错，避免将来误接回静默安装 —— 5.5.0 起自动更新一律可见。
	 */
	throw new Error('当前平台不支持自动安装，请手动下载安装包');
}
