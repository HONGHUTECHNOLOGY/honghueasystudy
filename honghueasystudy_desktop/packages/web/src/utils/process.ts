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

export type RemoteScriptWorker = <W extends keyof ScriptWorker = keyof ScriptWorker>(
	event: W,
	...args: ScriptWorker[W] extends { (...args: any[]): any } ? Parameters<ScriptWorker[W]> : any[]
) => void;

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
	/** 当前所有页面（远程控制展示用） */
	pages: { url: string; title: string }[] = [];

	video: HTMLVideoElement | undefined = undefined;
	stream: MediaStream | undefined = undefined;
	private pagesTimer: ReturnType<typeof setTimeout> | undefined;

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
				stdio: ['ipc'],
				env: process.env
			}
		);
		this.worker = createRemoteScriptWorker(this.shell);

		this.shell.stdout?.on('data', (data: any) => {
			this.logs.push(data.toString());
			onConsole?.(data.toString());
		});
		this.shell.stderr?.on('data', (data: any) => {
			onConsole?.(data.toString());
			remote.logger.call('error', String(data));
			this.logs.push(`${this.browser.name} 错误`, data);
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
			}, 15000);

			cleanup = () => {
				clearTimeout(timer);
				shell.removeListener('message', handler);
			};

			shell.on('message', handler);
			shell.send({ event, args, replyId });
		});
	}

	/** 节流刷新页面列表 */
	refreshPages() {
		if (this.pagesTimer) clearTimeout(this.pagesTimer);
		this.pagesTimer = setTimeout(async () => {
			try {
				const pages = await this.callWorker('getPages');
				if (Array.isArray(pages)) {
					this.pages = pages;
				}
			} catch {
				// 浏览器可能正在关闭，忽略
			}
		}, 500);
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

			/** 状态回退：任何原因导致启动失败，都不能让状态停留在 launching（否则远程端永远显示「启动中」） */
			const fail = (message?: string) => {
				clearTimeout(watchdog);
				this.status = 'closed';
				Process.remove(this.uid);
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
						this.shell?.once('exit', (code) => {
							// 子进程退出（含崩溃）：未成功启动时回退状态，已启动时标记为已关闭
							if (this.status === 'launching' || this.status === 'launched') {
								this.status = 'closed';
								Process.remove(this.uid);
							}
							clearTimeout(watchdog);
							resolve(code);
						});
						this.worker?.('launch', {
							userDataDir: this.browser.cachePath,
							...this.launchOptions
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
		return new Promise<void>((resolve) => {
			this.once('browser-closed', resolve);
			// 关闭进程
			this.worker?.('close');
		});
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
