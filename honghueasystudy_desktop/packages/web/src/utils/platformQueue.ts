/**
 * 同平台排队的纯逻辑
 *
 * 为什么单独放一个不依赖任何东西的文件：这段判断最容易出错（谁先跑、谁让路、
 * 什么时候不能再挡），而它一旦算错，表现出来是「到点了什么都不发生」或者
 * 「几门课又一起冲出去」，两种都很难从界面上看出来。抽成纯函数就能直接跑单测。
 *
 * 背景：方案里勾了「错过开始时间也补执行」时，软件一打开会把当天几门错过的课
 * 同时判成「该跑了」；而不少平台不允许同一账号同时刷多节课（互相顶号、判异常），
 * 所以同平台的实例要排队，一拍只放一台出去。
 */

/**
 * 已知教学平台的域名特征
 *
 * 只用来「合并同一平台的不同子域」：`icourse.fifedu.com` 与 `www.fifedu.com`
 * 是同一个平台，不能因为主机名不同就各排各的队。认不出来的域名退化成
 * 「取后两段」（`foo.bar.com` → `bar.com`），一样能把子域归到一起。
 */
const PLATFORM_HOST_RULES: { id: string; test: RegExp }[] = [
	{ id: 'chaoxing', test: /(^|\.)(chaoxing|xuexitong)\.com$/i },
	{ id: 'zhihuishu', test: /(^|\.)(zhihuishu|polymas)\.com$/i },
	{ id: 'zjy', test: /(^|\.)zjy2\.icve\.com\.cn$/i },
	{ id: 'icve', test: /(^|\.)icve\.com\.cn$/i },
	{ id: 'fifedu', test: /(^|\.)fifedu\.com$/i },
	{ id: 'yuketang', test: /(^|\.)(yuketang\.cn|yuketang\.com|yuketang\.ai)$/i }
];

/** URL → 主机名（小写），取不到返回空串 */
function hostOf(url: string): string {
	try {
		return new URL(String(url || '')).hostname.toLowerCase();
	} catch {
		return '';
	}
}

/**
 * 一台实例属于哪个平台
 *
 * 依次取：选课时记下的平台 id → 课程直链域名 → 登录脚本图标域名。
 * 三个都拿不到时返回空串 —— 宁可不排队（保持原来的并行），
 * 也不要凭空把两台不相干的机器归成一组、把用户的学习卡住。
 */
export function platformKeyFrom(
	course: { platform?: string; url?: string } | null | undefined,
	iconUrl?: string
): string {
	const recorded = String((course && course.platform) || '').trim();
	if (recorded) return recorded.toLowerCase();

	const host = hostOf((course && course.url) || '') || hostOf(iconUrl || '');
	if (!host) return '';
	for (const rule of PLATFORM_HOST_RULES) if (rule.test.test(host)) return rule.id;

	const parts = host.split('.').filter(Boolean);
	return parts.length >= 2 ? parts.slice(-2).join('.') : host;
}

/** 一台实例在这一拍里的处境 */
export interface PlatformCandidate {
	uid: string;
	/** 平台标识；空串 = 认不出来，不参与排队（保持原来的并行） */
	platform: string;
	/** 此刻是否已经占着平台在刷课（启动中 / 等登录 / 进课 / 定时还没收尾） */
	holds: boolean;
	/** 本拍想启动时的「本场会话开始时间」；`null` = 这一拍不想启动 */
	dueAt: number | null;
}

export interface PlatformPlan {
	/** 本拍被挡住的实例 → 占着平台、要先跑完的那一台 */
	blocked: Record<string, string>;
	/** 本拍真正可以启动的实例（含已经在跑的，供日志/面板使用） */
	allowed: string[];
}

/**
 * 算出这一拍谁能启动
 *
 * 顺序规则：已经在刷的占住平台 → 其余想启动的按「本场会话开始得早」排队。
 * 补执行时几门课的开始时间可能都在几小时前，用会话开始时间排序才能保证
 * 每次打开软件都是同一门先跑，而不是随配置树顺序变来变去。
 */
export function planPlatformStarts(candidates: PlatformCandidate[]): PlatformPlan {
	const blocked: Record<string, string> = {};
	const allowed: string[] = [];
	/** 平台 → 当前占用者 uid */
	const owner: Record<string, string> = {};

	/** ① 已经在刷的直接占住自己的平台（同平台多台都在刷时只认第一台） */
	for (const item of candidates) {
		if (!item.platform || owner[item.platform]) continue;
		if (item.holds) owner[item.platform] = item.uid;
	}

	/** ② 本拍想启动的排队 */
	const due = candidates
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => item.dueAt !== null)
		.sort((a, b) => (a.item.dueAt as number) - (b.item.dueAt as number) || a.index - b.index);

	for (const { item } of due) {
		/** 认不出平台：不挡也不占，保持原来的并行行为 */
		if (!item.platform) {
			allowed.push(item.uid);
			continue;
		}

		const current = owner[item.platform];
		if (current && current !== item.uid) {
			blocked[item.uid] = current;
			continue;
		}

		/** 这一台会真启动（或本来就是它占着），后面的同平台实例本拍让路 */
		owner[item.platform] = item.uid;
		allowed.push(item.uid);
	}

	return { blocked, allowed };
}
