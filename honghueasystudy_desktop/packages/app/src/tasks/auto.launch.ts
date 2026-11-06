import { app } from 'electron';
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

/**
 * 读回系统里的真实登记状态
 *
 * `setLoginItemSettings` 不报错不等于系统真的会启动它（权限、安全软件都可能
 * 让写入「成功」但被忽略）。把读回的结果写进日志，下次用户说「开了却没自启」
 * 时，日志能直接区分是「没登记」还是「登记了但系统不执行」。
 */
function readLoginItemStatus(): { registered: boolean; willLaunch: boolean } {
	try {
		/**
		 * 必须带上和写入时一致的 `args`：Electron 在 Windows 上是拿注册表里的
		 * 整条命令行（exe + 参数）去比对的，不传参数会判成「不匹配」，
		 * 于是日志里明明登记成功却显示「系统将启动=false」。
		 */
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
