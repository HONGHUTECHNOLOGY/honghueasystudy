import { app, shell } from 'electron';
import { existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { Logger } from '../logger';
import { store } from '../store';

const logger = Logger('auto-launch');

/** 开机自启是否开启（默认开启；旧存档没有该字段时按开启处理） */
function isAutoLaunchEnabled(): boolean {
	return store.store.window?.autoLaunch !== false;
}

/**
 * Windows「启动」文件夹里的快捷方式
 *
 * 只写注册表 `Run` 项不够可靠：安全软件、装机工具和「系统优化」经常把那条
 * 条目清掉或标成禁用，而应用每次启动又会原样写回去 —— 于是注册表看起来永远
 * 是对的，开机却从来不启动，日志里也全是「已开启」。
 *
 * 启动文件夹是 Windows 官方支持的第二种自启方式，两条路任意一条生效就够。
 * 都生效时会拉起两个进程，但第二个会被单实例锁挡掉，不会出现两套界面。
 */
function startupShortcut(): string {
	return path.join(
		app.getPath('appData'),
		'Microsoft',
		'Windows',
		'Start Menu',
		'Programs',
		'Startup',
		'鸿鹄易学.lnk'
	);
}

/**
 * 同步启动文件夹快捷方式
 *
 * 用 `replace` 而不是 `create`：用户换过安装目录后，旧快捷方式必须被覆盖，
 * 否则它指向的旧 exe 已经被卸载，开机时只会闪一下「找不到文件」。
 *
 * @returns 快捷方式当前是否存在
 */
function syncStartupShortcut(enabled: boolean): boolean {
	if (process.platform !== 'win32') return false;

	const link = startupShortcut();
	try {
		if (!enabled) {
			if (existsSync(link)) rmSync(link, { force: true });
			return false;
		}

		const folder = path.dirname(link);
		if (!existsSync(folder)) mkdirSync(folder, { recursive: true });

		const created = shell.writeShortcutLink(link, 'replace', {
			target: process.execPath,
			cwd: path.dirname(process.execPath),
			description: '鸿鹄易学（开机自启）'
		});
		if (!created) logger.error('写入启动文件夹快捷方式失败：' + link);
		return created;
	} catch (e) {
		logger.error('同步启动文件夹快捷方式失败', e);
		return false;
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
		const status = app.getLoginItemSettings({ path: process.execPath });
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
			 */
			app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
		} catch (e) {
			logger.error('设置开机自启失败', e);
		}

		const inStartupFolder = syncStartupShortcut(enabled);
		const status = readLoginItemStatus();
		logger.info(
			`开机自启：${enabled ? '已开启' : '已关闭'}` +
				`（注册表登记=${status.registered} 系统将启动=${status.willLaunch} 启动文件夹=${inStartupFolder}）`
		);
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
