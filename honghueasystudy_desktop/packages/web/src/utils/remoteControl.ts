import { watch } from 'vue';
import { electron } from './node';
import { Process, processes } from './process';
import { Folder } from '../fs/folder';
import { Browser } from '../fs/browser';
import { store } from '../store';

const { ipcRenderer } = electron;

/** 上报节流间隔 */
const PUSH_INTERVAL = 800;
/** 兜底全量上报间隔（避免 watch 漏检导致主进程快照陈旧） */
const HEARTBEAT_INTERVAL = 5000;
/** 每实例保留的日志行数 */
const MAX_LOGS = 200;

interface BrowserSnapshotItem {
	uid: string;
	name: string;
	notes: string;
	tags: { name: string; color: string }[];
	status: 'closed' | 'closing' | 'launching' | 'launched';
	pages: { url: string; title: string }[];
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
				pages: running && running.pages ? running.pages.slice(0, 12) : []
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
				const pageUrls = (p.pages || []).map((g) => g.url).join('|');
				return `${p.uid}:${p.status}:${(p.logs || []).length}:${pageUrls}`;
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
			const base64 = await running.callWorker('snapshot', {
				quality: payload && payload.quality ? payload.quality : 55
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

	/** 兜底心跳：直接发送、绕过节流，避免 pushTimer 滞留后彻底停更 */
	heartbeatTimer = setInterval(() => {
		if (pushTimer) {
			clearTimeout(pushTimer);
			pushTimer = undefined;
		}
		sendState();
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
