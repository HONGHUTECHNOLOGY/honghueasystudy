import { app } from 'electron';
import path from 'path';
import Store from 'electron-store';
import { getDecryptedRenderData } from './crypto';

// IO操作只能在 app.getPath('userData') 下进行，否则会有权限问题。

export const OriginalAppStore = {
	name: app.getName(),
	version: app.getVersion(),
	/** 路径数据 */
	paths: {
		'app-path': app.getAppPath(),
		'user-data-path': app.getPath('userData'),
		'exe-path': app.getPath('exe'),
		'logs-path': app.getPath('logs'),
		'config-path': path.resolve(app.getPath('userData'), './config.json'),
		/** 浏览器用户数据文件夹 */
		userDataDirsFolder: '',
		/** 浏览器下载文件夹 */
		downloadFolder: path.resolve(app.getPath('userData'), './downloads'),
		/** 加载拓展路径 */
		extensionsFolder: path.resolve(app.getPath('userData'), './downloads/extensions')
	},
	/** 软件设置 */
	app: {
		video_frame_rate: 1
	},
	/** 窗口设置 */
	window: {
		/** 开机自启 */
		alwaysOnTop: false,
		autoLaunch: false
	},
	/** 本地服务器数据 */
	server: {
		port: 15319,
		authToken: ''
	},
	/**
	 * 远程控制服务设置
	 * 独立于 render，不参与加密，便于主进程直接读写。
	 */
	remoteControl: {
		/** 是否开启远程控制 */
		enabled: false,
		/** 远程控制面板端口 */
		port: 15320,
		/** 是否允许局域网设备访问（false 时只监听 127.0.0.1） */
		allowLan: true,
		/** 访问验证方式：pair=随机配对码 / password=自设密码 / none=免验证 */
		authMode: 'pair' as 'pair' | 'password' | 'none',
		/** 访问密码的 scrypt 哈希，格式 scrypt$salt$hash（仅 password 模式使用） */
		passwordHash: '',
		/** 内网穿透设置 */
		tunnel: {
			enabled: false,
			provider: 'cloudflared'
		},
		/** 会话 Cookie 签名密钥，首次启动生成 */
		sessionSecret: ''
	},
	/** 渲染进程数据 */
	render: {} as { [x: string]: any }
};

/**
 * - electron 本地存储对象
 * - 可以使用 store.store 访问
 * - 设置数据请使用 store.set('key', value)
 */
export const store = new Store<typeof OriginalAppStore>();

/**
 * 获取解密后的渲染进程数据
 */
export { getDecryptedRenderData };
