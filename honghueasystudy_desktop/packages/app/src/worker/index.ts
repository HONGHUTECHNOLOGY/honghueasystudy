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
	 * 远程自动化（登录 / 选课）专用页面
	 *
	 * 单独开一个标签跑登录，跑完留在这一页上读课程列表，不碰用户正在看的刷课页。
	 * 登录态是按 context 共享的 Cookie，所以新标签同样已登录。
	 */
	private automationPage?: Page;
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

		/** 添加拓展启动参数 */
		options.args = formatExtensionArguments(this.extensionPaths);

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
				...options
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
		courses: { id: string; name: string; url: string }[];
		hint: string;
	}> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		const page = await this.acquireAutomationPage();
		let platform = detectCoursePlatform(page.url());

		if (options?.refresh !== false && platform) {
			const target = platform.listUrl;
			if (normalizeUrl(page.url()) !== normalizeUrl(target)) {
				this.info(`[远程] 打开课程列表页：${target}`);
				await page
					.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 })
					.catch((e: any) => this.warn('[远程] 打开课程列表页失败：', String(e && e.message ? e.message : e)));
			}
			platform = detectCoursePlatform(page.url()) || platform;
			/** 课程列表大多是异步渲染，直接抽取会抽到空列表 */
			await page.waitForTimeout(2500);
		}

		const result = await page.evaluate(extractCoursesInPage, { platform: platform?.id || '' });
		const pageTitle = (result && result.pageTitle) || '';
		const courses = (result && result.items) || [];

		const hint = courses.length
			? ''
			: platform
				? `未在${platform.id}课程页识别到课程（当前页面：${pageTitle || page.url()}）。请确认登录已完成，或在桌面端浏览器里手动打开课程列表后点「刷新」。`
				: '当前页面不属于支持的教学平台，请先运行登录脚本。';

		this.info(`[远程] 课程列表：识别到 ${courses.length} 门课程（${platform?.id || '未知平台'}）`);
		return { platform: platform?.id || '', pageUrl: page.url(), pageTitle, courses, hint };
	}

	/** 进入指定课程（列表项由 listCourses 打标记，这里按标记点击或直接跳转） */
	async enterCourse(options: { id: string; name?: string }): Promise<{ url: string; title: string }> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		const id = String((options && options.id) || '').trim();
		if (!id) throw new Error('缺少课程标识');

		const page =
			this.automationPage && !this.automationPage.isClosed() ? this.automationPage : await this.pickActivePage();
		if (!page) throw new Error('没有可用的页面，请先运行登录脚本并刷新课程列表');

		let handle = await page.$(`[data-hh-course="${id}"]`);
		let directUrl = '';

		if (!handle) {
			/**
			 * 页面在中途刷新/跳转过，之前的标记就没了。
			 * 按课程名重新抽取一次再定位，比直接报「列表过期」体验好得多
			 * （用户刚登录完就点课程时，课程页的异步渲染经常刚好重载一次）。
			 */
			const name = String((options && options.name) || '').trim();
			const again = await page.evaluate(extractCoursesInPage, {
				platform: detectCoursePlatform(page.url())?.id || ''
			});
			const hit = name ? again.items.find((item) => item.name === name) : undefined;
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
				await handle!
					.click({ timeout: 8000 })
					.catch(() => handle!.evaluate((el) => (el as HTMLElement).click()).catch(() => {}));
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

	/** 取（或新开）自动化专用页面：优先复用上次那页，避免每次登录都堆一个新标签 */
	private async acquireAutomationPage(): Promise<Page> {
		if (!this.browser) throw new Error('浏览器尚未启动');

		if (this.automationPage && !this.automationPage.isClosed()) return this.automationPage;

		const page = await this.browser.newPage();
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
	{ id: 'chaoxing', match: /(^|\.)chaoxing\.com$/i, listUrl: 'http://i.chaoxing.com/base' },
	{ id: 'zhihuishu', match: /(^|\.)zhihuishu\.com$/i, listUrl: 'https://onlineweb.zhihuishu.com/onlinestuh5' },
	{ id: 'zjy', match: /(^|\.)zjy2\.icve\.com\.cn$/i, listUrl: 'https://zjy2.icve.com.cn/study/index' },
	{ id: 'icve', match: /(^|\.)icve\.com\.cn$/i, listUrl: 'https://mooc.icve.com.cn/cms/' }
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
 * 页面内抽取课程列表（在浏览器里执行，不能引用外部变量）
 *
 * 踩过的坑写在这里：
 * - 不能只看 `a[href]`：智慧树/职教云的课程卡片是 JS 跳转，没有 href；
 * - 不能只按文本猜：导航栏里「我的课程」「全部课程」会被误判成课程；
 * - 同一门课常同时存在封面链接和标题链接，必须按 URL + 名称去重；
 * - 抽到的元素就地打 `data-hh-course` 标记，供「进入课程」按标记点击。
 */
export function extractCoursesInPage(arg: { platform: string }): {
	items: { id: string; name: string; url: string }[];
	pageTitle: string;
} {
	const BAD = /^(登录|注册|退出|注销|首页|帮助|下载|客户端|客服|更多|设置|消息|通知|购物车|充值|会员|全部课程|我的课程|课程中心|学习中心|返回|上一页|下一页|搜索)$/;
	const COURSE_RX: { [key: string]: RegExp } = {
		chaoxing: /(chaoxing\.com\/(mycourse|mooc[0-9]?-ans\/mycourse|visit\/interaction)|\/course\/[0-9]+)/i,
		zhihuishu:
			/(onlinestuh5|studyspace|studyvideoh5|studyplush5|fusioncourseh5|studywisdomh5|smartcoursestudent|ai-smart-course-student-pro|singleCourse)/i,
		zjy: /(zjy2\.icve\.com\.cn\/study)/i,
		icve: /(icve\.com\.cn\/(cms|course)|courseInfo)/i
	};

	const clean = (text: string) => String(text || '').replace(/\s+/g, ' ').trim();
	const items: { id: string; name: string; url: string }[] = [];
	const seenUrl: { [key: string]: boolean } = {};
	const seenName: { [key: string]: boolean } = {};
	const platformRx = COURSE_RX[arg && arg.platform ? arg.platform : ''];

	const push = (name: string, url: string, el: Element) => {
		const title = clean(name);
		if (!title || title.length < 2 || title.length > 60) return;
		if (BAD.test(title)) return;
		if (/^[0-9\s.:%+-]+$/.test(title)) return;
		if (seenName[title]) return;
		if (url && seenUrl[url]) return;

		seenName[title] = true;
		if (url) seenUrl[url] = true;

		const id = 'c' + (items.length + 1);
		(el as HTMLElement).setAttribute('data-hh-course', id);
		items.push({ id: id, name: title, url: url });
	};

	/** 1) 有直链的课程条目 */
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

		const img = anchor.querySelector('img') as HTMLImageElement | null;
		const name = clean(anchor.textContent || '') || anchor.getAttribute('title') || (img ? clean(img.alt) : '');
		push(name, abs, anchor);
	}

	/** 2) 没有直链的卡片（JS 跳转站点）：只在链接里一无所获时兜底 */
	if (items.length === 0) {
		const nodes = Array.prototype.slice.call(
			document.querySelectorAll('[class*="course" i], [class*="kecheng" i]')
		) as HTMLElement[];
		for (const node of nodes) {
			if (items.length >= 30) break;
			if (node.getAttribute('data-hh-course')) continue;
			/** 只取最内层的卡片，否则外层容器会带着整页文字被当成一门课 */
			if (node.querySelector('[class*="course" i], [class*="kecheng" i]')) continue;
			const text = clean(node.textContent || '');
			if (text.length < 4 || text.length > 60) continue;
			push(text, '', node);
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
	onLaunch
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
					/**
					 * 显示步骤提示
					 */
					const step = async (tips: string | string[], opts?: { loading?: boolean; warn?: boolean }) => {
						const { loading = true, warn = false } = opts || {};
						await blankPage.evaluate(
							(state) => {
								// @ts-ignore 鸿鹄易学导航页自带的方法
								const setState = window.setBookmarkLoadingState;
								if (setState) {
									setState(state);
								} else {
									window.document.body.textContent = state.tips.join('\n');
								}
							},
							{ tips: Array.isArray(tips) ? tips : [tips], loading, warn }
						);
					};

					const [blankPage] = browser.pages();

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

					// 运行自动化程序
					await runAutomationScripts({ browser, automationScripts, serverPort, step });

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
async function runAutomationScripts(opts: {
	browser: BrowserContext;
	serverPort: number;
	automationScripts: AS[];
	step: (tips: string | string[], opts?: { loading?: boolean; warn?: boolean }) => Promise<void>;
}) {
	const { automationScripts, browser, serverPort, step } = opts;

	if (automationScripts.length) {
		// 执行自动化程序
		for (const ps of automationScripts) {
			await step(`正在执行自动化程序 - ${ps.name} ...`);
			const configs = transformScriptConfigToRaw(ps.configs);

			for (const script of AutomationScripts) {
				if (script.name === ps.name) {
					script.on('script-data', (...msg) => console.log(...msg));
					script.on('script-error', (...msg) =>
						console.error('自动化程序错误：', ...msg.map((m) => ScriptWorker.getTransformedErrorMessage(m)))
					);
					try {
						await script.run(await browser.newPage(), configs, {
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
					break;
				}
			}
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
