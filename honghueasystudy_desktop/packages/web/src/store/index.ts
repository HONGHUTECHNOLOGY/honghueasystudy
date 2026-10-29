import { reactive } from 'vue';
import { remote } from '../utils/remote';
import defaultsDeep from 'lodash/defaultsDeep';
import type { AppStore, UserScripts } from '@honghu-desktop/app';
import { CommonUserScript } from '../types/user.script';
import { FolderOptions } from '../fs/interface';
import { Browser } from '../fs/browser';
import { Folder } from '../fs/folder';
import { DEFAULT_LANGS } from '../config/default-langs';

export type StoreUserScript = { info?: CommonUserScript } & Omit<UserScripts, 'info'>;

export type WebStore = {
	scripts: StoreUserScript[];
	notifies: any[];

	browser: {
		currentFolderUid: string;
		currentBrowserUid: string;
		/** 根目录 */
		root: FolderOptions<'root', Browser | Folder>;
		tags: Record<string, { color: string; count: number }>;
		search: {
			/** 名字或者备注搜素 */
			value: string;
			tags: string[];
		};
	};
	dashboard: {
		/** 显示标签和备注 */
		details: {
			tags: boolean;
			notes: boolean;
		};
		/** 列数控制 */
		num: number;
		/** 视频设置 */
		video: {
			/** 横纵比 */
			aspectRatio?: number;
		};
	};
	setting: {
		browserType: 'diy' | 'local' | 'setup';
		/** 界面模式：简洁模式 / 专业模式 */
		mode: 'simple' | 'professional';
		/** 是否显示侧边栏文字 */
		showSideBarText: boolean;
		/** 浏览器启动参数 */
		launchOptions: {
			custom: boolean;
			executablePath: string;
		};
		/** 开发者调试 */
		dev: {
			/** 开启后：浏览器开放 CDP 调试端口，并可在浏览器操作栏一键导出网页信息 */
			enabled: boolean;
			/** CDP 调试端口（仅本机可连） */
			port: number;
		};
		/** 当前的主题 */
		theme: {
			dark: boolean;
		};
		/** 鸿鹄易学特殊配置 */
		hh: {
			/** 当前配置名 */
			currentProjectName: string;
			/** 全局配置 */
			store: any;
			/** 是否同步鸿鹄易学配置 */
			openSync: boolean;
		};
		browser: {
			/** 浏览器缓存大小预警阈值（GB） */
			cachesSizeWarningPoint: number;
			/** 是否启用浏览器原版对话框 */
			enableDialog: boolean;
			/** 是否强制更新/安装脚本 */
			forceUpdateScript: boolean;
			/** 点击「新建浏览器」时是否自动打开初始化弹窗并执行初始化 */
			autoInitNewBrowser: boolean;
		};
	};

	langs: Record<string, string>;
	state: {
		/** 是否第一次打开 */
		first: boolean;
		/** 是否展示初始化设置  */
		setup: boolean;
		/** 是否展示「新建浏览器自动初始化」弹窗 */
		newBrowserSetup: boolean;
		mini: boolean;
		responsive: 'mini' | 'small';
		height: number;
		/** 已读的提示记录 */
		read_record: {
			user_script_usage: boolean;
			browser_usage: boolean;
			automation_script_usage: boolean;
		};
	};
};

/**
 * 默认值全集
 *
 * > 注意：必须「先解密、后 defaultsDeep」。磁盘上的 render 是加密字符串，
 * > 若先合并默认值，会把整个默认 render 挂到一个字符串上（truthy 不触发补齐），
 * > 随后解密结果整体覆盖 render —— 存档里没有的新增字段（如 setting.dev）就永远是
 * > undefined，模板里一读 `dev.enabled` 就抛 TypeError，整块设置面板渲染失败白屏。
 */
const APP_DEFAULTS = {
	remoteControl: {
		enabled: false,
		port: 15320,
		allowLan: true,
		tunnel: {
			enabled: false,
			provider: 'cloudflared'
		},
		sessionSecret: ''
	},
	render: {
		scripts: [],
		notifies: [],
		browser: {
			currentFolderUid: '',
			currentBrowserUid: '',
			root: {
				name: '根目录',
				parent: undefined,
				createTime: Date.now(),
				type: 'root',
				uid: 'root-folder',
				children: {},
				renaming: false
			},
			tags: {},
			search: {
				value: '',
				tags: [],
				results: undefined
			}
		},
		dashboard: {
			details: {
				tags: false,
				notes: false
			},
			num: 4,
			video: {
				aspectRatio: 0
			}
		},
		setting: {
			browserType: 'diy',
			mode: 'simple' as const,
			showSideBarText: true,
			launchOptions: {
				custom: false,
				executablePath: ''
			},
			dev: {
				enabled: false,
				port: 9222
			},
			theme: {
				dark: false
			},
			hh: {
				currentProjectName: '',
				store: {},
				openSync: false
			},
			browser: {
				cachesSizeWarningPoint: 10,
				enableDialog: false,
				forceUpdateScript: false,
				autoInitNewBrowser: true
			}
		},
		langs: { ...DEFAULT_LANGS },
		state: {
			first: true,
			setup: true,
			newBrowserSetup: false,
			mini: false,
			responsive: 'small',
			height: document.documentElement.clientHeight,
			read_record: {
				user_script_usage: false,
				browser_usage: false,
				automation_script_usage: false
			}
		}
	} as WebStore
};

/** 磁盘上的原始存档（render 可能还是加密字符串） */
const rawStore: any = remote['electron-store'].get('store') || {};

// 解密数据（兼容新旧加密格式）—— 必须在 defaultsDeep 之前，理由见 APP_DEFAULTS 注释
if (typeof rawStore.render === 'string') {
	try {
		rawStore.render = JSON.parse(remote.methods.callSync('decryptRenderString' as any, rawStore.render));
	} catch (e) {
		console.error('数据解密失败：' + e);
		/** 解不出来就当没有存档，交给默认值兜底，别让整个渲染端挂掉 */
		delete rawStore.render;
	}
}

const _store: AppStore & { render: WebStore } = defaultsDeep(rawStore, APP_DEFAULTS);

/**
 * 远程控制配置由主进程独占维护（渲染端既不该读快照、也不该写回）。
 *
 * 渲染端保存时是把整个 store 序列化后交给主进程的，这份快照里的 remoteControl
 * 停留在页面加载那一刻，写回去会把主进程刚改的开关/端口/验证方式全部回滚——
 * 典型现象：点「启动浏览器」触发自动保存，内网穿透开关自己关掉、隧道消失。
 * 这里直接从渲染端 store 中摘掉，保存时自然就不会带上它。
 */
// @ts-ignore - remoteControl 只在主进程维护
delete (_store as any).remoteControl;

/** 数据存储对象 */
export const store: AppStore & { render: WebStore } = reactive(_store);

console.log('store', store);
// @ts-ignore
window.store = store;

/** 根目录 */
export const files = reactive<File[]>([]);

/** 打开的文件 */
export const openedFiles = reactive(new Map<string, File>());

export function lang(key: string, def?: string, params?: Record<string, any>) {
	let text = store.render.langs[key];
	if (!text) {
		text = def || '';
	}
	if (params) {
		Object.keys(params).forEach((k) => {
			text = text.replace(new RegExp(`{{${k}}}`, 'g'), params[k]);
		});
	}
	return text;
}
