// @ts-check
import { BrowserWindow, shell, app } from 'electron';
import path from 'path';

export function createWindow() {
	const win = new BrowserWindow({
		title: '鸿鹄易学',
		// 打包后 cwd 不一定是应用目录，基于 appPath 解析；mac/linux 窗口图标用 png（.ico 不可用）
		icon: path.join(app.getAppPath(), process.platform === 'win32' ? './public/favicon.ico' : './public/favicon.png'),
		minWidth: 700,
		minHeight: 400,
		width: 900,
		height: 600,
		center: true,
		hasShadow: true,
		autoHideMenuBar: true,
		titleBarStyle: 'hidden',
		titleBarOverlay: {
			color: 'white',
			symbolColor: 'black'
		},
		frame: false,
		show: false,
		webPreferences: {
			zoomFactor: 1,
			// 关闭拼写矫正
			spellcheck: false,
			webSecurity: true,
			// 开启node
			nodeIntegration: true,
			contextIsolation: false
		}
	});

	win.webContents.on('will-navigate', (event, url) => {
		// 允许应用内部导航（开发服务器或本地文件），避免 Vite 热更新整页刷新时打开浏览器
		if (url.startsWith('http://localhost') || url.startsWith('file://')) {
			return;
		}
		event.preventDefault();
		shell.openExternal(url);
	});

	win.webContents.setWindowOpenHandler((detail) => {
		shell.openExternal(detail.url);
		return {
			action: 'deny'
		};
	});

	return win;
}
