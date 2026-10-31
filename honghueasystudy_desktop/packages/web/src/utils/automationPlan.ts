/**
 * 自动化方案执行器（渲染进程）
 *
 * 负责三件事，全部围绕「每次启动浏览器都自动把课上完」：
 *   1. 自动刷课：等登录脚本跑完 → 读课程列表 → 进入记住的那门课；
 *   2. 每日定时：到点拉起浏览器（启动即执行自动化脚本），到点暂停/关闭；
 *   3. 状态汇总：把方案与执行进度交给远程台展示（远程不能直接读渲染进程内存）。
 *
 * 为什么放在渲染进程而不是主进程：
 *   真正的浏览器操作都在 ScriptWorker 子进程里，渲染进程通过 `Process.callWorker`
 *   跟它对话；主进程只能经 CommandBridge 转一手。定时器、状态、UI 都在渲染进程，
 *   放这里可以少一层转发，也不会出现「主进程以为在跑、渲染进程根本没动」的分裂。
 */
import { reactive } from 'vue';
import {
	activeSession,
	dateKey,
	lastFinishedSession,
	migrateSpanToDuration,
	nextRunAt,
	normalizeBrowserAutomation,
	scheduleSummary,
	type AutomationCourseRef,
	type AutomationSchedule,
	type AutomationTarget,
	type BrowserAutomation
} from '@honghu-desktop/app/src/scripts/plan';
import { store } from '../store';
import { Browser } from '../fs/browser';
import { Folder } from '../fs/folder';
import { Process, processEvents } from './process';
import { notify } from './notify';

/** 自动刷课的执行状态 */
export interface StudyStatus {
	state: 'idle' | 'waiting' | 'running' | 'done' | 'error';
	/** 给人看的一句话 */
	message: string;
	/** 正在处理的课程名 */
	courseName: string;
	updatedAt: number;
	/** 最近一次成功进入课程的时间 */
	enteredAt: number;
}

/** 远程台展示用的方案摘要（随状态快照一起上报） */
export interface AutomationSummary {
	study: { enabled: boolean; courseName: string; target: AutomationTarget };
	/**
	 * 当前课程页是否支持「章节 / 作业 / 考试」三栏
	 *
	 * `undefined` = 还没进过课程，不知道；`true` = 超星；`false` = 别的平台。
	 * 远程台据此决定要不要显示那三个目录。
	 */
	catalog?: boolean;
	/**
	 * 此刻是不是正站在课程页上
	 *
	 * 三个目录只在课程页里才有入口，没进课时点下去必然报错，所以远程台要用它
	 * 把那一排按钮置灰。异步探测的结果由 `refreshCourseReady` 写进 `courseReady`。
	 */
	courseReady: boolean;
	schedule: {
		enabled: boolean;
		startTime: string;
		endTime: string;
		days: number[];
		endAction: string;
		maxMinutes: number;
		/** 下一次自动启动时间戳（0 表示算不出来） */
		nextRunAt: number;
		summary: string;
	};
	state: StudyStatus['state'];
	message: string;
	updatedAt: number;
	enteredAt: number;
}

/** 每个实例的执行状态（响应式，界面直接用） */
export const studyStatus = reactive<Record<string, StudyStatus>>({});

/**
 * 每个实例最近一次进入的课程站点是否支持「章节 / 作业 / 考试」三栏目录
 *
 * 只有超星（mooc1 / mooc2-ans）有这套菜单，其它平台的课程页长得完全不一样，
 * 硬读只会一直报「页面上找不到」。用进入课程时拿到的 URL 判断一次，
 * 菜单就只在该出现的地方出现。
 *
 * 没有记录（从未进入过课程）时是 `undefined`——那时既不隐藏也不承诺，交由界面提示。
 */
export const catalogSupport = reactive<Record<string, boolean>>({});

/**
 * 每个实例此刻是不是正站在课程页上
 *
 * 界面上的「章节 / 作业 / 考试」三个目录只有课程页里才有入口。没进课时把它们
 * 点亮，用户点下去只会收到一句「还没有进入课程页」；所以由桌面端去问子进程
 * （`catalogReady`），问到才点亮，进课之后才放开。
 */
export const courseReady = reactive<Record<string, boolean>>({});

/** 记一下「在不在课程页」，顺便让远程台立刻看到变化 */
export function markCourseReady(uid: string, ready: boolean): void {
	if (!!courseReady[uid] === !!ready) return;
	courseReady[uid] = !!ready;
	processEvents.emit('automation-state', uid);
}

/**
 * 问一次子进程：现在在课程页上吗
 *
 * 不抛异常：这是个状态查询，问不到就当「不在」，界面保持置灰。
 * 手工在浏览器里点进课程也能识别出来（子进程按 URL 在现有标签里找）。
 */
export async function refreshCourseReady(uid: string): Promise<boolean> {
	const proc = Process.from(uid);
	if (!proc || proc.status !== 'launched') {
		markCourseReady(uid, false);
		return false;
	}
	try {
		const result = await proc.callWorkerTimeout('catalogReady', [], 20 * 1000);
		const ready = !!(result && result.ready);
		markCourseReady(uid, ready);
		return ready;
	} catch {
		markCourseReady(uid, false);
		return false;
	}
}

/** 判断一个页面 URL 属于哪套课程目录体系 */
export function isChaoxingCourseUrl(url: string): boolean {
	return /\/\/[^/]*(chaoxing|xuexitong)\.com/i.test(String(url || ''));
}

/** 正在跑自动刷课的实例（防重入） */
const studyLocks: Record<string, boolean> = {};
/** 本次启动是否已经触发过自动刷课（浏览器关闭时清空） */
const studyTriggered: Record<string, boolean> = {};
/** 本次启动的自动刷课失败次数（避免无限重试把页面刷爆） */
const studyAttempts: Record<string, number> = {};

const MAX_STUDY_ATTEMPTS = 3;
/** 等浏览器就绪的上限：用户可能同时点定时启动和手动启动 */
const LAUNCH_TIMEOUT = 3 * 60 * 1000;
/** 等登录脚本跑完的上限（滑块/短信登录慢的时候确实要几分钟） */
const AUTOMATION_TIMEOUT = 5 * 60 * 1000;
/** 定时器节拍 */
const TICK_INTERVAL = 20 * 1000;

/** 取浏览器实体（配置树里的响应式对象，改动会自动落盘） */
export function findBrowser(uid: string): Browser | undefined {
	try {
		return Browser.from(uid);
	} catch {
		return undefined;
	}
}

/** 配置树里的全部浏览器实例 */
export function allBrowsers(): Browser[] {
	try {
		const root = Folder.from(store.render.browser.root.uid);
		return (root ? root.findAll((e) => e.type === 'browser') : []) as Browser[];
	} catch {
		return [];
	}
}

/** 读方案（自动补默认值，兼容没有 automation 字段的旧存档） */
export function readPlan(browser: Browser): BrowserAutomation {
	/** 旧的「起止时间段」在这里统一折算成「启动时间点 + 单次时长」，调用方拿到的永远是同一套语义 */
	return migrateSpanToDuration(normalizeBrowserAutomation((browser as unknown as { automation?: unknown }).automation));
}

/**
 * 写方案
 *
 * 赋值发生在响应式实体上，`watch(() => store.render, deep)` 会节流落盘，
 * 不需要额外调用保存接口。
 *
 * **记账字段（lastRunDate / lastStopDate / runStartedAt）一律沿用实体里的当前值。**
 * 界面上那份 `plan` 是挂载时的镜像，用户在面板里勾一下星期几就会整份写回；
 * 如果镜像里的记账字段是旧的，就会把调度器刚写下的「今天已启动」抹掉 ——
 * 下一轮 tick 立刻再启动一次，单次时长也从头计时。这类字段只由调度器写。
 */
export function writePlan(browser: Browser, plan: any): BrowserAutomation {
	const next = migrateSpanToDuration(normalizeBrowserAutomation(plan));
	const current = readPlan(browser);
	next.schedule.lastRunDate = current.schedule.lastRunDate;
	next.schedule.lastStopDate = current.schedule.lastStopDate;
	next.schedule.runStartedAt = current.schedule.runStartedAt;
	return applyPlan(browser, next);
}

/**
 * 底层写入：连记账字段一起写
 *
 * 只允许调度器内部使用 —— 界面与远程保存都必须走 `writePlan`。
 */
function applyPlan(browser: Browser, next: BrowserAutomation): BrowserAutomation {
	(browser as unknown as { automation: BrowserAutomation }).automation = next;
	return next;
}

/** 课程引用（选课接口返回的字段子集） */
export interface CourseLike {
	id: string;
	name: string;
	url?: string;
	label?: string;
	platform?: string;
}

/** 记住课程（选课成功后调用） */
export function rememberCourse(browser: Browser, course: CourseLike): BrowserAutomation {
	const plan = readPlan(browser);
	plan.study.course = {
		id: String(course.id || ''),
		name: String(course.name || ''),
		url: String(course.url || ''),
		label: String(course.label || ''),
		platform: String(course.platform || ''),
		savedAt: Date.now()
	};
	writePlan(browser, plan);
	return plan;
}

function setStatus(uid: string, patch: Partial<StudyStatus>): void {
	const before = studyStatus[uid] || { state: 'idle', message: '', courseName: '', updatedAt: 0, enteredAt: 0 };
	studyStatus[uid] = {
		...before,
		...patch,
		updatedAt: Date.now()
	};
	/** 让远程台立刻看到进度，而不是等下一次 3 秒心跳 */
	processEvents.emit('automation-state', uid);
}

export function getStatus(uid: string): StudyStatus {
	return studyStatus[uid] || { state: 'idle', message: '', courseName: '', updatedAt: 0, enteredAt: 0 };
}

/** 方案摘要：随快照上报给远程台 */
export function automationSummary(browser: Browser): AutomationSummary {
	const plan = readPlan(browser);
	const status = getStatus(browser.uid);
	/**
	 * 目录支持：优先用本次运行实测的结果（进入课程时按 URL 判定），
	 * 没有就退回「记住的课程平台」——用户重启应用后仍能正确隐藏菜单。
	 */
	let catalog: boolean | undefined = catalogSupport[browser.uid];
	if (catalog === undefined && plan.study.course && plan.study.course.platform) {
		catalog = plan.study.course.platform === 'chaoxing';
	}
	return {
		study: {
			enabled: plan.study.enabled,
			courseName: plan.study.course ? plan.study.course.name : '',
			target: plan.study.target
		},
		catalog,
		courseReady: !!courseReady[browser.uid],
		schedule: {
			enabled: plan.schedule.enabled,
			startTime: plan.schedule.startTime,
			endTime: plan.schedule.endTime,
			days: plan.schedule.days,
			endAction: plan.schedule.endAction,
			maxMinutes: plan.schedule.maxMinutes,
			nextRunAt: plan.schedule.enabled ? nextRunAt(plan.schedule, new Date()) || 0 : 0,
			summary: scheduleSummary(plan.schedule)
		},
		state: status.state,
		message: status.message,
		updatedAt: status.updatedAt,
		enteredAt: status.enteredAt
	};
}

// ---------------------------------------------------------------- 基础等待

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(e: any): string {
	if (!e) return '未知错误';
	return String(e && e.message ? e.message : e);
}

/** 等一个条件成立，超时返回 false */
async function waitFor(check: () => boolean, timeout: number, interval = 800): Promise<boolean> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (check()) return true;
		await sleep(interval);
	}
	return false;
}

/** 等浏览器就绪（必要时自己拉起） */
async function ensureLaunched(browser: Browser): Promise<Process> {
	let proc = Process.from(browser.uid);

	/**
	 * 残留的「已关闭」实例要先摘掉再启动。
	 *
	 * `Process.from` 取的是数组里第一个同 uid 的实例，如果它停在 closed，
	 * 新启动的实例永远拿不到状态（后续 waitFor 会一直看到 closed），
	 * 表现就是「自动刷课卡在等待浏览器就绪，最后超时」。
	 */
	if (proc && proc.status === 'closed') {
		Process.remove(browser.uid);
		proc = undefined;
	}

	/** 已经在启动/运行就不重复 fork：重复启动会抢同一个 user-data-dir */
	if (!proc) {
		await browser.launch();
		proc = Process.from(browser.uid);
	}

	if (!proc) throw new Error('浏览器启动失败，请检查浏览器路径与设置');

	const ok = await waitFor(() => {
		const current = Process.from(browser.uid);
		return !!current && current.status === 'launched';
	}, LAUNCH_TIMEOUT, 1000);

	if (!ok) throw new Error('等待浏览器启动超时');
	return Process.from(browser.uid) as Process;
}

/**
 * 等启动时那批自动化脚本跑完
 *
 * 子进程在 `runAutomationScripts` 结束后会发 `automation-done`；
 * 没配脚本时它也会立刻发，所以正常情况几乎马上返回。
 * 万一子进程在发之前就挂了（比如扩展加载失败），靠超时兜底继续往下走 ——
 * 这时候读课程列表通常也会失败，但至少用户能看到真实原因。
 */
async function waitAutomationDone(uid: string, timeout: number): Promise<void> {
	const proc = Process.from(uid);
	if (!proc) return;
	if (proc.status !== 'launched') return;

	await new Promise<void>((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			proc.off('automation-done', finish);
			clearTimeout(timer);
			resolve();
		};
		const timer = setTimeout(finish, timeout);
		proc.once('automation-done', finish);
	});
}

/** 读课程列表（带重试：登录后页面渲染有延迟，第一次经常是空列表） */
async function listCoursesWithRetry(
	proc: Process,
	attempts = 3
): Promise<{ courses: { id: string; name: string; url: string; label?: string }[]; platform: string; hint: string }> {
	let last: any = { courses: [], platform: '', hint: '' };

	for (let index = 0; index < attempts; index++) {
		last = await proc.callWorkerTimeout('listCourses', [{ refresh: index === 0 }], 120 * 1000);
		if (last && Array.isArray(last.courses) && last.courses.length > 0) return last;
		if (index < attempts - 1) await sleep(8000);
	}

	return last || { courses: [], platform: '', hint: '' };
}

/** 从课程列表里挑出记住的那门（先按名字，再按编号兜底） */
function pickCourse(
	courses: { id: string; name: string; url: string; label?: string }[],
	course: AutomationCourseRef
): { id: string; name: string; url: string; label?: string } | undefined {
	if (!courses.length) return undefined;

	/** 同名课（AI智课 + 共享课）靠类型角标区分，有记住的角标就必须一起比 */
	const sameName = courses.filter((item) => item.name === course.name);
	if (sameName.length === 0) {
		/** 名字对不上时按编号试一次：课程改名的情况很少，但确实存在 */
		return courses.find((item) => course.id && item.id === course.id);
	}
	if (sameName.length === 1) return sameName[0];

	const withLabel = sameName.find((item) => (item.label || '') === (course.label || ''));
	return withLabel || sameName[0];
}

// ---------------------------------------------------------------- 自动刷课

/**
 * 执行一次「读取课程 → 进入课程」
 *
 * `silent` 为真时不弹桌面通知（定时任务里由定时器统一汇报，避免半夜弹窗）。
 */
export async function runStudy(uid: string, opts?: { silent?: boolean }): Promise<StudyStatus> {
	const browser = findBrowser(uid);
	if (!browser) throw new Error('浏览器实例不存在');

	const plan = readPlan(browser);
	const course = plan.study.course;
	if (!course) throw new Error('还没有选择要刷的课程');

	if (studyLocks[uid]) return getStatus(uid);
	studyLocks[uid] = true;

	setStatus(uid, { state: 'waiting', message: '等待浏览器就绪…', courseName: course.name });

	try {
		const proc = await ensureLaunched(browser);

		setStatus(uid, { state: 'waiting', message: '等待登录脚本执行完成…' });
		await waitAutomationDone(uid, AUTOMATION_TIMEOUT);

		setStatus(uid, { state: 'running', message: '正在读取课程列表…' });
		const list = await listCoursesWithRetry(proc);

		const hit = pickCourse(list.courses || [], course);
		if (!hit) {
			const detail = list.courses && list.courses.length ? `（列表里没有同名课程）` : list.hint ? `：${list.hint}` : '';
			throw new Error(`没有找到课程「${course.name}」${detail}`);
		}

		setStatus(uid, { state: 'running', message: `正在进入课程：${hit.name}`, courseName: hit.name });
		const result = await proc.callWorkerTimeout('enterCourse', [{ id: hit.id, name: hit.name }], 120 * 1000);

		/** 记住这门课属于哪套体系：只有超星有「章节 / 作业 / 考试」三栏，其它平台不该显示那套菜单 */
		catalogSupport[uid] = isChaoxingCourseUrl((result && result.url) || hit.url || '');

		/** 刷新记住的课程：编号/直链会随列表变化，下次直接用最新的 */
		const refreshed = readPlan(browser);
		refreshed.study.course = {
			...(refreshed.study.course || course),
			id: hit.id,
			name: hit.name,
			url: hit.url || (result && result.url) || '',
			label: hit.label || '',
			platform: list.platform || '',
			savedAt: Date.now()
		};
		writePlan(browser, refreshed);

		/**
		 * 超星：接着打开方案里指定的那一块内容
		 *
		 * 用户要的是「从当前进度往下刷」，不是「挑一节」；也有人希望自动打开作业/考试。
		 * 送到位之后超星脚本会自己往下推，这一步失败不阻断整体流程——
		 * 课已经进去了，用户仍能在面板里手动点。
		 */
		markCourseReady(uid, true);
		const target = plan.study.target;
		let chapterNote = '';
		if (catalogSupport[uid] && target !== 'none') {
			setStatus(uid, {
				state: 'running',
				message: `正在打开${TARGET_SHORT[target]}…`,
				courseName: hit.name
			});
			const next = await openStudyTarget(uid, target).catch((e: any) => ({ entered: false, message: errorText(e) }));
			if (next && next.message) chapterNote = '　·　' + next.message;
			/** 打开内容后页面已经不是课程页了，如实反映一次：界面上的三个目录会跟着变灰 */
			await refreshCourseReady(uid);
		}

		const message = `已进入课程：${hit.name}${chapterNote}`;
		setStatus(uid, { state: 'done', message, courseName: hit.name, enteredAt: Date.now() });
		if (!opts || !opts.silent) {
			notify('自动刷课', message, `auto-study-${uid}`, { type: 'success' });
		}
		return getStatus(uid);
	} catch (e) {
		const message = errorText(e);
		setStatus(uid, { state: 'error', message, courseName: course.name });
		if (!opts || !opts.silent) {
			notify('自动刷课失败', message, `auto-study-${uid}`, { type: 'error', duration: 8000 });
		}
		throw e;
	} finally {
		studyLocks[uid] = false;
	}
}

/** 暂停刷课（不关浏览器） */
export async function pauseStudy(uid: string, opts?: { keepTab?: boolean }): Promise<string> {
	const proc = Process.from(uid);
	if (!proc) throw new Error('浏览器未运行');

	const result = await proc.callWorkerTimeout('stopStudy', [{ keepTab: !!(opts && opts.keepTab) }], 60 * 1000);
	const message = (result && result.message) || '已暂停刷课';
	setStatus(uid, { state: 'idle', message });
	/** 暂停后允许再次触发自动刷课（否则下一次定时不会重新进课） */
	studyTriggered[uid] = false;
	studyAttempts[uid] = 0;
	return message;
}

/** 手动「立即执行一次」：等同定时到点，但不改定时记录 */
export async function runStudyNow(uid: string): Promise<StudyStatus> {
	const browser = findBrowser(uid);
	if (!browser) throw new Error('浏览器实例不存在');
	studyTriggered[uid] = true;
	return runStudy(uid);
}

/** 读取课程列表供用户选择（会导航到课程页，需要浏览器已启动） */
export async function fetchCourseList(
	uid: string,
	opts?: { refresh?: boolean }
): Promise<{ courses: { id: string; name: string; url: string; label?: string }[]; platform: string; hint: string }> {
	const proc = Process.from(uid);
	if (!proc) throw new Error('请先启动浏览器');
	if (proc.status !== 'launched') throw new Error('浏览器正在启动，请稍候');

	const refresh = !opts || opts.refresh !== false;
	return proc.callWorkerTimeout('listCourses', [{ refresh }], 120 * 1000);
}

// ---------------------------------------------------------------- 课程内容（章节 / 作业 / 考试）

/**
 * 目录类型
 *
 * 类型在这里单独声明，不从 `@honghu-desktop/app/src/worker` 导入：
 * 那个模块会连带 `playwright-core` 等纯 Node 依赖，打进渲染进程会直接炸。
 */
export type CatalogKind = 'chapter' | 'work' | 'exam';

export interface CatalogItem {
	id: string;
	title: string;
	no: string;
	depth: number;
	status: 'done' | 'todo' | 'locked' | 'unknown';
	state: string;
	hint: string;
	clickable: boolean;
	onclick: string;
}

export interface CourseCatalog {
	kind: CatalogKind;
	title: string;
	url: string;
	items: CatalogItem[];
	summary: string;
	empty: boolean;
	message: string;
}

/** 读课程内部目录（章节 / 作业 / 考试），需要在课程页上点菜单并等 iframe */
export async function fetchCatalog(uid: string, kind: CatalogKind): Promise<CourseCatalog> {
	const proc = Process.from(uid);
	if (!proc) throw new Error('请先启动浏览器');
	if (proc.status !== 'launched') throw new Error('浏览器正在启动，请稍候');

	return proc.callWorkerTimeout('listCourseCatalog', [{ kind }], 90 * 1000);
}

/**
 * 进入目录里的某一条
 *
 * 章节跳到学习页由刷课脚本接管；作业、考试跳到答题页由做题脚本接管。
 */
export async function openCatalog(
	uid: string,
	kind: CatalogKind,
	id: string
): Promise<{ url: string; title: string; message: string }> {
	const proc = Process.from(uid);
	if (!proc) throw new Error('请先启动浏览器');
	if (proc.status !== 'launched') throw new Error('浏览器正在启动，请稍候');

	return proc.callWorkerTimeout('openCatalogItem', [{ kind, id }], 90 * 1000);
}

/** `enterNextChapter` 的返回：没进成也算正常结果，所以不用异常表达 */
export interface NextChapterResult {
	entered: boolean;
	chapterId: string;
	title: string;
	no: string;
	/** 还有多少节可进（含即将进入的这一节） */
	remaining: number;
	message: string;
	url: string;
}

/**
 * 从当前进度继续：进入第一个还没刷完的章节
 *
 * 这是「自动推进」的起点。后面的章节由超星脚本按闯关顺序自己往下推，
 * 不用一节一节点——所以界面上的主按钮是这一个，单节点的「刷课」只作备用。
 */
export async function enterNextChapter(uid: string, opts?: { skipIds?: string[] }): Promise<NextChapterResult> {
	const proc = Process.from(uid);
	if (!proc) throw new Error('请先启动浏览器');
	if (proc.status !== 'launched') throw new Error('浏览器正在启动，请稍候');

	return proc.callWorkerTimeout('enterNextChapter', [{ skipIds: (opts && opts.skipIds) || [] }], 3 * 60 * 1000);
}

/** 进课目标的短文案（用在「正在打开…」这类进行时提示里，长篇文案塞不进去） */
const TARGET_SHORT: Record<AutomationTarget, string> = {
	none: '课程',
	chapter: '章节',
	work: '作业',
	exam: '考试'
};

/**
 * 进课后按方案打开对应的内容
 *
 * 章节交给 `enterNextChapter`（它会挑第一个「已解锁且还有任务点」的并进入）；
 * 作业/考试没有「进度」可言，取第一份待处理且还能点的即可 —— 锁定态点下去
 * 只会弹「暂未开放」，所以必须跳过。
 *
 * 失败用返回值表达而不是抛异常：进课本身是成功的，不该因为「没有作业」
 * 就把整次自动刷课判成失败。
 */
async function openStudyTarget(uid: string, target: AutomationTarget): Promise<{ entered: boolean; message: string }> {
	if (target === 'none') return { entered: false, message: '' };

	if (target === 'chapter') {
		const result = await enterNextChapter(uid);
		return { entered: !!result.entered, message: result.message || '' };
	}

	/** target 只剩 work / exam，正好就是目录类型 */
	const kind: CatalogKind = target;
	const label = target === 'work' ? '作业' : '考试';
	const catalog = await fetchCatalog(uid, kind);

	const hit = (catalog.items || []).find((item) => item.status === 'todo' && item.clickable && item.id);
	if (!hit) {
		const locked = (catalog.items || []).filter((item) => item.status === 'locked').length;
		const fallback =
			locked > 0
				? `暂时没有可${target === 'work' ? '做' : '考'}的${label}，${locked} 份还没解锁`
				: `这门课没有待${target === 'work' ? '做' : '考'}的${label}`;
		return { entered: false, message: catalog.message || fallback };
	}

	const landed = await openCatalog(uid, kind, hit.id);
	return { entered: true, message: `已打开${label}：${(landed && landed.title) || hit.title}` };
}

// ---------------------------------------------------------------- 定时器

let tickTimer: ReturnType<typeof setInterval> | undefined;
let ticking = false;
let started = false;

/**
 * 定时器回调
 *
 * `tick` 内部已有 try/catch，这里再兜一层：将来若有人改动漏掉某个分支的 catch，
 * 单独一个未处理的 rejection 就会让整个调度器静默失效，而用户完全看不出来。
 */
function safeTick(): void {
	tick().catch((e) => console.warn('[自动化] 调度异常', e));
}

/** 触发一次（用锁防止与上一个 tick 叠加） */
async function tick(): Promise<void> {
	if (ticking) return;
	ticking = true;

	try {
		const browsers = allBrowsers();

		for (const browser of browsers) {
			const plan = readPlan(browser);
			const uid = browser.uid;

			/**
			 * ⓪ 课程页还在不在：三个目录能不能点，全看这一句
			 *
			 * 只让子进程比一次 URL，很轻；不 await 是为了别让一台慢实例卡住整个 tick
			 * （后面还有定时判断，卡住会连带别的浏览器不启动）。
			 */
			refreshCourseReady(uid).catch(() => {});

			/**
			 * ① 自动刷课：浏览器一起来就进课。
			 *
			 * 只做一次（`studyTriggered`），失败最多重试 3 次：
			 * 无限重试会在「课程已过期」这类硬错误上把页面刷成一片空白。
			 */
			if (plan.study.enabled && plan.study.course && !studyTriggered[uid]) {
				const proc = Process.from(uid);
				if (proc && proc.status === 'launched') {
					studyTriggered[uid] = true;
					studyAttempts[uid] = (studyAttempts[uid] || 0) + 1;
					runStudy(uid, { silent: studyAttempts[uid] > 1 }).catch(() => {
						/** 失败后放开重试额度，下一次定时/启动还能再试 */
						if ((studyAttempts[uid] || 0) < MAX_STUDY_ATTEMPTS) {
							setTimeout(() => {
								studyTriggered[uid] = false;
							}, 60 * 1000);
						}
					});
				}
			}

			/** ② 定时：到点启动 / 到点收尾 */
			if (!plan.schedule.enabled) continue;
			await handleSchedule(browser, plan.schedule);
		}
	} catch (e) {
		console.error('自动化定时任务执行失败', e);
	} finally {
		ticking = false;
	}
}

/** 单台实例的定时逻辑 */
async function handleSchedule(browser: Browser, schedule: AutomationSchedule): Promise<void> {
	const uid = browser.uid;
	const now = new Date();
	const session = activeSession(schedule, now);

	if (session) {
		if (schedule.lastRunDate !== session.id) {
			const proc = Process.from(uid);
			const alive = !!proc && (proc.status === 'launched' || proc.status === 'launching');

			/** 记下「这一场已经处理过」，先写再启动：启动失败也不该每 20 秒重试一次 */
			patchSchedule(browser, { lastRunDate: session.id, runStartedAt: Date.now() });

			if (!alive) {
				console.log(`[自动化] 定时启动浏览器：${browser.name}（${session.id} ${schedule.startTime}）`);
				/** 还没选课就没人替用户进课了，必须提示一次，否则课白开一上午 */
				if (!readPlan(browser).study.course) {
					notify(
						'定时任务已启动浏览器',
						'这台浏览器还没有选择要学习的课程，请在「自动刷课」里选一门。',
						`auto-nocourse-${uid}`,
						{ type: 'info', duration: 10000 }
					);
				}
				/**
				 * 不 await：拉起浏览器要几十秒，await 会把整个 tick 卡住，
				 * 后面几台实例的定时判断全部延后。启动完成后由 status 事件触发自动刷课。
				 */
				browser.launch().catch((e) => {
					notify('定时启动失败', errorText(e), `auto-launch-${uid}`, { type: 'error', duration: 8000 });
					setStatus(uid, { state: 'error', message: '定时启动失败：' + errorText(e) });
				});
			}
			return;
		}

		/** 单次最长学习时长 */
		if (schedule.maxMinutes > 0 && schedule.runStartedAt > 0) {
			const elapsed = Date.now() - schedule.runStartedAt;
			if (elapsed > schedule.maxMinutes * 60 * 1000) {
				await applyEndAction(browser, schedule, 'max-minutes', session.id);
			}
		}
		return;
	}

	/** 已经过了窗口：补做一次收尾（应用关掉再打开也能补上） */
	const finished = lastFinishedSession(schedule, now);
	if (finished && schedule.lastRunDate === finished.id && schedule.lastStopDate !== finished.id) {
		await applyEndAction(browser, schedule, 'schedule-end', finished.id);
	}
}

/** 改方案的定时字段（合并当前值，避免覆盖用户在界面上的其它改动） */
function patchSchedule(browser: Browser, patch: Partial<AutomationSchedule>): void {
	const plan = readPlan(browser);
	plan.schedule = normalizeBrowserAutomation({ ...plan, schedule: { ...plan.schedule, ...patch } }).schedule;
	/** 走底层写入：这里的 patch 就是要改记账字段 */
	applyPlan(browser, plan);
}

/**
 * 到点收尾
 *
 * `reason` 只用于日志与提示文案，不影响动作本身。
 */
async function applyEndAction(
	browser: Browser,
	schedule: AutomationSchedule,
	reason: 'schedule-end' | 'max-minutes',
	sessionId: string
): Promise<void> {
	const uid = browser.uid;
	const proc = Process.from(uid);

	console.log(`[自动化] ${reason === 'max-minutes' ? '达到单次时长上限' : '定时结束'}，开始收尾：${browser.name}`);

	try {
		if (schedule.endAction === 'none') {
			/* 用户明确要求「到点不处理」：只记录，不动浏览器 */
		} else {
			if (proc) {
				if (schedule.endAction === 'pause' || schedule.endAction === 'pause-close') {
					try {
						await pauseStudy(uid);
					} catch (e) {
						console.warn('暂停刷课失败（继续关闭流程）', e);
					}
				}
				if (schedule.endAction === 'pause-close' || schedule.endAction === 'close') {
					await browser.close().catch((e) => console.warn('关闭浏览器失败', e));
				}
			}
		}
	} finally {
		const plan = readPlan(browser);
		plan.schedule = {
			...plan.schedule,
			lastStopDate: sessionId || dateKey(new Date()),
			runStartedAt: 0
		};
		applyPlan(browser, plan);
		setStatus(uid, {
			state: 'idle',
			message: reason === 'max-minutes' ? '已达到单次学习时长上限，已暂停' : '定时结束，已收尾'
		});
	}
}

/** 启动自动化调度（幂等） */
export function startAutomationScheduler(): void {
	if (started) return;
	started = true;

	processEvents.on('status', handleProcessStatus);
	processEvents.on('automation-done', handleAutomationDone);

	tickTimer = setInterval(safeTick, TICK_INTERVAL);

	/** 启动后先补一次：应用刚打开时可能正处在定时窗口内，或者刚刚错过收尾时间 */
	setTimeout(safeTick, 4000);
	console.log('[自动化] 调度器已启动');
}

export function stopAutomationScheduler(): void {
	if (tickTimer) {
		clearInterval(tickTimer);
		tickTimer = undefined;
	}
	processEvents.off('status', handleProcessStatus);
	processEvents.off('automation-done', handleAutomationDone);
	started = false;
}

/** 浏览器状态变化：启动→触发自动刷课；关闭→清掉本次启动的标记 */
function handleProcessStatus(uid: string): void {
	const proc = Process.from(uid);

	if (!proc) {
		studyTriggered[uid] = false;
		studyAttempts[uid] = 0;
		/** 浏览器没了，课程页自然也没了：三个目录要立刻变灰 */
		markCourseReady(uid, false);
		if (studyStatus[uid] && studyStatus[uid].state !== 'idle') {
			setStatus(uid, { state: 'idle', message: '浏览器已关闭' });
		}
		return;
	}

	if (proc.status === 'launched') {
		const browser = findBrowser(uid);
		if (!browser) return;

		/** 启动/导航之后重新问一次：用户可能自己点进了某门课 */
		refreshCourseReady(uid).catch(() => {});

		const plan = readPlan(browser);
		if (!plan.study.enabled || !plan.study.course) return;
		if (studyTriggered[uid] || studyLocks[uid]) return;

		studyTriggered[uid] = true;
		studyAttempts[uid] = (studyAttempts[uid] || 0) + 1;
		runStudy(uid, { silent: studyAttempts[uid] > 1 }).catch((e) => {
			console.warn('自动刷课失败', errorText(e));
			if ((studyAttempts[uid] || 0) < MAX_STUDY_ATTEMPTS) {
				setTimeout(() => {
					studyTriggered[uid] = false;
				}, 60 * 1000);
			}
		});
	}
}

/** 登录脚本跑完：如果启动事件没触发到（例如方案是启动后才启用的），这里补一次 */
function handleAutomationDone(uid: string): void {
	handleProcessStatus(uid);
}
