import { app, BrowserWindow } from 'electron';
import { existsSync, statSync } from 'fs';
import { showMainWindow } from './tray';

export function globalListenerRegister(win: BrowserWindow) {
	app.on('second-instance', (e, argv) => {
		/**
		 * 全平台生效：再次启动时把已有窗口带回前台
		 * （mac 的文件打开走 open-file 事件，argv 仅 win/linux 有意义）。
		 * 托盘模式下窗口通常处于隐藏状态，统一走 showMainWindow 恢复。
		 */
		showMainWindow();
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
