import { app, BrowserWindow } from 'electron';
import { existsSync, statSync } from 'fs';
import { showMainWindow } from './tray';
import { AUTOSTART_FLAG } from './auto.launch';
import { Logger } from '../logger';

const logger = Logger('launch');

export function globalListenerRegister(win: BrowserWindow) {
	app.on('second-instance', (e, argv) => {
		/**
		 * 全平台生效：再次启动时把已有窗口带回前台
		 * （mac 的文件打开走 open-file 事件，argv 仅 win/linux 有意义）。
		 * 托盘模式下窗口通常处于隐藏状态，统一走 showMainWindow 恢复。
		 *
		 * 唯一的例外是「自启的重复拉起」：自启有两条通道（注册表 Run 项 +
		 * 启动文件夹快捷方式），开机时可能各启动一次，第二次被单实例锁挡下、
		 * 转成 second-instance 事件。如果这次也带着 `--hidden`，说明它同样是
		 * 自启通道拉起来的，此时把刚藏好的窗口唤出来就是「开机自己弹界面」。
		 */
		const silentInvoke = argv.includes(AUTOSTART_FLAG);
		logger.info(`收到第二次启动：${argv.slice(1).join(' ') || '(无参数)'}；静默参数=${silentInvoke}`);
		if (silentInvoke) {
			logger.info('第二次启动来自自启通道，保持窗口隐藏');
		} else {
			showMainWindow();
		}
		if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
			const file = getFileInArguments(argv);
			win.webContents.send('open-file', file);
		}
	});

	/**
	 * macOS Dock 图标点击 / 系统「重新打开」时把窗口带回前台。
	 *
	 * 窗口在托盘模式下只会隐藏、不会销毁，所以不能再走「没有窗口就新建」的老逻辑
	 * （那条路径建出来的窗口没加载页面）。
	 */
	app.on('activate', () => {
		/** Windows 不该触发（activate 是 macOS 事件）；真触发了就是窗口自亮的元凶，留痕 */
		logger.info(`收到 activate 事件（平台 ${process.platform}）`);
		showMainWindow();
	});
}

/**
 *
 * 获取命令行参数中的url信息
 * @param {string[]} argv
 * @returns
 */
export function getFileInArguments(argv: any[]) {
	argv.shift();
	for (const arg of argv) {
		if (!arg.startsWith('-')) {
			if (existsSync(arg) && statSync(arg).isFile()) {
				return arg;
			}
		}
	}
}
