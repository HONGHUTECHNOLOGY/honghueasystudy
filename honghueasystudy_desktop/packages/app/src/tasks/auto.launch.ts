import { app } from 'electron';
import { spawnSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { Logger } from '../logger';
import { store } from '../store';

const logger = Logger('auto-launch');

/**
 * 自启项附带的命令行参数：告诉程序「这次是开机拉起来的，不要显示界面」。
 *
 * 必须写进自启项本身，而不是靠「系统运行了多久」猜 —— 重启后用户马上手动点开，
 * uptime 同样只有几十秒，那种情况得正常显示窗口。
 */
export const AUTOSTART_FLAG = '--hidden';

/** 开机自启是否开启（默认开启；旧存档没有该字段时按开启处理） */
function isAutoLaunchEnabled(): boolean {
	return store.store.window?.autoLaunch !== false;
}

/**
 * 清理旧版本留下的「启动」文件夹快捷方式
 *
 * 早期为了防「注册表条目被系统优化工具清掉」，自启做了双通道（注册表 Run 项
 * 与启动文件夹快捷方式）。后来查明当时「开了却不自启」的真正原因是 exe 清单
 * 声明了 highestAvailable（登录启动项无法弹 UAC，被系统静默跳过），双通道是
 * 误判下的过度设计 —— 而且两条都生效时会拉起两个进程，第二个把已藏好的窗口
 * 唤回前台，直接导致「开机自己弹界面」。
 *
 * 现在只保留注册表一条路。但老用户机器上的 lnk 还在，留着它关掉自启照样会
 * 启动程序，所以每次启动都顺手清一次（不存在时是空操作）。
 */
function removeLegacyStartupShortcut(): void {
	if (process.platform !== 'win32') return;

	const link = path.join(
		app.getPath('appData'),
		'Microsoft',
		'Windows',
		'Start Menu',
		'Programs',
		'Startup',
		'鸿鹄易学.lnk'
	);
	if (!existsSync(link)) return;

	try {
		rmSync(link, { force: true });
		logger.info('已清除旧版遗留的启动文件夹快捷方式：' + link);
	} catch (e) {
		logger.error('清除旧版启动文件夹快捷方式失败', e);
	}
}

/* ------------------------------------------------------------------ *
 * Windows 登录启动项：自己写注册表，不用 app.setLoginItemSettings
 *
 * 原因是 Electron 写出的命令行**不给 exe 路径加引号**（实测 electron 35：
 * `D:\honghueasystudy\鸿鹄易学\鸿鹄易学.exe --hidden`）。当前用户装在无空格目录，
 * 碰巧能用；一旦装进 `C:\Program Files\...`、`C:\Users\Zhang San\...` 这类目录，
 * explorer 会按空格切分命令行，找不到 exe —— 表现是「登记了、日志也正常，开机
 * 就是不启动」，且没有任何错误提示，是最难排查的一类故障。
 *
 * 自己写就一个要求：整条命令行里的路径必须被引号包住。
 * 键位、值名保持与 Electron 原生完全一致，老机器上的旧条目直接被覆盖，
 * 不用做迁移，也不会丢失用户在任务管理器里设过的启用状态。
 * ------------------------------------------------------------------ */

const WIN_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

/**
 * 与 Electron 原生一致的值名（`app.setName('鸿鹄易学')` 之后就是 electron.app.鸿鹄易学）。
 *
 * 特意兜住 `getName()` 返回内置名 "Electron" 的情况（setName 尚未生效时会出现）：
 * 那样会写到另一个值名上，结果是「旧条目还在、新条目又多一条」，两条都不带引号，
 * 开机仍然失效，还多出一个没人认识的自启项。
 */
function winRunValueName(): string {
	const name = app.getName();
	return `electron.app.${!name || name === 'Electron' ? '鸿鹄易学' : name}`;
}
/** 任务管理器的「启动项」启用/禁用标记就存在这里 */
const WIN_STARTUP_APPROVED_KEY =
	'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run';

/**
 * reg.exe 的绝对路径（主进程 PATH 在精简系统里可能不含 System32）
 */
function regExePath(): string {
	const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
	const full = path.join(root, 'System32', 'reg.exe');
	return existsSync(full) ? full : 'reg.exe';
}

interface RegResult {
	/** reg 返回 0 */
	ok: boolean;
	/** 输出（latin1 解码，中文会失真，仅用于日志与 hex 提取） */
	out: string;
	/** 进程根本没跑起来（被安全软件拦截 / 找不到 reg.exe / 超时） */
	failed: boolean;
}

/**
 * 调一次 reg.exe。
 *
 * 输出按 latin1 解码：值名和命令行里含中文，按 utf8 解会整体错位。
 * 实际只用到「退出码」和 REG_BINARY 的十六进制串（纯 ASCII），不受影响。
 *
 * `failed` 与「返回非零」必须分开：前者是 reg 压根没跑起来（ENOENT、被拦截、
 * 超时），后者才是「这个值/键不存在」。混在一起会让日志把「环境问题」
 * 报成「没写进注册表」，排查时方向全错。
 */
function runReg(args: string[]): RegResult {
	try {
		const r = spawnSync(regExePath(), args, { windowsHide: true, encoding: 'latin1', timeout: 8000 });
		const out = `${r.stdout || ''}${r.stderr || ''}`;
		if (r.status === null) {
			return { ok: false, out: out || String(r.error?.message || ''), failed: true };
		}
		return { ok: r.status === 0, out, failed: false };
	} catch (e: any) {
		logger.error('执行 reg.exe 失败：' + args[0], e);
		return { ok: false, out: String(e?.message || ''), failed: true };
	}
}

/**
 * 写进注册表的完整命令行。
 *
 * `"<exe>" <参数>`：引号只包路径，参数在外面。这是 Windows 登录启动项的标准写法，
 * 也是本文档开头那段注释存在的原因 —— 少了这对引号，带空格的安装目录就会失效。
 */
export function winLoginCommand(): string {
	return `"${process.execPath}" ${AUTOSTART_FLAG}`;
}

/** 写入/删除注册表 Run 项；返回是否成功（删除时值本就不存在也算成功） */
function writeWindowsLoginItem(enabled: boolean): boolean {
	const name = winRunValueName();

	if (!enabled) {
		// 值不存在时 reg 返回 1，属正常情况，不当错误
		runReg(['delete', WIN_RUN_KEY, '/v', name, '/f']);
		return true;
	}

	const r = runReg([
		'add',
		WIN_RUN_KEY,
		'/v',
		name,
		'/t',
		'REG_SZ',
		'/d',
		winLoginCommand(),
		'/f'
	]);
	if (!r.ok) {
		logger.error(
			`写入注册表自启项失败（${r.failed ? 'reg.exe 无法运行' : 'reg 返回非零'}）：` + (r.out.trim() || '无输出')
		);
		return false;
	}
	return true;
}

/**
 * 解析 `StartupApproved\Run` 里那条 12 字节二进制，判断自启项是否被禁用。
 *
 * 首字节低位为 1 表示禁用：0x02 / 0x06 是启用，0x03 是禁用。
 * 拆成纯函数便于单测（真实调用要读写用户注册表，不适合放进测试）。
 */
export function isStartupApprovedDisabled(regQueryOutput: string): boolean {
	const m = /REG_BINARY\s+([0-9A-Fa-f]+)/i.exec(String(regQueryOutput || ''));
	if (!m) return false;
	return (parseInt(m[1].slice(0, 2), 16) & 1) === 1;
}

/**
 * 读回 Windows 的真实登记状态。
 *
 * `willLaunch` 看的是 `StartupApproved\Run`：任务管理器里「禁用」过启动项的话，
 * Run 项仍然在（所以「已登记」为真），但系统不会执行它。那里存 12 字节二进制，
 * 首字节低位为 1 表示禁用（0x02 / 0x06 = 启用，0x03 = 禁用）。
 */
function readWindowsLoginItem(): { registered: boolean; willLaunch: boolean } {
	const query = runReg(['query', WIN_RUN_KEY, '/v', winRunValueName()]);

	/** reg.exe 不可用（被拦/超时）：退回 Electron 读取，否则日志会误报「没登记」 */
	if (query.failed) {
		logger.warn('reg.exe 不可用，改用 Electron 接口读取自启状态（带引号的条目可能判不准）');
		try {
			const s = app.getLoginItemSettings({ path: process.execPath, args: [AUTOSTART_FLAG] });
			return { registered: !!s.openAtLogin, willLaunch: !!s.executableWillLaunchAtLogin };
		} catch {
			return { registered: false, willLaunch: false };
		}
	}
	if (!query.ok) return { registered: false, willLaunch: false };

	let disabled = false;
	const approved = runReg(['query', WIN_STARTUP_APPROVED_KEY, '/v', winRunValueName()]);
	if (approved.ok) disabled = isStartupApprovedDisabled(approved.out);

	return { registered: true, willLaunch: !disabled };
}

/**
 * 读回系统里的真实登记状态
 *
 * 写入不报错不等于系统真的会启动它（权限、安全软件都可能让写入「成功」但被忽略）。
 * 把读回的结果写进日志，下次用户说「开了却没自启」时，日志能直接区分是
 * 「没登记」还是「登记了但系统不执行」。
 */
function readLoginItemStatus(): { registered: boolean; willLaunch: boolean } {
	if (process.platform === 'win32') return readWindowsLoginItem();

	try {
		const status = app.getLoginItemSettings({ path: process.execPath, args: [AUTOSTART_FLAG] });
		return { registered: !!status.openAtLogin, willLaunch: !!status.executableWillLaunchAtLogin };
	} catch (e) {
		logger.error('读取开机自启状态失败', e);
		return { registered: false, willLaunch: false };
	}
}

/**
 * 按存档应用开机自启（应用启动时调用）
 *
 * 每次启动都重新写入一次：用户重新安装/更换目录后，注册表里的启动路径要跟着更新。
 * 必须在 initStore 之后调用，否则全新安装时 store.window 还不存在。
 */
export function autoLaunch() {
	if (!app.isPackaged) return;
	/** Linux 未实现登录启动项（Electron 只在 macOS / Windows 支持该接口） */
	if (process.platform === 'linux') return;

	const apply = () => {
		const enabled = isAutoLaunchEnabled();

		if (process.platform === 'win32') {
			/**
			 * Windows 自己写注册表：Electron 的 setLoginItemSettings 不给 exe 路径
			 * 加引号，装到带空格的目录就会静默失效（详见上方注释）。写完读回校验，
			 * 读不回来才说明真出问题了。
			 */
			const ok = writeWindowsLoginItem(enabled);
			if (!ok && enabled) {
				/**
				 * reg.exe 被安全软件拦截 / PATH 异常时的兜底：宁可退回「路径带空格会失效」
				 * 的老写法，也不能让用户彻底失去自启。当前目录无空格时它照样能用。
				 */
				logger.warn('自定义注册表写入失败，回退到 Electron 原生方式（安装在含空格目录时可能失效）');
				try {
					app.setLoginItemSettings({ openAtLogin: true, path: process.execPath, args: [AUTOSTART_FLAG] });
				} catch (e) {
					logger.error('回退写入开机自启也失败', e);
				}
			}
		} else {
			try {
				/**
				 * 显式传 `path`：默认值就是 `process.execPath`，但写出来能避免
				 * 「静默更新换了安装目录，注册表还指着旧 exe」这类静默失效。
				 *
				 * `args` 带上 `--hidden`：开机拉起时不弹主界面，直接进托盘。
				 */
				app.setLoginItemSettings({
					openAtLogin: enabled,
					path: process.execPath,
					args: enabled ? [AUTOSTART_FLAG] : []
				});
			} catch (e) {
				logger.error('设置开机自启失败', e);
			}
		}

		const status = readLoginItemStatus();

		/**
		 * 系统已运行时长：判断「这次到底是不是开机自启拉起来的」最直接的依据。
		 * 由登录启动的进程，这个值一般在几十秒内；手动打开则是几小时。
		 */
		const bootAge = Math.round(os.uptime());
		const bootHint = bootAge < 300 ? `开机 ${bootAge}s（疑似自启）` : `开机 ${bootAge}s（手动启动）`;

		/** 自启只走注册表一条路；顺手清掉旧版可能残留的启动文件夹快捷方式 */
		removeLegacyStartupShortcut();

		if (!enabled) {
			logger.info(`开机自启：已关闭（注册表项已清除）；${bootHint}`);
			return;
		}

		logger.info(
			`开机自启：已开启（注册表登记=${status.registered} 系统将启动=${status.willLaunch}）；${bootHint}`
		);
		/** 把登记的命令行原样打出来：路径含空格时，这里能一眼看出引号在不在 */
		if (process.platform === 'win32') logger.info('自启命令行：' + winLoginCommand());
		if (!status.registered) {
			logger.error('开机自启未写入注册表 Run 项，登录时不会拉起本程序');
		} else if (!status.willLaunch) {
			logger.warn('注册表已登记，但系统标记为「不启动」（可能被任务管理器启动项或安全软件禁用）');
		}
	};

	/**
	 * macOS 上 setLoginItemSettings 依赖 app 已就绪（要解析 bundle 路径）。
	 * 启动链里 initStore 可能先于 whenReady 完成，这里补一次等待；
	 * Windows 同理，延后执行没有副作用。
	 */
	if (!app.isReady()) {
		app.whenReady().then(apply).catch((e) => logger.error('等待 app ready 后设置开机自启失败', e));
		return;
	}
	apply();
}

/**
 * 修改开机自启（设置面板开关）
 *
 * 先落盘再应用：主进程启动时是按存档来注册的，只改系统状态不写存档的话，
 * 下次启动会被旧值覆盖。
 */
export function setAutoLaunch(enabled: boolean): boolean {
	const next = !!enabled;
	store.set('window.autoLaunch', next);
	autoLaunch();
	return isAutoLaunchEnabled();
}
