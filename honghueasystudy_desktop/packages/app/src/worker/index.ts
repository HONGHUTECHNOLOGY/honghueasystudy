import { Instance as Chalk } from 'chalk';
import { LoggerCore } from '../logger.core';
import path, { basename } from 'path';
import fs from 'fs';
import { chromium, BrowserContext, Page, Frame, ElementHandle, LaunchOptions, Response, Request } from 'playwright-core';
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

/**
 * 课程内部的三个目录
 *
 * 超星（以及同构的 mooc2 站点）把课程内容拆成三套互不相通的列表，
 * 各自有独立的 iframe 和鉴权参数（`enc` 每个目录都不一样、由服务端在点击时算出），
 * 所以只能「点菜单 → 读 iframe」，不能自己拼 URL。
 */
export type CatalogKind = 'chapter' | 'work' | 'exam';

/** 目录里的一个条目：一个章节 / 一份作业 / 一场考试 */
export interface CatalogItem {
	/** 平台侧 id：chapterId / workId / examId */
	id: string;
	title: string;
	/** 章节编号（1.2.3），作业与考试为空 */
	no: string;
	/** 章节层级（编号段数），作业与考试恒为 0 */
	depth: number;
	/**
	 * 归一化状态
	 *
	 * `locked` 是超星「闯关模式」的产物：前面的任务点没做完，后面的章节连 onclick 都没有，
	 * 点也点不进去 —— 自动刷课必须跳过它们，不能当普通「待完成」重试。
	 */
	status: 'done' | 'todo' | 'locked' | 'unknown';
	/** 平台原文状态（已完成 / 待完成 / 待做 …） */
	state: string;
	/** 补充说明：`2 个任务点未完成` / `完成49%任务点可参加考试` / `剩余…` */
	hint: string;
	/** 是否可进入（有没有 onclick / href） */
	clickable: boolean;
	/** 原始 onclick 文本，进入时复用，省得再解析一遍 */
	onclick: string;
}

/** 一个目录的读取结果 */
export interface CourseCatalog {
	kind: CatalogKind;
	/** 目录名：章节 / 作业 / 考试 */
	title: string;
	url: string;
	items: CatalogItem[];
	/** 进度摘要，例如 `4/329 任务点`、`0/0`、`1 份作业` */
	summary: string;
	/** 列表是否为空 */
	empty: boolean;
	/** 给用户看的一句话（空态、全部锁定等） */
	message: string;
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
	 * 进入后的课程页（超星 `…/mycourse/stu?courseid=…`）
	 *
	 * 与 `automationPage` 刻意分开：那个字段是「课程列表页」，被课程页顶掉的话，
	 * 下次读列表会去课程页里找课，一门都找不到。
	 * 读章节 / 作业 / 考试都要在**这一个**页面上点菜单，所以必须单独记住它。
	 */
	private coursePage?: Page;
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

	/**
	 * 停止刷课（定时收尾 / 远程「暂停」）
	 *
	 * 为什么不能只 `video.pause()`：扩展里的学习循环在页内自己跑，
	 * 暂停播放只是让它等在那儿，任务是「暂停」了，但页面还挂着、脚本还在轮询，
	 * 用户第二天回来会看到一半的进度条卡住不动。
	 *
	 * 这里做三件事，按「有效程度」递进：
	 *   1. 暂停所有 video/audio —— 立刻停止推进进度；
	 *   2. 退出课程页（导航回导航页 / about:blank）—— 页内脚本随之销毁，
	 *      已学进度由平台服务端保存，下次进入会从断点继续；
	 *   3. 关浏览器交给上层（渲染进程按方案里的「到点动作」决定）。
	 *
	 * `keepTab` 为真时只暂停、不导航（用户可能只是想暂停一下看看）。
	 */
	async stopStudy(options?: { keepTab?: boolean }): Promise<{
		paused: number;
		leftPages: number;
		message: string;
	}> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		const serverPort = this.store?.server?.port || 15319;
		const isNav = (url: string) => isBookmarksPageUrl(url, serverPort);
		const pages = this.browser.pages().filter((item) => !item.isClosed());

		let paused = 0;
		let leftPages = 0;

		for (const page of pages) {
			if (isNav(page.url())) continue;

			/** 只处理「教学平台页」和自动化正在用的那一页，别去动用户自己开着的网页 */
			const isStudy =
				!!detectCoursePlatform(page.url()) ||
				(this.automationPage && !this.automationPage.isClosed() && page === this.automationPage);
			if (!isStudy) continue;

			if (!options || !options.keepTab) {
				for (const frame of page.frames().slice(0, 10)) {
					const count = await frame
						.evaluate(() => {
							let n = 0;
							(
								Array.from(document.querySelectorAll('video,audio')) as (HTMLVideoElement | HTMLAudioElement)[]
							).forEach((media) => {
								if (!media.paused) {
									try {
										media.pause();
										n += 1;
									} catch {
										// 某些播放器会拒绝外部 pause，忽略即可
									}
								}
							});
							return n;
						})
						.catch(() => 0);
					paused += count;
				}
			}

			if (options && options.keepTab) continue;

			/**
			 * 退出课程页而不是关掉标签：标签数量保持不变，用户看到的还是那张导航页，
			 * 不会出现「刷完课少了几个标签」的困惑。
			 */
			const target = pages.length > 1 ? `http://localhost:${serverPort}/index.html#/bookmarks` : 'about:blank';
			await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
			leftPages += 1;
		}

		this.automationPage = undefined;
		this.automationPlatformId = '';

		const message = leftPages
			? `已暂停刷课并退出课程页（暂停 ${paused} 个媒体）`
			: pages.length
				? '已暂停播放（没有找到课程页）'
				: '浏览器没有打开的页面';

		this.info(`[自动化] ${message}`);
		return { paused, leftPages, message };
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

		/**
		 * 超星把「我的课程」整个放在 iframe 里（`i.chaoxing.com/base` 主文档只有导航），
		 * 主文档域名常常认不出平台，得连各 frame 的 URL 一起看。
		 */
		if (!platform) {
			for (const frame of page.frames()) {
				const hit = detectCoursePlatform(frame.url());
				if (hit) {
					platform = hit;
					break;
				}
			}
		}

		const extract = async (target: Page | Frame) => {
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
		let used: Page | Frame = page;

		/**
		 * 1) 先在已经开着的页面上抽，**不要**一上来就导航
		 *
		 * 登录脚本跑完常常就停在「我的课程」页，课程是全的；以前这里无条件先跳到平台首页，
		 * 等于把现成能用的页面顶掉，反而一门课都读不到。
		 *
		 * 用户常同时开着课程页和视频页，所以主页面抽不到时再试其他平台标签（最多 4 个）。
		 */
		const attempts: (Page | Frame)[] = [page];
		browser.pages().forEach((item) => {
			if (item === page || item.isClosed() || attempts.length >= 4) return;
			if (!detectCoursePlatform(item.url())) return;
			attempts.push(item);
		});

		/**
		 * 课程列表可能在 iframe 里（超星「我的课程」就是）：主文档抽不到时，
		 * 把候选页的 frame 也加进来试，顺序排在所有主文档之后（主文档优先，便宜）。
		 */
		const frameTargets: Frame[] = [];
		for (const source of attempts.slice() as Page[]) {
			for (const frame of source.frames()) {
				if (frameTargets.length >= 6) break;
				if (frame === source.mainFrame()) continue;
				if (!detectCoursePlatform(frame.url())) continue;
				frameTargets.push(frame);
			}
		}
		attempts.push(...frameTargets);

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

			/** 导航后 frame 会重建，必须重新收集（超星「我的课程」就在 iframe 里） */
			const afterNav: (Page | Frame)[] = [page];
			for (const frame of page.frames()) {
				if (frame === page.mainFrame()) continue;
				if (!detectCoursePlatform(frame.url())) continue;
				afterNav.push(frame);
			}

			for (const target of afterNav) {
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
		}

		const finalPlatform = detectCoursePlatform(used.url()) || platform;
		if (items.length) {
			/** 抽到课程的那一页就是后续「进入课程」要点击的页面（frame 里抽到的就记它的宿主页） */
			this.automationPage = toPage(used);
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

		/**
		 * 标记可能打在 iframe 里（超星「我的课程」整个在 mooc2-ans 的 iframe 内），
		 * 主文档 `page.$` 一定找不到，必须逐个 frame 找。
		 */
		const findMarked = async (which: string): Promise<{ handle: ElementHandle | null; frame: Frame | null }> => {
			const direct = await page.$(`[data-hh-course="${which}"]`).catch(() => null);
			if (direct) return { handle: direct, frame: null };
			for (const frame of page.frames()) {
				if (frame === page.mainFrame()) continue;
				const found = await frame.$(`[data-hh-course="${which}"]`).catch(() => null);
				if (found) return { handle: found, frame: frame };
			}
			return { handle: null, frame: null };
		};

		const located = await findMarked(id);
		let handle: ElementHandle | null = located.handle;
		/** 抽到课程的 frame：重定位抽取要在同一个 frame 里做，否则抽到的是另一份 DOM */
		let courseFrame: Frame | null = located.frame;
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
			/**
			 * 重新抽取的目标：优先原来那个 frame；没有就主文档 + 各 frame 依次试。
			 */
			const extractTargets: (Page | Frame)[] = courseFrame ? [courseFrame] : [page];
			if (!courseFrame) {
				for (const frame of page.frames()) {
					if (frame === page.mainFrame()) continue;
					if (!detectCoursePlatform(frame.url())) continue;
					extractTargets.push(frame);
				}
			}

			let again: Awaited<ReturnType<typeof extractCoursesInPage>> | undefined;
			let againFrame: Frame | null = courseFrame;
			for (const target of extractTargets) {
				/** 懒加载列表（智慧树共享课）不滚到底抽不到，重定位前同样先滚 */
				await autoScrollForCourses(target);
				const result = await target
					.evaluate(extractCoursesInPage, {
						platform: detectCoursePlatform(target.url())?.id || ''
					})
					.catch(() => undefined);
				if (result && result.items.length) {
					again = result;
					againFrame = target === page ? null : (target as Frame);
					break;
				}
			}
			if (!again) throw new Error('课程列表已过期，请重新刷新课程列表');
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
				handle = againFrame
					? await againFrame.$(`[data-hh-course="${hit.id}"]`).catch(() => null)
					: await page.$(`[data-hh-course="${hit.id}"]`).catch(() => null);
				if (againFrame) courseFrame = againFrame;
			}
			if (!directUrl && !handle) throw new Error('课程列表已过期，请重新刷新课程列表');
		}

		const before = this.browser.pages().length;
		/**
		 * 进入后的课程页单独记，**不覆盖 `automationPage`**：
		 * 那个字段是「课程列表页」，被课程页顶掉的话，下次读列表会去课程页里找课，一门都找不到。
		 */
		let enteredPage: Page | null = null;

		/** 有直链就按 URL 进入（超星），没有才能靠点击（智慧树） */
		let linkTarget = directUrl;
		if (!linkTarget) {
			const rawHref = await handle!.getAttribute('href');
			if (rawHref && /^https?:/i.test(rawHref.trim())) linkTarget = new URL(rawHref.trim(), page.url()).href;
		}

		if (linkTarget) {
			this.info(`[远程] 进入课程：${linkTarget}`);
			/**
			 * 新开标签进入：课程列表页得留着，用户才能接着点下一门
			 * （以前直接 `page.goto` 会把列表页顶掉，想换门课只能手工退回来）。
			 */
			const tab = await page.context().newPage().catch(() => null);
			if (tab) {
				await tab
					.goto(linkTarget, { waitUntil: 'domcontentloaded', timeout: 45000 })
					.catch((e: any) =>
						this.warn('[远程] 打开课程页失败：', String(e && e.message ? e.message : e))
					);
				enteredPage = tab;
			} else {
				await page.goto(linkTarget, { waitUntil: 'domcontentloaded', timeout: 45000 });
				enteredPage = page;
			}
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
				enteredPage = popup;
				await popup.waitForLoadState('domcontentloaded').catch(() => {});
			} else {
				enteredPage = page;
			}
		}

		const active = enteredPage && !enteredPage.isClosed() ? enteredPage : page;
		/** 进入课程后把这一页顶到最前，电脑前的人能直接看到刷课界面 */
		await active.bringToFront().catch(() => {});
		/**
		 * 标题兜底用课程名：分享课/SPA 课程页在 DOMContentLoaded 时 title 还是站点名
		 * （远程端就显示成「已进入课程：智慧树」），空或明显不是课程名时一律用课程名。
		 */
		const rawTitle = await active.title().catch(() => '');
		const title = rawTitle && rawTitle !== '智慧树' && rawTitle !== '超星' ? rawTitle : wantName || rawTitle;

		/** 记住这个课程页：读章节 / 作业 / 考试都要在它上面点菜单 */
		if (active && !active.isClosed() && isCoursePageUrl(active.url())) this.coursePage = active;

		return { url: active.url(), title };
	}

	/**
	 * 读课程内部目录（章节 / 作业 / 考试）
	 *
	 * 只能「点菜单 → 等 iframe → 在 iframe 里抽」：三个目录的 URL 各带一个
	 * 由服务端在点击时算出来的 `enc`，前端拼不出来（拼错就是一张空白页）。
	 */
	async listCourseCatalog(options: { kind: CatalogKind }): Promise<CourseCatalog> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		const kind = options && options.kind;
		const meta = CATALOG_MENUS[kind];
		if (!meta) throw new Error('未知的目录类型：' + String(kind));

		const page = await this.requireCoursePage();
		const frame = await this.openCatalog(page, kind);

		const result = await frame.evaluate(extractCatalogInPage, { kind }).catch((e: any) => {
			throw new Error('读取「' + meta.title + '」失败：' + String(e && e.message ? e.message : e));
		});

		return {
			kind,
			title: meta.title,
			url: result.url || frame.url(),
			items: result.items || [],
			summary: result.summary || '',
			empty: !!result.empty,
			message: result.message || ''
		};
	}

	/**
	 * 进入目录里的某一条
	 *
	 * 章节跳到 `studentstudy`（刷课脚本接管），作业跳到 `dowork`、考试跳到答题页
	 * （做题脚本接管）。这里只负责「把用户送到那一页」，跑不跑脚本由脚本自身决定。
	 */
	async openCatalogItem(options: { kind: CatalogKind; id: string; title?: string }): Promise<{
		url: string;
		title: string;
		message: string;
	}> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		const kind = options && options.kind;
		const meta = CATALOG_MENUS[kind];
		if (!meta) throw new Error('未知的目录类型：' + String(kind));

		const id = String((options && options.id) || '').trim();
		if (!id) throw new Error('缺少条目标识');

		const page = await this.requireCoursePage();
		const frame = await this.openCatalog(page, kind);

		const before = this.browser.pages().length;
		const clicked: { ok: boolean; reason?: string; title?: string } = await frame
			.evaluate(clickCatalogItemInPage, { kind, id })
			.catch((e: any) => ({ ok: false, reason: String(e && e.message ? e.message : e) }));

		if (!clicked || !clicked.ok) {
			throw new Error(clicked && clicked.reason ? clicked.reason : '没有找到这一条，请刷新目录后重试');
		}

		const landed = await this.waitEnteredItem(page, kind, before, 30000);
		const active = landed && !landed.isClosed() ? landed : page;
		await active.bringToFront().catch(() => {});

		const url = active.url();
		const title = (await active.title().catch(() => '')) || clicked.title || meta.title;
		return { url, title, message: landed ? '' : '已点击，但页面还没有跳转，稍等一下再看看' };
	}

	/**
	 * 进入第一个还没刷完的章节（「自动推进进度」的起点）
	 *
	 * 为什么不自己一节一节循环：学习页和课程页是同一张标签，进课之后课程页就没了，
	 * 中间想再读一次目录就得退出来——那会把正在播放的视频打断。
	 * 超星脚本本来就带「自动跳转下一个未完成章节」（`autoJumpToUnFinishJob`），
	 * 所以这里只负责把起点送到位，后面的推进交给脚本。
	 *
	 * `skipIds` 用于失败重试：某一节怎么也刷不动时，跳过它换下一节，避免死循环。
	 */
	async enterNextChapter(options?: { skipIds?: string[] }): Promise<{
		entered: boolean;
		chapterId: string;
		title: string;
		no: string;
		remaining: number;
		message: string;
		url: string;
	}> {
		const skip = (options && options.skipIds) || [];
		const catalog = await this.listCourseCatalog({ kind: 'chapter' });

		/** 只挑「已解锁且还有任务点」的：locked 连 onclick 都没有，done 没必要再进 */
		const todo = catalog.items.filter((item) => item.status === 'todo' && item.clickable && item.id);
		const next = pickNextChapter(catalog.items, skip);

		if (!next) {
			const locked = catalog.items.filter((item) => item.status === 'locked').length;
			return {
				entered: false,
				chapterId: '',
				title: '',
				no: '',
				remaining: 0,
				message:
					locked > 0
						? '能进的章节都刷完了，剩下 ' + locked + ' 节要先完成前面的闯关任务点'
						: '这门课的章节已经全部完成',
				url: catalog.url
			};
		}

		const landed = await this.openCatalogItem({ kind: 'chapter', id: next.id, title: next.title });
		return {
			entered: true,
			chapterId: next.id,
			title: next.title,
			no: next.no,
			remaining: todo.length,
			message: '已进入 ' + (next.no ? next.no + ' ' : '') + next.title,
			url: landed.url
		};
	}

	/**
	 * 当前是否已经站在课程页上
	 *
	 * 界面上那三个目录（章节 / 作业 / 考试）只有课程页里才有入口，没进课时点下去
	 * 必然报「还没有进入课程页」。所以点之前先问一句：不能只在进入课程的瞬间把按钮
	 * 点亮——用户中途退回去、或者换了标签，状态就变了；反过来手工进课时也要能亮。
	 *
	 * 不抛异常：这是一个状态查询，返回 `ready: false` 就够了。
	 */
	async catalogReady(): Promise<{ ready: boolean; url: string }> {
		if (!this.browser) return { ready: false, url: '' };

		const cached = this.coursePage;
		if (cached && !cached.isClosed() && isCoursePageUrl(cached.url())) {
			return { ready: true, url: cached.url() };
		}

		const pages = this.browser.pages().filter((item) => !item.isClosed());
		const hit = pages.find((item) => isCoursePageUrl(item.url()));
		if (hit) {
			/** 顺手补一下缓存：手工进课的情况靠这里把课程页认下来 */
			this.coursePage = hit;
			return { ready: true, url: hit.url() };
		}

		return { ready: false, url: '' };
	}

	/** 取课程页：缓存优先，其次按 URL 在现有标签里找 */
	private async requireCoursePage(): Promise<Page> {
		const cached = this.coursePage;
		if (cached && !cached.isClosed() && isCoursePageUrl(cached.url())) return cached;

		const pages = (this.browser ? this.browser.pages() : []).filter((item) => !item.isClosed());
		const hit = pages.find((item) => isCoursePageUrl(item.url()));
		if (hit) {
			this.coursePage = hit;
			return hit;
		}

		/** 停在平台页上但不带这套菜单（智慧树之类）：说清楚是「不支持」，别让用户以为漏点了什么 */
		const platformHit = pages.find((item) => !!detectCoursePlatform(item.url()));
		if (platformHit) {
			throw new Error('当前这个平台没有「章节 / 作业 / 考试」三栏目录，暂时只支持超星。');
		}

		throw new Error('还没有进入课程页。请先进入一门课程，再读它的章节 / 作业 / 考试。');
	}

	/** 点菜单切到指定目录，并等它的 iframe 渲染出内容 */
	private async openCatalog(page: Page, kind: CatalogKind): Promise<Frame> {
		const meta = CATALOG_MENUS[kind];
		await page.bringToFront().catch(() => {});

		const clicked = await this.clickCatalogMenu(page, meta.dataname);
		if (!clicked) {
			/** 旧版课程页可能没有这排菜单，但 iframe 已经停在目标页上 */
			const fallback = this.findCatalogFrame(page, kind);
			if (fallback) return fallback;
			throw new Error('这个课程页上没有「' + meta.title + '」入口');
		}

		const frame = await this.waitCatalogFrame(page, kind, 25000);
		if (!frame) throw new Error('「' + meta.title + '」加载超时，请重试');
		return frame;
	}

	/** 点课程页顶部菜单（`li[dataname=…]`） */
	private async clickCatalogMenu(page: Page, dataname: string): Promise<boolean> {
		const li = await page.$(`li[dataname="${dataname}"]`).catch(() => null);
		if (!li) return false;
		const link = (await li.$('a').catch(() => null)) || li;

		/** 与课程卡片同样的坑：某些皮肤会在菜单上盖透明层，真实点击会被拦下并重试到超时 */
		const covered = await link
			.evaluate((el) => {
				const box = (el as HTMLElement).getBoundingClientRect();
				if (!box.width || !box.height) return true;
				const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
				return !!top && top !== el && !el.contains(top);
			})
			.catch(() => false);

		if (covered) {
			await link.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
		} else {
			await link
				.click({ timeout: 3000 })
				.catch(() => link.evaluate((el) => (el as HTMLElement).click()).catch(() => {}));
		}
		return true;
	}

	private findCatalogFrame(page: Page, kind: CatalogKind): Frame | undefined {
		const part = CATALOG_MENUS[kind].framePart;
		return page.frames().find((item) => item !== page.mainFrame() && item.url().includes(part));
	}

	private async waitCatalogFrame(page: Page, kind: CatalogKind, timeout: number): Promise<Frame | undefined> {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const frame = this.findCatalogFrame(page, kind);
			if (frame) {
				/** iframe 的 src 换掉之后 DOM 还要渲染，空 body 直接抽会拿到 0 条 */
				const ready = await frame
					.evaluate(() => (((document.body && document.body.innerText) || '').replace(/\s+/g, '').length > 8))
					.catch(() => false);
				if (ready) return frame;
			}
			await page.waitForTimeout(400);
		}
		return undefined;
	}

	/** 等条目跳转完成：章节走当前页导航，作业/考试多半开新标签 */
	private async waitEnteredItem(
		page: Page,
		kind: CatalogKind,
		beforeCount: number,
		timeout: number
	): Promise<Page | undefined> {
		const want = CATALOG_MENUS[kind].enterUrlPart;
		const deadline = Date.now() + timeout;

		while (Date.now() < deadline) {
			const pages = (this.browser ? this.browser.pages() : []).filter((item) => !item.isClosed());
			const fresh = pages.length > beforeCount ? pages.slice(beforeCount) : [];
			const hit = [page, ...fresh].find((item) => want.test(item.url()));
			if (hit) {
				await hit.waitForLoadState('domcontentloaded').catch(() => {});
				return hit;
			}
			await page.waitForTimeout(500);
		}
		return undefined;
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
 * 是不是「课程主页」——进入某门课之后那一页，顶部有 章节/作业/考试 一排菜单。
 *
 * 故意排除 `studentstudy`：那是点进某一节之后的学习页，上面没有这排菜单，
 * 拿它去点菜单只会一直找不到元素。
 */
export function isCoursePageUrl(url: string): boolean {
	if (!/^https?:/i.test(String(url || ''))) return false;
	if (/\/mycourse\/studentstudy/i.test(url)) return false;
	return /\/mycourse\/(stu|studentcourse)(\?|$)/i.test(url);
}

/**
 * 三个目录在课程页上的「菜单 dataname / iframe 特征 / 进入后的 URL 特征」
 *
 * dataname 取自超星课程页 `li[dataname]`（zj=章节 zy=作业 ks=考试）；
 * framePart 用来在 page.frames() 里认出这个目录的 iframe；
 * enterUrlPart 用来判断「点了这一条之后确实跳进去了」。
 */
interface CatalogMenu {
	dataname: string;
	title: string;
	framePart: string;
	enterUrlPart: RegExp;
}

const CATALOG_MENUS: Record<CatalogKind, CatalogMenu> = {
	chapter: {
		dataname: 'zj',
		title: '章节',
		framePart: 'studentcourse',
		enterUrlPart: /\/mycourse\/studentstudy/i
	},
	work: {
		dataname: 'zy',
		title: '作业',
		framePart: 'work/list',
		enterUrlPart: /(work\/dowork|doHomeWorkNew|api\/work)/i
	},
	exam: {
		dataname: 'ks',
		title: '考试',
		framePart: 'exam-list',
		enterUrlPart: /(reVersionTestStart|exam-ans\/exam\/|exam\/test)/i
	}
};

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
/** Frame 有 page() 方法，Page 没有——用它区分两种抽取目标 */
function toPage(target: Page | Frame): Page {
	const maybe = target as Frame;
	return typeof maybe.page === 'function' ? maybe.page() : (target as Page);
}

/**
 * 课程列表常常「滚到底才加载下一批」，抽取前先把列表滚到底并等数量稳定。
 *
 * 智慧树 AI 教学中心就是典型：首屏只渲染 16 门 AI 智课，3 门共享课必须把列表滚到底
 * 才会出现在 DOM 里。而且它的滚动发生在内层 `.el-scrollbar__wrap` 上，
 * `window.scrollTo` 完全无效（页面本身高度就等于视口高度），必须找到真正的滚动容器。
 */
export async function autoScrollForCourses(target: Page | Frame, maxRounds = 10): Promise<void> {
	const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
	/**
	 * 变化判定同时看「课程卡片数」和「元素总数」：
	 * 卡片选择器各站不同（智慧树 `.course-card`、超星 `.course`），
	 * 元素总数则是通用的——滚到底加载出新内容，总数一定变。
	 */
	const snapshot = () =>
		target
			.evaluate(() => ({
				cards: document.querySelectorAll('div.course-card, [class*="course-card"], .course').length,
				nodes: document.querySelectorAll('*').length
			}))
			.catch(() => ({ cards: 0, nodes: 0 }));

	const scrollToEnd = () =>
		target
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

	let last = await snapshot();
	/** 页面里一张课程卡片都没有：不是列表页（视频页/空白页），滚也没用 */
	if (!last.cards) {
		await scrollToEnd();
		await sleep(700);
		last = await snapshot();
		if (!last.cards) return;
	}

	let stable = 0;
	for (let round = 0; round < maxRounds; round++) {
		const hadScroller = await scrollToEnd();
		await sleep(hadScroller ? 700 : 400);
		const now = await snapshot();
		if (now.cards === last.cards && now.nodes === last.nodes) {
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
	const KNOWN_CARDS: { host: RegExp; card: string; name: string; label: string; url?: string }[] = [
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
		},
		{
			/**
			 * 超星「我的课程」：列表在 iframe（`mooc2-ans.chaoxing.com/visit/interaction`）里，
			 * 卡片根 `.course`，课程名 `.course-name`（textContent 为空时看 title 属性），
			 * 标题链接 `.course-info a[href]` 直指 `mooc1.chaoxing.com/visit/stucoursemiddle`。
			 * 超星不标课程类型，label 留空。
			 */
			host: /(^|\.)chaoxing\.com$/i,
			card: '.course',
			name: '.course-name',
			label: '',
			url: '.course-info a[href]'
		}
	];

	const knownRule = KNOWN_CARDS.find((rule) => rule.host.test(location.hostname));
	if (knownRule) {
		const knownCards = Array.prototype.slice.call(document.querySelectorAll(knownRule.card)) as HTMLElement[];
		for (const card of knownCards) {
			if (items.length >= 30) break;
			const nameEl = card.querySelector(knownRule.name) as HTMLElement | null;
			let name = clean((nameEl && nameEl.textContent) || '');
			/** 标题被 ellipsis 截断时 textContent 仍是全名，但个别站点只把全名放在 title 属性里 */
			if (!name && nameEl) name = clean(nameEl.getAttribute('title') || '');
			/** 标题节点没渲染出来时退到封面图的 alt（真实站点里两者一致） */
			if (!name) {
				const img = card.querySelector('img') as HTMLImageElement | null;
				name = clean((img && img.alt) || '');
			}
			if (!name) continue;

			const labelEl = knownRule.label ? (card.querySelector(knownRule.label) as HTMLElement | null) : null;
			const label = clean((labelEl && labelEl.textContent) || '').slice(0, 12);

			/** 有直链就用直链（超星），没有就让「进入课程」去点卡片（智慧树） */
			let href = '';
			if (knownRule.url) {
				const link = card.querySelector(knownRule.url) as HTMLAnchorElement | null;
				const raw = clean((link && (link.getAttribute('href') || link.href)) || '');
				if (raw && /^https?:/i.test(raw)) href = raw;
			}
			push(name, href, card, label);
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

/**
 * 在章节目录里挑出「下一个该刷的」
 *
 * 三个条件缺一不可：已解锁（有 onclick）、还有任务点（`todo`）、没被跳过。
 * 抽成纯函数是为了能单测——真实页面上点一次菜单要好几秒，测试跑不动。
 *
 * 按目录顺序取第一个：超星是闯关模式，前面的没完成后面的本来也点不进去。
 */
export function pickNextChapter(items: CatalogItem[], skipIds?: string[]): CatalogItem | undefined {
	const skip = skipIds || [];
	return items.filter((item) => item.status === 'todo' && item.clickable && item.id && skip.indexOf(item.id) === -1)[0];
}

/**
 * 页面内抽取课程目录（在浏览器里执行，不能引用外部变量）
 *
 * 三个目录的 DOM 完全不一样，按 kind 分派。踩过的坑：
 * - 章节的「章名」节点（"1 必修部分"）既没有 id 也没有 onclick，不是可点条目，
 *   但它是分组信息，必须保留，否则前端展示不出层级；
 * - 超星开着「闯关模式」时，后面的章节**连 onclick 都没有**，靠这一点判定 locked；
 * - 章节的「还剩几个任务点」写在隐藏域 `input.knowledgeJobCount` 里，不是文本；
 * - 作业/考试的锁定态写在 `.span_tip[title]`（"完成49%任务点可参加考试"），
 *   条目本身仍有 onclick，点下去只会弹「暂未开放」——必须提前拦下来。
 */
export function extractCatalogInPage(arg: { kind: CatalogKind }): {
	url: string;
	items: CatalogItem[];
	summary: string;
	empty: boolean;
	message: string;
} {
	const norm = (value: any) =>
		String(value === null || value === undefined ? '' : value)
			.replace(/\s+/g, ' ')
			.trim();

	const kind = arg && arg.kind;
	const items: CatalogItem[] = [];
	let summary = '';
	let message = '';

	if (kind === 'chapter') {
		const nodes = Array.prototype.slice.call(document.querySelectorAll('div.chapter_item')) as HTMLElement[];

		for (const el of nodes) {
			const idMatch = /^cur(\d+)$/.exec(el.id || '');
			const onclick = el.getAttribute('onclick') || '';
			const barEl = el.querySelector('.catalog_sbar');
			const no = norm(barEl && barEl.textContent);
			const nameEl = (el.querySelector('.catalog_name') || el) as HTMLElement;
			const title = norm(nameEl.textContent).replace(no, '').trim();
			if (!title) continue;

			const stateEl = el.querySelector('.catalog_state');
			const stateCls = stateEl ? String(stateEl.className || '') : '';
			const jobEl = el.querySelector('input.knowledgeJobCount') as HTMLInputElement | null;
			const pending = jobEl ? Number(jobEl.value || 0) : 0;
			const taskText = norm((el.querySelector('.catalog_task') || el).textContent);

			let status: CatalogItem['status'] = 'unknown';
			let state = '';
			let hint = '';

			if (!idMatch && !onclick) {
				/** 纯分组标题，如 "1 必修部分"：不是条目，只用来分段 */
				state = '';
			} else if (!onclick) {
				status = 'locked';
				state = '未解锁';
				hint = taskText || '需先完成前面的闯关任务点';
			} else if (/icon_yiwanc/.test(stateCls)) {
				status = 'done';
				state = '已完成';
			} else if (pending > 0) {
				status = 'todo';
				state = '待完成';
				hint = pending + ' 个任务点未完成';
			} else if (/chuangguan/.test(stateCls)) {
				status = 'locked';
				state = '未解锁';
				hint = taskText;
			} else {
				status = 'todo';
				state = '未开始';
				hint = taskText;
			}

			items.push({
				id: idMatch ? idMatch[1] : '',
				title,
				no,
				depth: no ? no.split('.').length : 1,
				status,
				state,
				hint,
				clickable: !!onclick,
				onclick
			});
		}

		const bodyText = norm(document.body && document.body.innerText);
		const progress = /已完成任务点[:：]\s*(\d+)\s*\/\s*(\d+)/.exec(bodyText);
		if (progress) summary = progress[1] + '/' + progress[2] + ' 任务点';
	} else if (kind === 'work') {
		const lis = Array.prototype.slice.call(
			document.querySelectorAll('.bottomList ul > li, .work-list ul > li, .has-content ul > li')
		) as HTMLElement[];

		for (const el of lis) {
			const onClickEl = el.querySelector('[onclick]') as HTMLElement | null;
			const onclick = onClickEl ? onClickEl.getAttribute('onclick') || '' : '';
			const titleEl = el.querySelector('.overHidden2, .title, p');
			const title = norm(titleEl && titleEl.textContent) || norm(el.textContent).slice(0, 60);
			if (!title) continue;

			const state = norm((el.querySelector('.status') || {}).textContent);
			const tipEl = el.querySelector('.span_tip');
			const tip = tipEl ? norm(tipEl.getAttribute('title') || tipEl.textContent) : '';
			const time = norm((el.querySelector('.time') || {}).textContent);
			const digits = /(\d{6,})/.exec(onclick);

			let status: CatalogItem['status'] = 'unknown';
			if (!onclick) status = 'locked';
			else if (/已完成|已提交|已批阅/.test(state)) status = 'done';
			else if (tip && /任务点|未开放|无法|不能/.test(tip)) status = 'locked';
			else status = 'todo';

			items.push({
				id: digits ? digits[1] : '',
				title,
				no: '',
				depth: 0,
				status,
				state,
				hint: [tip, time].filter(Boolean).join(' · '),
				clickable: !!onclick,
				onclick
			});
		}

		const bodyText = norm(document.body && document.body.innerText);
		const progress = /\b(\d+)\s*\/\s*(\d+)\b/.exec(bodyText);
		if (progress) summary = progress[1] + '/' + progress[2];
	} else {
		const lis = Array.prototype.slice.call(
			document.querySelectorAll('.bottomList ul > li, .exam-list ul > li')
		) as HTMLElement[];

		for (const el of lis) {
			const onClickEl = el.querySelector('[onclick]') as HTMLElement | null;
			const onclick = onClickEl ? onClickEl.getAttribute('onclick') || '' : '';
			const titleEl = el.querySelector('.right-content p, p');
			const title = norm(titleEl && titleEl.textContent) || norm(el.textContent).slice(0, 60);
			if (!title) continue;

			const state = norm((el.querySelector('p.status, .status') || {}).textContent);
			const tipEl = el.querySelector('.span_tip');
			const tip = tipEl ? norm(tipEl.getAttribute('title') || tipEl.textContent) : '';
			const time = norm((el.querySelector('.time') || {}).textContent);

			/** goTest(courseId, examId, …)，第 2 个参数就是 examId */
			let id = '';
			const go = /goTest\(([^)]*)\)/i.exec(onclick);
			if (go) {
				const parts = go[1].split(',');
				id = String(parts[1] || '').replace(/["'\s]/g, '');
			}

			let status: CatalogItem['status'] = 'unknown';
			if (!onclick) status = 'locked';
			else if (/已完成|已交|已提交/.test(state)) status = 'done';
			else if (tip && /任务点|未开放|未开始|无法|不能/.test(tip)) status = 'locked';
			else status = 'todo';

			items.push({
				id,
				title,
				no: '',
				depth: 0,
				status,
				state,
				hint: [tip, time].filter(Boolean).join(' · '),
				clickable: !!onclick,
				onclick
			});
		}

		const bodyText = norm(document.body && document.body.innerText);
		if (/暂无考试/.test(bodyText)) message = '这门课还没有安排考试';
	}

	const real = items.filter((item) => !!item.id || item.status !== 'unknown');
	if (!real.length && !message) {
		const bodyText = norm(document.body && document.body.innerText);
		message = /暂无作业/.test(bodyText) ? '这门课还没有布置作业' : '没有读到内容，请稍后重试';
	}

	return { url: location.href, items, summary, empty: real.length === 0, message };
}

/**
 * 页面内点击目录里的某一条（在浏览器里执行，不能引用外部变量）
 *
 * 章节按 `#cur<chapterId>` 定位；考试按 `goTest(…, examId, …)` 里的 examId 比对；
 * 其余按 onclick 文本里是否出现 id。点之前统一看一次 `.span_tip`，
 * 锁定态点下去只会弹「暂未开放」，不如直接告诉用户原因。
 */
export function clickCatalogItemInPage(arg: { kind: CatalogKind; id: string }): {
	ok: boolean;
	reason?: string;
	title?: string;
} {
	const norm = (value: any) =>
		String(value === null || value === undefined ? '' : value)
			.replace(/\s+/g, ' ')
			.trim();

	const kind = arg && arg.kind;
	const id = String((arg && arg.id) || '');
	if (!id) return { ok: false, reason: '缺少条目标识' };

	let el: HTMLElement | null = null;

	if (kind === 'chapter') {
		el = document.querySelector('div.chapter_item#cur' + id) as HTMLElement | null;
		if (el && !el.getAttribute('onclick')) {
			return { ok: false, reason: '这一节还没解锁，需要先完成前面的闯关任务点' };
		}
	} else {
		const selector =
			kind === 'exam'
				? '.bottomList li [onclick], .exam-list li [onclick]'
				: '.bottomList li [onclick], .has-content li [onclick]';
		const all = Array.prototype.slice.call(document.querySelectorAll(selector)) as HTMLElement[];

		el =
			all.find((node) => {
				const text = node.getAttribute('onclick') || '';
				if (kind === 'exam') {
					const go = /goTest\(([^)]*)\)/i.exec(text);
					if (!go) return false;
					return String(go[1].split(',')[1] || '').replace(/["'\s]/g, '') === id;
				}
				return text.indexOf(id) !== -1;
			}) || null;
	}

	if (!el) return { ok: false, reason: '页面上找不到这一条，请刷新目录后重试' };

	const card = el.closest('li') || el;
	const tipEl = card.querySelector('.span_tip');
	const tip = tipEl ? norm(tipEl.getAttribute('title') || tipEl.textContent) : '';
	if (tip && /任务点|未开放|无法|不能/.test(tip)) {
		return { ok: false, reason: '这一条还没解锁：' + tip };
	}

	const title = norm(el.textContent).slice(0, 60);
	el.click();
	return { ok: true, title };
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

					/**
					 * 自动化程序全部结束。
					 *
					 * 必须显式通知渲染进程：自动刷课要等登录脚本跑完才能读课程列表，
					 * 之前只能靠「猜一个延时」，登录慢一点（滑块、短信）就会读到空列表，
					 * 登录快一点又白等半分钟。
					 */
					send('automation-done');

					await step('浏览器初始化完成。', { loading: false });
					console.log('浏览器初始化全部完成');
				} catch (err) {
					console.error('浏览器初始化步骤失败（不影响使用）：', err instanceof Error ? err.message : String(err));
					/** 初始化中途失败也要给个「自动化阶段结束」的信号，否则自动刷课会白等 5 分钟超时 */
					send('automation-done');
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
