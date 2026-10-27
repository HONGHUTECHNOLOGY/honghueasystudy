import { watch } from 'vue';
import { electron } from './node';
import { processEvents, Process, processes } from './process';
import { Folder } from '../fs/folder';
import { Browser } from '../fs/browser';
import { store } from '../store';

const { ipcRenderer } = electron;

/** 上报节流间隔 */
const PUSH_INTERVAL = 800;
/**
 * 兜底全量上报间隔
 *
 * 页面列表与任务进度都由心跳兜底拉取：切标签页、脚本新开标签页、
 * 日志推进进度这些动作不会稳定触发 watch（类实例内部赋值绕过了响应式），
 * 所以这里必须主动采集。间隔缩短到 3 秒是为了让远程端的「当前标签页」和
 * 「任务进度」跟得上刷课节奏。
 */
const HEARTBEAT_INTERVAL = 3000;
/** 单轮页面列表采集的最长等待（避免个别卡死页面拖住上报） */
const REFRESH_TIMEOUT = 2500;
/** 每实例保留的日志行数 */
const MAX_LOGS = 200;

interface BrowserSnapshotItem {
	uid: string;
	name: string;
	notes: string;
	tags: { name: string; color: string }[];
	status: 'closed' | 'closing' | 'launching' | 'launched';
	pages: { url: string; title: string; active?: boolean }[];
	/** 任务进度（从脚本日志推断），供远程台展示进度条与当前任务 */
	progress: {
		startedAt: number;
		lastActivityAt: number;
		currentTask: string;
		completed: number;
		answered: number;
		errors: number;
		finished: boolean;
	};
}

interface RemoteSnapshotPayload {
	browsers: BrowserSnapshotItem[];
	logs: { [uid: string]: string[] };
	ts: number;
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;
/** pushTimer 的设置时刻，用于识别被节流/冻结丢弃的定时器 */
let pushTimerAt = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
/** 心跳重入保护 */
let heartbeatBusy = false;
let started = false;

/** 定时器滞留阈值：超过这个时长仍未触发，说明定时器已被页面节流或冻结，必须丢弃重建 */
const PUSH_STALE = PUSH_INTERVAL * 4;

/**
 * 采集完整快照
 *
 * 浏览器实例来自配置树（包含未启动的），运行状态来自 processes。
 * 这样远程端才能「启动」一个尚未运行的浏览器。
 */
function buildSnapshot(): RemoteSnapshotPayload {
	const browsers: BrowserSnapshotItem[] = [];
	const logs: { [uid: string]: string[] } = {};

	try {
		const rootUid = store.render.browser.root.uid;
		const all = Folder.from(rootUid).findAll((e) => e.type === 'browser') as Browser[];

		all.forEach((browser) => {
			const running = Process.from(browser.uid);
			browsers.push({
				uid: browser.uid,
				name: browser.name || '未命名浏览器',
				notes: browser.notes || '',
				tags: (browser.tags || []).map((t) => ({ name: t.name, color: t.color })),
				status: running ? running.status : 'closed',
				pages: running && running.pages ? running.pages.slice(0, 12) : [],
				/** 浅拷贝：快照会经过 IPC 与 JSON 序列化，直接传引用没有意义 */
				progress: running
					? { ...running.progress }
					: {
							startedAt: 0,
							lastActivityAt: 0,
							currentTask: '',
							completed: 0,
							answered: 0,
							errors: 0,
							finished: false
						}
			});
			if (running && running.logs && running.logs.length > 0) {
				logs[browser.uid] = running.logs.slice(-MAX_LOGS);
			}
		});
	} catch (e) {
		console.error('采集远程控制快照失败', e);
	}

	return { browsers, logs, ts: Date.now() };
}

/** 立即发送一次快照，不做节流 */
function sendState() {
	try {
		ipcRenderer.send('remote-ctl:state', buildSnapshot());
	} catch (e) {
		console.error('上报远程控制状态失败', e);
	}
}

/** 立即上报（节流） */
function schedulePush() {
	if (pushTimer) {
		// 定时器被页面节流/冻结时会滞留不触发。此时若直接 return，pushTimer 将永远不清空，
		// 之后每一次上报都被短路，主进程快照就停在最后一次成功的时间里（远程端看起来「卡住」）
		if (Date.now() - pushTimerAt < PUSH_STALE) return;
		clearTimeout(pushTimer);
		pushTimer = undefined;
	}
	pushTimerAt = Date.now();
	pushTimer = setTimeout(() => {
		pushTimer = undefined;
		sendState();
	}, PUSH_INTERVAL);
}

/** 状态指纹，避免深度遍历大对象 */
function fingerprint(): string {
	try {
		return processes
			.map((p) => {
				/** 带上 active：切标签页只改 active 不改 url，不参与指纹就漏掉这个变化 */
				const pageUrls = (p.pages || []).map((g) => `${g.url}#${g.active ? 1 : 0}`).join('|');
				/** 日志数组到上限（300）后长度恒定，改用最后一条的长度兜底 */
				const tail = (p.logs || []).length ? String(p.logs[p.logs.length - 1]).length : 0;
				const progress = p.progress || ({} as any);
				return `${p.uid}:${p.status}:${(p.logs || []).length}:${tail}:${pageUrls}:${
					progress.currentTask || ''
				}:${progress.completed || 0}:${progress.answered || 0}:${progress.errors || 0}`;
			})
			.join(',');
	} catch {
		return String(Date.now());
	}
}

/**
 * 执行远程命令
 *
 * 只实现白名单内的操作，与主进程 command.ts 的 ALLOWED_ACTIONS 对应。
 *
 * 启动/关闭浏览器属于长耗时操作（Chrome 冷启动常见超过 15 秒），
 * 因此派发后最多等待数秒即返回，真实结果通过状态快照（SSE）推给远程端，
 * 避免手机端长时间转圈或触发命令超时。
 */
async function executeCommand(action: string, payload: any): Promise<any> {
	const uid = payload && payload.uid ? String(payload.uid) : '';

	switch (action) {
		case 'browser.launch': {
			const browser = Browser.from(uid);
			if (!browser) throw new Error('浏览器实例不存在');
			if (Process.from(uid)) throw new Error('该浏览器已在运行中');

			const task = browser.launch();
			task.catch((e) => console.error('远程启动浏览器失败', e));

			await Promise.race([task, sleep(2500)]);
			const running = Process.from(uid);
			return { uid, status: running ? running.status : 'launching', async: true };
		}

		case 'browser.close': {
			const browser = Browser.from(uid);
			const running = Process.from(uid);
			if (!browser && !running) throw new Error('浏览器实例不存在');

			const task = browser ? browser.close() : running!.close();
			task.catch((e) => console.error('远程关闭浏览器失败', e));

			await Promise.race([task, sleep(2500)]);
			return { uid, status: 'closing', async: true };
		}

		case 'browser.bringToFront': {
			const running = Process.from(uid);
			if (!running) throw new Error('该浏览器未运行');
			running.bringToFront();
			return { uid };
		}

		case 'browser.batchLaunch': {
			const uids = collectUids(payload).filter((item) => !Process.from(item));
			const result: { uid: string; ok: boolean; error?: string }[] = [];
			for (const item of uids) {
				try {
					await executeCommand('browser.launch', { uid: item });
					result.push({ uid: item, ok: true });
				} catch (e) {
					result.push({ uid: item, ok: false, error: String(e) });
				}
				/** 串行启动间隔，避免同时拉起多个 Chrome 造成卡顿 */
				await sleep(600);
			}
			return result;
		}

		case 'browser.batchClose': {
			const uids = collectUids(payload).filter((item) => !!Process.from(item));
			const result: { uid: string; ok: boolean; error?: string }[] = [];
			for (const item of uids) {
				try {
					await executeCommand('browser.close', { uid: item });
					result.push({ uid: item, ok: true });
				} catch (e) {
					result.push({ uid: item, ok: false, error: String(e) });
				}
			}
			return result;
		}

		case 'browser.getPages': {
			const running = Process.from(uid);
			if (!running) throw new Error('该浏览器未运行');
			if (running.status !== 'launched') throw new Error('浏览器尚未就绪，请稍后再试');
			const pages = await running.callWorker('getPages');
			if (Array.isArray(pages)) running.pages = pages;
			return pages || [];
		}

		case 'browser.snapshot': {
			const running = Process.from(uid);
			if (!running) throw new Error('该浏览器未运行');
			if (running.status !== 'launched') throw new Error('浏览器正在启动，请稍后再试');

			/**
			 * page 为远程端选中的标签页索引；不传时由子进程自行挑选前台可见页。
			 * 越界索引由子进程兜底回退，这里不做校验，避免页面刚关闭时的竞态误报。
			 */
			const page = payload && typeof payload.page === 'number' ? payload.page : undefined;

			const base64 = await running.callWorker('snapshot', {
				quality: payload && payload.quality ? payload.quality : 55,
				page
			});
			if (!base64) throw new Error('截图失败');
			return base64;
		}

		default:
			throw new Error('不支持的操作');
	}
}

/** 简易延时 */
function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 从 payload 中收集要批量操作的 uid 列表；为空则取全部未运行（或已运行）实例 */
function collectUids(payload: any): string[] {
	if (payload && Array.isArray(payload.uids) && payload.uids.length > 0) {
		return payload.uids.map((u: any) => String(u));
	}

	const uids: string[] = [];
	try {
		const rootUid = store.render.browser.root.uid;
		const all = Folder.from(rootUid).findAll((e) => e.type === 'browser') as Browser[];
		all.forEach((b) => uids.push(b.uid));
	} catch (e) {
		console.error('收集浏览器列表失败', e);
	}
	return uids;
}

/** 注册远程控制桥接（幂等） */
export function activeRemoteControlBridge() {
	if (started) return;
	started = true;

	/** 状态上报：只在指纹变化时触发 */
	watch(fingerprint, schedulePush, { flush: 'post' });

	/**
	 * 页面列表与任务进度的变化走事件总线。
	 * Process 内部对 `this.pages` / `this.progress` 的赋值不经过 Vue 的 set trap，
	 * 光靠 watch 收不到，必须在数据真正更新后主动推一次。
	 */
	processEvents.on('pages', schedulePush);
	processEvents.on('progress', schedulePush);

	/** 兜底心跳：直接发送、绕过节流，避免 pushTimer 滞留后彻底停更 */
	heartbeatTimer = setInterval(async () => {
		/** 上一轮还没跑完（慢页面会让采集拖到 2 秒以上）就跳过这一轮，避免任务堆叠 */
		if (heartbeatBusy) return;
		heartbeatBusy = true;

		if (pushTimer) {
			clearTimeout(pushTimer);
			pushTimer = undefined;
		}

		/**
		 * 先刷新页面列表、再上报。
		 *
		 * 原来两者是并行的：`refreshPages()` 只是把定时器排上队就返回，
		 * `sendState()` 立刻用旧数组打包，于是每次推送的 pages 都落后一轮。
		 * 加上刷课时 framenavigated 高频重置定时器，页面列表就长期停在初始值，
		 * 表现为「脚本后来开了新标签页，远程一直看不到」。
		 *
		 * 顺带刷新一次 `active`：用户在浏览器里切标签页不会触发 page-changed，
		 * 不主动拉取的话远程台的「默认查看当前页」会指到已经切走的那个标签。
		 */
		try {
			const jobs = processes.filter((p) => p.status === 'launched').map((p) => p.refreshPages());
			if (jobs.length > 0) {
				await Promise.race([Promise.allSettled(jobs), sleep(REFRESH_TIMEOUT)]);
			}
			sendState();
		} finally {
			heartbeatBusy = false;
		}
	}, HEARTBEAT_INTERVAL);

	/** 后台标签被冻结后回到前台时立即补一次，不必等下一个心跳 */
	if (typeof document !== 'undefined') {
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) sendState();
		});
	}
	window.addEventListener('focus', () => sendState());

	/** 命令执行 */
	ipcRenderer.on('remote-ctl:command', async (_event: any, message: { id: string; action: string; payload: any }) => {
		if (!message || !message.id) return;

		try {
			const data = await executeCommand(message.action, message.payload || {});
			ipcRenderer.send('remote-ctl:result', { id: message.id, ok: true, data: data === undefined ? null : data });
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			ipcRenderer.send('remote-ctl:result', { id: message.id, ok: false, error });
		}

		/** 操作后立即刷新一次快照 */
		schedulePush();
	});

	/** 首次上报 */
	schedulePush();
}

/** 停止桥接（应用卸载时调用） */
export function disposeRemoteControlBridge() {
	processEvents.off('pages', schedulePush);
	processEvents.off('progress', schedulePush);
	if (heartbeatTimer) {
		clearInterval(heartbeatTimer);
		heartbeatTimer = undefined;
	}
	if (pushTimer) {
		clearTimeout(pushTimer);
		pushTimer = undefined;
	}
	started = false;
}
