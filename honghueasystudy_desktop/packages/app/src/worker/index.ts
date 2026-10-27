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
					this.close();
				} else {
					console.error('错误 : ', err.message.substring(0, 500));
				}
			} else {
				console.error('未知错误 : ', String(err).substring(0, 500));
			}
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
	 */
	async snapshot(options?: { quality?: number }): Promise<string> {
		const pages = this.browser?.pages() || [];
		if (pages.length === 0) {
			throw new Error('浏览器尚未打开任何页面');
		}

		const page = pages[pages.length - 1];
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

	/** 获取当前浏览器实例的所有页面 */
	async getPages(): Promise<{ url: string; title: string }[]> {
		const pages = this.browser?.pages() || [];
		const result: { url: string; title: string }[] = [];

		for (const page of pages) {
			let title = '';
			try {
				title = await Promise.race([
					page.title(),
					new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500))
				]);
			} catch {
				title = '';
			}
			result.push({ url: page.url(), title });
		}

		return result;
	}

	/** 跳转到特殊图像共享浏览器窗口 */
	async gotoWebRTCPage() {
		const page = await this.browser?.newPage();
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
		chromium
			.launchPersistentContext(userDataDir, {
				headless,
				viewport: null,
				executablePath,
				ignoreHTTPSErrors: true,
				acceptDownloads: true,
				ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
				args: [
					'--window-position=0,0',
					'--no-first-run',
					'--no-default-browser-check',
					'--allow-file-access-from-files',
					// AppImage 下无法可靠保留 chrome-sandbox 的 setuid 位，Linux 关闭沙箱；
					// Windows/macOS 保留沙箱以收紧攻击面。
					...(process.platform === 'linux' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
					...args
				]
			})
			.then(async (browser) => {
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

	// 关闭检测
	const interval = setInterval(async () => {
		if (browser.pages().length === 0) {
			clearInterval(interval);

			await browser.close({
				reason: 'no pages'
			});
		}
	}, 100);

	browser.once('close', () => {
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
