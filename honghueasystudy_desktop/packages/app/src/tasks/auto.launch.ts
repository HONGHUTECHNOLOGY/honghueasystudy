import { app } from 'electron';
import { Logger } from '../logger';
import { store } from '../store';

const logger = Logger('auto-launch');

/** 开机自启是否开启（默认开启；旧存档没有该字段时按开启处理） */
function isAutoLaunchEnabled(): boolean {
	return store.store.window?.autoLaunch !== false;
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
		try {
			app.setLoginItemSettings({ openAtLogin: isAutoLaunchEnabled() });
			logger.info('开机自启：' + (isAutoLaunchEnabled() ? '已开启' : '已关闭'));
		} catch (e) {
			logger.error('设置开机自启失败', e);
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
