import { watch } from 'vue';
import { electron } from './node';
import { processEvents, Process, processes } from './process';
import { Folder } from '../fs/folder';
import { Browser } from '../fs/browser';
import { store } from '../store';
import type { AutomationTarget } from '@honghu-desktop/app/src/scripts/plan';
import {
	automationSummary,
	catalogSupport,
	enterNextChapter,
	fetchCourseList,
	getStatus,
	isChaoxingCourseUrl,
	markCourseReady,
	pauseStudy,
	readPlan,
	refreshCourseReady,
	runStudyNow,
	writePlan
} from './automationPlan';

const { ipcRenderer } = electron;

/**
 * 主进程日志桥接
 *
 * `remote` 是 preload 注入的全局对象，没有类型声明（直接写会报 TS2304）。
 * 统一收在这里，顺便把「日志通道不可用」也吃掉——记日志失败绝不能影响上报本身。
 */
function mainLog(level: 'log' | 'warn' | 'info', message: string) {
	try {
		(globalThis as any).remote?.logger?.call(level, message);
	} catch {
		// 忽略：日志通道异常不该影响主流程
	}
}

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
	/**
	 * 页面内视频播放状态
	 *
	 * 视频播放期间没有日志输出，远程台据此区分「正在看视频」和「真的卡住」。
	 * null 表示当前页没有 video。
	 */
	media: { playing: boolean; currentTime: number; duration: number } | null;
	/** 自动化方案摘要（远程台据此显示「已开定时 / 正在刷哪门课」） */
	automation: {
		study: { enabled: boolean; courseName: string; target: AutomationTarget };
		/** 当前课程页有没有「章节 / 作业 / 考试」三栏（undefined=还没进过课） */
		catalog?: boolean;
		/** 此刻是不是正站在课程页上：远程台据此把三个目录置灰/放开 */
		courseReady: boolean;
		schedule: {
			enabled: boolean;
			startTime: string;
			endTime: string;
			days: number[];
			endAction: string;
			maxMinutes: number;
			nextRunAt: number;
			summary: string;
		};
		state: 'idle' | 'waiting' | 'running' | 'done' | 'error';
		message: string;
		updatedAt: number;
		enteredAt: number;
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
 * 页面列表转纯对象
 *
 * `processes` 是 Vue 的 reactive 数组，`Process.pages` 读出来是 **响应式代理**。
 * Electron 的 IPC 走结构化克隆，代理对象会直接抛
 * `An object could not be cloned.` —— 而 sendState 里的 try/catch 会把它静默吞掉，
 * 于是「只要有一个页面，快照就永远发不出去」：
 *   · 远程台停在最后一份「启动前」的快照上（一直显示启动中、页面只有 1 个）
 *   · 多标签页永远不出现，默认页也不会跟着前台标签走
 *   · 命令通道是事件驱动的，不受影响，所以「能启动、看不到状态」
 * 必须逐字段拷贝成纯对象再发。
 */
function toPlainPages(pages: any): { url: string; title: string; active: boolean }[] {
	if (!Array.isArray(pages)) return [];
	return pages.slice(0, 12).map((p: any) => ({
		url: String((p && p.url) || ''),
		title: String((p && p.title) || ''),
		active: !!(p && p.active)
	}));
}

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
				pages: toPlainPages(running && running.pages),
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
						},
				/** 同样逐字段拷贝：running.media 读出来是响应式代理，直接进 IPC 会克隆失败 */
				media:
					running && running.media
						? {
								playing: !!running.media.playing,
								currentTime: Number(running.media.currentTime) || 0,
								duration: Number(running.media.duration) || 0
							}
						: null,
				/** 方案摘要是纯对象，但内部的 course/schedule 来自响应式实体，仍走一次 JSON 归一 */
				automation: JSON.parse(JSON.stringify(automationSummary(browser)))
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

/** 最近一次成功上报的时间，用于主进程催报去重 */
let lastSendAt = 0;

/** 最近一次上报失败的时间（限频写日志，避免刷屏） */
let lastSendErrorAt = 0;

/** 立即发送一次快照，不做节流 */
function sendState() {
	const snapshot = buildSnapshot();

	try {
		ipcRenderer.send('remote-ctl:state', snapshot);
		lastSendAt = Date.now();
		return;
	} catch (e) {
		/**
		 * 结构化克隆失败（响应式代理、函数、DOM 节点等）。
		 *
		 * 这里绝不能静默失败：快照发不出去时远程端只能看到一份永不更新的旧快照，
		 * 表现就是「卡在启动中 / 只有一个标签页 / 默认页不跟当前标签走」。
		 * 以前只 console.error，日志里毫无痕迹，排查要从头猜一遍。
		 */
		console.error('上报远程控制状态失败', e);

		/** 兜底：JSON 往返一次，把所有代理/类实例压成纯数据再发 */
		try {
			ipcRenderer.send('remote-ctl:state', JSON.parse(JSON.stringify(snapshot)));
			lastSendAt = Date.now();
			return;
		} catch (e2) {
			const now = Date.now();
			if (now - lastSendErrorAt > 15000) {
				lastSendErrorAt = now;
				mainLog('warn', `[远程] 状态上报失败：${e2 instanceof Error ? e2.message : String(e2)}`);
			}
		}
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

		/** 远程触发登录脚本：配置由手机端手填，子进程负责按脚本声明校验 */
		case 'script.run': {
			const running = Process.from(uid);
			if (!running) throw new Error('该浏览器未运行');
			if (running.status !== 'launched') throw new Error('浏览器尚未就绪，请稍后再试');

			const name = String((payload && payload.name) || '');
			if (!name) throw new Error('缺少脚本名称');

			return running.callWorkerTimeout(
				'runAutomationScript',
				[{ name, configs: (payload && payload.configs) || {} }],
				/** 登录脚本内含 60 秒登录超时 + 滑块重试，留足余量 */
				5 * 60 * 1000
			);
		}

		case 'course.list': {
			const running = Process.from(uid);
			if (!running) throw new Error('该浏览器未运行');
			if (running.status !== 'launched') throw new Error('浏览器尚未就绪，请稍后再试');

			const refresh = !(payload && payload.refresh === false);
			return running.callWorkerTimeout('listCourses', [{ refresh }], 90 * 1000);
		}

		case 'course.enter': {
			const running = Process.from(uid);
			if (!running) throw new Error('该浏览器未运行');
			if (running.status !== 'launched') throw new Error('浏览器尚未就绪，请稍后再试');

			const id = String((payload && payload.id) || '');
			if (!id) throw new Error('缺少课程标识');
			/** 带上课程名：页面若已刷新（标记丢失），子进程按名称重新定位 */
			const name = String((payload && payload.name) || '');

			const result = await running.callWorkerTimeout('enterCourse', [{ id, name }], 90 * 1000);
			/**
			 * 顺手判定这套课程页有没有「章节 / 作业 / 考试」三栏
			 *
			 * 只有超星有。判定结果随快照上报，手机端据此决定显示不显示那三个目录。
			 */
			catalogSupport[uid] = isChaoxingCourseUrl((result && result.url) || '');
			/** 刚进课，课程页就开着：三个目录可以放开了 */
			markCourseReady(uid, true);
			return plain(result);
		}

		/**
		 * ---------- 自动化方案 ----------
		 *
		 * 与上面 `script.run` 的根本区别：
		 *   · `script.run` 是「临时执行一次」，用完即忘，不写配置；
		 *   · 这里的方案会存进浏览器实体，**每次启动浏览器都自动执行**。
		 * 远程台必须能分清这两件事，否则用户会以为「手机上点过一次，以后电脑开机就会自己跑」。
		 */
		case 'automation.get': {
			const browser = Browser.from(uid);
			if (!browser) throw new Error('浏览器实例不存在');
			/**
			 * 必须压成纯对象再回传。
			 *
			 * `browser.automationScripts` 是 Vue 的响应式数组，里面的 configs 也是代理；
			 * Electron 的 IPC 走结构化克隆，代理对象会直接抛
			 * `An object could not be cloned.` —— 表现就是远程台永远读不到已配置的脚本。
			 *
			 * 这条命令属于主进程内部动作（INTERNAL_ACTIONS），远程客户端不能直接调用：
			 * 它返回的是**未脱敏**的原始脚本，只供 /api/plan/* 在服务端做脱敏与合并。
			 */
			return plain({ plan: readPlan(browser), scripts: browser.automationScripts || [] });
		}

		case 'automation.save': {
			const browser = Browser.from(uid);
			if (!browser) throw new Error('浏览器实例不存在');

			const plan = writePlan(browser, payload && payload.plan);
			/** 脚本列表由主进程按声明重建好（含密码合并），这里只做落盘 */
			if (payload && Array.isArray(payload.scripts)) {
				browser.automationScripts = payload.scripts;
			}
			return plain({ plan, scripts: browser.automationScripts || [] });
		}

		case 'automation.courses': {
			const refresh = !(payload && payload.refresh === false);
			return plain(await fetchCourseList(uid, { refresh }));
		}

		case 'automation.run': {
			const browser = Browser.from(uid);
			if (!browser) throw new Error('浏览器实例不存在');

			const plan = readPlan(browser);
			if (!plan.study.course) throw new Error('还没有选择要刷的课程');

			/**
			 * 后台执行、立即返回：读课程 + 进课程可能跨分钟，
			 * 手机锁屏会把 HTTP 连接掐断，进度靠快照里的 automation 字段推送。
			 */
			runStudyNow(uid).catch((e) => console.error('自动刷课失败', e));
			return plain({ started: true, status: getStatus(uid) });
		}

		case 'automation.stop': {
			const browser = Browser.from(uid);
			const message = await pauseStudy(uid, { keepTab: !!(payload && payload.keepTab) });
			if (payload && payload.closeBrowser && browser) {
				await browser.close().catch((e) => console.warn('关闭浏览器失败', e));
			}
			return plain({ message, status: getStatus(uid) });
		}

		case 'catalog.list': {
			const running = Process.from(uid);
			if (!running) throw new Error('该浏览器未运行');
			if (running.status !== 'launched') throw new Error('浏览器尚未就绪，请稍后再试');

			const kind = String((payload && payload.kind) || '');
			if (!kind) throw new Error('缺少目录类型');

			return plain(await running.callWorkerTimeout('listCourseCatalog', [{ kind }], 90 * 1000));
		}

		case 'catalog.open': {
			const running = Process.from(uid);
			if (!running) throw new Error('该浏览器未运行');
			if (running.status !== 'launched') throw new Error('浏览器尚未就绪，请稍后再试');

			const kind = String((payload && payload.kind) || '');
			const id = String((payload && payload.id) || '');
			if (!kind) throw new Error('缺少目录类型');
			if (!id) throw new Error('缺少条目标识');

			const result = await running.callWorkerTimeout('openCatalogItem', [{ kind, id }], 90 * 1000);
			/** 进去之后当前页就不是课程页了（或被新标签顶上），顺手更新一次，界面按钮跟着变 */
			refreshCourseReady(uid).catch(() => {});
			return plain(result);
		}

		case 'catalog.next': {
			const running = Process.from(uid);
			if (!running) throw new Error('该浏览器未运行');
			if (running.status !== 'launched') throw new Error('浏览器尚未就绪，请稍后再试');

			const skipIds = payload && Array.isArray(payload.skipIds) ? payload.skipIds.map((x: any) => String(x)) : [];
			const result = await enterNextChapter(uid, { skipIds });
			/** 推进成功就跳到学习页了，课程页被顶掉，置灰状态要如实更新 */
			refreshCourseReady(uid).catch(() => {});
			return plain(result);
		}

		/**
		 * 现在在不在课程页上
		 *
		 * 远程台据此把「章节 / 作业 / 考试」置灰或放开。浏览器没起来不是错，
		 * 直接回 `ready: false`，界面上保持灰色即可，不必弹错误提示。
		 */
		case 'catalog.ready': {
			const running = Process.from(uid);
			if (!running || running.status !== 'launched') {
				markCourseReady(uid, false);
				return plain({ ready: false, url: '' });
			}
			const ready = await refreshCourseReady(uid);
			return plain({ ready, url: '' });
		}

		default:
			throw new Error('不支持的操作');
	}
}

/** 简易延时 */
function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 压成纯对象
 *
 * IPC 的结构化克隆不接受 Vue 响应式代理（会抛 `An object could not be cloned.`）。
 * 命令返回值一律过一遍，宁可多花一次 JSON 往返，也不要出现「命令执行成功但远程收不到」。
 */
function plain<T>(value: T): T {
	try {
		return JSON.parse(JSON.stringify(value)) as T;
	} catch {
		return value;
	}
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

/**
 * 一轮心跳：先刷新页面列表，再上报快照
 *
 * 原来两者是并行的：`refreshPages()` 只是把定时器排上队就返回，
 * `sendState()` 立刻用旧数组打包，于是每次推送的 pages 都落后一轮。
 * 加上刷课时 framenavigated 高频重置定时器，页面列表就长期停在初始值，
 * 表现为「脚本后来开了新标签页，远程一直看不到」。
 *
 * 顺带刷新一次 `active`：用户在浏览器里切标签页不会触发 page-changed，
 * 不主动拉取的话远程台的「默认查看当前页」会指到已经切走的那个标签。
 */
async function runHeartbeat(): Promise<void> {
	/** 上一轮还没跑完（慢页面会让采集拖到 2 秒以上）就跳过这一轮，避免任务堆叠 */
	if (heartbeatBusy) return;
	heartbeatBusy = true;

	if (pushTimer) {
		clearTimeout(pushTimer);
		pushTimer = undefined;
	}

	try {
		const running = processes.filter((p) => p.status === 'launched');
		const jobs = running.map((p) => p.refreshPages());
		/** 播放状态也要在打包快照前更新，否则远程台看到的是上一轮的进度 */
		const mediaJobs = running.map((p) => p.refreshMedia());
		if (jobs.length > 0) {
			await Promise.race([Promise.allSettled([...jobs, ...mediaJobs]), sleep(REFRESH_TIMEOUT)]);
		}
		sendState();
	} finally {
		heartbeatBusy = false;
	}
}

/**
 * Worker 心跳
 *
 * 主线程的 `setInterval` 在窗口最小化 / 被完全遮挡时会被 Chromium 降频，
 * 严重时直接冻结——远程端于是永远停在最后一份快照上（浏览器明明已经启动，
 * 界面却一直显示「启动中」）。Worker 里的定时器不受页面可见性影响，
 * 这里再挂一条 Worker 节拍，到点就让主线程补报一次；两条链路互为备份。
 */
let beatWorker: Worker | undefined;

function startWorkerHeartbeat(): void {
	if (beatWorker) return;

	try {
		const source = `setInterval(function () { postMessage(1); }, ${HEARTBEAT_INTERVAL});`;
		const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
		beatWorker = new Worker(url);
		beatWorker.onmessage = () => {
			runHeartbeat();
		};
		beatWorker.onerror = () => {
			// Worker 起不来时主线程心跳仍在，忽略即可
		};
	} catch (e) {
		console.error('心跳 Worker 启动失败', e);
	}
}

/**
 * 诊断：主进程催报到达时记一行
 *
 * 只在「上报确实停滞」时才写，且 30 秒限频，正常运行时不会产生日志。
 * 用途是区分两种故障：主进程没催（ticker 没跑） vs 渲染进程没收到/没执行（IPC 看不到）。
 */
let lastTickNoteAt = 0;

function noteTick(): void {
	const now = Date.now();
	if (now - lastSendAt < 15000) return;
	if (now - lastTickNoteAt < 30000) return;
	lastTickNoteAt = now;
	mainLog('log', '[远程] 状态上报停滞，已收到主进程催报');
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
	/** 自动化方案的执行进度（等待登录 / 读课程 / 进课）也要立刻反映到远程台 */
	processEvents.on('automation-state', schedulePush);
	/**
	 * 状态变化（启动中 / 已启动 / 关闭中 / 失败）立刻上报，不经 800ms 节流。
	 *
	 * Process 内部对 `this.status` 的赋值绕过 Vue 的 set trap，指纹 watch 收不到，
	 * 原来只能等 3 秒心跳顺带发出去——心跳一旦被冻结，远程端就永远停在「启动中」。
	 */
	processEvents.on('status', sendState);

	/** 兜底心跳：直接发送、绕过节流，避免 pushTimer 滞留后彻底停更 */
	heartbeatTimer = setInterval(runHeartbeat, HEARTBEAT_INTERVAL);
	startWorkerHeartbeat();

	/** 留一条启动痕迹：排查「远程收不到状态」时先确认桥接和新版心跳确实在工作 */
	mainLog('log', `[远程] 状态上报已启动（心跳 ${HEARTBEAT_INTERVAL}ms，Worker ${beatWorker ? '已启用' : '不可用'}）`);

	/** 后台标签被冻结后回到前台时立即补一次，不必等下一个心跳 */
	if (typeof document !== 'undefined') {
		document.addEventListener('visibilitychange', () => {
			if (!document.hidden) sendState();
		});
	}
	window.addEventListener('focus', () => sendState());

	/**
	 * 主进程催报
	 *
	 * 窗口最小化 / 被遮挡时 Chromium 会冻结渲染进程的定时器，3 秒心跳直接停摆，
	 * 主进程手里就只剩最后一次快照（远程端表现为「浏览器已经开了还一直显示启动中」）。
	 * 主进程的定时器不受节流影响，由它定期来催，保证状态一定在推进。
	 */
	ipcRenderer.on('remote-ctl:tick', () => {
		noteTick();
		/** 刚上报过就跳过，避免催报和心跳重复发包 */
		if (Date.now() - lastSendAt < 1200) return;
		if (pushTimer) {
			clearTimeout(pushTimer);
			pushTimer = undefined;
		}
		sendState();
	});

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
	processEvents.off('automation-state', schedulePush);
	processEvents.off('status', sendState);
	if (beatWorker) {
		beatWorker.terminate();
		beatWorker = undefined;
	}
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
