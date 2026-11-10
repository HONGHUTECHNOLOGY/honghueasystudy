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
	/**
	 * 已计数过的节点（`done:任务名` / `answer:题目`），仅本机使用、不上报
	 *
	 * 超星每轮扫描章节都会把「章节测试已完成 : xxx」重打一遍，
	 * 不去重的话 completed 会随扫描次数线性虚高。
	 */
	doneTasks?: string[];
}

export function createProgress(): TaskProgress {
	return {
		startedAt: 0,
		lastActivityAt: 0,
		currentTask: '',
		completed: 0,
		answered: 0,
		errors: 0,
		finished: false,
		doneTasks: []
	};
}

/** 「正在学习 : 第3章 视频」这类开头（注意超星用带空格的半角冒号） */
const RE_TASK = /(?:正在学习|即将开始学习|开始学习|正在完成|开始答题|正在答题|当前任务)\s*[:：]?\s*(.+)$/;
/** 「任务 xxx 开始。」 */
const RE_TASK_START = /^任务\s*(.+?)\s*开始/;
/** 「章节测试已完成 : xxx」 */
const RE_TASK_DONE = /(?:已完成|学习完成|任务点已完成|完成任务点)/;
/** 「任务 xxx 完成，三秒后下一章」「视频播放完毕」 */
const RE_TASK_FINISH = /(?:^任务\s*(.+?)\s*完成|播放完成|播放完毕)/;
/** 全部完成的整体信号 */
const RE_ALL_DONE = /(?:全部任务点?已完成|所有任务已完成|全部任务已完成|全部任务点已完成|所有章节学习完成)/;
/** 作答类（逐题） */
const RE_ANSWER = /(?:作答成功|答题成功|已提交答案|题目已完成|答案已提交)/;
/** 批量结算：「作答结束：共 12 题，已选中 12 题」——用作已作答数的下限兜底 */
const RE_ANSWER_SUMMARY = /作答结束\s*[:：]\s*共\s*(\d+)\s*题\s*[，,]\s*已选中\s*(\d+)\s*题/;
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
 * 记录一个节点，返回是否是首次出现
 *
 * 只保留最近 120 条，避免进度对象随刷课时长无限膨胀。
 */
function remember(progress: TaskProgress, key: string): boolean {
	const list = progress.doneTasks || (progress.doneTasks = []);
	if (list.indexOf(key) !== -1) return false;
	list.push(key);
	if (list.length > 120) list.splice(0, list.length - 120);
	return true;
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

	/** 批量结算只抬高下限：同一份作业重复跑时逐题日志会被去重，这里兜住总量 */
	const summary = text.match(RE_ANSWER_SUMMARY);
	if (summary) {
		const selected = Number(summary[2]) || 0;
		if (selected > progress.answered) {
			progress.answered = selected;
			changed = true;
		}
	}

	const taskMatch = text.match(RE_TASK);
	const startMatch = taskMatch ? null : text.match(RE_TASK_START);
	let taskName = '';
	if (taskMatch && taskMatch[1]) taskName = normalizeTask(taskMatch[1]);
	else if (startMatch && startMatch[1]) taskName = normalizeTask(startMatch[1]);

	if (taskName && taskName !== progress.currentTask) {
		progress.currentTask = taskName;
		/** 开始一个新任务即认为上一个已结束，但只在明确「开始学习」时计数 */
		changed = true;
	}

	/**
	 * 完成节点：同一任务重复播报（超星每次扫章节都会重报）只计一次
	 *
	 * 两类信号的去重键不同：
	 * · 「章节测试已完成 : xxx」整行就带任务名，用整行；
	 * · 「视频播放完毕」这类没有名字，只能用当前任务名，否则多个视频会被并成一个。
	 */
	const doneMatch = text.match(RE_TASK_DONE);
	const finishMatch = doneMatch ? null : text.match(RE_TASK_FINISH);
	if (doneMatch || finishMatch) {
		const raw = doneMatch ? doneMatch[1] || text : (finishMatch && finishMatch[1]) || progress.currentTask || text;
		const name = normalizeTask(raw);
		if (remember(progress, `done:${name}`)) {
			progress.completed += 1;
			changed = true;
		}
	}

	if (RE_ANSWER.test(text)) {
		/** 同一道题只计一次：脚本题没选中时会重试，重复计数会让「已作答」虚高 */
		if (remember(progress, `answer:${normalizeTask(text)}`)) {
			progress.answered += 1;
			changed = true;
		}
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
