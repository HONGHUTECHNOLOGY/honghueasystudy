// @ts-check
import { BrowserWindow, shell, app } from 'electron';
import path from 'path';

export function createWindow() {
	const win = new BrowserWindow({
		title: '鸿鹄易学',
		// 打包后 cwd 不一定是应用目录，基于 appPath 解析；mac/linux 窗口图标用 png（.ico 不可用）
		icon: path.join(app.getAppPath(), process.platform === 'win32' ? './public/favicon.ico' : './public/favicon.png'),
		/**
		 * 最小 900×560：新的侧栏 216px + 内容区 32px 内边距，
		 * 700 宽时内容区只剩 420px，浏览器卡片会挤成一列且标题全被省略号截断。
		 * 默认 1120×720 接近主流笔记本的可视区，首屏不用滚动就能看到 4 张卡片。
		 */
		minWidth: 900,
		minHeight: 560,
		width: 1120,
		height: 720,
		center: true,
		hasShadow: true,
		autoHideMenuBar: true,
		titleBarStyle: 'hidden',
		/**
		 * 原生窗口按钮配色。
		 * height 必须与渲染端 .app-title 的 --title-height（40px）一致，
		 * 否则按钮会在标题栏里垂直偏移几像素，看起来"没对齐"。
		 * 暗色下的颜色由渲染端 utils/theme.ts 通过 setTitleBarOverlay 更新。
		 */
		titleBarOverlay: {
			color: '#FFFFFF',
			symbolColor: '#1F242B',
			height: 40
		},
		/**
		 * 首帧底色，消除启动白闪。
		 * 原来没设 backgroundColor，show() 时渲染进程可能还没画出第一帧，
		 * 用户会看到一瞬间的白（暗色主题下尤其刺眼）。这里取 --surface-page 的亮色值，
		 * 暗色启动时由主进程在窗口创建后按存档改掉。
		 */
		backgroundColor: '#F7F8FA',
		/** macOS 红绿灯位置：40px 高标题栏下垂直居中略偏上 1px 视觉更稳 */
		trafficLightPosition: { x: 16, y: 13 },
		frame: false,
		show: false,
		webPreferences: {
			zoomFactor: 1,
			// 关闭拼写矫正
			spellcheck: false,
			webSecurity: true,
			// 开启node
			nodeIntegration: true,
			contextIsolation: false,
			/**
			 * 关闭后台节流：收进托盘后窗口处于隐藏状态，Chromium 默认会把定时器压到每分钟一次，
			 * 自动化调度（20 秒一个节拍）会因此错过定时启动/收尾的时间点。
			 */
			backgroundThrottling: false
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
