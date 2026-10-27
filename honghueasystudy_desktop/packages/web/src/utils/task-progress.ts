/**
 * 任务进度推断
 *
 * 学习脚本运行在浏览器扩展里，只往控制台输出人类可读的中文日志，
 * 没有任何结构化的进度上报通道。桌面端自身也没有进度模型，
 * 所以远程台看到的只能是原始日志。
 *
 * 这里做一层「日志 → 进度」的轻量推断：
 * 只认几类稳定的关键节点（开始学习 / 已完成 / 作答成功 / 出错），
 * 命中就更新，认不出就跳过——宁可少报，也不要报错。
 */

export interface TaskProgress {
	/** 浏览器就绪时间（0 表示尚未就绪） */
	startedAt: number;
	/** 最后一次有日志输出的时间，用来判断任务是不是卡住了 */
	lastActivityAt: number;
	/** 推断出的当前任务名（章节 / 任务点 / 题目） */
	currentTask: string;
	/** 已完成的任务点数（累计） */
	completed: number;
	/** 已完成的作答数（累计） */
	answered: number;
	/** 错误条数（累计） */
	errors: number;
	/** 是否收到「全部完成」类信号 */
	finished: boolean;
}

export function createProgress(): TaskProgress {
	return {
		startedAt: 0,
		lastActivityAt: 0,
		currentTask: '',
		completed: 0,
		answered: 0,
		errors: 0,
		finished: false
	};
}

/** 「正在学习 : 第3章 视频」这类开头 */
const RE_TASK = /(?:正在学习|即将开始学习|开始学习|正在完成|正在答题|当前任务)\s*[:：]?\s*(.+)$/;
/** 「章节测试已完成 : xxx」 */
const RE_TASK_DONE = /(?:已完成|学习完成|任务点已完成|完成任务点)/;
/** 全部完成的整体信号 */
const RE_ALL_DONE = /(?:全部任务点?已完成|所有任务已完成|全部任务已完成|全部任务点已完成)/;
/** 作答类 */
const RE_ANSWER = /(?:作答成功|答题成功|已提交答案|题目已完成|答案已提交)/;
/** 异常类 */
const RE_ERROR = /(?:错误|失败|异常|超时|无法|未找到|拒绝)/;

/** 清理任务名：去掉尾部标点、时间戳前缀，限制长度 */
function normalizeTask(raw: string): string {
	let text = String(raw || '').trim();
	/** 去掉行首可能残留的时间戳（14:55:40）与方括号标签（[鸿鹄易学]） */
	text = text.replace(/^\d{1,2}:\d{2}:\d{2}\s*/, '').replace(/^\[[^\]]{1,20}\]\s*/, '');
	text = text.replace(/[\s。，,；;、]+$/, '');
	if (text.length > 60) text = text.slice(0, 60) + '…';
	return text;
}

/**
 * 吸收一行日志，返回进度是否发生变化
 *
 * 用「是否变化」而不是「总是 true」来驱动上报，
 * 避免脚本高频输出时把状态推送打满。
 */
export function feedProgress(progress: TaskProgress, line: string, now = Date.now()): boolean {
	const text = String(line || '').trim();
	if (!text) return false;

	let changed = false;

	/**
	 * 任何输出都算「有活动」，这是判断任务是否卡死的依据。
	 * 但不把它计入 changed：否则每一条日志都会触发一次全量状态推送，
	 * 刷课时日志密集，手机端流量和 CPU 都会被白白吃掉。
	 * 心跳（3 秒）会把 lastActivityAt 带过去，足够刷新「最后活动」。
	 */
	if (progress.lastActivityAt !== now) {
		progress.lastActivityAt = now;
	}

	if (RE_ALL_DONE.test(text)) {
		if (!progress.finished) {
			progress.finished = true;
			progress.currentTask = '全部任务已完成';
			progress.completed += 1;
			changed = true;
		}
		return changed;
	}

	const taskMatch = text.match(RE_TASK);
	if (taskMatch && taskMatch[1]) {
		const name = normalizeTask(taskMatch[1]);
		if (name && name !== progress.currentTask) {
			progress.currentTask = name;
			/** 开始一个新任务即认为上一个已结束，但只在明确「开始学习」时计数 */
			changed = true;
		}
	} else if (RE_TASK_DONE.test(text)) {
		progress.completed += 1;
		changed = true;
	}

	if (RE_ANSWER.test(text)) {
		progress.answered += 1;
		changed = true;
	}

	if (RE_ERROR.test(text)) {
		progress.errors += 1;
		changed = true;
	}

	return changed;
}

/** 运行时长（毫秒），未就绪返回 0 */
export function runningMs(progress: TaskProgress, now = Date.now()): number {
	if (!progress.startedAt) return 0;
	return Math.max(0, now - progress.startedAt);
}

/** 距最后一次活动多久（毫秒），无记录返回 -1 */
export function idleMs(progress: TaskProgress, now = Date.now()): number {
	if (!progress.lastActivityAt) return -1;
	return Math.max(0, now - progress.lastActivityAt);
}
