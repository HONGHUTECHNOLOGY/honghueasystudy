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
	/**
	 * 错过开始时间后是否补执行
	 *
	 * 默认 `false`：到点没赶上（电脑关机、应用没开、刚装完还没登录）就跳过当天，
	 * 不在用户中午打开软件时突然把浏览器拉起来刷课。
	 * `true` 时沿用旧的「只要还在窗口内就启动」行为。
	 *
	 * 无论哪种，开始后的 {@link SCHEDULE_GRACE_MINUTES} 分钟内都算「按时」——
	 * 开机自启本身就要几十秒，不留这点余量的话定时任务几乎永远赶不上。
	 */
	catchUp: boolean;
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
			catchUp: false,
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
			/** 旧存档没有这个字段：按「不补执行」处理，正是这次要的默认行为 */
			catchUp: schedule.catchUp === true,
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

/** 课程列表项（`listCourses` 的返回结构子集） */
export interface CourseCandidate {
	id: string;
	name: string;
	url: string;
	label?: string;
}

/**
 * 课程名归一化：只用于比对，不改变展示
 *
 * 平台偶尔会给课程名加后缀（「（2026级）」「(2026秋)」）或夹着全角空格，
 * 用户记住的是当初那一份，严格 `===` 会直接判成「列表里没有同名课程」。
 */
export function normalizeCourseName(value: any): string {
	return String(value || '')
		.replace(/[\s\u3000]+/g, '')
		.replace(/（/g, '(')
		.replace(/）/g, ')')
		.toLowerCase();
}

/**
 * 从课程列表里挑出记住的那门课
 *
 * 顺序：同名同角标 → 同名 → 归一化同名 → 同编号 → 唯一包含（需角标一致）。
 * 每放宽一步都必须更保守：宁可报「没找到」让用户重选，也不要把人送进另一门课。
 */
export function pickCourse(
	courses: CourseCandidate[],
	course: AutomationCourseRef | null | undefined
): CourseCandidate | undefined {
	if (!Array.isArray(courses) || !courses.length || !course) return undefined;

	/** 同名课（AI智课 + 共享课）靠类型角标区分，有记住的角标就必须一起比 */
	const wantLabel = String(course.label || '');
	const sameName = courses.filter((item) => item.name === course.name);
	if (sameName.length === 1) return sameName[0];
	if (sameName.length > 1) {
		const withLabel = sameName.find((item) => (item.label || '') === wantLabel);
		if (withLabel) return withLabel;
	}

	const want = normalizeCourseName(course.name);

	/** 名字被加了后缀 / 换了空白：归一化后再严格比一次 */
	const sameNormalized = courses.filter((item) => normalizeCourseName(item.name) === want);
	if (sameNormalized.length === 1) return sameNormalized[0];
	if (sameNormalized.length > 1) {
		const withLabel = sameNormalized.find((item) => (item.label || '') === wantLabel);
		if (withLabel) return withLabel;
	}

	/**
	 * 名字对不上时按编号试一次：课程改名的情况很少，但确实存在。
	 *
	 * 编号只是列表里的顺序，课程增删后会指到别的课上，所以要求名字也对得上。
	 */
	if (course.id) {
		const byId = courses.find((item) => item.id === course.id && normalizeCourseName(item.name) === want);
		if (byId) return byId;
	}

	/**
	 * 最后试一次「唯一包含」：平台常把学期/班号拼在名字里
	 * （记住的是「C语言程序设计」，列表里是「C语言程序设计 (2026秋)」）。
	 * 必须唯一、且角标一致才认。
	 */
	if (want.length >= 4) {
		const loose = courses.filter((item) => {
			const name = normalizeCourseName(item.name);
			if (!name) return false;
			if (wantLabel && (item.label || '') !== wantLabel) return false;
			return name.indexOf(want) !== -1 || want.indexOf(name) !== -1;
		});
		if (loose.length === 1) return loose[0];
	}

	/**
	 * 名字完全一致、只是角标对不上（旧存档里 label 可能是空的）
	 *
	 * 宁可进同名课（进错了还能在面板里换），也不要报「没有同名课程」把整次刷课判失败。
	 */
	if (sameName.length) return sameName[0];

	return undefined;
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
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(
		2,
		'0'
	)}`;
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

/**
 * 错过开始时间后仍算「按时」的宽限（分钟）
 *
 * 开机自启本身就要几十秒（登录、加载配置、等 app ready），调度器还要等第一次
 * tick。宽限给 0 会让定时任务在「一切正常」的情况下也经常赶不上；给太长又会
 * 变成用户下午打开电脑时突然开始刷课 —— 10 分钟足够覆盖开机延迟。
 */
export const SCHEDULE_GRACE_MINUTES = 10;

/**
 * 这一场还来不来得及「按点」启动
 *
 * - `catchUp=true`：只要还在窗口内就算来得及（旧行为）；
 * - `catchUp=false`：只在开始后的宽限内算来得及，超过就跳过当天。
 */
export function canStartSession(
	schedule: AutomationSchedule,
	session: ScheduleSession,
	now: Date = new Date()
): boolean {
	if (schedule.catchUp) return true;
	return now.getTime() - session.start <= SCHEDULE_GRACE_MINUTES * 60 * 1000;
}

/**
 * 定时任务期间给扩展下发的「定时停止」覆盖
 *
 * 扩展自己有一套 `stopTimeMinutes`（进入学习页后倒计时），桌面端又有一套定时方案。
 * 两套时间互不相干时，扩展可能按自己的 30 分钟提前暂停，桌面方案却还打算再学两小时。
 * 这里把「本次定时任务真正该在什么时刻暂停」算出来交给扩展，扩展在任务期间只认它；
 * 任务之外（返回 null）扩展继续用自己记忆的 `stopTimeMinutes`。
 */
export interface AutoStopOverride {
	/** 是否处于桌面定时任务期间 */
	active: boolean;
	/** 到点是否暂停；方案里「到点不处理」时为 false（扩展也不要按自己的设置暂停） */
	pause: boolean;
	/** 暂停时刻（本地时间戳，毫秒）；pause=false 时为 0 */
	endAt: number;
}

/**
 * 此刻桌面定时任务对扩展「定时停止」的覆盖
 *
 * 只有「由桌面调度器启动的这一场会话」才算定时任务：`lastRunDate` 是调度器在会话
 * 首次处理的节拍里写下的，`runStartedAt` 是同一次写入的时间。两者对不上时说明
 * 浏览器是用户手动开的、或者这一场早就收尾过（收尾会把 `runStartedAt` 清零），
 * 都不能让扩展按桌面时间走 —— 那些都是「其余时候」。
 */
export function autoStopOverride(schedule: AutomationSchedule, now: Date): AutoStopOverride | null {
	if (!schedule || !schedule.enabled) return null;

	const session = activeSession(schedule, now);
	if (!session) return null;
	if (schedule.lastRunDate !== session.id || schedule.runStartedAt <= 0) return null;

	/** 「到点不处理」：任务期间扩展也不要用自己的定时停止，否则等于替桌面收尾 */
	if (schedule.endAction === 'none') return { active: true, pause: false, endAt: 0 };

	/**
	 * 桌面端的收尾时刻 = min(单次时长到点, 本场会话结束)
	 *
	 * 新模型里 `endTime` 与 `startTime` 相同（全天窗口），收尾由 `maxMinutes` 或
	 * `maxMinutes=0` 时的不限时长决定；旧存档的窗口长度已在 `migrateSpanToDuration` 折算过。
	 */
	let endAt = session.end;
	if (schedule.maxMinutes > 0) {
		endAt = Math.min(endAt, schedule.runStartedAt + schedule.maxMinutes * 60 * 1000);
	}

	/**
	 * 已经越过收尾时刻也要继续算「任务期间」：桌面端最多还要等一个节拍（20 秒）才收尾，
	 * 这段时间里如果返回 null，扩展会退回自己的 `stopTimeMinutes` 重新计时，
	 * 「提前暂停」就又从这道缝里钻回来了。下发一个已到期的截止时刻，扩展据此
	 * 停掉自己的倒计时（剩余 ≤ 0 时不启动），把真正暂停留给桌面收尾动作。
	 */
	return { active: true, pause: true, endAt };
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
	const missed = schedule.catchUp ? '' : ' · 错过不补';
	if (schedule.endTime !== schedule.startTime) {
		const extra = schedule.maxMinutes > 0 ? ` · 单次最多 ${schedule.maxMinutes} 分钟` : '';
		return `${days} ${schedule.startTime}–${schedule.endTime} · 到点${action}${extra}${missed}`;
	}

	const tail = schedule.maxMinutes > 0 ? `${schedule.maxMinutes} 分钟后${action}` : '不限时长';
	return `${days} ${schedule.startTime} 启动 · ${tail}${missed}`;
}
