/** 任务进度：桌面端从脚本日志推断后随状态快照推送 */
export interface TaskProgress {
	/** 浏览器就绪时间戳（0 表示未就绪） */
	startedAt: number;
	/** 最后一次有日志输出的时间戳（0 表示还没有输出） */
	lastActivityAt: number;
	/** 推断出的当前任务名 */
	currentTask: string;
	/** 已完成任务点数 */
	completed: number;
	/** 已作答题目数 */
	answered: number;
	/** 错误条数 */
	errors: number;
	/** 是否收到「全部完成」信号 */
	finished: boolean;
}

/** 进课后自动打开哪一块课程内容（只有超星有这三套目录） */
export type AutomationTarget = 'none' | 'chapter' | 'work' | 'exam';

/** 快照里的方案摘要（不需要额外请求就能显示「定时中 / 正在刷哪门课」） */
export interface AutomationSummary {
	study: { enabled: boolean; courseName: string; target: AutomationTarget };
	/**
	 * 当前课程页有没有「章节 / 作业 / 考试」三栏
	 *
	 * `undefined` = 还没进过课程；`true` = 超星；`false` = 其它平台（整块不显示）。
	 */
	catalog?: boolean;
	/**
	 * 此刻是不是正站在课程页上
	 *
	 * 三个目录只有课程页里才有入口，没进课时点下去必然报错，所以要置灰。
	 * 旧版桌面端不上报该字段（`undefined`），这时按「未就绪」处理更安全。
	 */
	courseReady?: boolean;
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
}

export interface BrowserSnapshot {
	uid: string;
	name: string;
	notes: string;
	tags: { name: string; color: string }[];
	status: 'closed' | 'closing' | 'launching' | 'launched';
	/** active 为 true 表示该页是浏览器当前前台可见的标签页 */
	pages: { url: string; title: string; active?: boolean }[];
	/** 可选：桌面端旧版本不上报该字段 */
	progress?: TaskProgress;
	/**
	 * 页面内视频状态；null / 缺省表示当前页没有视频。
	 * 用来区分「正在看视频（没有日志是正常的）」和「真的卡住了」。
	 */
	media?: { playing: boolean; currentTime: number; duration: number } | null;
	/** 自动化方案摘要（旧版桌面端没有这个字段） */
	automation?: AutomationSummary;
}

export interface RemoteSnapshot {
	browsers: BrowserSnapshot[];
	logs: { [uid: string]: string[] };
	ts: number;
}

export interface TunnelStatus {
	state: 'idle' | 'downloading' | 'starting' | 'running' | 'error';
	url: string;
	error: string;
	progress: number;
	provider: string;
}

export interface ServiceInfo {
	running: boolean;
	port: number;
	allowLan: boolean;
	addresses: string[];
	tunnel: TunnelStatus;
	appVersion: string;
	deviceName: string;
}

export type AuthMode = 'pair' | 'password' | 'none';

/** 自动化脚本的表单字段（来自桌面端脚本声明） */
export interface RemoteScriptField {
	key: string;
	label: string;
	type: 'text' | 'password' | 'number' | 'textarea' | 'select' | 'switch';
	required: boolean;
	placeholder?: string;
	options?: { label: string; value: any }[];
	value?: any;
	max?: number;
	min?: number;
}

export interface RemoteScript {
	name: string;
	icon: string;
	fields: RemoteScriptField[];
}

export interface RemoteCourse {
	id: string;
	name: string;
	url: string;
	/** 课程类型角标：共享课 / 翻转课 / 公开课…（平台没标就没有） */
	label?: string;
}

/** 登录 → 选课 的自动化任务状态 */
export interface AutomationJob {
	uid: string;
	name: string;
	state: 'idle' | 'running' | 'done' | 'error';
	message: string;
	startedAt: number;
	finishedAt: number;
	updatedAt: number;
	courses: RemoteCourse[];
	platform: string;
	pageUrl: string;
	hint: string;
}

/** 记住的课程（自动刷课直接进这一门） */
export interface AutomationCourseRef {
	id: string;
	name: string;
	url?: string;
	label?: string;
	platform?: string;
	savedAt: number;
}

/** 每日定时 */
export interface AutomationSchedule {
	enabled: boolean;
	startTime: string;
	endTime: string;
	days: number[];
	endAction: 'pause' | 'pause-close' | 'close' | 'none';
	maxMinutes: number;
	lastRunDate?: string;
	lastStopDate?: string;
	runStartedAt?: number;
}

/** 自动化方案：每次启动浏览器都会自动执行 */
export interface AutomationPlan {
	version: number;
	study: { enabled: boolean; course: AutomationCourseRef | null; target?: AutomationTarget };
	schedule: AutomationSchedule;
}

/**
 * 自动化脚本的配置值（密码字段恒为空串，留空表示不修改）
 *
 * 与桌面端 `scripts/script-values.ts` 的 `ScriptValues` 同构：两端来回传的就是这一层，
 * 存储结构（configs 描述符）只在桌面端主进程里出现。
 */
export interface PlanScript {
	name: string;
	icon?: string;
	values: Record<string, any>;
}

/** 课程内部的三个目录 */
export type CatalogKind = 'chapter' | 'work' | 'exam';

/** 目录里的一个条目：一个章节 / 一份作业 / 一场考试 */
export interface CatalogItem {
	id: string;
	title: string;
	no: string;
	depth: number;
	/** locked 是超星「闯关模式」：前面的任务点没做完，这一条点不进去 */
	status: 'done' | 'todo' | 'locked' | 'unknown';
	state: string;
	hint: string;
	clickable: boolean;
	onclick: string;
}

/** 一个目录的读取结果 */
export interface CourseCatalog {
	kind: CatalogKind;
	title: string;
	url: string;
	items: CatalogItem[];
	summary: string;
	empty: boolean;
	message: string;
}

export interface PingResult {
	ok: boolean;
	authed: boolean;
	needPair: boolean;
	authMode: AuthMode;
	hasPassword: boolean;
	appVersion: string;
	deviceName: string;
	port: number;
}

/** 未登录/会话失效 */
export class AuthError extends Error {
	constructor(message?: string) {
		super(message || '登录已失效');
		this.name = 'AuthError';
	}
}

// eslint-disable-next-line no-undef -- RequestInit 为 TS lib.dom 类型，no-undef 对 TS 类型误报
async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		credentials: 'same-origin',
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(init && init.headers ? (init.headers as Record<string, string>) : {})
		}
	});

	if (res.status === 401) {
		throw new AuthError('登录已失效，请重新配对');
	}

	let body: any = null;
	try {
		body = await res.json();
	} catch {
		throw new Error(`服务响应异常（${res.status}）`);
	}

	if (!res.ok || !body || body.ok === false) {
		throw new Error((body && body.error) || `请求失败（${res.status}）`);
	}

	return body as T;
}

export const api = {
	ping: () => request<PingResult>('/api/ping'),

	/** 校验凭据（配对码或密码，由服务端按当前模式判定） */
	auth: (secret: string) =>
		request<{ ok: boolean }>('/api/auth', {
			method: 'POST',
			body: JSON.stringify({ secret })
		}),

	logout: () => request<{ ok: boolean }>('/api/logout', { method: 'POST', body: '{}' }),

	state: () => request<{ snapshot: RemoteSnapshot | null; service: ServiceInfo; sessions: number }>('/api/state'),

	/** 催桌面端立即补报一次快照（远程端发现状态停滞时用） */
	sync: () => request<{ ok: boolean; ts: number }>('/api/sync', { method: 'POST', body: '{}' }),

	command: (action: string, payload: Record<string, any> = {}) =>
		request<{ ok: boolean; data: any }>('/api/command', {
			method: 'POST',
			body: JSON.stringify({ action, payload })
		}),

	/** 自动化脚本目录（登录脚本 + 表单字段） */
	scripts: () => request<{ ok: boolean; scripts: RemoteScript[] }>('/api/scripts'),

	/** 某实例最近一次自动化任务（登录进度 / 课程列表） */
	automation: (uid: string) =>
		request<{ ok: boolean; job: AutomationJob | null }>(`/api/automation/${encodeURIComponent(uid)}`),

	/** 触发登录脚本：立即返回 running，结果走 SSE */
	runAutomation: (uid: string, name: string, configs: Record<string, any>) =>
		request<{ ok: boolean; job: AutomationJob }>('/api/automation/run', {
			method: 'POST',
			body: JSON.stringify({ uid, name, configs })
		}),

	/** 重新读取课程列表 */
	refreshCourses: (uid: string, refresh = true) =>
		request<{ ok: boolean; job: AutomationJob }>('/api/automation/courses', {
			method: 'POST',
			body: JSON.stringify({ uid, refresh })
		}),

	/** 进入课程（之后由桌面端刷课脚本接管） */
	enterCourse: (uid: string, id: string, name: string) =>
		request<{ ok: boolean; data: { url: string; title: string } }>('/api/automation/enter', {
			method: 'POST',
			body: JSON.stringify({ uid, id, name })
		}),

	/** 读取自动化方案（每次启动自动执行的那一份） */
	plan: (uid: string) =>
		request<{ ok: boolean; plan: AutomationPlan; scripts: PlanScript[] }>(`/api/plan/${encodeURIComponent(uid)}`),

	/**
	 * 保存自动化方案（脚本密码留空 = 保持原值）
	 *
	 * `baseline` 是打开面板时读到的那份脚本列表：桌面端在打开面板之后新增的脚本
	 * 不在表单里，带上基线桌面端才知道「没提交 ≠ 用户删了」。
	 */
	savePlan: (uid: string, plan: AutomationPlan, scripts: PlanScript[], baseline?: PlanScript[]) =>
		request<{ ok: boolean; plan: AutomationPlan; scripts: PlanScript[] }>('/api/plan/save', {
			method: 'POST',
			body: JSON.stringify({ uid, plan, scripts, baseline })
		}),

	/** 立即执行一次自动刷课 */
	runPlan: (uid: string) =>
		request<{ ok: boolean; data: any }>('/api/plan/run', {
			method: 'POST',
			body: JSON.stringify({ uid })
		}),

	/** 暂停刷课（可选顺便关浏览器） */
	stopPlan: (uid: string, opts?: { keepTab?: boolean; closeBrowser?: boolean }) =>
		request<{ ok: boolean; data: any }>('/api/plan/stop', {
			method: 'POST',
			body: JSON.stringify({ uid, ...(opts || {}) })
		}),

	/** 选课用的课程列表 */
	planCourses: (uid: string, refresh = true) =>
		request<{
			ok: boolean;
			courses: RemoteCourse[];
			platform: string;
			hint: string;
			pageUrl: string;
		}>('/api/plan/courses', {
			method: 'POST',
			body: JSON.stringify({ uid, refresh })
		}),

	/** 读课程内部目录（章节 / 作业 / 考试） */
	catalogList: (uid: string, kind: CatalogKind) =>
		request<{ ok: boolean; data: CourseCatalog }>('/api/command', {
			method: 'POST',
			body: JSON.stringify({ action: 'catalog.list', payload: { uid, kind } })
		}),

	/** 进入目录里的某一条（章节刷课 / 作业 / 考试） */
	catalogOpen: (uid: string, kind: CatalogKind, id: string) =>
		request<{ ok: boolean; data: { url: string; title: string; message: string } }>('/api/command', {
			method: 'POST',
			body: JSON.stringify({ action: 'catalog.open', payload: { uid, kind, id } })
		}),

	/** 从当前进度继续：进入第一个未完成的章节 */
	catalogNext: (uid: string, skipIds: string[] = []) =>
		request<{
			ok: boolean;
			data: {
				entered: boolean;
				chapterId: string;
				title: string;
				no: string;
				remaining: number;
				message: string;
				url: string;
			};
		}>('/api/command', {
			method: 'POST',
			body: JSON.stringify({ action: 'catalog.next', payload: { uid, skipIds } })
		}),

	/** 现在在不在课程页上（决定三个目录能不能点） */
	catalogReady: (uid: string) =>
		request<{ ok: boolean; data: { ready: boolean; url: string } }>('/api/command', {
			method: 'POST',
			body: JSON.stringify({ action: 'catalog.ready', payload: { uid } })
		})
};

/**
 * 截图地址，带时间戳防止缓存
 *
 * page 为选中的标签页索引；不传则由后端自动挑选当前前台可见的页面。
 */
export function snapshotUrl(uid: string, page?: number): string {
	const suffix = typeof page === 'number' && page >= 0 ? `&page=${page}` : '';
	return `/api/snapshot/${encodeURIComponent(uid)}?t=${Date.now()}${suffix}`;
}
