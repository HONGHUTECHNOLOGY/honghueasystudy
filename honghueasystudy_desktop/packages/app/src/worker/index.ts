import { Instance as Chalk } from 'chalk';
import { LoggerCore } from '../logger.core';
import path, { basename } from 'path';
import fs from 'fs';
import { chromium, BrowserContext, Page, LaunchOptions, Response, Request } from 'playwright-core';
import { AppStore } from '../../types';
import { AutomationScripts } from '../scripts/index';
import { Config } from '../scripts/interface';
import _get from 'lodash/get';
import child_process from 'child_process';
import { getBrowserMajorVersion, getBuiltinExtensionPaths } from '../utils/browser';

const { bgRedBright, bgBlueBright, bgYellowBright, bgGray } = new Chalk({ level: 2 });

type AS = { name: string; configs: Record<string, Config> };

type BrowserInfo = { name: string; notes: string; tags: { color: string; name: string }[] };

type BrowserConfig = {
	/** 是否启用弹窗 */
	enable_dialog?: boolean;
};

/**
 * 单个页面的前台状态采样结果
 *
 * known=false 表示这次没取到（页面正在跳转/已销毁），不能当作「不可见」，
 * 否则一个正在加载的页面会把「当前页」挤到别的标签上。
 */
interface PageState {
	page: Page;
	url: string;
	title: string;
	visible: boolean;
	focused: boolean;
	known: boolean;
	/** 本次采样中第一次出现（用户刚开的标签，几乎一定在前台） */
	fresh: boolean;
	/** 最近一次被观测到持有焦点的时间 */
	focusedAt: number;
	/** 最近一次被观测到可见的时间 */
	visibleAt: number;
}

/** 页面内视频的播放状态（远程台用来区分「正常播放」和「真的卡住」） */
export interface MediaState {
	playing: boolean;
	/** 当前播放位置（秒） */
	currentTime: number;
	/** 总时长（秒），直播/未知为 0 */
	duration: number;
}

interface Langs {
	error_when_executable_not_found?: string;
	error_when_browser_version_too_high?: string;
	error_when_browser_launch_failed_too_fast?: string;
	error_when_extension_version_too_low?: string;
	error_when_playwright_selector_timeout?: string;
	webrtc_page_loading_notice?: string;
}

/** 脚本工作线程 */
export class ScriptWorker {
	uid: string = '';
	browser?: BrowserContext;
	logger?: LoggerCore;
	/** 拓展路径 */
	extensionPaths: string[] = [];
	/** 执行的自动化程序列表 */
	automationScripts: AS[] = [];
	/** 可关闭的浏览器拓展主页 */
	store?: AppStore;
	/** 浏览器中软件设置的名字 */
	browserInfo?: BrowserInfo;
	config?: BrowserConfig;
	/** 上一次判定为「当前页」的页面对象，多个页面同分时沿用，避免来回跳 */
	private lastActivePage?: Page;
	/** 每页的 CDP 会话：用来关掉 Playwright 的焦点模拟（否则 hasFocus 恒为 true） */
	private cdpSessions = new WeakMap<Page, any>();
	/** 已经出现过的页面：用于识别「用户刚打开的新标签」 */
	private seenPages = new WeakSet<Page>();
	/** 焦点冲突（多页同时 focused）是否已记过日志，避免每次轮询刷屏 */
	private focusConflictLogged = false;
	/** 每页最近一次被观测到在前台/可见的时间，用于「浏览器整体失焦」时回退 */
	private pageActivity = new WeakMap<Page, { focusedAt: number; visibleAt: number }>();
	/**
	 * 远程自动化（登录 / 选课）使用的页面
	 *
	 * 优先复用**已经存在的标签**：浏览器如果配了「启动后自动运行自动程序」，
	 * 登录态和课程页早就在某个标签里了，这时再 `newPage()` 得到的是一张
	 * about:blank —— 既抽不到课程，又会在电脑上莫名多出一个空白标签。
	 */
	private automationPage?: Page;
	/**
	 * 上一次识别到的平台 id
	 *
	 * 登录脚本有时会自己开新标签、或把原页面关掉，此时手上没有平台页面了；
	 * 记住上一次的平台，`course.list` 才仍然知道该打开哪个课程列表页。
	 */
	private automationPlatformId = '';
	static langs?: Langs;
	static lang: (key: keyof Langs, def?: string, replace?: Record<string, string>) => string = (key, def, replace) => {
		const result = _get(ScriptWorker.langs, key, def);
		return (replace ? result?.replace(/\{\{(\w+)\}\}/g, (_, k) => replace[k] || '') : result) as string;
	};

	static getTransformedErrorMessage = (error: string, extra_placeholder?: Record<string, string>) => {
		if (error.match(/Timeout .+ exceeded/)) {
			return ScriptWorker.lang(
				'error_when_playwright_selector_timeout',
				'页面元素查找超时，请检查元素是否存在/可见或选择器是否正确。',
				{ error: error, ...extra_placeholder }
			);
		}
		return error;
	};

	init({
		store,
		uid,
		cachePath,
		automationScripts,
		browserInfo,
		config,
		langs
	}: {
		store: AppStore;
		uid: string;
		cachePath: string;
		automationScripts: AS[];
		browserInfo: BrowserInfo;
		config: BrowserConfig;
		langs: Langs;
	}) {
		this.debug('正在初始化进程...');

		this.store = store;
		ScriptWorker.langs = langs;

		this.uid = uid;
		// 只加载鸿鹄易学内置扩展，不再加载脚本猫/篡改猴等外部脚本管理器
		this.extensionPaths = getBuiltinExtensionPaths(store.paths.extensionsFolder);

		// 自动化程序
		this.automationScripts = automationScripts;

		// 初始化日志
		this.logger = new LoggerCore(store.paths['logs-path'], false, 'script', path.basename(cachePath));

		// 浏览器中软件设置的名字
		this.browserInfo = browserInfo;
		this.config = config;

		this.debug('初始化成功');
	}

	async launch(
		options: Required<Pick<LaunchOptions, 'executablePath' | 'headless' | 'args'>> & {
			userDataDir: string;
			/**
			 * 开发者调试端口
			 *
			 * >0 时额外给浏览器加 `--remote-debugging-port`，外部工具（DevTools / 脚本 / AI）
			 * 可以直接连进来看页面真实 DOM：http://127.0.0.1:<端口>/json
			 */
			devToolsPort?: number;
		}
	) {
		if (this.extensionPaths.length) {
			this.debug(
				'加载拓展：',
				this.extensionPaths.map((p) => basename(p))
			);
		} else {
			this.debug('浏览器拓展为空');
		}

		/**
		 * 启动参数必须合并，不能覆盖。
		 *
		 * 原实现是 `options.args = formatExtensionArguments(...)`：前端传进来的任何参数
		 * （自定义开关、调试端口）都会被这一行直接冲掉，排查页面问题最需要的入口就此消失。
		 */
		const extensionArguments = formatExtensionArguments(this.extensionPaths);
		const extraArguments = Array.isArray(options.args) ? options.args : [];
		options.args = [...extensionArguments, ...extraArguments];

		if (options.devToolsPort && options.devToolsPort > 0) {
			options.args.push(
				`--remote-debugging-port=${options.devToolsPort}`,
				// 外部 WebSocket 连接（DevTools / Puppeteer / Playwright connectOverCDP）必须放行来源
				'--remote-allow-origins=*'
			);
			this.debug(`开发者调试端口已开放：http://127.0.0.1:${options.devToolsPort}`);
		}

		const start_time = Date.now();

		/** =============================== 检测谷歌浏览器是否可用 =============================== */
		if (!fs.existsSync(options.executablePath)) {
			console.error(
				ScriptWorker.lang(
					'error_when_executable_not_found',
					`浏览器可执行文件不存在，请在设置中更换浏览器路径。：${options.executablePath}`,
					{ executablePath: options.executablePath }
				)
			);
			return await this.close();
		}

		const major = getBrowserMajorVersion(options.executablePath);
		console.log('major', major);
		const isEdge = options.executablePath.toLowerCase().includes('edge');
		// Chrome 138+ 禁止 --load-extension 命令行加载扩展；Edge 不受此限制（全平台生效）
		if (major && major > 137 && !isEdge) {
			console.error(
				ScriptWorker.lang(
					'error_when_browser_version_too_high',
					'当前浏览器版本过高，无法自动加载鸿鹄易学扩展，请在设置-浏览器路径中切换“软件内置”浏览器，如果没有内置浏览器，请重新在官网下载最新鸿鹄易学软件并安装'
				)
			);
			return await this.close();
		}

		/** =============================== 检测拓展是否可用 =============================== */
		for (const extensionPath of this.extensionPaths) {
			if (!fs.existsSync(extensionPath)) {
				console.error(`拓展不存在：${extensionPath}`);
				return await this.close();
			}

			if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
				console.error(`拓展格式不正确，缺少manifest.json：${extensionPath}`);
				return await this.close();
			}

			const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'));
			// 检查是否为 MV2 拓展，如果是则报错
			if (_get(manifest, 'manifest_version', 2) < 3) {
				const name = getExtensionName(extensionPath);
				console.error(
					ScriptWorker.lang(
						'error_when_extension_version_too_low',
						`该拓展版本较低：{{name}}，请尝试前往软件左侧-应用中心-卸载并重新安装。`,
						{ name }
					)
				);
				return await this.close();
			}
		}

		/** 启动浏览器 */
		try {
			await launchBrowser({
				/**
				 * 启动时自动跑的登录脚本跑完后，把「登录后落在哪一页 / 哪个平台」记住。
				 *
				 * 不接这一步的话，远程端来读课程时 worker 对登录结果一无所知：
				 * 它既不知道去哪个平台读课程，也不知道该复用哪一张标签，
				 * 只能自己新开一张 —— 那正好是一张 about:blank，于是一门课都读不到。
				 */
				onAutomationDone: (result) => {
					if (result.platformId) {
						this.automationPlatformId = result.platformId;
						console.log(`[启动] 自动化程序落地平台：${result.platformId}`);
					}
					if (result.page && !result.page.isClosed()) {
						this.automationPage = result.page;
						console.log(`[启动] 自动化程序落地页：${result.page.url()}`);
					}
				},
				onLaunch: (browser) => {
					this.browser = browser;

					/** URL事件解析器 */
					this.browser?.on('page', (page) => {
						const match = page.url().match(/hh-action_(.+)/);
						if (match?.[1]) {
							const action = match[1];
							const actions: any = {
								'bring-to-top': () => {
									// 通过命令行打开此页面后会置顶浏览器，并自动关闭当前事件页面
									page.close();
								}
							};

							actions[action]();
						}
					});

					/**
					 * 远程控制：页面新增/跳转/关闭时通知渲染进程刷新页面列表。
					 * 只发送轻量信号，具体数据由渲染进程按需调用 getPages() 拉取。
					 */
					const notifyPageChange = () => send('page-changed', this.uid);
					this.browser?.on('page', (page) => {
						page.on('framenavigated', notifyPageChange);
						page.on('close', notifyPageChange);
						notifyPageChange();
					});

					// 浏览器启动完成
					send('launched');
				},

				automationScripts: this.automationScripts,
				bookmarksPageUrl: this.store
					? `http://localhost:${this.store?.server.port || 15319}/index.html#/bookmarks?uid=${this.uid}`
					: undefined,
				serverPort: this.store?.server.port || 15319,
				closeableExtensionHomepages: [],
				authToken: this.store?.server.authToken || '',
				browserInfo: this.browserInfo,
				uid: this.uid,
				config: this.config,
				/**
				 * 调试端口只用于拼启动参数，不往下传给 launchBrowser。
				 * 用 delete 而不是解构丢弃，避免触发 noUnusedLocals。
				 */
				...(() => {
					const rest = { ...options } as typeof options & { devToolsPort?: number };
					delete rest.devToolsPort;
					return rest;
				})()
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);

			// 浏览器异常关闭
			if (err instanceof Error) {
				if (
					err.message.includes('browser has been closed') ||
					err.message.includes('Target closed') ||
					err.message.includes('Browser closed')
				) {
					// 5秒内异常关闭，可能是浏览器问题
					if (Date.now() - start_time < 5 * 1000) {
						console.error(
							ScriptWorker.lang(
								'error_when_browser_launch_failed_too_fast',
								'异常启动，请尝试重启浏览器，或者在设置中更换其他浏览器',
								{
									error: err.message.substring(0, 500)
								}
							)
						);
					} else {
						console.error('异常关闭，请尝试重启浏览器。', err.message.substring(0, 500));
					}
				} else {
					console.error('错误 : ', err.message.substring(0, 500));
				}
			} else {
				console.error('未知错误 : ', String(err).substring(0, 500));
			}

			/**
			 * 无论哪种失败都要显式告诉渲染进程。
			 * 否则界面只能干等看门狗的 120 秒，期间一直显示「启动中」，
			 * 用户看到的是「浏览器明明起来了、状态却不动」。
			 */
			send('launch-failed', ScriptWorker.getTransformedErrorMessage(message));
			return await this.close();
		}

		// 浏览器初始化完成
		send('init');
	}

	async close() {
		await this.browser?.close();
		this.browser = undefined;
		send('browser-closed');
		process.exit();
	}

	// TODO
	async bringToFront() {
		this.browser?.pages().at(-1)?.bringToFront();
	}

	/**
	 * 获取当前活动页面的截图（JPEG base64）
	 *
	 * 使用 Playwright 截图而非系统窗口截图：
	 * 能精确对应浏览器实例，且窗口被遮挡、最小化时依然可用。
	 *
	 * 页面选择优先级：
	 * 1. 远程端明确指定的 page 索引（用户在远程台切了标签页）
	 * 2. 前台可见的标签页（document.visibilityState === 'visible'）
	 * 3. 最后一个标签页
	 *
	 * 取「前台可见页」而不是简单取第一个/最后一个：脚本经常会在后台新开标签页
	 * （验证码、跳转中转页），这些页面内容静止，取错会导致远程画面长时间停留在一张不变的图上。
	 */
	async snapshot(options?: { quality?: number; page?: number }): Promise<string> {
		const pages = this.browser?.pages() || [];
		if (pages.length === 0) {
			throw new Error('浏览器尚未打开任何页面');
		}

		const requested = options && typeof options.page === 'number' ? options.page : -1;
		let page: Page | undefined;

		if (requested >= 0 && requested < pages.length) {
			page = pages[requested];
		} else {
			/**
			 * 不指定页码时必须和页面列表用同一套判定。
			 * 这里原来单独按 visibilityState 找，而 Playwright 下所有标签都是 visible，
			 * 结果永远截到第一个页面（与列表里标的「当前」还可能不一致）。
			 */
			page = await this.pickActivePage();
			if (!page) page = pages[pages.length - 1];
		}

		const quality = options && options.quality ? Math.min(Math.max(options.quality, 20), 90) : 55;

		const buffer = await page.screenshot({
			type: 'jpeg',
			quality,
			timeout: 10000,
			animations: 'disabled',
			caret: 'hide'
		});

		return Buffer.isBuffer(buffer) ? buffer.toString('base64') : '';
	}

	/**
	 * 获取当前浏览器实例的所有页面
	 *
	 * active 标记真正的前台标签，远程台据此把「默认查看的标签页」定位到用户正在看的那一页，
	 * 而不是永远截第一页。
	 */
	async getPages(): Promise<{ url: string; title: string; active: boolean }[]> {
		const pages = this.browser?.pages() || [];
		if (pages.length === 0) return [];

		const states = await this.collectPageStates(pages);
		const active = this.resolveActivePage(states);

		/** 任何时刻最多只有一个页面 active，远程端的「当前」徽标与默认截图页都依赖这个唯一性 */
		return states.map((state) => ({
			url: state.url,
			title: state.title,
			active: state.page === active
		}));
	}

	/**
	 * 一键获取当前页面信息（开发者调试用）
	 *
	 * 把页面「原样」落盘，交给人工或 AI 分析真实 DOM：
	 * - `page.html`：完整 DOM 序列化
	 * - `page.png`：当前视口截图
	 * - `info.json`：URL / 标题 / 平台 / 同构容器分组 / 链接 / 文本块 / 表单 / 存储键
	 *
	 * 全程只读：不点击、不填表、不修改页面。落盘位置跟随日志目录
	 * （`<logs>/debug-dumps/<时间戳>-<host>/`），方便直接打包发出去。
	 */
	async dumpPage(options?: { page?: number }): Promise<{
		dir: string;
		url: string;
		title: string;
		platformId: string;
		files: { name: string; size: number }[];
		containerCount: number;
	}> {
		const pages = (this.browser?.pages() || []).filter((item) => !item.isClosed());
		if (pages.length === 0) throw new Error('浏览器尚未打开任何页面');

		const requested = options && typeof options.page === 'number' ? options.page : -1;
		let page: Page | undefined;
		if (requested >= 0 && requested < pages.length) {
			page = pages[requested];
		} else {
			/** 和截图/页面列表同一套「当前页」判定，避免抓到后台的验证码中转页 */
			page = await this.pickActivePage();
			if (!page) page = pages[pages.length - 1];
		}

		const url = page.url();
		const title = await page.title().catch(() => '');
		const platformId = detectCoursePlatform(url)?.id || '';

		const root = path.join(this.store?.paths?.['logs-path'] || process.cwd(), 'debug-dumps');
		const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
		let host = 'page';
		try {
			host = new URL(url).host.replace(/[^\w.-]/g, '_') || 'page';
		} catch {
			// about:blank / data: 之类没有 host
		}
		const dir = path.join(root, `${stamp}-${host}`);
		fs.mkdirSync(dir, { recursive: true });

		/**
		 * 结构摘要
		 *
		 * 「同构重复容器」是识别列表/卡片最有效的线索：课程卡片、菜单项、章节行
		 * 都是同一份 class 重复 N 次。这里按 `tag|class` 分组后按数量排序，
		 * 顺带带上第一个样本的文本与 HTML，肉眼即可判断哪一组是课程列表。
		 */
		const summary = await page.evaluate(() => {
			const flat = (el: Element) => (el.textContent || '').replace(/\s+/g, ' ').trim();

			const groups = new Map<string, Element[]>();
			const all = Array.from(document.querySelectorAll('body *')).slice(0, 3000);
			for (const el of all) {
				const cls = String(el.className || '').trim();
				if (!cls || cls.length > 140) continue;
				const key = el.tagName.toLowerCase() + '|' + cls;
				const list = groups.get(key);
				if (!list) {
					groups.set(key, [el]);
				} else if (list.length < 40) {
					list.push(el);
				}
			}

			const containers = Array.from(groups.entries())
				.filter(([, list]) => list.length >= 2)
				.sort((a, b) => b[1].length - a[1].length)
				.slice(0, 40)
				.map(([key, list]) => ({
					key,
					count: list.length,
					text: flat(list[0]).slice(0, 160),
					html: (list[0].outerHTML || '').replace(/\s+/g, ' ').slice(0, 500)
				}));

			/** 链接：判断「课程入口在哪」最直接 */
			const links = Array.from(document.querySelectorAll('a[href]'))
				.slice(0, 120)
				.map((a) => ({
					text: flat(a).slice(0, 60),
					href: (a as HTMLAnchorElement).href,
					title: a.getAttribute('title') || '',
					cls: String(a.className || '').slice(0, 80)
				}))
				.filter((item) => item.text || item.title);

			/** 独立的短文本块：课程名/作者名多半在这里，配合 class 更容易定选择器 */
			const textBlocks: { tag: string; cls: string; text: string }[] = [];
			for (const el of all) {
				if (textBlocks.length >= 120) break;
				if (el.children.length > 0) continue;
				const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
				if (text.length < 2 || text.length > 60) continue;
				textBlocks.push({
					tag: el.tagName.toLowerCase(),
					cls: String(el.className || '').slice(0, 80),
					text
				});
			}

			const fields = Array.from(document.querySelectorAll('input, textarea, select, button'))
				.slice(0, 60)
				.map((el) => ({
					tag: el.tagName.toLowerCase(),
					type: el.getAttribute('type') || '',
					name: el.getAttribute('name') || '',
					placeholder: el.getAttribute('placeholder') || '',
					text: flat(el).slice(0, 40),
					cls: String(el.className || '').slice(0, 60)
				}));

			/**
			 * 存储键名
			 *
			 * 必须把取 storage 对象本身也包进 try：about:blank、沙箱 iframe、chrome:// 页面上
			 * 读 localStorage 会直接抛 SecurityError，把整个摘要打挂（实测踩过）。
			 */
			const storageKeys = (getter: () => Storage) => {
				try {
					return Object.keys(getter()).slice(0, 60);
				} catch {
					return [];
				}
			};

			const cookieNames = () => {
				try {
					return document.cookie
						.split(';')
						.map((item) => item.split('=')[0].trim())
						.filter(Boolean);
				} catch {
					return [];
				}
			};

			return {
				href: location.href,
				title: document.title,
				readyState: document.readyState,
				viewport: { width: window.innerWidth, height: window.innerHeight },
				documentSize: {
					width: document.documentElement.scrollWidth,
					height: document.documentElement.scrollHeight
				},
				counts: {
					elements: document.querySelectorAll('*').length,
					links: document.querySelectorAll('a[href]').length,
					iframes: document.querySelectorAll('iframe').length,
					images: document.querySelectorAll('img').length
				},
				containers,
				links,
				textBlocks,
				fields,
				storage: {
					local: storageKeys(() => localStorage),
					session: storageKeys(() => sessionStorage),
					/** 只留名字，不落 cookie 值 */
					cookies: cookieNames()
				},
				iframes: Array.from(document.querySelectorAll('iframe')).map((item) => item.src).slice(0, 20)
			};
		});

		const files: { name: string; size: number }[] = [];
		const write = (name: string, content: string) => {
			const target = path.join(dir, name);
			fs.writeFileSync(target, content, 'utf8');
			files.push({ name, size: fs.statSync(target).size });
		};

		write(
			'info.json',
			JSON.stringify(
				{
					dumpedAt: new Date().toISOString(),
					url,
					title,
					platformId,
					userAgent: await page.evaluate(() => navigator.userAgent).catch(() => ''),
					summary
				},
				null,
				2
			)
		);
		write('page.html', await page.content());

		try {
			const shot = await page.screenshot({ type: 'png', timeout: 15000, animations: 'disabled', caret: 'hide' });
			const target = path.join(dir, 'page.png');
			fs.writeFileSync(target, shot);
			files.push({ name: 'page.png', size: fs.statSync(target).size });
		} catch (err) {
			console.warn('截图失败（不影响 HTML 与结构摘要）：', err instanceof Error ? err.message : String(err));
		}

		console.log(`[调试] 已导出页面信息：${dir}`);

		return {
			dir,
			url,
			title,
			platformId,
			files,
			containerCount: Array.isArray((summary as any)?.containers) ? (summary as any).containers.length : 0
		};
	}

	/**
	 * 采集每个页面的前台状态
	 *
	 * 关键：Playwright 默认对每个 page 打开 Emulation.setFocusEmulationEnabled，
	 * 效果是**所有标签**的 document.hasFocus() 都为 true、visibilityState 都为 visible。
	 * 直接拿它判「当前页」会全部同分，只能沿用初始索引 —— 表现就是「明明前台是别的标签，
	 * 远程永远显示第一个」。实测关闭该模拟后 hasFocus 才反映真实标签焦点，
	 * 且 click / fill 等自动化操作不受影响。
	 */
	private async collectPageStates(pages: Page[]): Promise<PageState[]> {
		const now = Date.now();

		return Promise.all(
			pages.map(async (page) => {
				let title = '';
				try {
					title = await Promise.race([
						page.title(),
						new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500))
					]);
				} catch {
					title = '';
				}

				/**
				 * 必须先关掉焦点模拟，否则读出来的 focused 全为 true。
				 * 返回值是 CDP 会话（拿不到为 undefined），后面采样失败时用它兜底。
				 */
				const session = await this.disableFocusEmulation(page);

				let visible = false;
				let focused = false;
				let known = false;
				try {
					const state = await Promise.race([
						page.evaluate(() => ({
							v: document.visibilityState,
							f: document.hasFocus()
						})),
						new Promise<{ v: string; f: boolean }>((resolve) =>
							setTimeout(() => resolve({ v: '', f: false }), 900)
						)
					]);
					if (state.v) {
						visible = state.v === 'visible';
						focused = !!state.f;
						known = true;
					}
				} catch {
					// 页面正在跳转/已关闭：记为未知，不参与打分
				}

				/**
				 * CDP 兜底采样。
				 *
				 * 用户随手开的新标签页常常是 chrome://newtab 这类 WebUI 页面，
				 * page.evaluate 拿不到执行上下文（或超时）→ known 永远为 false。
				 * 而唯一能确认「它是前台」的手段就是读这两个状态，不兜底的话
				 * 新标签连候选都进不去，远程会一直停在旧标签上。
				 */
				if (!known && session) {
					try {
						const raw = await Promise.race([
							session.send('Runtime.evaluate', {
								expression: 'document.visibilityState + "|" + (document.hasFocus() ? "1" : "0")',
								returnByValue: true
							}),
							new Promise<any>((resolve) => setTimeout(() => resolve(undefined), 900))
						]);
						const value = raw && raw.result && raw.result.value;
						if (typeof value === 'string' && value.includes('|')) {
							const [v, f] = value.split('|');
							if (v) {
								visible = v === 'visible';
								focused = f === '1';
								known = true;
							}
						}
					} catch {
						// 兜底也拿不到（页面已销毁）：维持未知
					}
				}

				const activity = this.pageActivity.get(page) || { focusedAt: 0, visibleAt: 0 };
				if (known) {
					if (focused) activity.focusedAt = now;
					if (visible) activity.visibleAt = now;
					this.pageActivity.set(page, activity);
				}

				const fresh = !this.seenPages.has(page);
				if (fresh) this.seenPages.add(page);

				return {
					page,
					url: page.url(),
					title,
					visible,
					focused,
					known,
					fresh,
					focusedAt: activity.focusedAt,
					visibleAt: activity.visibleAt
				};
			})
		);
	}

	/** 关掉 Playwright 对单个页面的焦点模拟（幂等，会话缓存复用），返回 CDP 会话供兜底采样用 */
	private async disableFocusEmulation(page: Page): Promise<any | undefined> {
		let session = this.cdpSessions.get(page);
		try {
			if (!session) {
				session = await page.context().newCDPSession(page);
				this.cdpSessions.set(page, session);
			}
			await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
			return session;
		} catch {
			/** 页面已销毁或会话失效：丢掉缓存，下次采样重建 */
			this.cdpSessions.delete(page);
			return undefined;
		}
	}

	/**
	 * 挑出唯一的「当前页」
	 *
	 * 打分：真实焦点 5 > 可见 4 > 「刚出现且采样不到」3 > 采样不到 1 > 不可见 0。
	 *
	 * 三个关键点：
	 * 1. 采样失败（known=false）的页面**不再被直接排除**。原来只给 known 的页面打分，
	 *    而新开的 chrome://newtab 类页面永远读不到状态 → 连候选都进不去；剩下几个
	 *    后台标签全是 0 分打平，靠 lastActivePage 沿用 → 远程永远停在旧标签上。
	 * 2. 新出现的页面给一档加成：用户刚点的标签按定义就在前台，即使读不到状态，
	 *    也该优先于旧的后台标签。
	 * 3. 只有一个标签能真正持有焦点。若同时有多个页面声称 focused，说明焦点模拟
	 *    还没关掉（富余情况下 Playwright 会连 visibilityState 一起伪造），
	 *    这时焦点信号整批不可信，降级只用可见性 + 新页/上次判定。
	 */
	private resolveActivePage(states: PageState[]): Page | undefined {
		if (states.length === 0) return undefined;

		const focusTrusted = states.filter((state) => state.focused).length <= 1;

		/** 只在状态翻转时记一行，便于事后定位「焦点模拟没关掉」的现场 */
		if (!focusTrusted && !this.focusConflictLogged) {
			this.debug(
				'多个页面同时报告持有焦点（焦点模拟未生效），本次降级为可见性判定：',
				states.map((state) => `${state.visible ? 'V' : '-'}${state.focused ? 'F' : '-'} ${state.url.slice(0, 60)}`).join(' | ')
			);
			this.focusConflictLogged = true;
		} else if (focusTrusted) {
			this.focusConflictLogged = false;
		}

		const scoreOf = (state: PageState) => {
			if (focusTrusted && state.focused) return 5;
			if (state.visible) return 4;
			if (!state.known) return state.fresh ? 3 : 1;
			return 0;
		};

		const bestScore = Math.max(...states.map(scoreOf));
		const tied = states.filter((state) => scoreOf(state) === bestScore);

		let chosen: PageState;
		if (tied.length === 1) {
			chosen = tied[0];
		} else {
			chosen =
				tied.find((state) => state.fresh) ||
				tied.find((state) => state.page === this.lastActivePage) ||
				tied.reduce((a, b) =>
					b.focusedAt > a.focusedAt || (b.focusedAt === a.focusedAt && b.visibleAt >= a.visibleAt) ? b : a
				);
		}

		this.lastActivePage = chosen.page;
		return chosen.page;
	}

	/**
	 * 读取当前页面的视频播放状态
	 *
	 * 网课一个视频动辄几十分钟，播放期间脚本不会有任何日志输出。
	 * 远程台只看「日志静止」会把正常播放误判成卡住，所以把播放进度也当作活性信号。
	 *
	 * 视频通常在 iframe 里（超星、智慧树都是），必须逐 frame 找；
	 * 只看主文档会永远返回 null，等于没做。取进度最大的那个 video，
	 * 避免页面里同时挂着一个广告/预加载的 0 秒播放器。
	 */
	async getMedia(): Promise<MediaState | null> {
		const page = await this.pickActivePage();
		if (!page) return null;

		let best: MediaState | null = null;

		/** 限制扫描的 frame 数量：每帧最坏 600ms，页面 frame 多时会把这次采集拖过心跳预算 */
		for (const frame of page.frames().slice(0, 10)) {
			try {
				const info = await Promise.race([
					frame.evaluate(() => {
						const videos = Array.from(document.querySelectorAll('video')) as HTMLVideoElement[];
						if (videos.length === 0) return null;

						let pick: HTMLVideoElement | null = null;
						for (const video of videos) {
							if (!pick || (video.currentTime || 0) > (pick.currentTime || 0)) pick = video;
						}
						if (!pick) return null;

						const duration = Number.isFinite(pick.duration) ? pick.duration : 0;

						return {
							playing: !pick.paused && !pick.ended && pick.readyState > 2,
							currentTime: Math.round((pick.currentTime || 0) * 10) / 10,
							duration: Math.round(duration * 10) / 10
						};
					}),
					new Promise<null>((resolve) => setTimeout(() => resolve(null), 600))
				]);

				if (!info) continue;
				/** 找到正在播放的就直接返回，不用再扫其它 frame */
				if (info.playing) return info;
				if (!best) best = info;
			} catch {
				// frame 可能已销毁或正在跳转，跳过
			}
		}

		return best;
	}

	// ------------------------------------------------------------ 远程自动化

	/**
	 * 远程触发一次自动化脚本（登录类）
	 *
	 * 两个关键点：
	 * 1. 这些脚本内部用 `emit('script-error')` 报错，**不抛异常**（cx/zhs 全是这个写法）。
	 *    只 await run() 会把失败当成功，远程端看到「已完成」其实根本没登上，
	 *    所以必须临时挂监听，把错误收集起来转成 reject。
	 * 2. 配置来自手机端手填，需要按脚本声明的 configs 逐项校验（必填、类型），
	 *    不能直接把请求体原样塞进去。
	 */
	async runAutomationScript(options: {
		name: string;
		configs?: Record<string, any>;
	}): Promise<{ name: string; url: string; title: string; duration: number }> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		const name = String((options && options.name) || '').trim();
		if (!name) throw new Error('缺少脚本名称');

		const script = AutomationScripts.find((item) => item.name === name);
		if (!script) throw new Error('未知的自动化脚本：' + name);

		const configs = this.buildAutomationConfig(script, (options && options.configs) || {});
		const page = await this.acquireAutomationPage();

		const errors: string[] = [];
		const onError = (...args: any[]) => errors.push(args.map((item) => String(item)).join(' '));
		const onData = (...args: any[]) => this.info(...args);

		script.on('script-data', onData);
		script.on('script-error', onError);

		const startedAt = Date.now();
		try {
			this.info(`[远程] 开始执行自动化脚本：${name}（${page.url()}）`);
			/**
			 * AutomationScripts 是各脚本类型组成的联合，`run` 的 configs 被推导成
			 * 具体字面量类型；这里的配置是按脚本声明动态构造的，只能放宽类型。
			 */
			await (script.run as any)(page, configs, {
				ocrApiUrl: `http://localhost:${this.store?.server.port || 15319}/ocr`,
				ocrApiImageKey: 'image',
				detBackgroundKey: 'det_bg',
				detTargetKey: 'det_target'
			});
		} catch (e) {
			errors.push(e instanceof Error ? e.message : String(e));
		} finally {
			script.off('script-data', onData);
			script.off('script-error', onError);
		}

		if (errors.length) {
			const message = errors.join('；');
			this.error('[远程] 自动化脚本失败：', message);
			throw new Error(ScriptWorker.getTransformedErrorMessage(message));
		}

		const url = page.url();
		const title = await page.title().catch(() => '');

		/**
		 * 登录脚本经常自己开新标签（滑块验证、扫码、单点登录都要跳），
		 * 结束时得重新认一下「登录后的落点在哪一页」，否则紧接着抽课程
		 * 还会抽旧页面，一门课都读不到。
		 */
		const landed = (this.browser?.pages() || []).find(
			(item) => !item.isClosed() && detectCoursePlatform(item.url())
		);
		if (landed) this.automationPage = landed;
		const platform = detectCoursePlatform((landed || page).url());
		if (platform) this.automationPlatformId = platform.id;

		this.info(`[远程] 自动化脚本执行完成：${name} → ${title || url}`);
		return { name, url, title, duration: Date.now() - startedAt };
	}

	/**
	 * 读取当前平台课程列表
	 *
	 * `refresh` 为 true 时先打开平台课程页（登录完成后手机端点「刷新课程列表」走这条），
	 * 否则只在当前页面上抽取。抽取到的元素会就地打上 `data-hh-course` 标记，
	 * 之后「进入课程」按标记点击 —— 这样对纯 JS 跳转、没有 href 的卡片也有效。
	 */
	async listCourses(options?: { refresh?: boolean }): Promise<{
		platform: string;
		pageUrl: string;
		pageTitle: string;
		/** label 是课程类型角标（共享课 / 翻转课 / 公开课…），平台没标就为空 */
		courses: { id: string; name: string; url: string; label?: string }[];
		hint: string;
	}> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		const browser = this.browser;
		const wantRefresh = !options || options.refresh !== false;

		/**
		 * 只有导航页、也没有任何平台线索时，别急着开新标签：
		 * 那会留下一个永远读不到课的空白页，用户看到的就是「又莫名多了个空白网页」。
		 * 直接返回提示，让用户先去跑登录脚本。
		 */
		const serverPort = this.store?.server?.port || 15319;
		const hasUsablePage = browser
			.pages()
			.some((item) => !item.isClosed() && !isBookmarksPageUrl(item.url(), serverPort));
		if (!hasUsablePage) {
			const known = this.rememberedPlatform() || (await this.platformFromCookies());
			if (!known) {
				return {
					platform: '',
					pageUrl: '',
					pageTitle: '',
					courses: [],
					hint: '还没有检测到教学平台的登录状态，请先运行登录脚本（或在桌面端浏览器里打开课程列表）。'
				};
			}
		}

		const page = await this.acquireAutomationPage({ requirePlatform: true });

		/**
		 * 平台判定四层兜底：当前页 → 记住的上次平台 → Cookie 域 → 放弃。
		 *
		 * 「识别不到课程」最常见的原因不是没登录，而是拿到了一张空白页；
		 * 登录脚本跑完又常把临时标签关掉（扫码 / 单点登录流程），页面上一点痕迹都不剩。
		 * Cookie 是按 context 持久化的，只要还留着一个平台域名的 Cookie，
		 * 就知道该去哪个平台读课程。
		 */
		let platform = detectCoursePlatform(page.url()) || this.rememberedPlatform() || (await this.platformFromCookies());

		const extract = async (target: Page) => {
			/** 先把列表滚到底：智慧树的共享课就藏在懒加载的第二批里 */
			await autoScrollForCourses(target);
			return target
				.evaluate(extractCoursesInPage, {
					platform: detectCoursePlatform(target.url())?.id || platform?.id || ''
				})
				.catch(() => undefined);
		};

		let items: { id: string; name: string; url: string; label?: string }[] = [];
		let pageTitle = '';
		let used = page;

		/**
		 * 1) 先在已经开着的页面上抽，**不要**一上来就导航
		 *
		 * 登录脚本跑完常常就停在「我的课程」页，课程是全的；以前这里无条件先跳到平台首页，
		 * 等于把现成能用的页面顶掉，反而一门课都读不到。
		 *
		 * 用户常同时开着课程页和视频页，所以主页面抽不到时再试其他平台标签（最多 4 个）。
		 */
		const attempts: Page[] = [page];
		browser.pages().forEach((item) => {
			if (item === page || item.isClosed() || attempts.length >= 4) return;
			if (!detectCoursePlatform(item.url())) return;
			attempts.push(item);
		});

		for (const target of attempts) {
			const result = await extract(target);
			if (!result) continue;
			if (result.items.length) {
				items = result.items;
				pageTitle = result.pageTitle || pageTitle;
				used = target;
				break;
			}
			if (!pageTitle) pageTitle = result.pageTitle || '';
		}

		/**
		 * 2) 确实抽不到，才去打开课程列表页重试
		 *
		 * 只在用户主动刷新、或当前页根本不是网页时做；
		 * 静默探测（refresh=false）遇到普通网页就到此为止，不去打扰用户正在看的东西。
		 */
		const onBlankPage = !/^https?:/i.test(page.url());
		if (!items.length && platform && (wantRefresh || onBlankPage)) {
			const target = platform.listUrl;
			if (normalizeUrl(page.url()) !== normalizeUrl(target)) {
				this.info(`[远程] 打开课程列表页：${target}`);
				await page
					.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 })
					.catch((e: any) => this.warn('[远程] 打开课程列表页失败：', String(e && e.message ? e.message : e)));
				/** 后台标签的渲染会被 Chromium 节流，抽列表前先顶到前台 */
				await page.bringToFront().catch(() => {});
			}
			platform = detectCoursePlatform(page.url()) || platform;
			this.automationPlatformId = platform.id;
			/** 课程列表大多是异步渲染，直接抽取会抽到空列表 */
			await page.waitForTimeout(2500);

			const result = await extract(page);
			if (result && result.items.length) {
				items = result.items;
				pageTitle = result.pageTitle || pageTitle;
				used = page;
			} else if (result && !pageTitle) {
				pageTitle = result.pageTitle || '';
			}
		}

		const finalPlatform = detectCoursePlatform(used.url()) || platform;
		if (items.length) {
			/** 抽到课程的那一页就是后续「进入课程」要点击的页面 */
			this.automationPage = used;
			this.automationPlatformId = finalPlatform?.id || '';
		}

		const hint = items.length
			? ''
			: finalPlatform
				? `已识别为${finalPlatform.label}，但没读到课程（当前页面：${pageTitle || used.url()}）。` +
						'课程页可能还没加载完，点「刷新课程列表」重试，或在桌面端浏览器里打开「我的课程」后再点刷新。'
				: '没有检测到教学平台的登录状态。请先在桌面端浏览器里完成登录（或运行登录脚本），再点「刷新课程列表」。';

		this.info(`[远程] 课程列表：识别到 ${items.length} 门课程（${finalPlatform?.id || '未知平台'}）`);
		return {
			platform: finalPlatform?.id || '',
			pageUrl: used.url(),
			pageTitle,
			courses: items,
			hint
		};
	}

	/** 进入指定课程（列表项由 listCourses 打标记，这里按标记点击或直接跳转） */
	async enterCourse(options: { id: string; name?: string }): Promise<{ url: string; title: string }> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		const id = String((options && options.id) || '').trim();
		if (!id) throw new Error('缺少课程标识');

		const wantName = String((options && options.name) || '').trim();

		/** 优先用读课程列表那一页：上面的 `data-hh-course` 标记就是在这里打的 */
		const page = await this.acquireAutomationPage();

		let handle = await page.$(`[data-hh-course="${id}"]`);
		let directUrl = '';

		/**
		 * 每轮抽课都会重新编号（c1/c2/…），手机端如果还拿着上一轮的列表来点，
		 * 标记可能已经指到别的课程上。名字对不上就按名字重找，别把用户送进错误的课。
		 */
		if (handle && wantName) {
			/** 新标记自带课程名：精确比对，避免子串误判（多门课名字只差个后缀） */
			const markedName = String((await handle.getAttribute('data-hh-course-name').catch(() => '')) || '').trim();
			if (markedName) {
				if (markedName !== wantName) {
					this.warn(`[远程] 课程标记与名称不一致（标记：${markedName}，期望：${wantName}），按名称重新定位`);
					handle = null;
				}
			} else {
				const marked = ((await handle.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
				if (marked && marked.indexOf(wantName) === -1 && wantName.indexOf(marked) === -1) {
					this.warn(`[远程] 课程标记与名称不一致（标记：${marked}，期望：${wantName}），按名称重新定位`);
					handle = null;
				}
			}
		}

		if (!handle) {
			/**
			 * 页面在中途刷新/跳转过，之前的标记就没了。
			 * 按课程名重新抽取一次再定位，比直接报「列表过期」体验好得多
			 * （用户刚登录完就点课程时，课程页的异步渲染经常刚好重载一次）。
			 */
			const name = wantName;
			/** 懒加载列表（智慧树共享课）不滚到底抽不到，重定位前同样先滚 */
			await autoScrollForCourses(page);
			const again = await page.evaluate(extractCoursesInPage, {
				platform: detectCoursePlatform(page.url())?.id || ''
			});
			/**
			 * 同一门课会同时挂「AI智课」和「共享课」两个班，课程名完全一样。
			 * 先按原标记的序号取（卡片顺序在同一页面里稳定），名字对得上才用，
			 * 否则才退到「第一个同名」，避免点共享课结果进了 AI 智课。
			 */
			const seq = /^c(\d+)$/.exec(id);
			const sameIndex = seq ? again.items[Number(seq[1]) - 1] : undefined;
			const hit =
				(sameIndex && sameIndex.name === name ? sameIndex : undefined) ||
				(name ? again.items.find((item) => item.name === name) : undefined);
			if (hit) {
				directUrl = hit.url;
				handle = await page.$(`[data-hh-course="${hit.id}"]`);
			}
			if (!directUrl && !handle) throw new Error('课程列表已过期，请重新刷新课程列表');
		}

		const before = this.browser.pages().length;

		if (directUrl) {
			this.info(`[远程] 按课程名重新定位并进入：${directUrl}`);
			await page.goto(directUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
		} else {
			const rawHref = await handle!.getAttribute('href');
			if (rawHref && /^https?:/i.test(rawHref.trim())) {
				const target = new URL(rawHref.trim(), page.url()).href;
				this.info(`[远程] 进入课程：${target}`);
				await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
			} else {
				/** 没有 href 的卡片（Vue/React 站点靠 click 跳转）只能点 */
				this.info('[远程] 课程卡片无直链，改为点击进入');
				/**
				 * 有些站点会在卡片上方盖一层透明 div（智慧树 AI 教学中心就是），
				 * Playwright 的真实鼠标点击会被它拦下并一直重试到超时。
				 * 先探一次是否被遮挡：被遮挡就直接派发 click，省掉几秒空等。
				 */
				const covered = await handle!
					.evaluate((el) => {
						const box = (el as HTMLElement).getBoundingClientRect();
						const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
						return !!top && top !== el && !el.contains(top);
					})
					.catch(() => false);

				if (covered) {
					this.warn('[远程] 课程卡片被透明层遮挡，改用脚本派发点击');
					await handle!.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
				} else {
					await handle!
						.click({ timeout: 3000 })
						.catch(() => handle!.evaluate((el) => (el as HTMLElement).click()).catch(() => {}));
				}
				await page.waitForTimeout(3000);

				const pages = this.browser.pages();
				if (pages.length > before) {
					const popup = pages[pages.length - 1];
					this.automationPage = popup;
					await popup.waitForLoadState('domcontentloaded').catch(() => {});
				}
			}
		}

		const active = this.automationPage && !this.automationPage.isClosed() ? this.automationPage : page;
		/** 进入课程后把这一页顶到最前，电脑前的人能直接看到刷课界面 */
		await active.bringToFront().catch(() => {});
		const title = await active.title().catch(() => '');
		return { url: active.url(), title };
	}

	/** 校验并填充脚本配置：只接受脚本声明过的字段，必填缺失直接报错 */
	private buildAutomationConfig(
		script: (typeof AutomationScripts)[number],
		input: Record<string, any>
	): Record<string, any> {
		const defs = ((script as any).configs || {}) as Record<string, Config>;
		const configs: Record<string, any> = {};
		const missing: string[] = [];

		for (const key of Object.keys(defs)) {
			const def = defs[key] || ({} as Config);
			const hasInput = Object.prototype.hasOwnProperty.call(input || {}, key);
			let value: any = hasInput ? input[key] : def.value;

			if (def.type === 'number') {
				value = value === '' || value === undefined || value === null ? '' : Number(value);
				if (value !== '' && !Number.isFinite(value)) value = '';
			} else if (def.type === 'switch') {
				value = !!value;
			} else if (typeof value === 'string') {
				value = value.trim();
			}

			if (def.required && (value === '' || value === undefined || value === null)) {
				missing.push(def.label || key);
			}
			configs[key] = value;
		}

		if (missing.length) throw new Error('请填写完整：' + missing.join('、'));
		return configs;
	}

	/** 上一次识别到的平台（登录脚本把页面搞丢时的兜底） */
	private rememberedPlatform(): (typeof COURSE_PLATFORMS)[number] | undefined {
		if (!this.automationPlatformId) return undefined;
		return COURSE_PLATFORMS.find((item) => item.id === this.automationPlatformId);
	}

	/**
	 * 用浏览器 Cookie 推断用户登录过哪个平台
	 *
	 * 浏览器配了「启动后自动运行自动程序」时，登录是脚本自己跑的：
	 * 扫码 / 单点登录常常把临时标签关掉，页面上一点痕迹都留不下，
	 * 但 Cookie 挂在 context 上不会跟着页面消失 —— 这是最后一个可靠的线索。
	 *
	 * 多个平台同时有 Cookie 时按 COURSE_PLATFORMS 的顺序取（zjy 排在 icve 前）。
	 */
	private async platformFromCookies(): Promise<(typeof COURSE_PLATFORMS)[number] | undefined> {
		if (!this.browser) return undefined;

		const cookies = await this.browser.cookies().catch(() => [] as { domain?: string }[]);
		if (!cookies.length) return undefined;

		const ids: { [key: string]: boolean } = {};
		for (const cookie of cookies) {
			/** Cookie 的 domain 是裸域名（`.chaoxing.com`），`detectCoursePlatform` 要完整 URL，这里直接匹正则 */
			const host = String((cookie as { domain?: string }).domain || '').replace(/^\./, '');
			if (!host) continue;
			const platform = COURSE_PLATFORMS.find((item) => item.match.test(host));
			if (platform) ids[platform.id] = true;
		}

		const hit = COURSE_PLATFORMS.find((item) => ids[item.id]);
		if (hit) this.info(`[远程] 依据 Cookie 推断平台：${hit.id}`);
		return hit;
	}

	/**
	 * 取（或复用）自动化页面
	 *
	 * 顺序：缓存页 → 已有教学平台页 → 任意普通网页 → 任意标签 → 最后才新开。
	 * `requirePlatform` 为真时，缓存页不在平台上就不算数，继续往下找。
	 *
	 * 之所以这么绕：浏览器配了「启动后自动运行自动程序」时，登录态和课程页
	 * 早就在某个标签里了；不先找它就 newPage()，拿到的是 about:blank ——
	 * 课程一门也抽不到，还会在电脑上莫名多出一个空白标签。
	 */
	private async acquireAutomationPage(options?: { requirePlatform?: boolean }): Promise<Page> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		const browser = this.browser;
		const serverPort = this.store?.server?.port || 15319;
		/** 导航页要留着显示启动进度：远程读课程一旦把它导航到平台页，用户的导航页就没了 */
		const isNav = (item: Page) => isBookmarksPageUrl(item.url(), serverPort);
		const alive = () => browser.pages().filter((item) => !item.isClosed() && !isNav(item));
		const cached =
			this.automationPage && !this.automationPage.isClosed() && !isNav(this.automationPage)
				? this.automationPage
				: undefined;
		const requirePlatform = !!(options && options.requirePlatform);

		/** 1) 正在用的这一页就合适：直接复用（标记、滚动位置都还在） */
		if (cached && (!requirePlatform || detectCoursePlatform(cached.url()))) return cached;

		/** 2) 已有教学平台的页面：自动登录脚本跑完通常就停在这里 */
		const platformPage = alive().find((item) => detectCoursePlatform(item.url()));
		if (platformPage) {
			this.automationPage = platformPage;
			return platformPage;
		}

		if (cached) return cached;

		/** 3) 任意普通网页：优先真正的前台页，其次最新打开的 */
		const webPages = alive().filter((item) => /^https?:/i.test(item.url()));
		if (webPages.length) {
			const active = await this.pickActivePage();
			const page = active && webPages.indexOf(active) >= 0 ? active : webPages[webPages.length - 1];
			this.automationPage = page;
			return page;
		}

		/** 4) 连普通网页都没有（只剩 start-page / about:blank）：复用它，别再多开一个 */
		const rest = alive();
		if (rest.length) {
			const page = rest[rest.length - 1];
			this.automationPage = page;
			return page;
		}

		/** 5) 一个标签都没有，才新开 */
		const page = await browser.newPage();
		this.automationPage = page;
		/** 让电脑前的人也能看到登录过程（用户是远程点的，说明人就在等） */
		await page.bringToFront().catch(() => {});
		return page;
	}

	/** 取真正的前台页；判定不出时退回最新页面（与页面列表的选择保持一致） */
	private async pickActivePage(): Promise<Page | undefined> {
		const pages = this.browser?.pages() || [];
		if (pages.length === 0) return undefined;

		/** 和 getPages() 用同一套判定，避免「页面列表里的当前页」与「截哪一页」不一致 */
		const states = await this.collectPageStates(pages);
		return this.resolveActivePage(states);
	}

	/** 跳转到特殊图像共享浏览器窗口 */
	async gotoWebRTCPage() {		const page = await this.browser?.newPage();
		if (page) {
			const loadingText = ScriptWorker.lang('webrtc_page_loading_notice', `正在获取图像中，请勿操作...`);
			await page
				.evaluate(
					({ uid, text }: { uid: string; text: string }) => {
						document.title = uid;
						document.body.innerHTML = text;
					},
					{ uid: this.uid, text: loadingText }
				)
				.catch(console.error);

			setTimeout(() => {
				send('webrtc-page-loaded');
			}, 200);
		}
	}

	/** 关闭特殊图像共享浏览器窗口 */
	async closeWebRTCPage() {
		try {
			const pages = this.browser?.pages() || [];
			for (const page of pages) {
				const title = await page.title();
				if (title === this.uid) {
					await page.close();
				}
			}
		} catch {}
		setTimeout(() => {
			send('webrtc-page-closed');
		}, 200);
	}

	kill() {
		process.exit();
	}

	debug(...msg: any[]) {
		console.log(bgGray(loggerPrefix()), ...msg);
	}

	warn(...msg: any[]) {
		console.log(bgYellowBright(loggerPrefix()), ...msg);
	}

	info(...msg: any[]) {
		console.log(bgBlueBright(loggerPrefix()), ...msg);
	}

	error(...msg: any[]) {
		console.error(bgRedBright(loggerPrefix()), ...msg);
	}
}

/** 支持「远程选课」的平台：识别域名与各自的课程列表页 */
const COURSE_PLATFORMS = [
	{ id: 'chaoxing', label: '超星学习通', match: /(^|\.)chaoxing\.com$/i, listUrl: 'http://i.chaoxing.com/base' },
	{
		id: 'zhihuishu',
		label: '智慧树',
		/**
		 * polymas.com 是智慧树的 AI 教学中心（hike-teaching-center.polymas.com），
		 * 课程列表和「共享课」体系是同一套账号，不认它就会出现「已登录但识别不到平台」。
		 */
		match: /(^|\.)(zhihuishu|polymas)\.com$/i,
		listUrl: 'https://onlineweb.zhihuishu.com/onlinestuh5'
	},
	{ id: 'zjy', label: '职教云', match: /(^|\.)zjy2\.icve\.com\.cn$/i, listUrl: 'https://zjy2.icve.com.cn/study/index' },
	{ id: 'icve', label: '智慧职教', match: /(^|\.)icve\.com\.cn$/i, listUrl: 'https://mooc.icve.com.cn/cms/' }
];

export function detectCoursePlatform(url: string): (typeof COURSE_PLATFORMS)[number] | undefined {
	try {
		const host = new URL(url).hostname;
		return COURSE_PLATFORMS.find((item) => item.match.test(host));
	} catch {
		return undefined;
	}
}

/** 只比较「协议 + 主机 + 路径」，忽略末尾斜杠与查询串，避免无意义的重复导航 */
function normalizeUrl(url: string): string {
	try {
		const u = new URL(url);
		return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
	} catch {
		return String(url || '').toLowerCase();
	}
}

/**
 * 是不是鸿鹄易学的导航页（浏览器启动时加载的那一页，负责显示启动进度）。
 *
 * 它挂在本地 http 服务上，长得和普通网页一样，因此极容易被「找一页来用」的逻辑征用：
 * 启动脚本把它当登录页导航走、远程读课程把它当课程页导航走，结果导航页消失；
 * 之后启动流程再往它写状态文字时（`document.body.textContent` 兜底），
 * 那张已经变成平台页的标签就被清成孤零零一行「浏览器初始化完成。」。
 * 凡是要挑页面的地方都必须把它排除掉。
 */
export function isBookmarksPageUrl(url: string, serverPort?: number): boolean {
	if (!/^https?:/i.test(String(url || ''))) return false;
	try {
		const u = new URL(url);
		if (u.pathname !== '/index.html') return false;
		if (!u.hash.startsWith('#/bookmarks')) return false;
		if (typeof serverPort === 'number' && serverPort > 0 && u.port && Number(u.port) !== serverPort) return false;
		return true;
	} catch {
		return false;
	}
}

/**
 * 页面内抽取课程列表（在浏览器里执行，不能引用外部变量）
 *
 * 踩过的坑写在这里：
 * - 不能只看 `a[href]`：智慧树/职教云的课程卡片是 JS 跳转，没有 href；
 * - **不能把链接文本当课程名**：智慧树课程卡片里「教师名」「学校名」各自也是链接，
 *   它们的文本短、URL 又带 `study`，按链接扫一遍得到的全是作者名。
 *   正确做法是以「卡片」为单位，一张卡片出一门课，再在卡片里挑最像课程名的元素；
 * - 不能只按文本猜：导航栏里「我的课程」「全部课程」会被误判成课程；
 * - 同一门课常同时存在封面链接和标题链接，必须按 URL + 名称去重；
 * - 抽到的元素就地打 `data-hh-course` 标记，供「进入课程」按标记点击。
 */
/**
 * 课程列表常常「滚到底才加载下一批」，抽取前先把列表滚到底并等数量稳定。
 *
 * 智慧树 AI 教学中心就是典型：首屏只渲染 16 门 AI 智课，3 门共享课必须把列表滚到底
 * 才会出现在 DOM 里。而且它的滚动发生在内层 `.el-scrollbar__wrap` 上，
 * `window.scrollTo` 完全无效（页面本身高度就等于视口高度），必须找到真正的滚动容器。
 */
export async function autoScrollForCourses(page: Page, maxRounds = 10): Promise<void> {
	const countCards = () =>
		page
			.evaluate(() => document.querySelectorAll('div.course-card, [class*="course-card"]').length)
			.catch(() => 0);

	const scrollToEnd = () =>
		page
			.evaluate(() => {
				/** 找最像列表的滚动容器：纵向可滚，且可滚动距离最大 */
				const found: { el: HTMLElement; score: number }[] = [];
				const all = document.querySelectorAll('div,main,section,ul');
				for (let i = 0; i < all.length; i++) {
					const el = all[i] as HTMLElement;
					if (el.scrollHeight <= el.clientHeight + 40) continue;
					const style = getComputedStyle(el);
					if (!/(auto|scroll)/.test(style.overflowY)) continue;
					found.push({ el: el, score: el.scrollHeight - el.clientHeight });
				}
				found.sort((a, b) => b.score - a.score);
				if (found.length) {
					found[0].el.scrollTop = found[0].el.scrollHeight;
					return true;
				}
				/** 没有内层容器就退到整页滚动 */
				window.scrollTo(0, document.documentElement.scrollHeight);
				return false;
			})
			.catch(() => false);

	let last = await countCards();
	/** 页面里一张课程卡片都没有：不是列表页（视频页/空白页），滚也没用 */
	if (!last) {
		await scrollToEnd();
		await page.waitForTimeout(700);
		last = await countCards();
		if (!last) return;
	}

	let stable = 0;
	for (let round = 0; round < maxRounds; round++) {
		const hadScroller = await scrollToEnd();
		await page.waitForTimeout(hadScroller ? 700 : 400);
		const now = await countCards();
		if (now === last) {
			stable++;
			/**
			 * 连续两轮数量不变才认为加载到底：首屏滚到底往往只是「发出请求」，
			 * 数据要几百毫秒才回来，只等一轮容易把共享课这种懒加载批次漏掉。
			 */
			if (stable >= 2) break;
		} else {
			stable = 0;
			last = now;
		}
	}
}

export function extractCoursesInPage(arg: { platform: string }): {
	items: { id: string; name: string; url: string; label?: string }[];
	pageTitle: string;
} {
	const platform = (arg && arg.platform) || '';
	const COURSE_RX: { [key: string]: RegExp } = {
		chaoxing: /(chaoxing\.com\/(mycourse|mooc[0-9]?-ans\/mycourse|visit\/interaction)|\/course\/[0-9]+)/i,
		zhihuishu:
			// eslint-disable-next-line max-len
			/(onlinestuh5|studyspace|studyvideoh5|studyplush5|fusioncourseh5|studywisdomh5|smartcoursestudent|ai-smart-course-student-pro|singleCourse)/i,
		zjy: /(zjy2\.icve\.com\.cn\/study)/i,
		icve: /(icve\.com\.cn\/(cms|course)|courseInfo)/i
	};

	/** 导航 / 操作类文案，永远不是课程名 */
	const BAD_TEXT =
		// eslint-disable-next-line max-len
		/^(登录|注册|退出|注销|首页|帮助|下载|客户端|客服|更多|设置|消息|通知|购物车|充值|会员|全部课程|我的课程|课程中心|学习中心|返回|上一页|下一页|搜索|去学习|继续学习|开始学习|进入课程|查看详情|详情|分享|退课|删除|已结束|未开始|进行中|学习中|已完成|换一换|查看全部|全部|更多课程|选课|我的学堂|学习进度|查看成绩)$/;

	/** 课程类型角标：智慧树的「共享课 / 翻转课」等，其他平台也一并识别 */
	const TYPE_RX =
		/(AI\s*共享课|共享课|翻转课|公开课|慕课|MOOC|SPOC|微课|直播课|见面课|学位课|通识课|专业课|虚拟仿真|智慧课程|精品课程|在线课程|混合式课程|选修课|必修课)/i;

	/** 学校 / 院系 */
	const SCHOOL_RX = /(大学|学院|学校|中学|职院|职业技术学院|高等专科|研究院|研究所|党校|电大|开放大学|校区)/;

	/** 教师称谓 */
	const TEACHER_RX = /(老师|教授|副教授|讲师|助教|教师|导师|博士|硕士)/;

	const clean = (text: string) => String(text || '').replace(/\s+/g, ' ').trim();

	/** 2~4 个纯汉字、且不含学校/教师/类型词 —— 很像人名（作者名就是这么被误当课程名的） */
	const looksLikePerson = (text: string) => {
		const s = clean(text).replace(/\s+/g, '');
		if (!/^[\u4e00-\u9fa5·]{2,4}$/.test(s)) return false;
		if (SCHOOL_RX.test(s) || TEACHER_RX.test(s) || TYPE_RX.test(s)) return false;
		return true;
	};

	/** 给一段文本打分：越高越像课程名 */
	const scoreText = (el: Element, text: string) => {
		const cls = String((el as HTMLElement).className || '').toLowerCase();
		const tag = el.tagName.toLowerCase();
		let score = 0;

		/** class / 标签名里的信号最强 */
		if (/name|title|tit/.test(cls)) score += 40;
		if (/teacher|author|school|university|person|avatar|cover|pic|img|user|logo/.test(cls)) score -= 55;
		if (/^h[1-4]$/.test(tag)) score += 30;
		if (tag === 'p' || tag === 'span' || tag === 'div') score += 3;

		/** 有 title 属性且与文本一致，说明这个元素就是标题本体 */
		const attrTitle = clean(el.getAttribute('title') || '');
		if (attrTitle && attrTitle === text) score += 15;

		const len = text.length;
		if (len >= 4 && len <= 40) score += 20;
		else if (len === 2 || len === 3) score -= 4;
		else if (len > 40 && len <= 60) score += 4;
		else score -= 30;

		if (TEACHER_RX.test(text)) score -= 45;
		if (SCHOOL_RX.test(text)) score -= 40;
		if (TYPE_RX.test(text)) score -= 30;
		if (looksLikePerson(text)) score -= 15;
		if (/\d{2,4}[-/年]\d{1,2}/.test(text)) score -= 25;
		if (/^[\d\s.:%+-]+$/.test(text)) score -= 50;

		return score;
	};

	const platformRx = COURSE_RX[platform];
	const items: { id: string; name: string; url: string; label?: string }[] = [];
	const seenUrl: { [key: string]: boolean } = {};
	const seenName: { [key: string]: boolean } = {};

	const push = (name: string, url: string, el: Element, label: string) => {
		const title = clean(name);
		if (!title || title.length < 2 || title.length > 60) return;
		if (BAD_TEXT.test(title)) return;
		if (/^[0-9\s.:%+-]+$/.test(title)) return;
		/**
		 * 去重键必须带上类型角标：同一门课会同时挂「AI智课」和「共享课」两个班，
		 * 只按课程名去重会把共享课整条吃掉（真实页 19 张卡片只剩 17 条）。
		 */
		const seenKey = title + '\u0001' + label;
		if (seenName[seenKey]) return;
		if (url && seenUrl[url]) return;

		seenName[seenKey] = true;
		if (url) seenUrl[url] = true;

		const id = 'c' + (items.length + 1);
		(el as HTMLElement).setAttribute('data-hh-course', id);
		/**
		 * 一并记下课程名：卡片文本里还混着学期、教师、类型角标，
		 * 「C语言程序设计」正好是「C语言程序设计A」的子串，只靠文本包含判断会进错课。
		 */
		(el as HTMLElement).setAttribute('data-hh-course-name', title);
		const item: { id: string; name: string; url: string; label?: string } = { id: id, name: title, url: url };
		if (label) item.label = label;
		items.push(item);
	};

	/** 上一轮打的标记先清掉：标记可能落在过期的节点上（比如卡片改版前标记的是学期栏） */
	Array.prototype.slice.call(document.querySelectorAll('[data-hh-course]')).forEach((el) => {
		(el as HTMLElement).removeAttribute('data-hh-course');
	});

	/**
	 * 已知站点的卡片结构（照真实 DOM 写死）
	 *
	 * 启发式打分在结构规整的站点上够用，但智慧树 AI 教学中心里「课程名」和「学期」
	 * 是同一个 class（`div.line1.tool-tip-pro`），只靠文本特征分不出来，必须靠层级。
	 *
	 * `card` 要选**整张卡的根节点**：这类卡片没有 `<a>`，靠 click 打开，
	 * 标记打在根节点上才点得动（打在标题上时，外层常有一层透明 div 挡住真实鼠标点击）。
	 */
	const KNOWN_CARDS: { host: RegExp; card: string; name: string; label: string }[] = [
		{
			/**
			 * 智慧树 AI 教学中心：div.course-card > h4 = 课程名。
			 * 类型角标有两套 DOM：AI 智课用 `.type-tag-component`，共享课用 `.course-tag`，
			 * 只认前者会让共享课的 label 永远是空。
			 */
			host: /(^|\.)polymas\.com$/i,
			card: 'div.course-card',
			name: 'h4',
			label: '[class*="type-tag" i], [class*="course-tag" i]'
		}
	];

	const knownRule = KNOWN_CARDS.find((rule) => rule.host.test(location.hostname));
	if (knownRule) {
		const knownCards = Array.prototype.slice.call(document.querySelectorAll(knownRule.card)) as HTMLElement[];
		for (const card of knownCards) {
			if (items.length >= 30) break;
			const nameEl = card.querySelector(knownRule.name) as HTMLElement | null;
			let name = clean((nameEl && nameEl.textContent) || '');
			/** 标题节点没渲染出来时退到封面图的 alt（真实站点里两者一致） */
			if (!name) {
				const img = card.querySelector('img') as HTMLImageElement | null;
				name = clean((img && img.alt) || '');
			}
			if (!name) continue;

			const labelEl = card.querySelector(knownRule.label) as HTMLElement | null;
			const label = clean((labelEl && labelEl.textContent) || '').slice(0, 12);
			push(name, '', card, label);
		}
	}

	/**
	 * 在一张卡片里挑出最像课程名的那段文本
	 *
	 * 只取元素的「直接文本节点」，避免把「课程名 + 学校 + 教师」拼成一长串；
	 * 唯一子元素时允许取子文本（覆盖 `<p class="name"><span>高等数学</span></p>` 这种写法）。
	 */
	const pickTitle = (card: HTMLElement): { el: HTMLElement; text: string } | null => {
		let best: { el: HTMLElement; text: string; score: number } | null = null;
		const nodes = ([card] as HTMLElement[]).concat(
			Array.prototype.slice.call(card.querySelectorAll('*')) as HTMLElement[]
		);

		for (const el of nodes.slice(0, 80)) {
			if (el.children.length > 3) continue;

			let own = '';
			for (let i = 0; i < el.childNodes.length; i++) {
				const node = el.childNodes[i];
				if (node.nodeType === 3) own += node.nodeValue || '';
			}

			let text = clean(own);
			if (!text) {
				const attrTitle = clean(el.getAttribute('title') || '');
				if (attrTitle) text = attrTitle;
			}
			if (!text && el.children.length <= 1) text = clean(el.textContent || '');

			if (!text || text.length < 2 || text.length > 60) continue;
			if (BAD_TEXT.test(text)) continue;

			const score = scoreText(el, text);
			if (!best || score > best.score) best = { el: el, text: text, score: score };
		}

		return best && best.score > 0 ? { el: best.el, text: best.text } : null;
	};

	/**
	 * 找「同构重复」的课程卡片
	 *
	 * 课程列表的卡片 class 完全一致，靠这个特征定位比写死选择器稳：
	 * 智慧树改版换 class 也不会失效，只要它还是「重复的一张张卡片」。
	 */
	const findCards = (): HTMLElement[] => {
		const all = Array.prototype.slice.call(
			document.querySelectorAll('[class*="course" i], [class*="kecheng" i], [class*="lesson" i], [class*="subject" i]')
		) as HTMLElement[];

		const groups: { [key: string]: HTMLElement[] } = {};
		for (const el of all.slice(0, 600)) {
			if (el.querySelector('script,style')) continue;
			const cls = String(el.className || '').trim();
			if (!cls) continue;
			const key = el.tagName + '|' + cls;
			if (!groups[key]) groups[key] = [];
			groups[key].push(el);
		}

		const candidates = Object.keys(groups)
			.map((key) => groups[key])
			.filter((list) => list.length >= 2 && list.length <= 60);
		candidates.sort((a, b) => b.length - a.length);

		let best: { list: HTMLElement[]; score: number } | null = null;

		for (const raw of candidates.slice(0, 6)) {
			/** 组内互相嵌套说明抓到的是外层容器，把父节点剔掉 */
			const list = raw.filter((el) => !raw.some((other) => other !== el && el.contains(other)));
			if (list.length < 2) continue;

			const take = Math.min(list.length, 12);
			let good = 0;
			let labels = 0;
			for (const card of list.slice(0, take)) {
				const picked = pickTitle(card);
				if (picked && picked.text.length >= 3 && !looksLikePerson(picked.text)) good++;
				if (TYPE_RX.test(clean(card.textContent || ''))) labels++;
			}

			const ratio = good / take;
			/** 挑出来的东西大多像人名/学校名，说明这组不是课程卡片 */
			if (ratio < 0.5) continue;

			const score = ratio * 100 + Math.min(list.length, 30) + labels * 2;
			if (!best || score > best.score) best = { list: list, score: score };
		}

		return best ? best.list : [];
	};

	/** 卡片里最像「课程入口」的链接 */
	const pickUrl = (card: HTMLElement): string => {
		let fallback = '';

		/** 卡片本身就是个大链接（常见于整卡可点）时，直接用它的地址 */
		const selfHref = String((card as HTMLAnchorElement).href || '');
		if (card.tagName === 'A' && /^https?:/i.test(selfHref)) {
			if (!/\/teacher|\/author|\/user\/|\/school\/|\/personal/i.test(selfHref)) return selfHref;
		}

		const anchors = Array.prototype.slice.call(card.querySelectorAll('a[href]')) as HTMLAnchorElement[];
		for (const anchor of anchors) {
			const raw = anchor.getAttribute('href') || '';
			if (!raw || raw.indexOf('javascript:') === 0 || raw === '#') continue;

			let abs = '';
			try {
				abs = new URL(raw, location.href).href;
			} catch {
				continue;
			}
			if (!/^https?:/i.test(abs)) continue;

			/** 教师 / 学校 / 个人主页也是平台域名，不能当课程入口 */
			const cls = String(anchor.className || '').toLowerCase();
			const absLc = abs.toLowerCase();
			if (/teacher|author|school|person|user|avatar|logo|cover/.test(cls)) continue;
			if (/\/teacher|\/author|\/user\/|\/school\/|\/personal/.test(absLc)) continue;

			if (platformRx && platformRx.test(abs)) return abs;
			if (!fallback && /course|study|kecheng|learn|class/i.test(abs)) fallback = abs;
		}
		return fallback;
	};

	/** 1) 卡片优先：一张卡片一门课，天然把作者名排除在外（已知站点上面已抽到就不再猜） */
	const cards = items.length >= 2 ? [] : findCards();
	for (const card of cards) {
		if (items.length >= 30) break;
		if (card.getAttribute('data-hh-course')) continue;

		const picked = pickTitle(card);
		if (!picked) continue;

		const typeMatch = clean(card.textContent || '').match(TYPE_RX);
		push(picked.text, pickUrl(card), picked.el, typeMatch ? clean(typeMatch[1]) : '');
	}

	/** 2) 卡片没找到时才退回到链接扫描（部分老站点只有链接） */
	if (items.length < 2) {
		const anchors = Array.prototype.slice.call(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
		for (const anchor of anchors) {
			if (items.length >= 30) break;
			const raw = anchor.getAttribute('href') || '';
			if (!raw || raw.indexOf('javascript:') === 0 || raw === '#') continue;

			let abs = '';
			try {
				abs = new URL(raw, location.href).href;
			} catch {
				continue;
			}
			if (!/^https?:/i.test(abs)) continue;

			const matched = platformRx ? platformRx.test(abs) : false;
			const generic = /course|kecheng|interaction|study/i.test(abs);
			if (!matched && !generic) continue;

			/** 教师 / 学校 / 个人主页的链接不是课程 */
			const cls = String((anchor as HTMLElement).className || '').toLowerCase();
			const hrefLc = abs.toLowerCase();
			if (/teacher|author|school|person|user|avatar|logo/.test(cls)) continue;
			if (/\/teacher|\/author|\/user\/|\/school\/|\/personal/.test(hrefLc)) continue;

			/** 名字优先取链接内部的标题元素，其次 title 属性、图片 alt，最后才用链接文本 */
			let name = '';
			const inner = anchor.querySelector('[class*="name" i], [class*="title" i], h1, h2, h3, h4') as HTMLElement | null;
			if (inner) name = clean(inner.textContent || '');
			if (!name) name = clean(anchor.getAttribute('title') || '');
			if (!name) {
				const img = anchor.querySelector('img') as HTMLImageElement | null;
				if (img) name = clean(img.alt || '');
			}
			if (!name) {
				const raw2 = clean(anchor.textContent || '');
				/** 很长的链接文本多半是整张卡片拼起来的，不要 */
				name = raw2.length <= 40 ? raw2 : '';
			}
			if (!name) continue;

			/** 2~3 字纯汉字又没别旁证，基本就是作者名/学校简称 */
			if (name.length <= 3 && looksLikePerson(name) && !anchor.getAttribute('title')) continue;

			push(name, abs, anchor, '');
		}
	}

	return { items: items, pageTitle: document.title || '' };
}

/** 格式化浏览器拓展启动参数 */
function formatExtensionArguments(extensionPaths: string[]) {
	const paths = extensionPaths.map((p) => p.replace(/\\/g, '/')).join(',');
	return paths.length === 0 ? [] : [`--disable-extensions-except=${paths}`, `--load-extension=${paths}`];
}

function loggerPrefix() {
	return `[鸿鹄易学] ${new Date().toLocaleTimeString()}`;
}

/**
 * 运行脚本
 */
export async function launchBrowser({
	executablePath,
	headless,
	args,
	userDataDir,
	automationScripts,
	closeableExtensionHomepages,
	bookmarksPageUrl,
	serverPort,
	authToken,
	browserInfo,
	uid,
	config,
	onLaunch,
	onAutomationDone
}: Required<Pick<LaunchOptions, 'executablePath' | 'headless' | 'args'>> & {
	/** 用户数据目录 */
	userDataDir: string;
	/** 可关闭的浏览器拓展主页 */
	closeableExtensionHomepages: string[];
	/** 自动化程序 */
	automationScripts: AS[];
	/** 初始导航页地址 */
	bookmarksPageUrl?: string;
	/** 鸿鹄易学服务器端口 */
	serverPort: number;
	/** 软件辅助权限认证 */
	authToken: string;
	/** 浏览器信息 */
	browserInfo?: BrowserInfo;
	uid: string;
	config?: BrowserConfig;
	onLaunch?: (browser: BrowserContext) => void;
	/**
	 * 启动时自动跑的自动化程序结束后的回调
	 *
	 * 把「登录后最终停在哪一页 / 落在哪个平台」交回给 worker：
	 * 远程端随后要点「选课」时，就不用猜去哪儿读课程了。
	 */
	onAutomationDone?: (result: { page?: Page; platformId?: string }) => void;
}) {
	return new Promise<void>((resolve, reject) => {
		/** 握手耗时参考：全新 profile 约 0.5~2 秒；已有大量会话/扩展的 profile 可达 10~15 秒 */
		const launchStartedAt = Date.now();
		console.log(
			`[启动] 开始拉起浏览器 exe=${executablePath} userDataDir=${userDataDir} 附加参数=${args.length} 个`
		);

		chromium
			.launchPersistentContext(userDataDir, {
				headless,
				viewport: null,
				executablePath,
				ignoreHTTPSErrors: true,
				acceptDownloads: true,
				ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
				/**
				 * 显式限制握手超时。playwright 默认 180 秒，而渲染端的启动看门狗是 120 秒：
				 * 浏览器窗口已经弹出、但 DevTools 通道没连上时会一直等，
				 * 结果就是「用户看到浏览器起来了、远程端永远显示启动中」，120 秒后又被判成未运行。
				 * 这里收到 60 秒，保证失败原因能在看门狗之前被明确抛出。
				 */
				timeout: 60 * 1000,
				args: [
					'--window-position=0,0',
					'--no-first-run',
					'--no-default-browser-check',
					'--allow-file-access-from-files',
					/**
					 * 上一次异常退出（崩溃 / 被强杀 / 启动超时）后，Edge 与 Chrome 都会在下次启动时
					 * 弹「恢复页面」气泡并尝试恢复整批标签页，恢复期间 DevTools 握手会拖到几十秒，
					 * 表现为「浏览器窗口已经出现了，但状态一直卡在启动中」。
					 * 关掉这个气泡，启动耗时即可回到正常水平。
					 */
					'--hide-crash-restore-bubble',
					// AppImage 下无法可靠保留 chrome-sandbox 的 setuid 位，Linux 关闭沙箱；
					// Windows/macOS 保留沙箱以收紧攻击面。
					...(process.platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
					...args
				]
			})
			.then(async (browser) => {
				console.log(`[启动] 握手完成，耗时 ${Date.now() - launchStartedAt}ms，初始页面数 ${browser.pages().length}`);

				// 处理浏览器初始
				handleBrowserInit(browser, { enable_dialog: config?.enable_dialog, userDataDir });

				// 浏览器进程已就绪：立即触发 onLaunch 并 resolve，
				// 否则导航页加载、开发者模式、自动化脚本任何一步抛错/卡住
				// 都会让远程端永远停留在「启动中」且无法截图（浏览器本身却在正常刷课）。
				onLaunch?.(browser);
				resolve();

				// 后续初始化步骤转为后台执行：失败只记日志，不再影响启动状态
				try {
					/** 浏览器启动时自带的那一页：改造成导航页，之后只往它写启动进度 */
					const [blankPage] = browser.pages();
					/** 导航页可能还没挂载完，缺接口只提示一次，避免刷屏 */
					let stepTipWarned = false;

					/**
					 * 显示步骤提示
					 */
					const step = async (tips: string | string[], opts?: { loading?: boolean; warn?: boolean }) => {
						const { loading = true, warn = false } = opts || {};
						/**
						 * 只往「还是导航页」的那一页写状态。
						 *
						 * 页面一旦被登录脚本或用户导航到别的站点，`setBookmarkLoadingState` 就不存在了；
						 * 以前这里会退回 `document.body.textContent = tips`，把一张真实网页清成一行文字 ——
						 * 这正是「登录完成后页面变成一行『浏览器初始化完成。』」的成因。
						 * 现在拿不到接口就什么都不写：宁可少一条提示，也不能毁掉页面内容。
						 */
						if (!blankPage || blankPage.isClosed() || !isBookmarksPageUrl(blankPage.url(), serverPort)) return;
						const applied = await blankPage
							.evaluate(
								(state) => {
									// @ts-ignore 鸿鹄易学导航页自带的方法
									const setState = window.setBookmarkLoadingState;
									if (typeof setState !== 'function') return false;
									setState(state);
									return true;
								},
								{ tips: Array.isArray(tips) ? tips : [tips], loading, warn }
							)
							.catch(() => false);
						if (!applied && !stepTipWarned) {
							stepTipWarned = true;
							console.warn('导航页尚未就绪（缺少 setBookmarkLoadingState），启动提示暂不显示');
						}
					};

					// 加载本地导航页
					await blankPage.goto(bookmarksPageUrl || 'about:blank');
					console.log('浏览器初始化：导航页已加载');

					// 打开开发者模式
					await openExtensionDeveloperMode(browser, executablePath.toLowerCase().includes('edge'));

					// 必须先打开开发者模式，才能关闭额外拓展页，否则打开开发者模式可能会重启插件，导致出现新的额外页面
					// 关闭拓展加载时弹出的首页（内置鸿鹄易学扩展无主页，跳过等待）
					if (closeableExtensionHomepages.length) {
						waitAndCloseExtensionHomepage({ browser, closeableExtensionHomepages }).catch(() => {});
					}

					// 鸿鹄易学扩展随浏览器启动自动加载，不再安装任何用户脚本
					// 监听网络请求
					browserNetworkRoute(authToken, browser);

					// 运行自动化程序（导航页不参与，脚本自己新开标签）
					await runAutomationScripts({
						browser,
						automationScripts,
						serverPort,
						step,
						navPage: blankPage,
						onDone: onAutomationDone
					});

					await step('浏览器初始化完成。', { loading: false });
					console.log('浏览器初始化全部完成');
				} catch (err) {
					console.error('浏览器初始化步骤失败（不影响使用）：', err instanceof Error ? err.message : String(err));
				}
			})
			.catch((err) => {
				console.error(
					`[启动] 握手失败，耗时 ${Date.now() - launchStartedAt}ms：${
						err instanceof Error ? err.message : String(err)
					}`
				);
				reject(err);
			});
	});
}

function send(event: string, ...args: any[]) {
	process.send?.({ event, args });
}

/**
 * 将脚本配置转换为可用的对象配置
 * @param configs
 */
function transformScriptConfigToRaw(configs: AS['configs']) {
	const raw = Object.create({});
	for (const key in configs) {
		if (Object.prototype.hasOwnProperty.call(configs, key)) {
			Reflect.set(raw, key, configs[key].value);
		}
	}
	return raw;
}

/**
 * 运行自动化程序
 */
export async function runAutomationScripts(opts: {
	browser: BrowserContext;
	serverPort: number;
	automationScripts: AS[];
	step: (tips: string | string[], opts?: { loading?: boolean; warn?: boolean }) => Promise<void>;
	/** 导航页（启动进度页）：绝不能被脚本占用 */
	navPage?: Page;
	/** 跑完后把「落在哪一页 / 哪个平台」交回 worker，供远程端读课程、选课直接复用 */
	onDone?: (result: { page?: Page; platformId?: string }) => void;
}) {	const { automationScripts, browser, serverPort, step, navPage, onDone } = opts;

	if (!automationScripts.length) return;

	/**
	 * 挑一张页交给脚本：**一律新开**。
	 *
	 * 曾经为了不「多一个空白页」去复用启动时留下的页面，结果把导航页导航走了：
	 * 用户再也看不到导航页，启动流程收尾时还会往那张已经变成平台页的标签里写状态文字，
	 * 整页被清成一行「浏览器初始化完成。」。导航页必须留着，脚本自己新开一张。
	 * 只有真存在一张闲置的 about:blank 时才顺手复用。
	 */
	const pickScriptPage = async (): Promise<Page> => {
		const alive = browser.pages().filter((item) => !item.isClosed());
		const usable = alive.filter((item) => item !== navPage && !isBookmarksPageUrl(item.url(), serverPort));
		const spare = usable.find((item) => !item.url() || item.url() === 'about:blank');
		return spare || (await browser.newPage());
	};

	for (const ps of automationScripts) {
		await step(`正在执行自动化程序 - ${ps.name} ...`);
		const configs = transformScriptConfigToRaw(ps.configs);

		for (const script of AutomationScripts) {
			if (script.name !== ps.name) continue;

			script.on('script-data', (...msg) => console.log(...msg));
			script.on('script-error', (...msg) =>
				console.error('自动化程序错误：', ...msg.map((m) => ScriptWorker.getTransformedErrorMessage(m)))
			);

			const page = await pickScriptPage();

			try {
				await script.run(page, configs, {
					ocrApiUrl: `http://localhost:${serverPort}/ocr`,
					ocrApiImageKey: 'image',
					detBackgroundKey: 'det_bg',
					detTargetKey: 'det_target'
				});
			} catch (err) {
				console.error(
					'自动化程序错误：',
					ScriptWorker.getTransformedErrorMessage(err instanceof Error ? err.message : String(err))
				);
			}

			/** 登录脚本常自己开新标签（扫码 / 滑块 / 单点登录），落地页未必是传进去那张 */
			const alive = browser.pages().filter((item) => !item.isClosed());
			const landed = alive
				.slice()
				.reverse()
				.find((item) => detectCoursePlatform(item.url()));
			const platformId = detectCoursePlatform(landed?.url() || '')?.id;

			/**
			 * 脚本什么都没干就结束（配置错、直接抛错等）会留下一张纯空白页：
			 * 既没有内容也没有平台信息，关掉比留着干净（仅当还有别的页面可留）。
			 */
			if (!landed && alive.length > 1 && !page.isClosed() && (!page.url() || page.url() === 'about:blank')) {
				await page.close().catch(() => {});
			}

			onDone?.({ page: landed, platformId });
			break;
		}
	}
}

/**
 * 关闭浏览器拓展主页
 */
async function waitAndCloseExtensionHomepage(opts: { browser: BrowserContext; closeableExtensionHomepages: string[] }) {
	return new Promise<any>((resolve, reject) => {
		const timeout = setTimeout(() => {
			clearInterval(interval);
			reject(new Error('浏览器拓展加载超时，请尝试重启浏览器，或者查看网络情况。'));
		}, 60 * 1000);
		const interval = setInterval(async () => {
			const includes: Page[] = [];
			for (const page of opts.browser.pages()) {
				// 当拓展主页无法访问时，会跳转到chrome-error://chromewebdata/，此时获取的url为chrome-error://chromewebdata/，而不是拓展主页的url，但是title是拓展主页的host
				const title = page.url() === 'chrome-error://chromewebdata/' ? await page.title() : '';
				if (
					opts.closeableExtensionHomepages.some((homepage) =>
						page.url() === 'chrome-error://chromewebdata/' ? homepage.includes(title) : page.url().includes(homepage)
					)
				) {
					includes.push(page);
				}
			}
			if (includes.length) {
				clearInterval(interval);
				clearTimeout(timeout);
				Promise.all(includes.map(async (page) => page.close()))
					.then(resolve)
					.catch(reject);
			}
		}, 1000);
	});
}

function browserNetworkRoute(authToken: string, browser: BrowserContext) {
	browser.route(/hh-environment/, async (route) => {
		await route.fulfill({
			status: 200,
			body: JSON.stringify({
				environment: 'playwright'
			})
		});
	});
	browser.route(/hh-script-actions/, async (route) => {
		const req = route.request();
		if (req.method().toLocaleUpperCase() !== 'POST') {
			return;
		}
		const headerValue = await req.headerValue('auth-token');

		if (headerValue !== authToken) {
			return;
		}

		const { page: targetPageUrl, property, args }: { page: string; property: string; args: any[] } = req.postDataJSON();

		try {
			const page = browser?.pages().find((p) => p.url().includes(targetPageUrl));
			if (!page) {
				return;
			}

			const targetFunction: Function = _get(page, property);
			if (typeof targetFunction !== 'function') {
				return;
			}

			if (property === 'waitForResponse' || property === 'waitForRequest') {
				args[0] = new RegExp(args[0]);
			}

			const res = await targetFunction.apply(
				property.split('.').length > 1 ? _get(page, property.split('.')[0]) : page,
				args
			);
			if (typeof res === 'object') {
				if (property === 'screenshot') {
					const buffer: Buffer = res;
					await route.fulfill({
						status: 200,
						body: buffer.toString('base64')
					});
				} else if (property === 'waitForResponse') {
					const response: Response = res;

					await route.fulfill({
						status: 200,
						body: JSON.stringify({
							url: response.url(),
							status: response.status(),
							headers: response.headers(),
							body: await response.body().then((res) => res.toString('utf8'))
						})
					});
				} else if (property === 'waitForRequest') {
					const request: Request = res;
					await route.fulfill({
						status: 200,
						body: JSON.stringify({
							url: request.url(),
							method: request.method(),
							headers: request.headers(),
							postData: request.postData()
						})
					});
				} else {
					await route.fulfill({ status: 200, body: JSON.stringify(res) });
				}
			} else {
				await route.fulfill({ status: 200, body: res ?? 'OK' });
			}
		} catch (err) {
			await route.continue();
			console.error(
				'脚本软件辅助失败：',
				ScriptWorker.getTransformedErrorMessage(err instanceof Error ? err.message : String(err), {
					url: targetPageUrl,
					property:
						property === 'click' ? '点击' : property === 'fill' ? '填写' : property === 'check' ? '选中' : property,
					args: JSON.stringify(args)
				})
			);
		}
	});
}

function handleBrowserInit(browser: BrowserContext, config: { enable_dialog?: boolean; userDataDir: string }) {
	// 防检测
	browser.addInitScript({
		content: 'Object.defineProperty(navigator, "webdriver", { get: () => false });console.log(navigator)'
	});

	/**
	 * 空页面巡检：连续 1 秒都没有任何页面才判定浏览器已被关闭。
	 *
	 * 原来是 100ms 单次判空就 close —— 启动瞬间（标签页还没挂完、或首屏正在被替换）
	 * 极易误判成「用户关掉了浏览器」，直接把刚起来的浏览器整个关掉，
	 * 表现就是「浏览器窗口一闪就没了，远程一直显示启动中/未运行」。
	 */
	let emptyTicks = 0;
	const interval = setInterval(async () => {
		if (browser.pages().length > 0) {
			emptyTicks = 0;
			return;
		}
		emptyTicks += 1;
		if (emptyTicks < 10) return;

		clearInterval(interval);
		console.warn('[启动] 连续 1 秒没有任何页面，判定浏览器已关闭，主动回收实例');
		await browser.close({ reason: 'no pages' }).catch(() => {});
	}, 100);

	browser.once('close', () => {
		clearInterval(interval);
		send('browser-closed');
		process.exit();
	});

	const pageHandle = (page: Page) => {
		// 按照文档的说法，如果不进行任何处理，则动作会和原版浏览器一致
		// 如果不进行监听 page.on('dialog') playwright 会自动处理弹窗
		page.on('dialog', async (dialog) => {
			if (config?.enable_dialog) {
				// 不进行任何处理
			} else {
				await dialog.accept(dialog.defaultValue());
			}
		});

		// 修改下载逻辑
		page.on('download', async (download) => {
			// 不处理脚本安装
			if (download.url().endsWith('.user.js')) {
				return;
			}

			download.cancel();
			// 调用电脑本地浏览器进行文件下载
			openUrl(download.url());
			await page.evaluate(() => alert('自动化浏览器无法下载文件，已使用本地浏览器进行下载任务。'));
		});
	};
	for (const page of browser.pages()) {
		pageHandle(page);
	}
	browser.on('page', pageHandle);
}

function openUrl(url: string) {
	let cmd = 'start';
	if (process.platform === 'darwin') {
		cmd = 'open';
	} else if (process.platform === 'linux') {
		cmd = 'xdg-open';
	}
	child_process.exec(`${cmd} ${url}`);
}

/**
 * 打开浏览器拓展开发者模式（由于 MV3 的限制，运行脚本需要打开开发者模式）
 */
async function openExtensionDeveloperMode(browser: BrowserContext, edge: boolean = false) {
	const page = await browser.newPage();
	await page.goto('chrome://extensions/');

	try {
		await page.bringToFront();
		await page.waitForTimeout(200);
		if (edge) {
			// Edge 新 UI 使用 fluent-switch#dev-switch；旧 UI 使用 #developer-mode。
			// 开启开发者模式后必须点“重新加载”，否则已加载的扩展不会读取磁盘上的新版本。
			const handled = await page.evaluate(() => {
				const walk = (root: Document | ShadowRoot, fn: (el: Element) => void) => {
					(root.querySelectorAll ? root.querySelectorAll('*') : []).forEach((el) => {
						fn(el);
						if (el.shadowRoot) walk(el.shadowRoot, fn);
					});
				};
				let devSwitch: any;
				walk(document, (el) => {
					if (!devSwitch && (el.id === 'dev-switch' || el.getAttribute('aria-label') === '开发人员模式')) {
						devSwitch = el;
					}
				});
				if (!devSwitch) return false;
				const checked =
					devSwitch.checked === true ||
					(devSwitch.hasAttribute('checked') && devSwitch.getAttribute('checked') !== 'false');
				if (!checked) devSwitch.click();
				return true;
			});
			if (!handled) {
				// 旧版 Edge 页面
				const els = await page.$$('[aria-label="扩展 菜单"]');
				await els[1]?.click();
				const element = await page.waitForSelector('#developer-mode', {
					timeout: 1000
				});
				if (await element.evaluate<boolean, HTMLInputElement>((el) => el.checked === false)) {
					await element.click();
				}
			}
			await page.waitForTimeout(500);
			// 让所有已加载的扩展重新读取磁盘文件
			await page.evaluate(() => {
				const walk = (root: Document | ShadowRoot) => {
					(root.querySelectorAll ? root.querySelectorAll('*') : []).forEach((el) => {
						const text = (el.textContent || '').trim();
						if (
							el.tagName &&
							el.tagName.toLowerCase() === 'fluent-button' &&
							(text === '重新加载' || text === 'Reload')
						) {
							(el as HTMLElement).click();
						}
						if (el.shadowRoot) walk(el.shadowRoot);
					});
				};
				walk(document);
			});
		} else {
			const element = await page.waitForSelector('#devMode', {
				timeout: 1000
			});
			// 如果没有开启开发者模式
			if (
				await element.evaluate<boolean, HTMLDivElement>((el) => el.getAttribute('aria-pressed')?.toString() === 'false')
			) {
				await element.click();
				// 重新加载拓展，否则需要重启浏览器才能使用
				const extensions = await page.$$('[id="dev-reload-button"]');
				for (const ext of extensions) {
					await ext.click();
					await page.waitForTimeout(200);
				}
			}
		}
	} catch {}
	await page.waitForTimeout(500);
	console.log('开发者模式已打开');
	await page.close();
}
function getExtensionName(filepath: string) {
	return filepath.toLocaleLowerCase().includes('tampermonkey')
		? '油猴'
		: filepath.toLocaleLowerCase().includes('scriptcat')
		? '脚本猫'
		: path.basename(filepath);
}
