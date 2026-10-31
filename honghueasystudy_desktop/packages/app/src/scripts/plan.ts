/**
 * 自动化方案（运行计划）
 *
 * 与 `automationScripts`（每次启动都跑的登录/点击脚本）配套：
 * 方案描述「什么时候自动拉起浏览器、进去以后自动刷哪门课、到点怎么收尾」。
 *
 * 单独放一个文件、只依赖纯函数，是为了让主进程（远程台接口）、渲染进程
 * （本地设置界面 + 定时器）和单测共用同一套语义 —— 定时窗口、跨天、
 * 星期选择这些边界只要两边理解不一致，就会出现「手机上看到 8 点跑，实际 9 点才动」。
 */

/** 到点收尾动作 */
export type AutomationEndAction = 'pause' | 'pause-close' | 'close' | 'none';

/** 记住的一门课（自动刷课时直接进这门） */
export interface AutomationCourseRef {
	/** 列表里的编号（c1/c2…），只在本轮页面有效，失效时按 name 重定位 */
	id: string;
	name: string;
	/** 课程直链（超星这类有直链的平台可以少点一次） */
	url?: string;
	/** 类型角标：共享课 / AI智课 … */
	label?: string;
	/** 平台标识：chaoxing / zhihuishu / zjy / icve */
	platform?: string;
	savedAt: number;
}

/** 每日定时 */
export interface AutomationSchedule {
	enabled: boolean;
	/** 开始时间 HH:mm */
	startTime: string;
	/** 结束时间 HH:mm（小于开始时间表示跨天，例如 23:00 → 06:30） */
	endTime: string;
	/** 星期，0=周日 … 6=周六；空数组=每天 */
	days: number[];
	/** 到点动作 */
	endAction: AutomationEndAction;
	/** 单次最长学习时长（分钟），0=不限 */
	maxMinutes: number;
	/** 最近一次自动启动的会话日期 YYYY-MM-DD（防同一天重复拉起） */
	lastRunDate: string;
	/** 最近一次自动收尾的会话日期 YYYY-MM-DD（防重复关闭） */
	lastStopDate: string;
	/** 本次自动运行的开始时间戳（用于 maxMinutes 判断） */
	runStartedAt: number;
}

/**
 * 进课后自动打开哪一块课程内容
 *
 * 超星把课程内容拆成「章节 / 作业 / 考试」三套互不相通的目录，用户想让它自动干的
 * 也确实是三种不同的事：往下刷课、把作业做了、把考试考了。所以目标要能选，
 * 不能一律当作「刷章节」。
 */
export type AutomationTarget = 'none' | 'chapter' | 'work' | 'exam';

export const AUTOMATION_TARGETS: AutomationTarget[] = ['none', 'chapter', 'work', 'exam'];

/** 目标文案（桌面端与远程台共用，避免两处说法不一致） */
export const TARGET_LABELS: Record<AutomationTarget, string> = {
	none: '只进课程',
	chapter: '章节：自动往下刷',
	work: '作业：打开第一份待做',
	exam: '考试：打开第一场可考'
};

/** 自动刷课 */
export interface AutomationStudy {
	/** 启动后自动进入记住的课程 */
	enabled: boolean;
	/** 记住的课程；为空时远程/本地都只提示「去选一门课」 */
	course: AutomationCourseRef | null;
	/**
	 * 进课后自动打开哪一块
	 *
	 * 默认 `chapter`，与升级前「进课就找第一个未完成章节」的行为保持一致：
	 * 旧存档没有这个字段时不能把用户已经习惯的自动推进悄悄关掉。
	 */
	target: AutomationTarget;
}

/** 一台浏览器的自动化方案 */
export interface BrowserAutomation {
	/** 结构版本，便于以后迁移 */
	version: number;
	/**
	 * 自动刷课：浏览器一启动（含定时启动）就自动进入记住的课程。
	 *
	 * 注意这里没有「脚本开关」—— `automationScripts` 是启动即执行的既有行为，
	 * 登录脚本永远会在启动时跑；方案只决定「跑完之后做什么」。
	 */
	study: AutomationStudy;
	schedule: AutomationSchedule;
}

export const AUTOMATION_VERSION = 1;

/** 星期文案（索引即 days 里的值） */
export const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function defaultBrowserAutomation(): BrowserAutomation {
	return {
		version: AUTOMATION_VERSION,
		study: { enabled: false, course: null, target: 'chapter' },
		schedule: {
			enabled: false,
			startTime: '08:00',
			endTime: '11:30',
			days: [],
			endAction: 'pause-close',
			maxMinutes: 0,
			lastRunDate: '',
			lastStopDate: '',
			runStartedAt: 0
		}
	};
}

/** 任意输入 → 合法方案（旧存档、手机端手填、字段缺失都走这里） */
export function normalizeBrowserAutomation(input: any): BrowserAutomation {
	const base = defaultBrowserAutomation();
	if (!input || typeof input !== 'object') return base;

	const schedule = (input.schedule || {}) as Partial<AutomationSchedule>;
	const study = (input.study || {}) as Partial<AutomationStudy>;

	return {
		version: AUTOMATION_VERSION,
		study: {
			enabled: !!study.enabled,
			course: normalizeCourse(study.course),
			target: normalizeTarget(study.target)
		},
		schedule: {
			enabled: !!schedule.enabled,
			startTime: normalizeHm(schedule.startTime, base.schedule.startTime),
			endTime: normalizeHm(schedule.endTime, base.schedule.endTime),
			days: normalizeDays(schedule.days),
			endAction: normalizeEndAction(schedule.endAction),
			maxMinutes: clampNumber(schedule.maxMinutes, 0, 24 * 60, 0),
			lastRunDate: typeof schedule.lastRunDate === 'string' ? schedule.lastRunDate : '',
			lastStopDate: typeof schedule.lastStopDate === 'string' ? schedule.lastStopDate : '',
			runStartedAt: clampNumber(schedule.runStartedAt, 0, Number.MAX_SAFE_INTEGER, 0)
		}
	};
}

/**
 * 把「起止时间段」的旧方案迁移成「启动时间点 + 单次时长」
 *
 * 界面上只留一个启动时间：手机上填两个时间既麻烦，跨天（23:00→06:30）还容易填错。
 * 结束时刻改由「单次最长 + 结束后动作」决定；旧存档里的窗口长度直接折算成时长，
 * 收尾时刻与升级前保持一致。`endTime` 写成与 `startTime` 相同，表示「全天窗口」，
 * 这样 `activeSession` 仍然按天给出场次 id，`lastRunDate` 的防重复逻辑不用改。
 */
export function migrateSpanToDuration(plan: BrowserAutomation): BrowserAutomation {
	const schedule = plan.schedule;
	if (!schedule || schedule.endTime === schedule.startTime) return plan;

	const start = parseHm(schedule.startTime);
	const end = parseHm(schedule.endTime);
	if (start === null || end === null) return plan;

	const span = windowSpan(start, end);
	if (span >= 24 * 60) return plan;

	return {
		...plan,
		schedule: {
			...schedule,
			endTime: schedule.startTime,
			maxMinutes: schedule.maxMinutes > 0 ? Math.min(schedule.maxMinutes, span) : span
		}
	};
}

function normalizeCourse(course: any): AutomationCourseRef | null {
	if (!course || typeof course !== 'object') return null;
	const name = String(course.name || '').trim();
	if (!name) return null;
	return {
		id: String(course.id || ''),
		name,
		url: typeof course.url === 'string' ? course.url : '',
		label: typeof course.label === 'string' ? course.label : '',
		platform: typeof course.platform === 'string' ? course.platform : '',
		savedAt: clampNumber(course.savedAt, 0, Number.MAX_SAFE_INTEGER, Date.now())
	};
}

function normalizeDays(days: any): number[] {
	if (!Array.isArray(days)) return [];
	const set = new Set<number>();
	days.forEach((item) => {
		const value = Number(item);
		if (Number.isInteger(value) && value >= 0 && value <= 6) set.add(value);
	});
	return Array.from(set).sort((a, b) => a - b);
}

function normalizeEndAction(value: any): AutomationEndAction {
	const allowed: AutomationEndAction[] = ['pause', 'pause-close', 'close', 'none'];
	return allowed.indexOf(value) !== -1 ? (value as AutomationEndAction) : 'pause-close';
}

/** 未知值一律回落到 `chapter`：那是升级前的行为，不能因为字段缺失就停掉自动推进 */
function normalizeTarget(value: any): AutomationTarget {
	return AUTOMATION_TARGETS.indexOf(value) !== -1 ? (value as AutomationTarget) : 'chapter';
}

function clampNumber(value: any, min: number, max: number, fallback: number): number {
	const num = Number(value);
	if (!Number.isFinite(num)) return fallback;
	return Math.min(Math.max(Math.round(num), min), max);
}

/**
 * 'HH:mm' → 分钟数；非法返回 null
 *
 * 兼容带秒的写法（'08:00:00'）：不同控件的 v-model 格式不统一，
 * 桌面端 Arco 时间选择器与手机端 `<input type="time">` 一个给秒一个不给。
 * 只认 'HH:mm' 的话，用户设的 19:30 会被静默重置成默认的 08:00。
 */
export function parseHm(text: any): number | null {
	const match = /^(\d{1,2})\s*[:：]\s*(\d{1,2})(?:\s*[:：]\s*(\d{1,2}))?$/.exec(String(text || '').trim());
	if (!match) return null;
	const hour = Number(match[1]);
	const minute = Number(match[2]);
	const second = match[3] === undefined ? 0 : Number(match[3]);
	if (!Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second)) return null;
	if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
	return hour * 60 + minute;
}

/** 分钟数 → 'HH:mm' */
export function formatHm(minutes: number): string {
	const safe = ((Math.round(minutes) % 1440) + 1440) % 1440;
	return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

/** 非法的时间串回落到默认值 */
export function normalizeHm(text: any, fallback: string): string {
	const value = parseHm(text);
	return value === null ? fallback : formatHm(value);
}

/** 本地日期 → YYYY-MM-DD（不要用 toISOString，那是 UTC，跨时区会差一天） */
export function dateKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 星期索引，0=周日 */
export function weekdayOf(date: Date): number {
	return date.getDay();
}

/** days 是否命中该星期（空数组=每天） */
export function dayMatches(days: number[], weekday: number): boolean {
	return !days || days.length === 0 || days.indexOf(weekday) !== -1;
}

/**
 * 一次「定时会话」的描述
 *
 * start/end 都是真实时间戳；跨天窗口的 end 会落在第二天。
 */
export interface ScheduleSession {
	/** 会话标识（用开始那天的日期） */
	id: string;
	start: number;
	end: number;
}

/** 某天的 HH:mm 对应的本地时间 */
function atMinutes(day: Date, minutes: number): Date {
	return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}

/** 窗口长度（分钟）：起止相同视为 24 小时，结束早于开始视为跨天 */
function windowSpan(startMinutes: number, endMinutes: number): number {
	let span = endMinutes - startMinutes;
	if (span === 0) span = 24 * 60;
	if (span < 0) span += 24 * 60;
	return span;
}

/**
 * 计算「此刻所处的定时会话」
 *
 * 会往前看 2 天：跨天窗口（23:00 → 06:30）在凌晨时段属于**昨天**那一场，
 * 只看今天会算不出来，凌晨那一段就永远不会自动收尾。
 */
export function activeSession(schedule: AutomationSchedule, now: Date): ScheduleSession | null {
	const startMinutes = parseHm(schedule.startTime);
	const endMinutes = parseHm(schedule.endTime);
	if (startMinutes === null || endMinutes === null) return null;

	const span = windowSpan(startMinutes, endMinutes);

	for (let back = 0; back <= 1; back++) {
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
		if (!dayMatches(schedule.days, weekdayOf(day))) continue;

		const start = atMinutes(day, startMinutes);
		const end = new Date(start.getTime() + span * 60 * 1000);
		if (now.getTime() >= start.getTime() && now.getTime() < end.getTime()) {
			return { id: dateKey(day), start: start.getTime(), end: end.getTime() };
		}
	}
	return null;
}

/** 最近一场已经结束的会话（用于「到点收尾」在窗口外也能补做一次） */
export function lastFinishedSession(schedule: AutomationSchedule, now: Date): ScheduleSession | null {
	const startMinutes = parseHm(schedule.startTime);
	const endMinutes = parseHm(schedule.endTime);
	if (startMinutes === null || endMinutes === null) return null;

	const span = windowSpan(startMinutes, endMinutes);

	for (let back = 0; back <= 1; back++) {
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
		if (!dayMatches(schedule.days, weekdayOf(day))) continue;

		const start = atMinutes(day, startMinutes);
		const end = new Date(start.getTime() + span * 60 * 1000);
		/** 只看最近 26 小时：再早的会话已经被后面的正常流程处理过，补做只会打扰用户 */
		if (now.getTime() >= end.getTime() && now.getTime() - end.getTime() < 26 * 60 * 60 * 1000) {
			return { id: dateKey(day), start: start.getTime(), end: end.getTime() };
		}
	}
	return null;
}

/** 下一次自动启动的时间戳（仅用于展示，按 7 天滚动找最近一次） */
export function nextRunAt(schedule: AutomationSchedule, now: Date): number | null {
	const startMinutes = parseHm(schedule.startTime);
	if (startMinutes === null) return null;

	for (let offset = 0; offset <= 7; offset++) {
		const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
		if (!dayMatches(schedule.days, weekdayOf(day))) continue;
		const at = atMinutes(day, startMinutes);
		if (at.getTime() > now.getTime()) return at.getTime();
	}
	return null;
}

/** 一句话描述方案（桌面端与远程台共用，避免两处文案不一致） */
export function scheduleSummary(schedule: AutomationSchedule): string {
	if (!schedule.enabled) return '未开启定时';

	const days =
		!schedule.days || schedule.days.length === 0
			? '每天'
			: schedule.days.length === 7
				? '每天'
				: schedule.days
						.slice()
						.sort((a, b) => a - b)
						.map((day) => WEEK_LABELS[day] || '')
						.join('、');

	const action =
		schedule.endAction === 'pause'
			? '暂停'
			: schedule.endAction === 'pause-close'
				? '暂停并关闭'
				: schedule.endAction === 'close'
					? '关闭'
					: '不处理';

	/**
	 * 起止不同 = 升级前的「时间段」存档，保留原样描述；
	 * 起止相同 = 新模型（一个启动时间点 + 单次时长）。
	 */
	if (schedule.endTime !== schedule.startTime) {
		const extra = schedule.maxMinutes > 0 ? ` · 单次最多 ${schedule.maxMinutes} 分钟` : '';
		return `${days} ${schedule.startTime}–${schedule.endTime} · 到点${action}${extra}`;
	}

	const tail = schedule.maxMinutes > 0 ? `${schedule.maxMinutes} 分钟后${action}` : '不限时长';
	return `${days} ${schedule.startTime} 启动 · ${tail}`;
}
