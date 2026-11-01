import { app, BrowserWindow, Menu, Notification, Tray, nativeImage, NativeImage } from 'electron';
import fs from 'fs';
import path from 'path';
import { Logger } from '../logger';
import { store } from '../store';

const logger = Logger('tray');

let tray: Tray | null = null;
let win: BrowserWindow | null = null;
/** 同一会话只提示一次「已收进托盘」 */
let hiddenTipShown = false;

/**
 * 后台托盘运行是否开启
 *
 * 旧存档没有 `window.tray` 字段，按默认开启处理（initStore 里会补写默认值）。
 */
export function isTrayEnabled(): boolean {
	return store.store.window?.tray !== false;
}

/** 绑定主窗口并在开启托盘时创建托盘图标（应用启动时调用一次） */
export function initTray(window: BrowserWindow): void {
	win = window;
	if (!isTrayEnabled()) return;
	if (createTray()) return;

	/** 系统装不了托盘：把设置改成关闭，避免开关显示「开」但关窗后软件直接退出 */
	logger.warn('托盘创建失败，已把「后台托盘运行」改为关闭');
	store.set('window.tray', false);
}

/** 托盘图标路径：Windows 用 ico，其它平台用 png */
function trayIconCandidates(): string[] {
	const dir = path.join(app.getAppPath(), 'public');
	return process.platform === 'win32'
		? [path.join(dir, 'favicon.ico'), path.join(dir, 'favicon.png')]
		: [path.join(dir, 'favicon.png'), path.join(dir, 'favicon.ico')];
}

function createIconSource(icon: string): string | NativeImage {
	/** Windows 的 Tray 直接吃 ico 路径；其它平台给缩放后的 NativeImage（菜单栏/状态栏尺寸很小） */
	if (process.platform === 'win32') return icon;
	const image = nativeImage.createFromPath(icon);
	return image.isEmpty() ? icon : image.resize({ width: 18, height: 18 });
}

/**
 * 创建托盘图标
 *
 * 失败返回 false：Linux 部分桌面环境没有状态栏服务，此时不能把关闭行为改成「收进托盘」，
 * 否则用户既关不掉也找不到窗口。
 */
function createTray(): boolean {
	if (tray) return true;

	const icon = trayIconCandidates().find((file) => fs.existsSync(file));
	if (!icon) {
		logger.warn('找不到托盘图标资源，后台托盘运行不可用');
		return false;
	}

	try {
		tray = new Tray(createIconSource(icon));
	} catch (e) {
		logger.error('创建托盘图标失败', e);
		tray = null;
		return false;
	}

	tray.setToolTip('鸿鹄易学 - 正在后台运行');
	tray.setContextMenu(
		Menu.buildFromTemplate([
			{ label: '显示主界面', click: () => showMainWindow() },
			{ type: 'separator' },
			{ label: '退出鸿鹄易学', click: () => quitApp() }
		])
	);
	/** Windows 习惯单击唤起主界面；macOS 单击由系统弹出菜单 */
	if (process.platform === 'win32') {
		tray.on('click', () => showMainWindow());
	}
	tray.on('double-click', () => showMainWindow());

	logger.info('托盘图标已创建');
	return true;
}

function destroyTray(): void {
	if (!tray) return;
	try {
		tray.destroy();
	} catch (e) {
		logger.warn('销毁托盘图标失败', e);
	}
	tray = null;
}

/** 把主窗口带回前台（隐藏/最小化都能恢复） */
export function showMainWindow(): void {
	if (!win || win.isDestroyed()) return;
	if (win.isMinimized()) win.restore();
	if (!win.isVisible()) win.show();
	win.focus();
}

/**
 * 窗口关闭时尝试收进托盘
 *
 * 返回 false 表示托盘不可用（未开启 / 创建失败），调用方应继续走正常关闭流程。
 */
export function hideToTray(): boolean {
	if (!isTrayEnabled() || !tray) return false;
	if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return false;

	win.hide();
	showHiddenTip();
	logger.info('窗口已收进托盘，后台继续运行');
	return true;
}

/** 首次收进托盘时提示一次，避免用户以为软件已退出 */
function showHiddenTip(): void {
	if (hiddenTipShown) return;
	hiddenTipShown = true;

	const title = '鸿鹄易学仍在后台运行';
	/**
	 * 提示里补一条「重新打开」：少数 Linux 桌面（如原生 GNOME）没有状态栏服务，
	 * 托盘图标可能不显示，用户仍可通过再次启动软件（单实例会唤起已有窗口）找回界面。
	 */
	const content = '已最小化到系统托盘，定时自动化任务会继续执行。右键托盘图标可退出；找不到图标时再次打开软件即可恢复界面。';
	try {
		if (process.platform === 'win32' && tray) {
			tray.displayBalloon({ title, content });
		} else {
			new Notification({ title, body: content, silent: true }).show();
		}
	} catch (e) {
		logger.warn('托盘提示发送失败', e);
	}
}

/**
 * 修改后台托盘运行（设置面板开关）
 *
 * 返回 false 表示托盘不可用，渲染端应把开关退回关闭状态。
 */
export function setTrayEnabled(enabled: boolean): boolean {
	if (enabled) {
		const ok = createTray();
		if (!ok) return false;
		store.set('window.tray', true);
		return true;
	}

	store.set('window.tray', false);
	destroyTray();
	/** 关闭托盘前先把窗口带回来，否则藏在托盘里的主界面就再也找不到了 */
	showMainWindow();
	return true;
}

/**
 * 托盘菜单「退出鸿鹄易学」
 *
 * 复用渲染进程的关闭流程（关浏览器 → 保存数据 → 退出）。
 * 必须先显示主窗口：浏览器还在运行时会弹出「确定关闭软件吗」确认框，
 * 窗口藏起来的话用户看不到这个确认，软件就卡在退出前一步。
 */
export function quitApp(): void {
	const window = win;
	showMainWindow();

	if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
		app.exit(0);
		return;
	}

	const send = () => {
		if (window.isDestroyed() || window.webContents.isDestroyed()) {
			app.exit(0);
			return;
		}
		window.webContents.send('close');
	};

	/** 渲染端还没加载完时发送会丢：等加载完成后补发 */
	if (window.webContents.isLoading()) {
		window.webContents.once('did-finish-load', () => setTimeout(send, 500));
	} else {
		send();
	}
}
