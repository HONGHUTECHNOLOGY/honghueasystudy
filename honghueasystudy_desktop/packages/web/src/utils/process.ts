import { ChildProcess } from 'child_process';
import { remote } from './remote';
import { store } from '../store';
import { LaunchOptions } from 'playwright-core';
import { reactive } from 'vue';
import type { ScriptWorker } from '@honghu-desktop/app';
import { Browser } from '../fs/browser';
import { Message } from '@arco-design/web-vue';
import EventEmitter from 'events';
import { child_process } from './node';
import { notify } from './notify';
import { createProgress, feedProgress, TaskProgress } from './task-progress';

export type RemoteScriptWorker = <W extends keyof ScriptWorker = keyof ScriptWorker>(
	event: W,
	...args: ScriptWorker[W] extends { (...args: any[]): any } ? Parameters<ScriptWorker[W]> : any[]
) => void;

/**
 * 进程级事件总线
 *
 * `processes` 虽然是 reactive 数组，但类方法内部的 `this` 指向原始实例，
 * 直接给 `this.pages` / `this.progress` 赋值会绕过 Vue 的 set trap，
 * watch 收不到变化。远程控制的上报因此改为「变化即广播」，不再依赖响应式追踪。
 */
export const processEvents = new EventEmitter();

/**
 * 运行进程
 */
export class Process extends EventEmitter {
	uid: string;
	shell?: ChildProcess;
	worker?: RemoteScriptWorker;
	/** 状态 */
	status: 'closed' | 'closing' | 'launching' | 'launched' = 'closed';
	/** 浏览器实体信息 */
	browser: Browser;
	/** 浏览器启动参数 */
	launchOptions: Required<LaunchOptions>;
	/** 输出 */
	logs: string[] = [];
	/** 当前所有页面（远程控制展示用）；active 标记前台可见页，作为远程台默认查看的标签页 */
	pages: { url: string; title: string; active?: boolean }[] = [];
	/** 任务进度（由脚本日志推断，远程台据此展示「进度」） */
	progress: TaskProgress = createProgress();
	/**
	 * 页面内视频的播放状态
	 *
	 * 网课一个视频几十分钟且播放期间没有日志，远程台只靠「日志静止」判断会误报卡住，
	 * 所以额外采集播放进度当作活性信号。null 表示当前页没有 video 元素。
	 */
	media: { playing: boolean; currentTime: number; duration: number } | null = null;

	video: HTMLVideoElement | undefined = undefined;
	stream: MediaStream | undefined = undefined;
	private pagesTimer: ReturnType<typeof setTimeout> | undefined;
	/** 是否有一次刷新正在排队（节流用） */
	private pagesPending = false;
	/** 上一次真正拉到页面列表的时刻 */
	private pagesLastAt = 0;
	/** 两次实际拉取的最小间隔 */
	private static readonly PAGES_MIN_INTERVAL = 900;

	static from(uid: string) {
		return processes.find((p) => p.uid === uid);
	}

	// 从进程列表中移除
	static remove(uid: string) {
		const index = processes.findIndex((p) => p.uid === uid);
		if (index !== -1) {
			processes.splice(index, 1);
		}
	}

	constructor(browser: Browser, launchOptions: LaunchOptions) {
		super();
		this.browser = browser;
		this.uid = browser.uid;
		this.launchOptions = launchOptions as any;
	}

	/**
	 * 使用 child_process 运行鸿鹄易学命令
	 */
	async init(onConsole?: (data: any) => void) {
		this.shell = child_process.fork(
			await remote.path.call('join', await remote.app.call('getAppPath'), './script.js'),
			{
				/**
				 * 必须显式 pipe 出 stdout/stderr。
				 * 原来只写 ['ipc']，子进程的 console.log/console.error 全部被丢弃，
				 * 浏览器启动失败时（launchPersistentContext 握手超时）远程端只能看到「启动中」，
				 * 日志里一个字都没有，完全无法定位。
				 */
				stdio: ['ipc', 'pipe', 'pipe'],
				env: process.env
			}
		);
		this.worker = createRemoteScriptWorker(this.shell);

		/** 子进程输出统一落盘：启动阶段的日志是排查「一直显示启动中」的唯一线索 */
		const appendOutput = (raw: any, isError: boolean) => {
			const line = String(raw).trim();
			if (!line) return;

			this.logs.push(isError ? `[${this.browser.name}] ${line}` : line);
			/** 防止长时间刷课把内存里的日志数组撑爆 */
			if (this.logs.length > 300) this.logs.splice(0, this.logs.length - 300);

			/**
			 * 顺带推进任务进度。
			 * 一个 chunk 可能是多行，逐行喂给推断器；结果变化时立刻广播，
			 * 让远程台不必等下一次心跳就能看到「正在学习 xxx」这类节点。
			 */
			try {
				const now = Date.now();
				let changed = false;
				for (const text of line.split(/\r?\n/)) {
					if (feedProgress(this.progress, text, now)) changed = true;
				}
				if (changed) processEvents.emit('progress', this.uid);
			} catch {
				// 进度推断失败不影响日志输出
			}

			/**
			 * 启动阶段全量落盘（这段时间的输出才有诊断价值）；
			 * 运行阶段只落错误，否则脚本每道题的 console.log 会把日志文件刷爆。
			 */
			if (!isError && this.status === 'launched') return;
			try {
				const text = `[${this.browser.name}] ${line.slice(0, 2000)}`;
				if (isError) {
					remote.logger.call('error', text);
				} else {
					remote.logger.call('log', text);
				}
			} catch {
				// 日志写入失败不影响主流程
			}
		};

		this.shell.stdout?.on('data', (data: any) => {
			appendOutput(data, false);
			onConsole?.(data.toString());
		});
		this.shell.stderr?.on('data', (data: any) => {
			appendOutput(data, true);
			onConsole?.(data.toString());
			notify(`${this.browser.name} 错误`, data, this.browser.uid, {
				duration: 60 * 1000,
				copy: true,
				type: 'error'
			});
		});

		/** 监听器 */
		const listeners: Record<string, (...args: any[]) => void> = {
			/** 浏览器启动 */
			launched: async () => {
				this.status = 'launched';
				/**
				 * 必须显式广播状态变化。
				 *
				 * `this` 是原始 Process 实例（不是 reactive 代理），直接赋值绕过 Vue 的 set trap，
				 * 状态指纹 watch 收不到；而 `refreshPages()` 只在页面签名变化时才 emit，
				 * worker 还没准备好时会静默失败。于是「已启动」只能等下一次 3 秒心跳才上报——
				 * 心跳一旦被冻结，远程端就会永远停在启动中，而且拿不到截图。
				 */
				processEvents.emit('status', this.uid);
				if (!this.progress.startedAt) this.progress.startedAt = Date.now();
				this.refreshPages();
			},
			/**
			 * 浏览器关闭
			 * 可以由 browser.close() 关闭
			 * 或者进程主动触发
			 */
			'browser-closed': () => {
				console.log('browser-closed', this.uid);
				// 从进程列表中移除
				Process.remove(this.uid);
				processEvents.emit('status', this.uid);
			},
			/**
			 * 启动失败（握手超时、浏览器被策略拦截、扩展加载异常等）
			 *
			 * 子进程现在会显式上报失败原因，不必再等看门狗的 120 秒。
			 * 没有这条监听时，失败只会打到子进程的 stderr，
			 * 界面永远停在「启动中」，用户看到的就是「浏览器明明起来了、状态却不动」。
			 */
			'launch-failed': (message?: string) => {
				const reason = String(message || '未知原因');
				console.error('浏览器启动失败：', reason);
				this.status = 'closed';
				Process.remove(this.uid);
				processEvents.emit('status', this.uid);
				notify(`${this.browser.name} 启动失败`, reason, this.browser.uid, {
					duration: 60 * 1000,
					copy: true,
					type: 'error'
				});
			},
			/** 页面新增/跳转/关闭，节流后刷新页面列表 */
			'page-changed': () => {
				this.refreshPages();
			}
		};

		this.shell.on('message', ({ event, args }: { event: string; args: any[] }) => {
			// 将 shell 的事件共享到当前的对象
			this.emit(event, ...args);
			if (listeners[event]) {
				listeners[event](...args);
			}
		});

		// 初始化进程数据
		this.worker('init', {
			store,
			cachePath: this.browser.cachePath,
			uid: this.uid,
			automationScripts: this.browser.automationScripts,
			browserInfo: {
				name: this.browser.name,
				notes: this.browser.notes,
				tags: this.browser.tags
			},
			config: {
				enable_dialog: store.render.setting.browser.enableDialog
			},
			langs: store.render.langs as any
		});
	}

	/**
	 * 调用子进程方法并等待返回值
	 *
	 * 用于远程控制：截图、获取页面列表等需要拿到结果的场景。
	 * 子进程侧通过 replyId 回传，见 packages/app/script.js。
	 */
	callWorker(event: string, ...args: any[]): Promise<any> {
		return this.callWorkerTimeout(event, args, 15000);
	}

	/**
	 * 带自定义超时的 RPC
	 *
	 * 远程登录脚本要处理验证码/滑块、跳转、等待登录态，一分钟以上很正常；
	 * 沿用 15 秒会在脚本还在跑的时候先报超时，用户只能重复点，反而制造并发登录。
	 */
	callWorkerTimeout(event: string, args: any[], timeoutMs: number): Promise<any> {
		return new Promise((resolve, reject) => {
			const shell = this.shell;
			if (!shell || !shell.connected) {
				reject(new Error('浏览器进程未运行'));
				return;
			}

			const replyId = `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

			let cleanup = () => {};

			const handler = (message: any) => {
				if (!message || message.event !== '__reply__') return;
				if (!message.args || message.args[0] !== replyId) return;
				cleanup();
				const payload = message.args[1] || {};
				if (payload.error) {
					reject(new Error(String(payload.error)));
				} else {
					resolve(payload.data);
				}
			};

			const timer = setTimeout(() => {
				cleanup();
				reject(new Error('操作超时，可能是浏览器页面无响应'));
			}, timeoutMs);

			cleanup = () => {
				clearTimeout(timer);
				shell.removeListener('message', handler);
			};

			shell.on('message', handler);
			shell.send({ event, args, replyId });
		});
	}

	/**
	 * 刷新页面列表（节流 + 保底）
	 *
	 * 原实现是纯防抖：每次调用都 `clearTimeout` 再等 500ms。
	 * 刷课脚本的 `framenavigated` 触发极其频繁（SPA 路由、iframe 导航、
	 * 跳转中转页都在内），间隔常常小于 500ms，定时器被无限重置，
	 * 页面列表永远停在第一次拉到的结果上——也就是「后来脚本开了新标签页，
	 * 远程一直只看到最开始那一个」。
	 *
	 * 现在改成节流：距上次拉取超过最小间隔就立即拉，否则合并到最近一次窗口内，
	 * 保证高频触发时也一定会有结果落地。
	 */
	refreshPages(): Promise<void> {
		if (this.status !== 'launched') return Promise.resolve();

		const since = Date.now() - this.pagesLastAt;
		if (since >= Process.PAGES_MIN_INTERVAL) return this.pullPages();

		if (this.pagesPending) return Promise.resolve();
		this.pagesPending = true;

		return new Promise<void>((resolve) => {
			if (this.pagesTimer) clearTimeout(this.pagesTimer);
			this.pagesTimer = setTimeout(async () => {
				this.pagesPending = false;
				await this.pullPages();
				resolve();
			}, Process.PAGES_MIN_INTERVAL - since);
		});
	}

	/** 是否已有一次拉取在执行：慢页面会让单次 getPages 拖到 2 秒，重的并发会拖垮页面 */
	private pagesInFlight = false;

	/** 页面列表指纹，用于判断是否有变化 */
	private pagesSignature(pages = this.pages): string {
		return (pages || []).map((p) => `${p.url}|${p.title}|${p.active ? 1 : 0}`).join('\n');
	}

	/** 真正拉取一次页面列表 */
	private async pullPages(): Promise<void> {
		if (!this.shell || !this.shell.connected) return;
		/** 单次 getPages 最坏要 2 秒（每页 title 1.5s + visibilityState 0.6s），并发没有意义 */
		if (this.pagesInFlight) return;

		this.pagesInFlight = true;
		this.pagesLastAt = Date.now();
		try {
			const pages = await this.callWorker('getPages');
			if (!Array.isArray(pages)) return;

			/**
			 * 空列表不覆盖旧值：浏览器启动瞬间、或脚本正在批量重建标签页时
			 * `browser.pages()` 可能短暂为空，覆盖会让远程端闪一下「没有页面」。
			 */
			if (pages.length === 0) return;

			const next = pages as { url: string; title: string; active?: boolean }[];
			const before = this.pagesSignature();
			this.pages = next;
			if (before !== this.pagesSignature(next)) {
				processEvents.emit('pages', this.uid);
			}
		} catch (e) {
			/**
			 * 浏览器可能正在关闭/跳转，忽略即可；但连续失败会让页面列表永远停在旧值
			 * （远程端表现为「只有第一个标签页」），所以限频留一条痕迹。
			 */
			const now = Date.now();
			if (now - Process.pagesErrorAt > 30000) {
				Process.pagesErrorAt = now;
				console.error('刷新页面列表失败', e);
			}
		} finally {
			this.pagesInFlight = false;
		}
	}

	/** 上一次页面列表拉取失败的时间（限频写日志） */
	private static pagesErrorAt = 0;

	/** 上一次采集播放状态的时刻 */
	private mediaLastAt = 0;
	/** 是否有一次播放状态采集在执行 */
	private mediaInFlight = false;
	/** 两次采集的最小间隔：视频进度不需要秒级精度 */
	private static readonly MEDIA_MIN_INTERVAL = 2500;

	/**
	 * 刷新页面内视频的播放状态
	 *
	 * 视频播放时页面不会有新日志，光看日志静止会把「正在看视频」误判成「卡住」。
	 * 这里把播放进度取回来，远程台据此展示播放时间、并抑制「长时间无输出」告警。
	 */
	refreshMedia(): Promise<void> {
		if (this.status !== 'launched') {
			this.media = null;
			return Promise.resolve();
		}
		if (this.mediaInFlight) return Promise.resolve();
		if (Date.now() - this.mediaLastAt < Process.MEDIA_MIN_INTERVAL) return Promise.resolve();

		this.mediaInFlight = true;
		this.mediaLastAt = Date.now();

		return this.callWorker('getMedia')
			.then((info) => {
				if (!info || typeof info !== 'object') {
					this.media = null;
					return;
				}
				const raw = info as { playing?: boolean; currentTime?: number; duration?: number };
				this.media = {
					playing: !!raw.playing,
					currentTime: Number(raw.currentTime) || 0,
					duration: Number(raw.duration) || 0
				};
			})
			.catch(() => {
				/**
				 * 浏览器正在关闭/跳转时取不到，保留上一次结果。
				 * 这里不能清空：播放中偶发一次失败会让远程台闪一下「未知」。
				 */
			})
			.finally(() => {
				this.mediaInFlight = false;
			});
	}


	async launchPreCheck() {
		// 只检查浏览器路径；鸿鹄易学扩展随软件打包，不再检查/安装用户脚本
		if (!this.launchOptions.executablePath) {
			Message.error('浏览器路径为空，请在软件设置中修改');
			return false;
		}

		try {
			const exists = await remote.fs.call('existsSync', this.launchOptions.executablePath);
			if (!exists) {
				Message.error('浏览器路径不存在，请在软件设置中修改');
				return false;
			}
			return true;
		} catch (err) {
			Message.error('浏览器路径读取错误 : ' + String(err));
			return false;
		}
	}

	/** 启动文件 */
	launch() {
		return new Promise<void | number | null>((resolve, reject) => {
			this.status = 'launching';
			/** 启动中也要立刻让远程端看到，不能等心跳 */
			processEvents.emit('status', this.uid);

			/** 状态回退：任何原因导致启动失败，都不能让状态停留在 launching（否则远程端永远显示「启动中」） */
			const fail = (message?: string) => {
				clearTimeout(watchdog);
				this.status = 'closed';
				/**
				 * 必须连同子进程一起回收。
				 * 只从 processes 里移除对象而把 worker / 浏览器进程留在后台的话，
				 * 下次启动会再 fork 一个 worker 去抢同一个 user-data-dir，
				 * 触发 SingletonLock 冲突 → 必然又卡在启动中，越试越坏。
				 */
				try {
					this.shell?.kill();
				} catch {
					// 进程可能已退出
				}
				Process.remove(this.uid);
				processEvents.emit('status', this.uid);
				if (message) reject(new Error(message));
			};
			/** 看门狗：初始化链条卡死（如页面 evaluate 无超时）时兜底回退 */
			const watchdog = setTimeout(() => {
				if (this.status === 'launching') {
					console.error('浏览器启动超时（120 秒未就绪），已回退为未运行状态');
					fail('浏览器启动超时（120 秒未就绪）');
				}
			}, 120 * 1000);

			this.launchPreCheck()
				.then((result) => {
					if (result) {
						this.once('launched', () => {
							clearTimeout(watchdog);
							resolve();
						});
						/** 子进程明确报告启动失败：立刻落地结果，不必空等看门狗 */
						this.once('launch-failed', (message?: string) => {
							clearTimeout(watchdog);
							reject(new Error(String(message || '浏览器启动失败')));
						});
						this.shell?.once('exit', (code) => {
							// 子进程退出（含崩溃）：未成功启动时回退状态，已启动时标记为已关闭
							if (this.status === 'launching' || this.status === 'launched') {
								this.status = 'closed';
								Process.remove(this.uid);
								processEvents.emit('status', this.uid);
							}
							clearTimeout(watchdog);
							resolve(code);
						});
						this.worker?.('launch', {
							userDataDir: this.browser.cachePath,
							...this.launchOptions,
							/**
							 * 开发者调试端口：>0 时 worker 会额外拼上 --remote-debugging-port。
							 * 关闭开关传 0，保证不会因为历史参数继续对外开放端口。
							 */
							devToolsPort: store.render.setting.dev?.enabled
								? Number(store.render.setting.dev?.port) || 0
								: 0
						});
					} else {
						// preCheck 失败（浏览器路径缺失等）：原实现 promise 永不落定，状态永久卡在 launching
						fail();
					}
				})
				.catch((err) => {
					fail();
					reject(err);
				});
		});
	}

	/** 关闭进程 */
	async close() {
		// 标记为 closing ，使监控页面，以及操作栏的图标可以判断状态
		this.status = 'closing';
		processEvents.emit('status', this.uid);
		return new Promise<void>((resolve) => {
			this.once('browser-closed', resolve);
			// 关闭进程
			this.worker?.('close');
		});
	}

	/**
	 * 一键导出当前页面信息（开发者调试）
	 *
	 * 落盘由 worker 直接完成：HTML 动辄几 MB，走 IPC 回传既慢又容易踩序列化上限。
	 * 这里只带回目录、命中的同构容器数量和文件清单，够界面提示即可。
	 */
	dumpPage(page?: number) {
		if (this.status !== 'launched') {
			return Promise.reject(new Error('浏览器未运行，请先启动浏览器'));
		}
		return this.callWorkerTimeout('dumpPage', [{ page }], 60 * 1000) as Promise<{
			dir: string;
			url: string;
			title: string;
			platformId: string;
			files: { name: string; size: number }[];
			containerCount: number;
		}>;
	}

	/** 显示当前的浏览器  */
	bringToFront() {
		if (this.status === 'launched' && this.launchOptions) {
			const action = `http://localhost:${store.server.port}/hh-action_bring-to-top`;
			child_process.exec(
				`"${this.launchOptions.executablePath}" --user-data-dir="${this.browser.cachePath}" "${action}"`
			);
			this.worker?.('bringToFront');
			Message.warning('已置顶，如未生效，电脑底部任务栏闪烁的浏览器图标即为置顶浏览器。');
		} else {
			Message.warning('必须先启动文件');
		}
	}

	toString() {
		return '[Process]';
	}
}

export const processes: Process[] = reactive([]);

/**
 * 创建  ScriptWorker Shell 调用 APi
 * @param shell
 */
function createRemoteScriptWorker(shell: ChildProcess) {
	return <W extends keyof ScriptWorker, F extends ScriptWorker[W]>(
		event: W,
		...args: F extends { (...args: any[]): any } ? Parameters<F> : any[]
	) => {
		if (shell.connected) {
			shell.send({ event, args });
		}
	};
}
