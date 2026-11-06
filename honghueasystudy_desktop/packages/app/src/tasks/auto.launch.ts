import { app, shell } from 'electron';
import { existsSync, mkdirSync, rmSync } from 'fs';
import os from 'os';
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
 * 必须用 `create`，不能用 `replace` ——这个坑曾经让自启功能长期静默失效：
 * Electron 文档写明 replace 只覆盖**已存在**的快捷方式、不存在时直接返回 false，
 * 而首次安装时启动文件夹里当然没有这个文件，于是每次启动都「写入失败」，
 * 只剩注册表一条路（那条一旦被系统忽略，就彻底不自启了）。
 *
 * create 的语义是「创建，必要时覆盖」，同样满足「用户换过安装目录后要更新指向」
 * 的需求，不会留下指向已卸载 exe 的旧快捷方式。
 *
 * @returns 快捷方式当前是否存在且指向本程序
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

		const details = {
			target: process.execPath,
			cwd: path.dirname(process.execPath),
			description: '鸿鹄易学（开机自启）'
		};

		let created = shell.writeShortcutLink(link, 'create', details);
		if (!created) {
			// 兜底：残留的损坏文件（或占用）可能让 create 失败，删掉重来一次
			if (existsSync(link)) rmSync(link, { force: true });
			created = shell.writeShortcutLink(link, 'create', details);
		}
		if (!created) {
			logger.error('写入启动文件夹快捷方式失败：' + link);
			return false;
		}

		// 不信返回值，读回来比对：快捷方式存在但指向旧 exe 时，开机只会闪一下「找不到文件」
		try {
			const back = shell.readShortcutLink(link);
			const same = path.normalize(back.target).toLowerCase() === path.normalize(process.execPath).toLowerCase();
			if (!same) {
				logger.warn(`启动快捷方式指向 ${back.target}，与当前程序 ${process.execPath} 不一致`);
				return false;
			}
			return true;
		} catch (e) {
			logger.warn('读取刚写入的启动快捷方式失败', e);
			return existsSync(link);
		}
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

		/**
		 * 系统已运行时长：判断「这次到底是不是开机自启拉起来的」最直接的依据。
		 * 由登录启动的进程，这个值一般在几十秒内；手动打开则是几小时。
		 */
		const bootAge = Math.round(os.uptime());
		const bootHint = bootAge < 300 ? `开机 ${bootAge}s（疑似自启）` : `开机 ${bootAge}s（手动启动）`;

		if (!enabled) {
			logger.info(`开机自启：已关闭（注册表与启动文件夹均已清除）；${bootHint}`);
			return;
		}

		/**
		 * 两条通道任意一条生效即可：注册表 Run 项可能被系统优化工具屏蔽，
		 * 启动文件夹是 Windows 官方支持的第二种方式，互为备份。
		 */
		const usable = status.registered || inStartupFolder;
		logger.info(
			`开机自启：已开启（注册表登记=${status.registered} 系统将启动=${status.willLaunch} ` +
				`启动文件夹=${inStartupFolder}）；${bootHint}` + (usable ? '' : ' —— 两条通道都未生效')
		);
		if (!usable) logger.error('开机自启两条通道都未生效，登录时不会拉起本程序');
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
