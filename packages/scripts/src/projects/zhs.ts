import { $ui, Project, Script, $el, h, $$el, $message, $, $modal, MessageElement, $store, $gm } from 'easy-us';
import { RemotePage, SimplifyWorkResult, HonghuWorker, defaultAnswerWrapperHandler, request } from '@honghu/core';
import { CommonProject } from './common';
import { workNotes, definition, volume, restudy } from '../utils/configs';
import {
	commonWork,
	createUnVisibleTextOfImage,
	optimizationElementWithImage,
	removeRedundantWords,
	simplifyWorkResult
} from '../utils/work';
import { CommonWorkOptions, playMedia } from '../utils';
import { $console, BackgroundProject } from './background';
import {
	safeClick,
	trustedClick,
	trustedDispatch,
	isChoiceSelected,
	trustedPointerClick,
	OrigEvent,
	OrigMouseEvent
} from '../utils/safe-click';
import { waitForMedia, waitForElement } from '../utils/study';
import { $playwright } from '../utils/app';
import { $render } from '../utils/render';
import { answerVideoQuiz, judgeAnswerOf, VideoQuizStrategy } from '../utils/video-quiz';
import { setExtensionAutomation } from '../utils/automation-state';

const state = {
	study: {
		/**
		 * 学习是否暂停
		 */
		stop: false,
		currentMedia: undefined as HTMLMediaElement | undefined,
		stopInterval: 0 as any,
		stopMessage: undefined as MessageElement | undefined,
		/** 定期向桌面端确认定时任务的计时器（页面级） */
		stopRefreshTimer: 0 as any
	}
};

/**
 * 需要软件辅助的掌握度页面
 */
const remote_not_required_pages = [
	'fusioncourseh5.zhihuishu.com',
	'studywisdomh5.zhihuishu.com',
	'wisdom-mooc.zhihuishu.com'
];

/**
 * 掌握度练习（视频下方「去提升」）的往返标记。
 *
 * learnPage 点「去提升」是 `window.location.href` 整页跳到 studentexamcomh5，
 * 两个域名不同源，localStorage / sessionStorage 都不通，只能借扩展的 tab 级存储传递：
 * `{ url: 学习页地址, at: 跳转时间, skipReplay: 返回后不要重播当前视频 }`。
 */
const ZHS_MASTERY_RETURN_KEY = 'zhs-mastery-return';

/** 掌握度练习次数 `{ [pathname]: count }`，达到配置上限后不再自动进入，避免反复往返 */
const ZHS_MASTERY_TIMES_KEY = 'zhs-mastery-times';

/** 掌握度练习页（学生端试卷页），走 smartWork 答题，允许没有桌面端 remotePage */
const ZHS_POINT_EXAM_HOST = 'studentexamcomh5.zhihuishu.com';
const ZHS_POINT_EXAM_PAGE = ZHS_POINT_EXAM_HOST + '/studentReviewTestOrExam';

/**
 * 知识点学习报告页（掌握度练习的第二层入口）
 *
 * 新形态课程把「去提升」拆成了两步：学习页视频下方按钮 → 本报告页 → 再点一次「去提升」
 * 才 `location.href` 跳到试卷页。报告页是学习页 SPA 的路由 `/masteryHistory/:courseId/:classId/:nodeUid`。
 */
const ZHS_MASTERY_REPORT_PATH = '/masteryHistory/';

/**
 * 知识点练习结果页（提交后平台自己整页跳到这里）
 * 路由 `/point/:courseId/:examPaperId/:examTestId/:nodeUid/:classId`
 */
const ZHS_POINT_RESULT_PATH = '/point/';

/**
 * 知识点解析页（结果页点「查看作答记录与解析」进来的）
 * 路由 `/examPreview/:courseId/:examPaperId/:examTestId/:knowledeId/:classId`
 */
const ZHS_EXAM_PREVIEW_PATH = '/examPreview/';

/**
 * 从解析页抄下来的正确答案
 *
 * 提交后平台会立刻整页跳到结果页，本页脚本当场销毁，
 * 所以「提交 → 看结果 → 抄答案 → 重做」这条链只能在结果页/解析页重新接管着走。
 * 存全局（GM_setValue）而不是 tab 级：重做可能换 tab 打开，且题库本来就该跨页面复用。
 */
const ZHS_MASTERY_ANSWERS_KEY = 'zhs-mastery-answers';

/**
 * 命中「解析页抄下来的答案」时，答题结果面板里显示的来源名
 *
 * 面板会把它渲染在每道题的来源行，用户一眼能看出这题用的是抄来的答案而不是题库/AI。
 * `onResultsUpdate` 里也靠这个名字把这类结果排除在 `localQuestionCaches` 之外，
 * 否则抄来的答案会被二次写进题库缓存，把用户自己攒的 200 条挤掉。
 */
const MASTERY_ANSWER_SOURCE = '[已记录] 解析页';

/**
 * 未满分重做的轮次 `{ count: number, key: string }`
 *
 * 重做走「结果页 → 解析页 → 重新答题」，不经过学习页，所以不能复用
 * `ZHS_MASTERY_TIMES_KEY`（那个是学习页「去提升」的次数）。
 * 每次从学习页发起新一轮时会清零。
 */
const ZHS_MASTERY_RETRY_KEY = 'zhs-mastery-retry';

/**
 * 「本节刚练完」标记 `{ key, at }`
 *
 * 从结果页回学习页时写入，学习页 `tryEnterMasteryImprove` 读到就跳过本次。
 * 只靠次数上限不够：重做失败退回学习页时会把 `retry.active` 置 true 用重做上限放行，
 * 一路走下来就有概率又开一轮，用户看到的就是「做完卷子回学习页又进去了」。
 */
const ZHS_MASTERY_SETTLED_KEY = 'zhs-mastery-settled';

/** 掌握度练习页 / 作业页 / AI 助教页各用一套提示，别把「请自行保存或提交」贴到自动交卷的页面上 */
function smartWorkNotes(): string[] {
	if (location.href.includes(ZHS_POINT_EXAM_HOST)) {
		// 掌握度练习页由脚本自动交卷，不需要用户手动保存
		return ['答完会自动提交试卷，提交后自动返回课程继续学习。'];
	}
	if (remote_not_required_pages.some((domain) => location.href.includes(domain))) {
		return [];
	}
	return ['答题中请勿进行任何操作，如需暂停答题', '请等待全部题目搜索完成并执行自动保存功能后才能操作。'];
}

/** 结果页 / 解析页的接管防重入（oncomplete 与 SPA 的 onhistorychange 会同时触发） */
let pointExamRunning = false;

/**
 * 解析页抄答案的去重锁
 *
 * 有两条进入路径：结果页流程里点完链接直接接着抄（SPA 不重载），
 * 以及页面重载后由 `collectPreviewAnswers` 方法接管。
 * 两条同时进来会重复点「重新答题」，用这个独立锁挡一下
 * —— 不能复用 `pointExamRunning`：结果页流程持有它的时候，
 * 解析页那次接管会被自己挡掉，然后两边都不干活，就卡在解析页了。
 */
let previewCollectRunning = false;

/**
 * 报告页接管只跑一次
 *
 * 走到 `/masteryHistory/` 时 `oncomplete`（整页跳转）和 `onhistorychange`（SPA 路由 push）
 * 可能同时触发，重复点「去提升」会连开两张试卷。
 */
let masteryReportRunning = false;

const gxk_read_notes = [
	'如果未开始答题，请尝试刷新页面。',
	'禁止同时打开多个作业/考试页面。',
	['答题中请勿进行任何操作，如需暂停答题', '请等待全部题目搜索完成并执行自动保存功能后才能操作。'],
	['暂停后手动操作请确保每个题目都点击下一题', '进行答案保存（不然不会保存，提交没分）']
];

/**
 * 章节/视频项「已完成」的文本兜底判定
 *
 * 各页面原本靠不同类名标记完成态（time_icofinish / finish-icon / label.success / i.select），
 * 平台改版换掉类名后判定会整体失效 —— 此时 getNext 会认为「所有任务都未完成」，
 * 于是每次都从列表头部开始，表现为反复播放第一个已经看完的视频。
 * 页面上「已完成」这几个字是稳定的，用文案兜底可以在类名失效时仍正确跳过已完成项。
 */
function textSaysFinished(el: HTMLElement | null | undefined): boolean {
	if (!el) return false;
	const text = (el.textContent || '').replace(/\s+/g, '');
	// 注意不要匹配「未完成」，“未完成”不包含子串“已完成”
	return /已完成|已学完|已看完/.test(text);
}

/** 元素纯文本（innerText 在隐藏节点上为空，兜底 textContent） */
function normalizedText(el: HTMLElement | null | undefined): string {
	if (!el) return '';
	return String(el.innerText || el.textContent || '').replace(/\s+/g, '');
}

/** 元素是否可见（离线/惰性渲染的节点不能被点） */
function isElementVisible(el: HTMLElement): boolean {
	const rect = el.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) return false;
	const style = getComputedStyle(el);
	return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * 取页面上的「去提升」入口
 *
 * 新形态课程的掌握度入口是两层的，两层的 DOM 完全不同：
 *
 * 1. 学习页视频下方 `SimplifiedMasteryLevel` 组件：
 *    `<button class="simplified-mastery__action"><span>去提升</span></button>`
 *    —— 点它进的是知识点学习报告页（SPA 路由 `/masteryHistory/...`），**不是**试卷；
 * 2. 报告页里再一个 `div.to-improve`，文案「去提升 →」
 *    —— 这个才真正 `location.href` 跳到 studentexamcomh5 的试卷页。
 *
 * 另外免考知识点是「去练习」、无题目时是「建设中」、课程结束时按钮 disabled，
 * 这几种都不能点（点了也进不去试卷），所以只认「去提升」且未禁用。
 */
function getMasteryImproveButton(): HTMLElement | undefined {
	/** 文案是「去提升」或「去提升 →」，忽略末尾箭头 */
	const isImproveText = (el: HTMLElement) =>
		/^去提升[→>»›）)]{0,2}$/.test((el.textContent || '').replace(/\s+/g, ''));

	const isUsable = (el: HTMLElement) => {
		if ((el as HTMLButtonElement).disabled) return false;
		if (typeof el.className === 'string' && /disabled/i.test(el.className)) return false;
		// 先用 textContent 粗筛（不触发 reflow），命中的才去量尺寸
		if (!isImproveText(el)) return false;
		return isElementVisible(el);
	};

	// 已知的两个组件类名，优先命中
	const known = Array.from(document.querySelectorAll<HTMLElement>('.simplified-mastery__action, .to-improve'));
	const hit = known.find(isUsable);
	if (hit) return hit;

	/**
	 * 类名兜底：报告页的「去提升 →」文本可能挂在普通 div 的文本节点上，
	 * 所以连 div / span 一起扫，命中后返回可点击祖先。
	 * 用 textContent 长度先剪枝，避免对整棵页面容器反复求文本。
	 */
	for (const el of Array.from(
		document.querySelectorAll<HTMLElement>('button, a, div, span, [role="button"]')
	)) {
		if ((el.textContent || '').length > 20) continue;
		if (!isUsable(el)) continue;
		return (
			el.closest<HTMLElement>('button, a, [role="button"], [class*="btn"], [class*="button"], .to-improve') || el
		);
	}
	return undefined;
}

/** 等「去提升」入口渲染出来（报告页是异步组件，接口回包后才有按钮） */
async function waitMasteryImproveButton(timeoutSeconds = 15): Promise<HTMLElement | undefined> {
	const startedAt = Date.now();
	while (Date.now() - startedAt < timeoutSeconds * 1000) {
		const btn = getMasteryImproveButton();
		if (btn) return btn;
		await $.sleep(1000);
	}
	return undefined;
}

/**
 * 一路点到试卷页。
 *
 * 每一层既可能是 SPA 路由切换（JS 上下文还活着，可以接着点第二层），
 * 也可能是整页跳转（本脚本当场被销毁）。所以这里按「当前页还有入口就再点一次」推进；
 * 被整页跳转打断时，由脚本在报告页重新启动后接着走（见 resumeMasteryReport）。
 */
async function advanceToPointExam(firstBtn?: HTMLElement, maxLayers = 3): Promise<boolean> {
	const arrived = () => location.href.includes(ZHS_POINT_EXAM_HOST);
	let btn = firstBtn;

	for (let layer = 0; layer < maxLayers; layer++) {
		if (arrived()) return true;

		if (!btn) btn = await waitMasteryImproveButton(15);
		if (!btn) return arrived();

		$message.info({ content: layer === 0 ? '正在进入掌握度练习' : '正在打开掌握度试卷' });
		await safeClick(btn);
		btn = undefined;

		// 等这一层生效：跳走，或者换路由后下一层的入口冒出来
		for (let i = 0; i < 15; i++) {
			await $.sleep(1000);
			if (arrived()) return true;
			if (getMasteryImproveButton()) break;
		}
	}

	return arrived();
}

/** 读结果页里「总题数 / 已答对」这类「标签 + 兄弟数字」结构 */
function readStatNumber(label: string): number | null {
	const nodes = Array.from(document.querySelectorAll<HTMLElement>('div, span, p'));
	for (const el of nodes) {
		if ((el.textContent || '').trim() !== label) continue;
		const next = el.nextElementSibling;
		if (!next) continue;
		const n = parseInt((next.textContent || '').trim(), 10);
		if (Number.isFinite(n)) return n;
	}
	return null;
}

/**
 * 题干归一化：把「解析页抄的答案」和「答题页题干」对齐
 *
 * 两边取文本的路径完全不同（解析页 `.quest-title`，答题页 `.questionName .centent-pre`
 * 还经过 `optimizationElementWithImage` 处理），实测会造成不匹配的差异有：
 * - 图片题：答题页题干里被塞进了图片的 src，解析页没有；
 * - 填空占位符：`（ ）`、`(  )`、`＿＿` 各处写法不一；
 * - 标点、全半角、空白。
 */
function compactQuestion(text: string): string {
	return (text || '')
		// 图片地址先抹掉，否则图片题永远匹配不上（只认 URL 合法字符，别把后面的中文一起吃掉）
		.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/g, '')
		.replace(/[\s\u3000]+/g, '')
		// 填空占位符：去空白后就是（）/()，直接删
		.replace(/[（(][)）]/g, '')
		.replace(/[_＿]{2,}/g, '')
		.replace(/[，。！？；：""''、（）【】《》,.\-!?;:'"()[\]<>]/g, '')
		.toLowerCase();
}

interface MasteryAnswerItem {
	title: string;
	answer: string;
	at: number;
}

/**
 * 写入从解析页抄到的答案。
 *
 * 双写：
 * - **tab 级优先并 await**：`GM_saveTab` 走 background 的 `sendResponse`，能确认真的落地。
 *   抄完答案马上就要 `location.replace` 跳到试卷页，全局存储（`GM_setValue` 只发消息、
 *   不等回执）很可能在页面卸载时丢掉 —— 实测 `chrome.storage.local` 里根本搜不到这个 key，
 *   重做时自然一条都命不中，界面上就显示成 AI 答的。
 * - 全局再补一份做持久化（换 tab / 浏览器重启后还能用）。
 */
async function saveMasteryAnswers(items: { title: string; answer: string }[]) {
	if (items.length === 0) return;
	const now = Date.now();

	const apply = (store: MasteryAnswerItem[]) => {
		const list = store.slice();
		for (const item of items) {
			const key = compactQuestion(item.title);
			if (!key) continue;
			const record: MasteryAnswerItem = { title: item.title, answer: item.answer, at: now };
			const idx = list.findIndex((s) => compactQuestion(s.title) === key);
			if (idx === -1) list.unshift(record);
			else list[idx] = record;
		}
		return list.slice(0, 500);
	};

	const tabStore = (((await $store.getTab(ZHS_MASTERY_ANSWERS_KEY)) || []) as MasteryAnswerItem[]) || [];
	await $store.setTab(ZHS_MASTERY_ANSWERS_KEY, apply(tabStore));

	const globalStore = (($store.get(ZHS_MASTERY_ANSWERS_KEY) as MasteryAnswerItem[]) || []) as MasteryAnswerItem[];
	$store.set(ZHS_MASTERY_ANSWERS_KEY, apply(globalStore));
}

/**
 * 从抄下来的答案里找这道题。
 *
 * 分三级：精确 → 包含 → 前缀。级别越往下越容易误命中，
 * 所以包含要求长度比 ≥ 0.75，前缀要求前 15 个字完全一致（中文 15 字基本能锁定一道题）。
 * tab 级排在前面 —— 它是最新写入的那份。
 */
async function lookupMasteryAnswer(title: string): Promise<string | undefined> {
	const key = compactQuestion(title);
	if (!key) return undefined;

	const tabStore = (((await $store.getTab(ZHS_MASTERY_ANSWERS_KEY)) || []) as MasteryAnswerItem[]) || [];
	const globalStore = (($store.get(ZHS_MASTERY_ANSWERS_KEY) as MasteryAnswerItem[]) || []) as MasteryAnswerItem[];
	const store = [...tabStore, ...globalStore];
	if (store.length === 0) return undefined;

	// 1) 归一化后完全一致
	const exact = store.find((s) => compactQuestion(s.title) === key);
	if (exact) return exact.answer;

	// 2) 一边包含另一边（应对题号、括号注释、尾部多一句话）
	for (const s of store) {
		const other = compactQuestion(s.title);
		if (!other) continue;
		const shorter = Math.min(other.length, key.length);
		const longer = Math.max(other.length, key.length);
		if (shorter < 8 || shorter / longer < 0.75) continue;
		if (other.includes(key) || key.includes(other)) return s.answer;
	}

	// 3) 前 15 个字一致（应对题干尾部标点/注释差异导致长度比不达标）
	if (key.length >= 15) {
		const head = key.slice(0, 15);
		for (const s of store) {
			const other = compactQuestion(s.title);
			if (other.length >= 15 && other.slice(0, 15) === head) return s.answer;
		}
	}

	return undefined;
}

/** 本地答案表里一共有多少题（tab 与全局取较大者） */
async function countMasteryAnswers(): Promise<number> {
	const tabStore = ((await $store.getTab(ZHS_MASTERY_ANSWERS_KEY)) || []) as MasteryAnswerItem[];
	const globalStore = (($store.get(ZHS_MASTERY_ANSWERS_KEY) as MasteryAnswerItem[]) || []) as MasteryAnswerItem[];
	return Math.max(tabStore.length || 0, globalStore.length || 0);
}

/**
 * 解析页逐题标注「答案是否已记录」。
 *
 * 让用户一眼看出重做时会用哪些答案 —— 已记录的题在重做轮直接命中本地表，
 * 不会再去 AI 搜题；没记录的才会走题库缓存/搜题。
 */
async function markPreviewAnswerBadges() {
	const items = Array.from(document.querySelectorAll<HTMLElement>('.question-item'));
	for (const item of items) {
		const titleEl = item.querySelector<HTMLElement>('.quest-title');
		const title = (titleEl?.innerText || '').trim();
		if (!titleEl || !title) continue;
		if (item.querySelector('.hh-answer-badge')) continue;

		const recorded = !!(await lookupMasteryAnswer(title));
		const badge = document.createElement('span');
		badge.className = 'hh-answer-badge';
		badge.textContent = recorded ? '✓ 已记录答案' : '未记录';
		badge.style.cssText = [
			'display:inline-block',
			'margin-left:8px',
			'padding:1px 8px',
			'border-radius:10px',
			'font-size:12px',
			'line-height:18px',
			'vertical-align:middle',
			'white-space:nowrap',
			recorded
				? 'background:#e8f7ee;color:#1a9e4b;border:1px solid #b6e6c9'
				: 'background:#f5f5f5;color:#8c8c8f;border:1px solid #e0e0e0'
		].join(';');
		titleEl.appendChild(badge);
	}
}

/** 结果页在「查看作答记录与解析」旁标注答案库规模 */
async function markResultAnswerTip() {
	const link = document.querySelector<HTMLElement>('.line1-count-link');
	if (!link || link.querySelector('.hh-answer-tip')) return;

	const total = await countMasteryAnswers();
	if (total === 0) return;

	const tip = document.createElement('span');
	tip.className = 'hh-answer-tip';
	tip.textContent = `（答案库已记录 ${total} 题）`;
	tip.style.cssText = 'margin-left:8px;font-size:12px;color:#8c8c8f;font-weight:400;';
	link.appendChild(tip);
}

/**
 * 解析页核心：抄答案 → 点「重新答题」重做这套题。
 *
 * 抽成模块级是因为有两条进入路径：
 *
 * 1. 结果页流程里点完「查看作答记录与解析」后直接接着做（SPA 路由，页面不重载，
 *    `onhistorychange` 触发的那次接管会被 `pointExamRunning` 挡掉，必须由结果页自己接上）；
 * 2. 页面重载后由 `collectPreviewAnswers` 方法接管。
 *
 * `back` 可以为空：用户自己在解析页点「抄答案并重做」时没有返回地址，
 * 这时重做失败就原地提示，不往回跳。
 */
async function collectPreviewAnswersCore(back: { url?: string; at?: number } | null): Promise<void> {
	if (previewCollectRunning) return;
	previewCollectRunning = true;
	try {
		// 题目是异步渲染的：等数量稳定（连续两次相同）再抄，避免只抄到一半
		let lastCount = -1;
		for (let i = 0; i < 15; i++) {
			const count = document.querySelectorAll('.question-item').length;
			if (count > 0 && count === lastCount) break;
			lastCount = count;
			await $.sleep(1000);
		}

		const items = Array.from(document.querySelectorAll<HTMLElement>('.question-item'));
		const collected: { title: string; answer: string }[] = [];
		for (const item of items) {
			const title = (item.querySelector<HTMLElement>('.quest-title')?.innerText || '').trim();
			const answerText = (item.querySelector<HTMLElement>('.answer-title')?.innerText || '')
				.replace(/参考答案[:：]/, '')
				.trim();
			if (!title || !answerText) continue;
			collected.push({ title, answer: answerText });
		}

		if (collected.length === 0) {
			// 没抄到答案就重做纯属浪费一次机会，直接回去
			$message.warn({ content: '解析页未解析到题目', duration: 0 });
			$console.warn('[掌握度] 解析页未解析到题目');
			if (back?.url) {
				await $store.setTab(ZHS_MASTERY_RETURN_KEY, { ...back, at: Date.now() });
				await $.sleep(2000);
				location.replace(back.url);
			}
			return;
		}

		// 先 await 保证写进 tab 级存储（有回执），再往下点「重新答题」跳走
		await saveMasteryAnswers(collected);
		// 抄完立刻回标：让用户看到每道题的答案状态（重做轮会直接用这些）
		await markPreviewAnswerBadges();
		/**
		 * 只写本地答案表，不往公共题库缓存里塞：
		 * localQuestionCaches 只有 200 条上限，掌握度题目多的时候
		 * 会把用户自己攒的题库缓存挤掉。
		 */
		$message.success({
			content: `已记录 ${collected.length} 道题的正确答案，正在重做这套题`,
			duration: 5
		});
		$console.log(`[掌握度] 已记录 ${collected.length} 道题的正确答案`);

		/**
		 * 抄完答案直接点「重新答题」重做这套题。
		 *
		 * 它走的就是「去提升」那套 practiceHandle（同一个 examTestId / paperId），
		 * 所以题目和选项顺序都不变，抄下来的字母答案可以直接用；
		 * 比「回学习页 → 再点去提升」少绕两跳，也不会让学习页重播视频。
		 */
		const retry = ((await $store.getTab(ZHS_MASTERY_RETRY_KEY)) || { count: 0 }) as { count?: number };
		await $store.setTab(ZHS_MASTERY_RETRY_KEY, { count: (retry.count || 0) + 1 });
		// 刷新 at：万一重做这条路走不通退回学习页，标记也不会被判过期
		await $store.setTab(
			ZHS_MASTERY_RETURN_KEY,
			back ? { ...back, at: Date.now(), skipReplay: true } : null
		);

		/**
		 * 「重新答题」必须等页面把 `examInfo` 拉回来才点得动。
		 *
		 * 解析页 `mounted` 时才调 `startCreatePagerByKenoledgeId` 拿 `examInfo`
		 *（里面是 examTestId / paperId / questionNum），而题目列表 `.question-item`
		 * 是另一个接口 `getUserAnswer` 渲染的，通常先出来。这时候点按钮，
		 * `practiceHandle` 里的 `this.examInfo.questionNum` 还是 undefined，
		 * `openExam` 拿到空参数直接失败 —— 而且失败是静默的，页面上什么都不显示。
		 * 所以先等几秒再点，点不动就重试几次。
		 */
		await $.sleep(3000);

		// 有桌面端就用 Playwright 真点（最可靠），浏览器独立运行时退回 DOM 点击
		const remotePage = await BackgroundProject.scripts.dev.methods.getRemotePlaywrightCurrentPage();

		for (let attempt = 0; attempt < 3; attempt++) {
			const found = findVisibleClickableByText(/^重新答题$/);
			if (!found) break;
			// 平台把 onClick 绑在 div.submit 上，优先点它本身
			const againBtn = found.closest<HTMLElement>('.submit') || found;

			$message.info({
				content: attempt === 0 ? '正在重做这套题' : `正在重试重做（第 ${attempt + 1} 次）`
			});
			$console.log(
				`[掌握度] 点击「重新答题」第 ${attempt + 1} 次：${againBtn.tagName}.${againBtn.className}（${remotePage ? 'Playwright' : 'DOM'}）`
			);

			await clickElement(remotePage, againBtn);

			// 整页跳回试卷页，脚本上下文到此结束
			for (let i = 0; i < 6; i++) {
				await $.sleep(1000);
				if (location.href.includes(ZHS_POINT_EXAM_HOST)) return;
			}
			$console.log('[掌握度] 未进入试卷页，等待接口就绪后重试');
			await $.sleep(2000);
		}

		/**
		 * 自动点击没生效：答案已经记好了，别白抄 —— 提示用户手动点一下，
		 * 手动点进去照样能命中刚抄的答案。留 30 秒窗口，没动就回学习页继续刷课。
		 */
		$message.warn({
			content: '答案已记录。若没有自动重做，请手动点右上角「重新答题」（30 秒后返回学习页）',
			duration: 0
		});
		$console.warn('[掌握度] 自动点击「重新答题」未生效，等待手动点击');
		for (let i = 0; i < 30; i++) {
			await $.sleep(1000);
			if (location.href.includes(ZHS_POINT_EXAM_HOST)) return;
		}

		// 30 秒还没进去：退回学习页重新点「去提升」
		// 退回学习页：把重做标记置为 active，学习页会用「重做上限」而不是单节练习次数放行
		await $store.setTab(ZHS_MASTERY_RETRY_KEY, { count: (retry.count || 0) + 1, active: true });
		await $store.setTab(
			ZHS_MASTERY_RETURN_KEY,
			back ? { ...back, at: Date.now(), skipReplay: true } : null
		);
		await $.sleep(2000);
		if (back?.url) location.replace(back.url);
	} finally {
		previewCollectRunning = false;
	}
}

/** 从文本节点往上找真正带点击行为的容器（最多 4 层） */
function findClickableAncestor(el: HTMLElement): HTMLElement {
	let cur: HTMLElement | null = el;
	for (let i = 0; i < 4 && cur; i++) {
		if (isProbablyClickable(cur)) return cur;
		cur = cur.parentElement;
	}
	return el;
}

/** 元素是否像个可点按钮（平台大量用 div + onClick，标签名靠不住） */
function isProbablyClickable(el: HTMLElement): boolean {
	const cls = typeof el.className === 'string' ? el.className : '';
	// 平台用 noNext 表示「已经是最后一题」，容器虽然还带 next-topic 但不能点
	if (/noNext|nopre|no-?next/i.test(cls)) return false;

	const tag = el.tagName;
	if (tag === 'BUTTON' || tag === 'A') return true;
	if (el.getAttribute('role') === 'button') return true;

	if (/btn|button|click|submit|to-improve|next-topic/i.test(cls)) return true;

	try {
		return getComputedStyle(el).cursor === 'pointer';
	} catch {
		return false;
	}
}

/**
 * 元素自身或近亲是否处于「禁用/置灰」态
 *
 * 智慧树的置灰不是原生 disabled：最后一题时把 `.next-topic.next-t` 换成
 * `.next-topic.noNext`（按钮仍是可点的 div，UIA 的 IsEnabled 也还是 true），
 * 所以只能靠类名 + 计算样式判断，否则兜底选择器会一直找到这个灰按钮，死循环。
 */
function isDisabledLike(el: HTMLElement): boolean {
	let cur: HTMLElement | null = el;
	for (let i = 0; i < 4 && cur; i++) {
		if ((cur as HTMLButtonElement).disabled) return true;
		if (cur.getAttribute('aria-disabled') === 'true') return true;

		const cls = typeof cur.className === 'string' ? cur.className : '';
		// next-topic 的置灰态：`.next-topic.noNext` / `.pre-topic.nopre`（CSS 里颜色变成 #9c9c9c）
		if (/(^|[\s_-])(noNext|nopre|no-?next|disabled?|forbid|is-disabled)([\s_-]|$)/i.test(cls)) return true;

		try {
			const style = getComputedStyle(cur);
			if (style.pointerEvents === 'none') return true;
			if (style.cursor === 'not-allowed') return true;
			// 置灰按钮通常压了透明度；阈值取 0.5，正常按钮不会这么低
			const opacity = parseFloat(style.opacity);
			if (Number.isFinite(opacity) && opacity > 0 && opacity < 0.5) return true;
		} catch (e) {
			// 拿不到样式就当没禁用，不阻塞点击
		}

		cur = cur.parentElement;
	}
	return false;
}

/**
 * 按文案找可见、未禁用的可点击元素
 *
 * 智慧树试卷页的「提交作业 / 上一题 / 下一题」都**不是** `<button>`，
 * 而是绑了 onClick 的 div/span（UI Automation 里只会报成 Text），
 * 所以不能只扫 `button / .el-button`；这里连普通容器一起扫，
 * 命中后向上找带 cursor:pointer 或 btn 类名的最近祖先作为点击目标。
 *
 * 用 textContent 而不是 innerText 做匹配：innerText 会触发 reflow，
 * 而这里要把整页扫一遍，代价太大。容器节点的文本很长，用长度剪枝挡掉。
 */
function findVisibleClickableByText(text: RegExp, root: ParentNode = document): HTMLElement | undefined {
	const candidates = Array.from(
		root.querySelectorAll<HTMLElement>('button, a, li, div, span, [role="button"]')
	);

	for (const el of candidates) {
		const raw = (el.textContent || '').replace(/\s+/g, '');
		// 按钮文案都很短，超过 12 个字基本是容器
		if (!raw || raw.length > 12) continue;
		if (!text.test(raw)) continue;
		if ((el as HTMLButtonElement).disabled) continue;
		if (typeof el.className === 'string' && /disabled/i.test(el.className)) continue;
		if (!isElementVisible(el)) continue;

		const target = findClickableAncestor(el);
		// 命中的可能是置灰按钮（如最后一题的「下一题」），必须排除，否则会一直点它
		if (isDisabledLike(target)) continue;
		return target;
	}
	return undefined;
}

/**
 * 等章节列表和「已完成」标记渲染稳定
 *
 * 首次进入（或刷新、脚本重启）学习页时，平台会先把章节列表渲染出来，
 * 「已完成」标记（.time_icofinish 等）要等接口回包后再补样式，
 * 实测两者差 200~300ms。而脚本在列表一出现就去算「下一个该学哪一节」，
 * 那一刻所有项看起来都是「未完成」，于是永远选中列表第一个，
 * 表现为每次重启都回头重播第一个已经看完的视频。
 *
 * 这里连续多次采样（列表数量 + 完成标记数量）都不再变化才认为渲染稳定。
 */
async function waitJobListSettled(timeout = 6000, step = 300): Promise<void> {
	const snapshot = () => {
		const nodes = document.querySelectorAll(
			'.clearfix.video, .child-main, .source-icon, .el-tree-node, .chapter-content-second, .resources-item'
		);
		let finished = 0;
		nodes.forEach((node) => {
			if (
				node.querySelector(
					'.time_icofinish, .finish-icon, .finished-icon, .isFinish, label.success, i.select'
				)
			) {
				finished++;
			}
		});
		return `${nodes.length}:${finished}`;
	};

	const deadline = Date.now() + timeout;
	let last = '';
	let stable = 0;
	while (Date.now() < deadline) {
		await $.sleep(step);
		const now = snapshot();
		// 列表还没渲染出来时（0:0）不算稳定，继续等
		if (now === last && now !== '0:0') {
			stable++;
			if (stable >= 2) return;
		} else {
			stable = 0;
		}
		last = now;
	}
}

/** 远程动作超时哨兵 */
const ACTION_TIMEOUT = Symbol('action-timeout');

/**
 * 给远程（桌面端 Playwright）动作加超时
 *
 * 远程点击是把动作丢给桌面端浏览器执行的，请求一旦没人应答就永远不 resolve。
 * 之前弹题处理链就卡在这一步：日志停在「AI 题库作答成功 / 未匹配」，弹窗一直挂在页面上，
 * 而且整条轮询链从此死掉，后面的弹题都不再处理。加超时后至少能继续走本地兜底点击。
 */
function withTimeout<T>(task: Promise<T> | void, ms: number, label: string): Promise<T | typeof ACTION_TIMEOUT> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<typeof ACTION_TIMEOUT>((resolve) => {
		timer = setTimeout(() => {
			$console.warn(`${label}超过 ${ms}ms 未返回，改用本地点击兜底`);
			resolve(ACTION_TIMEOUT);
		}, ms);
	});
	// 动作正常返回时清掉计时器，否则超时到了还会补打一条「超过 xx ms 未返回」的误报
	const guarded = Promise.resolve(task).then(
		(value) => {
			if (timer !== undefined) clearTimeout(timer);
			return value;
		},
		(error) => {
			if (timer !== undefined) clearTimeout(timer);
			throw error;
		}
	);
	return Promise.race([guarded as Promise<T>, timeout]);
}

/**
 * 弹题选项的候选点击目标（按优先级）
 *
 * 各平台选项的外层容器里往往还有一层真正带点击逻辑的节点
 * （.topic-item / label / 原生 input），只点最外层 li 时事件冒泡不会向下传递，
 * 内部的处理函数收不到，表现就是「点了没反应」。
 *
 * 共享课弹题的真实结构（#playTopic-dialog）：
 *   li.topic-item > span.topic-option-item 「A.」 + div.item-topic 「对」
 * 选中态挂在最内层 div.item-topic 的 active 类上，所以内层节点也要单独试一次。
 */
function quizClickTargets(el: HTMLElement): HTMLElement[] {
	const targets: HTMLElement[] = [];
	const push = (node: Element | null | undefined) => {
		if (node instanceof HTMLElement && targets.indexOf(node) === -1) {
			targets.push(node);
		}
	};
	push(el);
	push(el.querySelector('.topic-item, .option-item, .option-content, label'));
	// 内层选项文字节点：平台把选中态和点击处理都绑在这里
	push(el.querySelector('.item-topic'));
	push(el.querySelector('.topic-option-item'));
	push(el.querySelector('input[type="radio"], input[type="checkbox"]'));
	push(el.parentElement);
	return targets;
}

/** 「读不到选中态」最多提示 3 次：既要能排查，又不能每道题都刷屏 */
let quizSelectStateWarned = 0;

/**
 * 判断小组弹题的题型
 *
 * 共享课的判断题选项就是「A.对 / B.错」：没有 input、容器也没有 checkbox 类名，
 * 只按容器判只能得出 single，于是提示词要求 AI 回字母，白白丢掉一次精确匹配的机会。
 * 这里用选项文字反推判断题，让 AI 按要求直接回选项文字。
 */
function guessDialogQuizType(optionElements: HTMLElement[]): 'single' | 'multiple' | 'judgement' {
	if (optionElements[0]?.closest('.checkbox')) return 'multiple';
	if (optionElements.length === 2) {
		const polarities = optionElements.map((el) => judgeAnswerOf(el.textContent || ''));
		if (polarities.filter(Boolean).length === 2 && polarities[0] !== polarities[1]) return 'judgement';
	}
	return 'single';
}

/**
 * 点击一个弹题选项，并确认它真的被选中
 *
 * 旧实现发一次点击就当成功，于是日志打印「作答成功」但页面毫无变化：
 * 远程页面的元素点击是按元素中心坐标发真实鼠标事件，弹窗刚渲染完 / 被遮罩 /
 * 坐标落在视口外时会静默点空（异常还被吞掉了），从日志上完全看不出来。
 * 这里改成：点击 → 回读选中态 → 换目标重试 → 换手段（合成鼠标序列）重试。
 *
 * @returns 是否确认到选中态
 */
async function clickQuizOption(el: HTMLElement, remotePage?: RemotePage | void): Promise<boolean> {
	if (isChoiceSelected(el)) return true;

	const targets = quizClickTargets(el);

	// 先瞬时滚动到位，避免远程点击内部的平滑滚动尚未结束就取了旧坐标
	try {
		el.scrollIntoView({ block: 'center' });
	} catch {
		// 部分容器不支持，忽略
	}
	await $.sleep(200);

	// 第一轮：真实鼠标点击
	for (const target of targets) {
		let timedOut = false;
		try {
			if (remotePage) {
				timedOut = (await withTimeout(remotePage.click(target), 5000, '弹题选项远程点击')) === ACTION_TIMEOUT;
			} else {
				trustedClick(target);
			}
		} catch (error: any) {
			$console.warn('弹题选项点击异常：' + ((error && error.message) || String(error)));
		}
		await $.sleep(300);
		if (isChoiceSelected(el)) return true;
		// 远程通道已经挂了，再换目标也是白等，直接走合成点击
		if (timedOut) break;
	}

	// 第二轮：合成完整鼠标序列，不依赖坐标，遮挡/滚出视口时同样有效
	for (const target of targets) {
		trustedPointerClick(target);
		await $.sleep(300);
		if (isChoiceSelected(el)) return true;
	}

	if (quizSelectStateWarned < 3) {
		quizSelectStateWarned++;
		const rect = el.getBoundingClientRect();
		const cls = (node: Element) => {
			const name = typeof (node as HTMLElement).className === 'string' ? (node as HTMLElement).className : '';
			return name ? name.trim().replace(/\s+/g, '.') : node.tagName.toLowerCase();
		};
		const inner = Array.from(el.querySelectorAll('*'))
			.slice(0, 4)
			.map(cls)
			.join(' , ');
		$console.warn(
			`弹题选项点击后读不到选中态（${Math.round(rect.width)}x${Math.round(rect.height)}，` +
				`通道：${remotePage ? '远程' : '本地'}，li=「${cls(el)}」，内部=「${inner}」）。` +
				'已继续处理，但平台可能没记录这次作答 —— 请把这条日志反馈过来以便适配页面结构'
		);
	}
	return false;
}

/**
 * 2024 下半年智慧树更新至两个版本，其中一个改进了部分UI，所以这里使用两个处理器 StudyVideoH5,FusionCourseH5 对不同UI进行处理
 */
interface ZHSProcessor {
	remotePage: RemotePage | undefined | void;
	/** 视频内题目（弹题）作答策略 */
	quizStrategy: VideoQuizStrategy;
	init?(): void;
	getCourseName(): string;
	getChapterName(root: HTMLElement): string;
	hasJob(): boolean;
	getNext(opts: { next: boolean; restudy: boolean }): HTMLElement | undefined;
	hideDialog(): void;
	handleTestDialog(remotePage?: RemotePage): void | Promise<void>;
	switchPlaybackRate(rate: number, remotePage?: RemotePage): void | Promise<void>;
	switchLine(definition: 'line1bq' | 'line1gq', remotePage?: RemotePage): void | Promise<void>;
}

class StudyVideoH5 implements ZHSProcessor {
	remotePage: RemotePage | undefined = undefined;
	/** 视频内题目（弹题）作答策略，由脚本配置注入 */
	quizStrategy: VideoQuizStrategy = 'random';

	/**
	 * 按策略作答一组（一道题）选项
	 *
	 * - ai：连接题库（含 AI 答题）自动选择答案，未匹配时随机兜底
	 * - random：随机选择一个选项
	 *
	 * @returns 是否成功点击了选项
	 */
	async answerQuiz(options: {
		root: HTMLElement;
		optionElements: HTMLElement[];
		type?: 'single' | 'multiple' | 'judgement';
		/** 是否通过远程控制页面点击 */
		remotePage?: RemotePage;
	}): Promise<boolean> {
		const { root, optionElements, type, remotePage } = options;
		if (optionElements.length === 0) return false;

		const click = async (el: HTMLElement) => {
			// 点击后回读选中态，未选中会自动换目标/换手段重试；返回值用于判定是否真的选中
			const ok = await clickQuizOption(el, remotePage);
			await $.sleep(200);
			return ok;
		};

		if (this.quizStrategy === 'ai') {
			try {
				// 把题库数量打出来：一次就能分清「没配」「配了但全被禁用」「正常」
				let total = -1;
				let enabled = -1;
				try {
					total = (CommonProject.scripts.settings.cfg.answererWrappers || []).length;
					enabled = (CommonProject.scripts.settings.methods.getWorkOptions().answererWrappers || []).length;
				} catch {
					total = -1;
				}
				$console.log(
					total >= 0
						? `正在使用 AI 题库作答视频内题目（题库 ${total} 个，启用 ${enabled} 个）...`
						: '正在使用 AI 题库作答视频内题目...'
				);
				const ret = await answerVideoQuiz({
					root,
					optionElements,
					type,
					click
				});
				if (ret.ok) {
					$console.log(`AI 题库作答成功：${ret.title} => ${ret.answers.join(' / ')}`);
					return true;
				}
				// 答案已经选出来了，只是点击没落地：这种情况再随机点一次只会把刚选中的覆盖掉
				if (ret.answers.length > 0) {
					$console.warn(
						`AI 题库已选出答案但点击未生效（${ret.error || '未回显选中态'}）：` +
							`${ret.title} => ${ret.answers.join(' / ')}`
					);
					return false;
				}
				$console.warn(`AI 题库未匹配到答案（${ret.error || '未知原因'}），将随机作答：${ret.title}`);
			} catch (error: any) {
				$console.error('AI 题库作答失败：' + ((error && error.message) || String(error)));
			}
		}

		const target = optionElements[Math.floor(Math.random() * optionElements.length)];
		if (target) {
			await click(target);
			return true;
		}
		return false;
	}

	async init() {
		this.remotePage = await BackgroundProject.scripts.dev.methods.getRemotePlaywrightCurrentPage();
		if (!this.remotePage) {
			$playwright.showError();
			await new Promise<void>((resolve) => {
				const check = async () => {
					const page = await BackgroundProject.scripts.dev.methods.getRemotePlaywrightCurrentPage();
					if (page) {
						this.remotePage = page;
						$message.success({ content: '已连接，即将开始学习', duration: 3 });
						resolve();
					} else {
						setTimeout(check, 1000);
					}
				};
				setTimeout(check, 1000);
			});
		}
	}

	getCourseName() {
		return $el('.source-name')?.textContent || '无名称';
	}

	getChapterName(root: HTMLElement): string {
		return root.querySelector('.catalogue_title')?.textContent || '未知章节';
	}

	getNext(opts: { next: boolean; restudy: boolean }) {
		const videoItems = Array.from(document.querySelectorAll<HTMLElement>('.clearfix.video'));
		const isFinished = (el: HTMLElement) => el.querySelector('.time_icofinish') !== null || textSaysFinished(el);

		// 在全量列表中定位当前播放项：当前视频刚播完会立刻带上完成标记，
		// 若先过滤再找 current_play 会找不到而误选列表头部（跳回第一个视频）
		const currentIndex = videoItems.findIndex((el) => el.classList.contains('current_play'));
		if (currentIndex !== -1) {
			for (let i = currentIndex + (opts.next ? 1 : 0); i < videoItems.length; i++) {
				if (opts.restudy || isFinished(videoItems[i]) === false) {
					return videoItems[i];
				}
			}
			return undefined;
		}

		// 页面刚加载没有当前播放标记，回退为第一个未完成的视频
		return opts.restudy ? videoItems[0] : videoItems.find((el) => isFinished(el) === false);
	}

	async switchPlaybackRate(rate: number) {
		const controlsBar = $el('.controlsBar');
		const sl = $el('.speedList');
		if (controlsBar && sl) {
			controlsBar.style.display = 'block';
			sl.style.display = 'block';
			/**
			 * 兼容 1.0 和 1 的两个属性值匹配
			 */
			const rate_parsed = parseFloat(String(rate));
			const selector = `.speedList [rate="${rate_parsed === 1 ? '1.0' : rate}"],.speedList [rate="${
				rate_parsed === 1 ? '1' : rate
			}"]`;
			if (this.remotePage) {
				await this.remotePage.click(selector);
			} else {
				trustedClick(document.querySelector<HTMLElement>(selector));
			}
		}
	}

	async switchLine(definition: 'line1bq' | 'line1gq') {
		const controlsBar = $el('.controlsBar');
		const dl = $el('.definiLines');

		if (controlsBar && dl) {
			controlsBar.style.display = 'block';
			dl.style.display = 'block';
			// :not(.active) ： 如果已经是激活状态则不点击
			const selector = `.definiLines .${definition}:not(.active)`;
			const el = document.querySelector<HTMLElement>(selector);
			if (el) {
				if (this.remotePage) {
					await this.remotePage.click(selector);
				} else {
					await safeClick(el);
				}
			}
		}
	}

	hasJob() {
		return $$el('.clearfix.video')?.length > 0;
	}

	hideDialog() {
		/** 隐藏通知弹窗 */
		$$el('.el-dialog__wrapper').forEach((dialog) => {
			dialog.remove();
		});
	}

	/** 弹题轮询是否已在运行，避免重复调用叠加成多条循环同时点击同一个选项 */
	private quizDialogLoopRunning = false;

	async handleTestDialog() {
		if (this.quizDialogLoopRunning) return;
		this.quizDialogLoopRunning = true;
		try {
			// 原本靠尾部递归自己调自己实现「每 3 秒检测一次」，会无限堆积调用栈，
			// 这里改成普通循环，语义不变但不会泄漏
			while (state.study.stop === false) {
				try {
					await this.answerTestDialogOnce();
				} catch (error: any) {
					// 单次处理失败不能让整条轮询链死掉，否则后面所有弹题都没人管了
					$console.warn('弹题处理异常：' + ((error && error.message) || String(error)));
				}
				await $.sleep(3000);
			}
		} finally {
			this.quizDialogLoopRunning = false;
		}
	}

	/** 处理一次当前弹题弹窗（多页时逐页作答） */
	private async answerTestDialogOnce() {
		const dialog = $el('#playTopic-dialog');
		if (!dialog) return;
		const dialogRect = dialog.getBoundingClientRect();
		if (dialogRect.width <= 0 || dialogRect.height <= 0) return;

		// 单页弹题时 Element UI 往往不渲染分页器，此时按 1 页处理，
		// 否则单页弹题会因为取不到 .el-pager .number 被整题跳过。
		// 既没有分页器又没有题目容器，说明不是弹题对话框，直接放过。
		const pagerItems = $$el('#playTopic-dialog .el-pager .number');
		if (pagerItems.length === 0 && $$el('#playTopic-dialog .topic-item').length === 0) return;
		const pageCount = pagerItems.length === 0 ? 1 : pagerItems.length;

		for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
			// 每页都重新查询：翻页后 el-pager 会重新渲染，之前缓存的节点已脱离文档
			// 单页弹题没有分页器，item 为 undefined，此时不需要翻页直接往下作答
			const item = $$el('#playTopic-dialog .el-pager .number')[pageIndex];
			if (item && item.classList.contains('active') === false) {
				// 翻页同样优先走桌面端真实点击：平台的分页有时要求可信事件，
				// 远程不可用时（超时/未连上）再回退到本地合成点击
				let flipped = false;
				if (this.remotePage) {
					try {
						flipped =
							(await withTimeout(this.remotePage.click(item), 5000, '弹题翻页远程点击')) !== ACTION_TIMEOUT;
					} catch {
						flipped = false;
					}
				}
				if (!flipped) trustedClick(item);
				await $.sleep(500);
				// 翻页没成功就别在这一页上继续点选项了，等下一轮重试
				if (item.classList.contains('active') === false) {
					$console.warn('弹题翻页未生效，等下一轮重试');
					continue;
				}
			}

			// 每一页可能存在多道题，按题目容器分组作答
			const groups: { root: HTMLElement; optionElements: HTMLElement[] }[] = [];
			for (const topicItem of $$el('#playTopic-dialog .topic-item')) {
				// .topic-item 一般是 li 内的内容，点击目标是 li
				const li = (topicItem.closest('li') as HTMLElement) || topicItem;
				const root =
					(li.closest('.topic') as HTMLElement) ||
					(li.closest('.radio, .checkbox') as HTMLElement) ||
					(li.parentElement as HTMLElement);
				if (!root) continue;

				const exist = groups.find((g) => g.root === root);
				if (exist) {
					if (exist.optionElements.indexOf(li) === -1) exist.optionElements.push(li);
				} else {
					groups.push({ root, optionElements: [li] });
				}
			}

			if (groups.length !== 0) {
				await waitForCaptcha();
				// 最小化脚本窗口
				$render.moveToEdge();
				await $.sleep(1000);

				for (const group of groups) {
					// 选项已有选中态 = 这道题上一轮已经答过（弹窗还没关掉，3 秒后又进来一轮）。
					// 此时再调一次 answerQuiz 只会重复打印「作答成功」：clickQuizOption 对已选中的项
					// 直接返回 true、一次点击都不发，于是日志上多出一条完全没有实际动作的成功记录；
					// 随机策略下还会把已经选对的答案覆盖成别的选项。
					if (group.optionElements.some((el) => isChoiceSelected(el))) {
						$console.log('该题已有选中选项，跳过重复作答');
						continue;
					}
					await this.answerQuiz({
						root: group.root,
						optionElements: group.optionElements,
						// 共享课弹题一般为单选；多选容器带 checkbox 类名；两个选项是「对/错」时按判断题
						type: guessDialogQuizType(group.optionElements),
						remotePage: this.remotePage || undefined
					});
					await $.sleep(500);
				}

				await $.sleep(1000);
			}
		}

		await $.sleep(1000);
		await this.closeTestDialog();
	}

	/** 关闭弹题弹窗：优先点「提交/确定」，再退回关闭按钮，并回读是否真的关掉 */
	private async closeTestDialog() {
		const dialogExists = () => {
			const dialog = $el('#playTopic-dialog');
			if (!dialog) return false;
			const rect = dialog.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		};

		const click = async (el: HTMLElement | null | undefined) => {
			if (!el) return;
			let done = false;
			try {
				if (this.remotePage) {
					done = (await withTimeout(this.remotePage.click(el), 4000, '弹题关闭按钮远程点击')) !== ACTION_TIMEOUT;
				}
			} catch {
				done = false;
			}
			// 远程点不到（超时/报错）就本地合成点击：弹窗关不掉比点错更糟
			if (!done) trustedClick(el);
			await $.sleep(800);
		};

		// 弹题一般需要提交后才算作答成功，只点关闭按钮可能被平台丢弃
		const buttons = $$el('#playTopic-dialog button, #playTopic-dialog .btn, #playTopic-dialog .close-btn');
		const submit = buttons.find((el) => /提交|确定|确认|知道了|继续/.test(el.textContent || ''));
		if (submit && dialogExists()) {
			await click(submit);
		}

		// 关闭类按钮按「页脚关闭 → 通用 .btn → 右上角 X」顺序逐个尝试，关掉即停
		const closeSelectors = [
			'#playTopic-dialog .close-btn',
			'#playTopic-dialog .dialog-footer .btn',
			'#playTopic-dialog .btn',
			'#playTopic-dialog .el-dialog__headerbtn'
		];
		for (const selector of closeSelectors) {
			if (!dialogExists()) break;
			await click($el(selector));
		}

		if (dialogExists()) {
			$console.warn('弹题弹窗未能关闭，3 秒后重试');
		} else {
			$console.log('弹题弹窗已关闭');
		}
	}
}

/**
 * AI 助教课程，为智慧课程分类中的新课程
 */
class FusionCourseH5 extends StudyVideoH5 implements ZHSProcessor {
	getCourseName() {
		// 无法读取课程名称
		return '智慧课程-AI';
	}

	getChapterName(root: HTMLElement): string {
		// AI 助教课有两种进度模式，一个是百分百，一个是必学项目进度条
		const is_resource_box_mode = !!document.querySelector('.resource-box');
		if (is_resource_box_mode) {
			// 小节名称
			const card_name = root.querySelector('.file-name');
			if (card_name) {
				return card_name.textContent || '未知章节';
			}
		}
		return super.getChapterName(root);
	}

	getNext(opts: { next: boolean; restudy: boolean }) {
		// AI 助教课有两种进度模式，一个是百分百，一个是必学项目进度条
		const is_resource_box_mode = !!document.querySelector('.resource-box');
		if (is_resource_box_mode) {
			// 检测小节

			const getNextCard = () => {
				const cards = Array.from(document.querySelectorAll('.resources-item'));

				let target_el;
				let start = false;
				for (let index = 0; index < cards.length; index++) {
					const card = cards[index];
					if (start) {
						if (opts.restudy) {
							target_el = card;
							break;
						} else {
							if (card.querySelector('.isFinish')) {
								continue;
							}
							target_el = card;
							break;
						}
					}
					if (card.className.includes('active')) {
						start = true;
					}
				}

				return target_el;
			};

			const next_card = getNextCard();
			if (next_card) {
				return next_card as HTMLElement;
			}
		}

		const videoItems = Array.from(document.querySelectorAll<HTMLElement>('.clearfix.video')).filter((el) => {
			if (is_resource_box_mode) {
				return !!el.querySelector('.resource-box');
			}
			return true;
		});

		console.log(videoItems);

		const isFinished = (el: HTMLElement) => {
			if (is_resource_box_mode) {
				const text = el.querySelector('.resource-text')?.textContent || '';
				const [progress, total] = text
					.replace('必学', '')
					.trim()
					.split('/')
					.map((s) => parseInt(s));
				// 解析失败时 parseInt 得到 NaN，!(NaN < NaN) 会把每一项都误判成已完成，
				// 直接返回会让脚本以为「全部学完」而停下，所以先兜到文本判定
				if (!Number.isFinite(progress) || !Number.isFinite(total)) {
					return textSaysFinished(el);
				}
				return progress >= total;
			}
			const num_el = el.querySelector('.progress-num');
			if (num_el && (num_el.textContent || '').replace(/\s+/g, '') === '100%') {
				return true;
			}
			return textSaysFinished(el);
		};

		// 在全量列表中定位当前播放项：当前视频刚播完会立刻带上完成标记，
		// 若先过滤再找 current_play/activeNode 会找不到而误选列表头部（跳回第一个视频）
		const currentIndex = videoItems.findIndex((el) =>
			el.classList.contains(is_resource_box_mode ? 'activeNode' : 'current_play')
		);
		if (currentIndex !== -1) {
			for (let i = currentIndex + (opts.next ? 1 : 0); i < videoItems.length; i++) {
				if (opts.restudy || isFinished(videoItems[i]) === false) {
					return videoItems[i];
				}
			}
			return undefined;
		}

		// 页面刚加载没有当前播放标记，回退为第一个未完成的视频
		return opts.restudy ? videoItems[0] : videoItems.find((el) => isFinished(el) === false);
	}
}

/**
 * 新共享课页面，为智慧课程分类中的新课程
 */
class StudyPlusH5 extends StudyVideoH5 implements ZHSProcessor {
	getCourseName() {
		return $el('.top-back-box > span:nth-child(2)')?.textContent?.match(/课程名称：(.+)/)?.[1] || '无名称';
	}

	getChapterName(item: HTMLElement): string {
		return item.parentElement?.textContent || '未知章节';
	}

	hasJob() {
		return $$el('.child-main')?.length > 0;
	}

	getNext(opts: { next: boolean; restudy: boolean }) {
		const videoItems = Array.from(document.querySelectorAll<HTMLElement>('.child-main')).filter((el) =>
			el.parentElement?.querySelector('.child-time')
		);
		console.log(videoItems);
		const isFinished = (el: HTMLElement) => !!el.parentElement?.querySelector('.finish-icon') || textSaysFinished(el);

		// 在全量列表中定位当前播放项：当前视频刚播完会立刻带上完成标记，
		// 若先过滤再找 current 会找不到而误选列表头部（跳回第一个视频）
		const currentIndex = videoItems.findIndex((el) => el.classList.contains('current'));
		if (currentIndex !== -1) {
			for (let i = currentIndex + (opts.next ? 1 : 0); i < videoItems.length; i++) {
				if (opts.restudy || isFinished(videoItems[i]) === false) {
					return videoItems[i];
				}
			}
			return undefined;
		}

		// 页面刚加载没有当前播放标记，回退为第一个未完成的视频
		return opts.restudy ? videoItems[0] : videoItems.find((el) => isFinished(el) === false);
	}

	hideDialog() {
		/** 隐藏通知弹窗 */
		$$el('.el-overlay,.el-dialog').forEach((dialog) => {
			dialog.style.display = 'none';
		});
	}

	async handleTestDialog(remotePage?: RemotePage) {
		const question_box = $el('.ai-test-question-wrapper');
		const done = $el('.ai-test-question-wrapper .done');
		if (question_box) {
			$message.info('正在关闭弹窗测验...');
			const close_btn = $el('.close-box', question_box);
			if (done) {
				if (close_btn) {
					if (remotePage) {
						await remotePage.click(close_btn);
					} else {
						await safeClick(close_btn);
					}
				}
			} else {
				const options = $$el('.options .option', question_box);
				if (options.length !== 0) {
					await waitForCaptcha();
					// 最小化脚本窗口
					$render.moveToEdge();
					await $.sleep(1000);

					await this.answerQuiz({
						root: question_box,
						optionElements: options,
						type: question_box.querySelector('.checkbox') ? 'multiple' : 'single',
						remotePage: remotePage || undefined
					});

					await $.sleep(1000);
				}
				await $.sleep(1000);
				const submit_btn = $el('.submit-btn .submits');
				if (submit_btn) {
					if (remotePage) {
						await remotePage.click(submit_btn);
					} else {
						await safeClick(submit_btn);
					}
				}
				await $.sleep(1000);

				if (close_btn) {
					if (remotePage) {
						await remotePage.click(close_btn);
					} else {
						await safeClick(close_btn);
					}
				}
			}
		}

		/**
		 * 每过三秒递归检测是否有弹窗
		 */
		await $.sleep(3000);
		await this.handleTestDialog(remotePage);
	}
}

/**
 * 2025-9月份新智慧学习页面，为智慧课程分类中的新课程
 */
class WishdomH5 extends StudyVideoH5 implements ZHSProcessor {
	getCourseName() {
		return $el('.course-name')?.textContent?.match(/课程名称：(.+)/)?.[1] || '无名称';
	}

	getChapterName(item: HTMLElement): string {
		return item.textContent || '未知章节';
	}

	hasJob() {
		return $$el('.chapter-content .chapter-content-second')?.length > 0;
	}

	getNext(opts: { next: boolean; restudy: boolean }) {
		const jobs = Array.from(document.querySelectorAll<HTMLElement>('.chapter-content .chapter-item'))
			.map((el) => {
				const children = el.querySelectorAll<HTMLElement>('.chapter-content-second');
				if (children.length > 0) {
					return Array.from(children);
				} else {
					return [el];
				}
			})
			.flat();

		console.log(jobs);
		const isFinished = (el: HTMLElement) => !!el.querySelector('.finish-icon') || textSaysFinished(el);

		// 在全量列表中定位当前播放项，从当前位置向后找第一个未完成任务，避免误选列表头部
		const currentIndex = jobs.findIndex((el) => el.classList.contains('current'));
		if (currentIndex !== -1) {
			for (let i = currentIndex + (opts.next ? 1 : 0); i < jobs.length; i++) {
				if (opts.restudy || isFinished(jobs[i]) === false) {
					return jobs[i];
				}
			}
			return undefined;
		}

		return opts.restudy ? jobs[0] : jobs.find((el) => isFinished(el) === false);
	}

	hideDialog() {
		/** 隐藏通知弹窗 */
		$$el('.el-overlay,.el-dialog').forEach((dialog) => {
			dialog.style.display = 'none';
		});
	}

	async handleTestDialog(remotePage?: RemotePage) {
		const question_box = $el('.ai-class-exercise-dialog');
		if (question_box) {
			$message.info('正在关闭弹窗测验...');

			// 弹窗内可能存在多道题，按题目容器分组作答
			const questions = $$el('.ques-list .item', question_box);
			const groups: { root: HTMLElement; optionElements: HTMLElement[] }[] = [];

			if (questions.length > 1) {
				for (const question of questions) {
					const options = $$el('.option', question);
					if (options.length) {
						groups.push({ root: question, optionElements: options });
					}
				}
			}

			// 兜底：按题目容器分组失败时，按整个弹窗作为一道题处理
			if (groups.length === 0) {
				const options = $$el('.ques-list .item .option', question_box);
				if (options.length) {
					groups.push({ root: questions[0] || question_box, optionElements: options });
				}
			}

			if (groups.length !== 0) {
				await waitForCaptcha();
				// 最小化脚本窗口
				CommonProject.scripts.render.methods.minimize();
				CommonProject.scripts.render.methods.setPosition(100, 200);
				await $.sleep(1000);

				for (const group of groups) {
					await this.answerQuiz({
						root: group.root,
						optionElements: group.optionElements,
						type: group.root.querySelector('.checkbox') ? 'multiple' : 'single',
						remotePage: remotePage || undefined
					});
					await $.sleep(500);
				}

				await $.sleep(1000);
			}
			await $.sleep(1000);

			const submit_btn = $el('.ai-class-exercise-dialog .el-dialog__footer .el-button.btn');
			if (submit_btn) {
				if (remotePage) {
					await remotePage.hover('.ai-class-exercise-dialog .el-dialog__footer .el-button.btn');
					await remotePage.click('.ai-class-exercise-dialog .el-dialog__footer .el-button.btn');
				} else {
					await safeClick(submit_btn);
				}
			}

			const close_btn = $el('.ai-class-exercise-dialog .header-icon');
			if (close_btn) {
				if (remotePage) {
					await remotePage.hover('.ai-class-exercise-dialog .header-icon');
					await remotePage.click('.ai-class-exercise-dialog .header-icon');
				} else {
					await safeClick(close_btn);
				}
			}

			// 如果无法关闭弹窗，后续版本只能强制删除
			// await $.sleep(1000);
			// document.querySelector('.components-box.has-compoent')?.remove();
			// document.querySelector('.transparent-mask')?.remove();
			$message.info('弹窗测验已关闭');
		}

		/**
		 * 每过三秒递归检测是否有弹窗
		 */
		await $.sleep(3000);
		await this.handleTestDialog(remotePage);
	}
}

/**
 * 2025-9月份教学空间-AI智慧学习页面，新系统
 */
class Hike extends StudyVideoH5 implements ZHSProcessor {
	getCourseName() {
		return '无名称';
	}

	getChapterName(item: HTMLElement): string {
		return item.textContent || '未知章节';
	}

	hasJob() {
		return document.querySelectorAll('.source-icon')?.length > 0;
	}

	getNext(opts: { next: boolean; restudy: boolean }) {
		let jobs = Array.from(document.querySelectorAll<HTMLElement>('.source-icon')).map(
			(el) => el.parentElement?.parentElement as HTMLElement
		);
		console.log(jobs);
		// 如果不是复习模式，则排除掉已经完成的任务
		if (!opts.restudy) {
			const total = jobs.length;
			jobs = jobs.filter((el) => {
				if (!el) {
					return false;
				}
				// i.select 是完成标记，类名失效时用「已完成」文案兜底
				return !(el.querySelector('i.select') || textSaysFinished(el));
			});
			console.log(`[鸿鹄易学] 章节共 ${total} 个，识别为已完成 ${total - jobs.length} 个，待学习 ${jobs.length} 个`);
		}

		for (let i = 0; i < jobs.length; i++) {
			const item = jobs[i];
			if (item.querySelector('.active-file')) {
				return jobs[i + (opts.next ? 1 : 0)];
			}
		}
		return jobs[0];
	}

	hideDialog() {
		/** 隐藏通知弹窗 */
		$$el('.el-overlay,.el-dialog').forEach((dialog) => {
			dialog.style.display = 'none';
		});
	}
}

class HikeV2 extends StudyVideoH5 implements ZHSProcessor {
	getCourseName() {
		return document.querySelector('.header-title-wrap')?.textContent || '无名称';
	}

	getChapterName(): string {
		return document.querySelector('.el-tree-node.is-current .file-name')?.textContent || '未知章节';
	}

	hasJob() {
		return document.querySelectorAll('.el-tree-node')?.length > 0;
	}

	getNext(opts: { next: boolean; restudy: boolean }) {
		let jobs = Array.from(document.querySelectorAll<HTMLElement>('.el-tree-node')).filter(
			(e) => e.querySelector('.el-tree-node__children')?.children.length === 0
		);
		console.log(jobs);
		// 如果不是复习模式，则排除掉已经完成的任务
		if (!opts.restudy) {
			const total = jobs.length;
			jobs = jobs.filter((el) => {
				// label.success 是完成标记，类名失效时用「已完成」文案兜底；
				// 已完成项若正好是当前项，会被一起过滤掉，下面的循环找不到它，
				// 于是从剩余列表第一个开始 —— 这正是想要的行为
				return !(el.querySelector('label.success') || textSaysFinished(el));
			});
			console.log(`[鸿鹄易学] 章节共 ${total} 个，识别为已完成 ${total - jobs.length} 个，待学习 ${jobs.length} 个`);
		}

		// 这里以前写成 classList.contains('.is-current')，classList 的参数不能带点号，
		// 条件恒为 false，循环永远不命中，于是每次调用都回退到 jobs[0]，
		// 表现为「明明后面还有没看的，却总是从列表第一个开始播」
		const currentIndex = jobs.findIndex((el) => el.classList.contains('is-current'));
		if (currentIndex !== -1) {
			return jobs[currentIndex + (opts.next ? 1 : 0)];
		}
		return jobs[0];
	}

	hideDialog() {
		/** 隐藏通知弹窗 */
		$$el('.el-overlay,.el-dialog').forEach((dialog) => {
			dialog.style.display = 'none';
		});
	}
}

/** 工程导出 */
export const ZHSProject = Project.create({
	name: '知到智慧树',
	domains: [
		'zhihuishu.com',
		// 2025下半学期新系统: AI智慧课程
		'hike-teaching-center.polymas.com'
	],
	scripts: {
		guide: new Script({
			name: '使用提示',
			matches: [
				['学习首页', 'https://onlineweb.zhihuishu.com/onlinestuh5'],
				['首页', 'https://www.zhihuishu.com/']
			],
			namespace: 'zhs.guide',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'请手动进入视频、作业、考试页面，脚本会自动运行。',
						'兴趣课会自动下一个，所以不提供脚本。'
					]).outerHTML
				}
			},
			oncomplete() {
				// 置顶
				CommonProject.scripts.render.methods.pin(this);
			}
		}),
		'gxk-study': new Script({
			name: '共享课-学习脚本',
			matches: [
				['共享课学习页面', 'studyvideoh5.zhihuishu.com'],
				['新共享课学习页面', 'studyplush5.zhihuishu.com'],
				['新版AI课页面', 'fusioncourseh5.zhihuishu.com/stuStudy'],
				['2025-9月新智慧共享课学习页面', 'studywisdomh5.zhihuishu.com/study/index']
			],
			namespace: 'zhs.gxk.study',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'章节测试请大家观看完视频后手动打开。',
						[
							'请大家仔细打开视频上方的”学前必读“，查看成绩分布。',
							'如果 “平时成绩-学习习惯成绩” 占比多的话，就需要规律学习。',
							'每天定时半小时可获得一分习惯分。',
							'如果不想要习惯分可忽略。'
						],
						'请使用时关闭卡巴斯基软件，否则会被检测出异常脚本。',
						'不要最小化浏览器，可能导致脚本暂停。',
						'运行中请将浏览器缩放调整至适合的大小，避免元素遮挡，无法点击',
						'例如：调整缩放到 50%，然后刷新页面即可'
					]).outerHTML
				},
				/** 学习记录 []  */
				studyRecord: {
					defaultValue: [] as {
						/** 学习日期 */
						date: number;
						courses: {
							/** 课程名 */
							name: string;
							/** 学习时间 */
							time: number;
						}[];
					}[],
					extra: {
						appConfigSync: false
					}
				},
				stopTimeMinutes: {
					label: '定时停止（分钟）',
					attrs: {
						type: 'number',
						min: 0,
						step: 1,
						title: '0 表示关闭；例如 30 = 30 分钟，90 = 1 小时 30 分钟；进入学习页面后开始计时',
						placeholder: '0 表示关闭，例如 30 = 30 分钟'
					},
					defaultValue: 0
				},
				restudy: restudy,
				reloadWhenError: {
					label: '黑屏自动刷新',
					attrs: { title: '视频黑屏或者检测不到视频时自动刷新页面', type: 'checkbox' },
					defaultValue: true
				},
				volume: volume,
				definition: definition,
				playbackRate: {
					label: '视频倍速',
					tag: 'select',
					attrs: { title: '目前智慧树倍速最高只能1.5x，超出有封号风险' },
					defaultValue: 1,
					options: [
						['1', '1 x'],
						['1.25', '1.25 x'],
						['1.5', '1.5 x']
					]
				},
				videoQuizStrategy: {
					label: '视频内题目',
					tag: 'select',
					defaultValue: 'random' as VideoQuizStrategy,
					options: [
						['ai', 'AI题库答题', '连接题库（含AI答题）自动选择答案，题库未配置或未匹配时随机作答'],
						['random', '随机答题']
					],
					attrs: {
						title:
							'视频播放过程中弹出的测验题。选择 AI题库答题 后会自动连接题库选择答案（需先在 通用-全局设置 中配置题库或 AI 答题），题库搜不到时回退为随机作答。'
					}
				}
			},
			methods() {
				return {
					/**
					 * 增加学习时间
					 * @param courseName 课程名
					 * @param val 增加的时间
					 */
					increaseStudyTime: (courseName: string, val: number) => {
						const records = this.cfg.studyRecord;
						// 查找是否存在今天的记录
						const record = records.find(
							(r) => new Date(r.date).toLocaleDateString() === new Date().toLocaleDateString()
						);
						let courses: {
							name: string;
							time: number;
						}[] = [];
						if (record) {
							courses = record.courses;
						} else {
							records.push({ date: Date.now(), courses: courses });
						}

						// 查找是否存在课程记录
						const course = courses.find((c) => c.name === courseName);
						if (course) {
							// 存在则累加时间
							course.time = course.time + val;
							// 历史遗留问题，之前的倍速没有转换为数字，导致可能显示为字符串
							if (typeof course.time === 'string') {
								course.time = parseFloat(course.time);
							}
						} else {
							// 不存在则新建
							courses.push({ name: courseName, time: 0 });
						}

						this.cfg.studyRecord = records;
					}
				};
			},
			onrender({ panel }) {
				panel.body.replaceChildren(
					h('hr'),
					$ui.button('检测是否需要规律学习', {}, (btn) => {
						btn.style.marginRight = '12px';
						btn.onclick = () => {
							const href = document.querySelector('[href*=stuLearnReportNew]')?.getAttribute('href') || '';
							if (href) {
								$modal.alert({
									title: '规律学习检测',
									content: `自动检测功能已失效，<a href="${href}"> -> 点击此处 <- </a> 前往成绩分析页面，点击 <b>“学习习惯”</b> 即可查看习惯分详情。`
								});
							} else {
								$modal.alert({
									title: '提示',
									content: '自动检测功能已失效，请自行前往成绩分析页面，点击学习习惯即可查看习惯分详情。'
								});
							}
						};
					}),
					$ui.button('查看学习记录', {}, (btn) => {
						btn.onclick = () => {
							$modal.alert({
								title: '学习记录',
								content: $ui.notes(
									this.cfg.studyRecord.map((r) => {
										const date = new Date(r.date);
										return [
											`${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date
												.getDate()
												.toString()
												.padStart(2, '0')}`,
											$ui.notes(r.courses.map((course) => `${course.name} - ${optimizeSecond(course.time)}`))
										];
									})
								)
							});
						};
					})
				);
			},
			onactive() {
				if (this.cfg.playbackRate) {
					// 转换为数字
					this.cfg.playbackRate = parseFloat(this.cfg.playbackRate.toString());
				}
			},
			async oncomplete() {
				// 置顶当前脚本
				CommonProject.scripts.render.methods.pin(this);

				const type = location.href.includes('fusioncourseh5')
					? 'AI课程'
					: location.href.includes('studyplush5')
					? '新共享课'
					: location.href.includes('studywisdomh5')
					? '新智慧共享课'
					: '共享课';

				const ProcessorConstructor = location.href.includes('fusioncourseh5')
					? FusionCourseH5
					: location.href.includes('studyplush5') || location.href.includes('studywisdomh5')
					? StudyPlusH5
					: StudyVideoH5;

				const processor = new ProcessorConstructor();
				// 注入视频内题目作答策略
				processor.quizStrategy = (this.cfg.videoQuizStrategy as VideoQuizStrategy) || 'random';
				// 策略改动立即生效：此前只在 oncomplete 读一次，改完配置必须停脚本再运行才生效
				this.onConfigChange('videoQuizStrategy', (curr) => {
					processor.quizStrategy = (curr as VideoQuizStrategy) || 'random';
					$console.log(`视频内题目策略已切换：${processor.quizStrategy === 'ai' ? 'AI题库答题' : '随机答题'}`);
				});

				// 10秒后还没加载出来，则结束
				setTimeout(() => {
					if (processor.hasJob() === false) {
						finishAlert();
					}
				}, 10 * 1000);

				const waitForVideoJob = () => {
					return new Promise<void>((resolve, reject) => {
						if (processor.hasJob()) {
							resolve();
						} else {
							setTimeout(() => {
								resolve(waitForVideoJob());
							}, 200);
						}
					});
				};

				await waitForVideoJob();

				// 初始化处理器
				await processor.init();

				// 监听定时停止（分钟）
				this.onConfigChange('stopTimeMinutes', (minutes) => {
					const value = parseFloat(String(minutes));
					if (!isFinite(value) || value <= 0) {
						$message.info({ content: '定时停止已关闭' });
						applyAutoStop(0);
					} else {
						applyAutoStop(value);
					}
				});

				// 监听音量
				this.onConfigChange('volume', (curr) => {
					state.study.currentMedia && (state.study.currentMedia.volume = curr);
				});

				// 监听速度
				this.onConfigChange('playbackRate', (curr) => {
					if (typeof curr === 'string') {
						this.cfg.playbackRate = parseFloat(curr);
					}
					processor.switchPlaybackRate(curr);
				});

				// 监听清晰度
				this.onConfigChange('definition', (curr) => {
					processor.switchLine(curr);
				});

				// 循环记录学习时间
				const recordStudyTimeLoop = () => {
					this.methods.increaseStudyTime(processor.getCourseName(), this.cfg.playbackRate);
					setTimeout(recordStudyTimeLoop, 1000);
				};

				// 检测是否需要学前必读
				closeDialogRead();
				// 循环记录学习时间
				recordStudyTimeLoop();
				// 自动暂停任务：桌面定时任务期间以桌面方案的时间为准，其余时候用自己的配置
				applyAutoStop(this.cfg.stopTimeMinutes);
				clearInterval(state.study.stopRefreshTimer);
				state.study.stopRefreshTimer = setInterval(() => {
					/** 已经暂停过就不再折腾（否则任务结束后会按自己的设置再暂停一次） */
					if (state.study.stop) return;
					/** 与桌面调度节拍一致：方案改动 / 任务开始结束都在 20 秒内跟上 */
					applyAutoStop(this.cfg.stopTimeMinutes);
				}, 20 * 1000);
				// 自动隐藏弹窗
				processor.hideDialog();
				// 自动过弹窗测验
				processor.handleTestDialog(processor.remotePage);

				setInterval(async () => {
					// 删除遮罩层
					$$el('.v-modal,.mask').forEach((modal) => {
						modal.remove();
					});
					// 定时显示进度条，防止消失
					fixProcessBar();
				}, 3000);

				$message.info({ content: '3秒后开始学习', duration: 3 });

				const remotePage = processor.remotePage;

				const study = async (opts: { next: boolean }) => {
					if (state.study.stop === false) {
						// 首次进入/刷新/重启时，章节列表比「已完成」标记先渲染，
						// 立刻算「下一个该学哪节」会把已完成项全当成未完成、选中列表第一个，
						// 于是每次重启都回头重播第一个视频。先等渲染稳定再决定。
						if (!opts.next) await waitJobListSettled();

						let item = processor.getNext({ next: opts.next, restudy: this.cfg.restudy });
						if (item) {
							const msg = '即将学习：' + processor.getChapterName(item);
							$message.info({ content: msg });
							$console.log(msg);
							await $.sleep(3000);
							// 双保险：点击前再复核一次，渲染仍比预期慢时以复核结果为准
							const recheck = processor.getNext({ next: opts.next, restudy: this.cfg.restudy });
							if (recheck && recheck !== item) {
								item = recheck;
								const recheckMsg = '复核后改为：' + processor.getChapterName(item);
								$message.info({ content: recheckMsg });
								$console.log(recheckMsg);
							}
							// 最小化脚本窗口
							$render.moveToEdge();
							// 点击侧边栏任务
							if (remotePage) {
								if (type === '新共享课') {
									await withTimeout(remotePage.click('.title-box'), 6000, '展开章节列表远程点击');
									await $.sleep(200);
								}
								// 远程动作必须带超时：页面没被桌面端接管时请求会被挂住或直接拒绝，
								// 没有超时整条学习链就卡在这里，界面一直停在「即将学习」不动
								await withTimeout(remotePage.click(item), 8000, '切换章节远程点击');
								await $.sleep(1000);
								// 两次点击修复黑屏问题
								await withTimeout(remotePage.click(item), 8000, '切换章节远程点击');
								await $.sleep(1000);
								// 远程没点动（页面未接管/被拦）就本地补一次，否则永远停在当前视频
								if (item.classList.contains('current_play') === false) {
									$console.warn('远程点击未生效，改用本地点击切换章节');
									await safeClick(item);
									await $.sleep(1000);
								}
							} else {
								await safeClick(item);
							}

							// 适配AI助教课程PPT跳过
							if (type === 'AI课程' && document.querySelector('.preview-warp .doc-box,.preview-warp .ppt-box')) {
								$message.info({ content: '检测到PPT资源，即将跳过...' });
								await $.sleep(2000);
								study({ next: true });
								return;
							}

							watch(
								processor,
								{
									reloadWhenError: this.cfg.reloadWhenError,
									volume: this.cfg.volume,
									playbackRate: this.cfg.playbackRate,
									definition: this.cfg.definition
								},
								{
									reload() {
										// 旧共享课页面点击右侧栏就能重新加载
										if (type === '共享课') {
											study({ next: false });
										} else {
											location.reload();
										}
									},
									onended({ next }) {
										study({ next });
									}
								}
							);
						} else {
							finishAlert();
						}
					} else {
						const msg = '检测到当前视频全部播放完毕，如果还有未完成的视频请刷新重试，或者打开复习模式。';
						$message.warn({ content: msg });
						CommonProject.scripts.settings.methods.notificationBySetting(msg, {
							duration: 0,
							extraTitle: '知道智慧树学习脚本'
						});
					}
				};
				// 当页面初始化时无需切换下一个视频，直接播放当前的。
				study({ next: false });
			}
		}),
		'gxk-work': new Script({
			name: '共享课-作业考试脚本',
			matches: [
				['共享课作业页面', 'zhihuishu.com/stuExamWeb.html#/webExamList/dohomework'],
				['共享课考试页面', 'zhihuishu.com/stuExamWeb.html#/webExamList/doexamination'],
				['作业考试列表', 'zhihuishu.com/stuExamWeb.html#/webExamList\\?']
			],
			namespace: 'zhs.gxk.work',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'自动答题前请在 “通用-全局设置” 中设置题库配置。',
						'可以搭配 “通用-在线搜题” 一起使用。',
						...gxk_read_notes
					]).outerHTML
				},
				workDelay: {
					label: '作业答题开始时间延迟（秒）',
					defaultValue: 3,
					attrs: { type: 'number', min: 1, step: 1, max: 10 }
				},
				readNotes: {
					defaultValue: false
				}
			},
			methods() {
				async function getWorkInfo(remotePage: RemotePage) {
					const isExam = location.href.includes('doexamination');
					let url = '';
					if (isExam) {
						url = '/taurusExam/gateway/t/v1/student/doExam';
					} else {
						url = '/studentExam/gateway/t/v1/student/doHomework';
					}
					return JSON.parse((await remotePage.waitForResponse(url)).body);
				}

				return {
					getWorkInfo: getWorkInfo,
					work: async () => {
						// 检查是否为软件环境
						const remotePage = await BackgroundProject.scripts.dev.methods.getRemotePlaywrightCurrentPage();
						// 检查是否为软件环境
						if (!remotePage) {
							return $playwright.showError();
						}

						// 等待试卷加载
						const isExam = location.href.includes('doexamination');
						const isWork = location.href.includes('dohomework');

						if (isExam || isWork) {
							const workInfo = await getWorkInfo(remotePage);

							// 移动到边缘
							$render.moveToEdge();
							CommonProject.scripts.render.methods.normal();
							// 固定脚本
							CommonProject.scripts.render.methods.pin(this);

							// 阅读须知
							if (this.cfg.readNotes === false) {
								const notes = $ui.notes(gxk_read_notes).outerHTML;
								const start = await new Promise<boolean>((resolve, reject) => {
									$modal.confirm({
										title: isExam ? '脚本考前须知' : '脚本作业须知',
										content: notes,
										confirmButtonText: '我已知晓，开始自动答题',
										cancelButtonText: '取消答题',
										maskCloseable: false,
										onConfirm: () => {
											this.cfg.readNotes = true;
											resolve(true);
										},
										onCancel() {
											resolve(false);
										}
									});
								});
								if (!start) {
									$message.info({ content: '已取消答题，如需答题请刷新页面重新开始。' });
									return;
								}
							}

							setTimeout(() => {
								$message.info({ content: `开始${isExam ? '考试' : '作业'}` });
								commonWork(this, {
									workerProvider: (opts) => gxkWorkAndExam(workInfo, opts),
									start_delay_seconds: this.cfg.workDelay ?? 3
								});
							}, 1000);
						} else {
							$message.info({ content: '请手动进入作业/考试，如果未开始答题，请尝试刷新页面。', duration: 0 });

							CommonProject.scripts.render.methods.pin(this);
						}
					}
				};
			},
			async onactive() {
				this.methods.work();
				/**
				 * 当页面从作业考试列表跳转到作业考试页面时，触发的是onhistorychange事件，而不是oncomplete事件。
				 */
				this.on('historychange', () => {
					this.methods.work();
				});
			}
		}),
		'smart-study': new Script({
			name: '新形态课程-学习脚本',
			matches: [
				['新形态课程学习页面', 'smartcoursestudent.zhihuishu.com/learnPage'],
				['新形态课程新域名学习页面', 'ai-smart-course-student-pro.zhihuishu.com/learnPage'],
				// 掌握度练习的第二层入口：整页跳转过来后旧脚本被销毁，靠这里重新接管去点「去提升」
				['新形态课程-知识点学习报告页', 'ai-smart-course-student-pro.zhihuishu.com/masteryHistory'],
				['新形态课程-知识点学习报告页旧域名', 'smartcoursestudent.zhihuishu.com/masteryHistory'],
				// 提交后平台自己跳到结果页/解析页，同样得靠这里接管收尾
				['新形态课程-知识点练习结果页', 'ai-smart-course-student-pro.zhihuishu.com/point/'],
				['新形态课程-知识点练习结果页旧域名', 'smartcoursestudent.zhihuishu.com/point/'],
				['新形态课程-知识点解析页', 'ai-smart-course-student-pro.zhihuishu.com/examPreview/'],
				['新形态课程-知识点解析页旧域名', 'smartcoursestudent.zhihuishu.com/examPreview/'],
				['新形态课程首页', 'smartcoursestudent.zhihuishu.com/singleCourse'],
				['新形态课程新域名课程首页', 'ai-smart-course-student-pro.zhihuishu.com/singleCourse']
			],
			namespace: 'zhs.smart.study',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'视频看完会自动点「去提升」做掌握度练习，答完自动提交并返回继续学习（可在设置里关闭）。',
						'掌握度练习次数可在设置中限制，避免掌握度未满时反复往返。',
						'不要最小化浏览器/关闭电脑屏幕，可能导致脚本暂停。',
						'任意选择一个章节，脚本会自动往下学“必学”课程。',
						'运行中请将浏览器缩放调整至适合的大小，避免元素遮挡，无法点击',
						'例如：调整缩放到 50%，然后刷新页面即可'
					]).outerHTML
				},
				switchMode: {
					label: '跳转模式',
					tag: 'select',
					defaultValue: 'job' as 'job' | 'all',
					options: [
						['job', '只跳转必学章节', '章节后面有必学，并且必学数量未完成的章节，如果全部完成将停止学习'],
						['all', '顺序跳转']
					]
				},
				restudy: restudy,
				volume: volume,
				definition: definition,
				playbackRate: {
					label: '视频倍速',
					tag: 'select',
					defaultValue: 1,
					attrs: { title: '目前智慧树倍速最高只能1.5x，超出有封号风险' },
					options: [
						['1', '1 x'],
						['1.25', '1.25 x'],
						['1.5', '1.5 x']
					]
				},
				autoImproveMastery: {
					label: '自动提升掌握度',
					attrs: {
						type: 'checkbox',
						title: '视频看完后，若视频下方出现「去提升」按钮，自动进入知识点练习（掌握度）；答完会自动提交并返回继续学习'
					},
					defaultValue: true
				},
				masteryImproveTimes: {
					label: '每节掌握度练习次数',
					defaultValue: 1,
					attrs: {
						type: 'number',
						min: 0,
						step: 1,
						max: 5,
						title: '同一个小节自动进入掌握度练习的最大次数，0 表示不自动进入。掌握度未到 100% 时会反复出现「去提升」，限制次数可避免来回往返'
					}
				},
				retryWhenNotFull: {
					label: '未满分自动重做',
					attrs: {
						type: 'checkbox',
						title: '答题提交后若没有全对：自动点「查看作答记录与解析」进入解析页，把正确答案记进题库缓存，再返回重做这套题。开启后练习次数上限改由下面一项控制'
					},
					defaultValue: true
				},
				retryMaxTimes: {
					label: '未满分重做上限',
					defaultValue: 3,
					attrs: {
						type: 'number',
						min: 1,
						step: 1,
						max: 10,
						title: '同一小节为了刷满掌握度最多自动重做几次（含第一次）。答完仍不满分就会停在这里，不再无限重刷'
					}
				}
			},
			oncomplete() {
				this.methods.start();
			},
			onhistorychange(type, ...args) {
				if (type === 'push') {
					this.methods.start();
				}
			},
			methods() {
				return {
					/**
					 * 知识点学习报告页接管：把页面上的「去提升」点进试卷页。
					 *
					 * 学习页点完「去提升」后落在 `/masteryHistory/...`，这一层才是真正
					 * `location.href` 跳试卷的入口。整页跳转会把学习页那套流程打断，
					 * 所以由本脚本在新页面重新启动后接着推进（SPA 切换时则直接复用前一段轮询）。
					 */
					resumeMasteryReport: async () => {
						if (masteryReportRunning) return;

						// 只接管从学习页「去提升」跳过来的会话；正常浏览报告页不打扰
						const pending = (await $store.getTab(ZHS_MASTERY_RETURN_KEY)) as
							| { url?: string; at?: number }
							| null;
						if (!pending?.url || Date.now() - (pending.at || 0) > 5 * 60 * 1000) return;

						masteryReportRunning = true;
						try {
							CommonProject.scripts.render.methods.pin(this);
							$message.info({ content: '正在打开掌握度练习试卷' });
							const ok = await advanceToPointExam();
							if (!ok) {
								$message.warn({
									content: '未能自动打开试卷，请手动点击页面上的「去提升」',
									duration: 0
								});
								$console.warn('知识点学习报告页未能进入试卷');
							}
						} finally {
							masteryReportRunning = false;
						}
					},
					/**
					 * 知识点练习结果页收尾。
					 *
					 * 提交后平台会立刻整页跳到 `/point/...`，试卷页那套收尾代码当场被销毁，
					 * 所以「回学习页 / 去解析页抄答案重做」都在这里做：
					 * - 全对 → 直接回学习页接着刷课；
					 * - 没全对且开了「未满分自动重做」且没超次数 → 点「查看作答记录与解析」抄答案；
					 * - 其它情况 → 回学习页，避免无限重刷。
					 */
					afterPointExam: async () => {
						if (pointExamRunning) return;

						const back = (await $store.getTab(ZHS_MASTERY_RETURN_KEY)) as
							| { url?: string; at?: number }
							| null;
						// 不是从学习页「去提升」进来的（用户自己点开的），不接管
						if (!back?.url) return;

						pointExamRunning = true;
						try {
							CommonProject.scripts.render.methods.pin(this);

							// 掌握度是接口回包的，等「总题数 / 已答对」渲染出来
							let total: number | null = null;
							let correct: number | null = null;
							for (let i = 0; i < 15; i++) {
								total = readStatNumber('总题数');
								correct = readStatNumber('已答对');
								if (total !== null && total > 0 && correct !== null) break;
								await $.sleep(1000);
							}

							const full = total !== null && correct !== null && total > 0 && correct >= total;
							$console.log(
								`[掌握度] 本次结果：${correct ?? '?'}/${total ?? '?'}${full ? '（已满分）' : ''}`
							);
							// 在「查看作答记录与解析」旁标出答案库规模，方便判断要不要再抄一遍
							await markResultAnswerTip();

							if (total === null || correct === null) {
								// 读不到成绩就别瞎重做，老老实实回学习页
								$message.warn({ content: '未能读取本次成绩，即将返回学习页', duration: 5 });
							} else if (!full && this.cfg.retryWhenNotFull) {
								const retry = ((await $store.getTab(ZHS_MASTERY_RETRY_KEY)) || { count: 0 }) as {
									count?: number;
								};
								const done = retry.count || 0;
								// 含首次：retryMaxTimes=3 表示这套题最多答 3 遍（首答 + 2 次重做）
								const limit = this.cfg.retryMaxTimes ?? 3;

								if (done + 1 < limit) {
									const link = findVisibleClickableByText(/^查看作答记录与解析$/);
									if (link) {
										$message.info({
											content: `未满分（${correct ?? '?'}/${total ?? '?'}），正在查看解析抄答案后重做（第 ${done + 2}/${limit} 遍）`
										});
										await safeClick(link);
										// SPA 路由，等页面切到解析页
										for (let i = 0; i < 10; i++) {
											await $.sleep(1000);
											if (location.pathname.includes(ZHS_EXAM_PREVIEW_PATH)) {
												/**
												 * 这里必须自己接着抄答案。
												 * SPA 切路由不会重载页面，`onhistorychange` 触发的那次接管
												 * 会被 `pointExamRunning` 挡掉，不接上就卡在解析页了。
												 */
												await collectPreviewAnswersCore(back);
												return;
											}
										}
									}
									$message.warn({ content: '未能打开解析页，即将返回学习页', duration: 5 });
								} else {
									$message.warn({
										content: `已答 ${done + 1} 遍仍未满分（上限 ${limit} 遍），即将返回学习页`,
										duration: 5
									});
								}
							}

							// 满分 / 不再重做 → 回学习页继续刷课
							// 先结束重做状态，否则学习页读到 active 会再开一轮
							await $store.setTab(ZHS_MASTERY_RETRY_KEY, { count: 0, active: false });

							const learnKey = (() => {
								try {
									return new URL(back.url!).pathname;
								} catch (e) {
									return '';
								}
							})();
							if (learnKey) {
								// 明确标记「本节刚练完」：学习页读到就跳过，不再依赖次数计算
								await $store.setTab(ZHS_MASTERY_SETTLED_KEY, { key: learnKey, at: Date.now() });
								// 双保险：把本节计次直接顶到上限，即使标记丢了也不会再进
								const times = ((await $store.getTab(ZHS_MASTERY_TIMES_KEY)) || {}) as Record<
									string,
									number
								>;
								const cap = Math.max(
									this.cfg.retryMaxTimes ?? 3,
									this.cfg.masteryImproveTimes ?? 1
								);
								await $store.setTab(ZHS_MASTERY_TIMES_KEY, {
									...times,
									[learnKey]: Math.max(times[learnKey] || 0, cap)
								});
							}

							// 刷新 at 让学习页知道「刚练完」，把视频进度顶到末尾而不是重播
							await $store.setTab(ZHS_MASTERY_RETURN_KEY, { ...back, at: Date.now() });
							$message.success({ content: '掌握度练习已完成，即将返回课程继续学习', duration: 5 });
							await $.sleep(3000);
							location.replace(back.url!);
						} finally {
							pointExamRunning = false;
						}
					},
					/**
					 * 知识点解析页接管（页面重载进入时走这里）。
					 *
					 * 结果页点完「查看作答记录与解析」是 SPA 路由，页面不重载，
					 * 那条路径由 `afterPointExam` 直接调 `collectPreviewAnswersCore` 接着做；
					 * 这里只负责「解析页被整页加载/用户刷新」的情况。
					 */
					collectPreviewAnswers: async () => {
						// 结果页流程正在接管时由它直接接着抄，这里不重复插手
						if (pointExamRunning) return;

						const back = (await $store.getTab(ZHS_MASTERY_RETURN_KEY)) as
							| { url?: string; at?: number }
							| null;

						if (!back?.url) {
							// 用户自己打开解析页复习：只标一下每题的答案状态，不强制重做
							for (let i = 0; i < 10; i++) {
								if (document.querySelectorAll('.question-item').length > 0) break;
								await $.sleep(1000);
							}
							await markPreviewAnswerBadges();
							$message.info({
								content: '已标注每题的答案状态。要重做请点右上角「重新答题」，答案会自动命中',
								duration: 8
							});
							return;
						}

						CommonProject.scripts.render.methods.pin(this);
						await collectPreviewAnswersCore(back);
					},
					start: async () => {
						// 提交后的解析页 / 结果页：不属于视频学习，单独接管
						if (location.pathname.includes(ZHS_EXAM_PREVIEW_PATH)) {
							await this.methods.collectPreviewAnswers();
							return;
						}
						if (location.pathname.includes(ZHS_POINT_RESULT_PATH)) {
							await this.methods.afterPointExam();
							return;
						}

						// 掌握度练习的第二层：知识点学习报告页，不涉及视频学习
						if (location.pathname.includes(ZHS_MASTERY_REPORT_PATH)) {
							await this.methods.resumeMasteryReport();
							return;
						}

						if (location.href.includes('singleCourse')) {
							$message.info({ content: '请点击任意章节开始进行自动学习', duration: 60 });
							return;
						}
						setExtensionAutomation(true, '智慧树课程学习');
						// 整个学习流程包一层 try/finally：手动停止 / 定时停止 / 全部完成都会熄灭流光。
						const runStudy = async () => {
							// 置顶当前脚本
							CommonProject.scripts.render.methods.pin(this);
							const processor = new StudyVideoH5();

							const getInfos = () => Array.from(document.querySelectorAll<HTMLElement>('.section-item-collapse-info'));
							const getChapterName = () =>
								(document.querySelector('.point-title-text')?.textContent || '未知章节') +
								'-' +
								(document.querySelector('[class*="card-container"].active .video-title')?.textContent || '未知小节');

							// 需点击的任务点，其他是是外部链接或者未知任务点
							const include_jobs = ['video', 'book', /** 一般是PPT */ 'other', /** 一般是文档 */ 'text'];

							const getNextJob = () => {
								const cards = Array.from(document.querySelectorAll('[class*="card-container"]'));

								// 如果没有正在选中的章节，证明第一个就是外链模式，此时默认点击第一个
								if (cards.some((card) => card.classList.contains('active')) === false) {
									return cards[0];
								}

								let target_el;
								const start_index = cards.findIndex((c) => c.classList.contains('active')) || 0;
								for (let index = start_index + 1; index < cards.length; index++) {
									const card = cards[index];

									if (this.cfg.restudy) {
										target_el = card;
										break;
									} else {
										if (card.querySelector('.finished-icon')?.textContent?.includes('已完成')) {
											continue;
										}
										target_el = card;
										break;
									}
								}
								return target_el;
							};
							const getNext = () => {
								const infos = getInfos();

								const works: { info: HTMLElement; progress: number; total: number }[] = [];

								for (let index = 0; index < infos.length; index++) {
									const info = infos[index];
									const text = info.querySelector('.collapse-info-progress .progress-text')?.textContent || '';

									if (this.cfg.switchMode === 'all') {
										works.push({
											info,
											progress: 0,
											total: 1
										});
									} else {
										const [progress, total] = text
											.replace('必学', '')
											.trim()
											.split('/')
											.map((s) => parseInt(s));
										if (progress < total) {
											works.push({ progress, total, info });
										}
									}
								}
								let start = false;
								for (let index = 0; index < works.length; index++) {
									const work = works[index];
									if (start) {
										if (work.progress < work.total) {
											return works[index].info;
										}
									}
									if (work.info.classList.contains('active')) {
										if (this.cfg.switchMode === 'all') {
											return works[index + 1].info;
										} else {
											start = true;
										}
									}
								}
								return works[0]?.info;
							};

							// 监听音量
							this.onConfigChange('volume', (curr) => {
								state.study.currentMedia && (state.study.currentMedia.volume = curr);
							});

							// 监听速度
							this.onConfigChange('playbackRate', (curr) => {
								if (typeof curr === 'string') {
									this.cfg.playbackRate = parseFloat(curr);
								}
								processor.switchPlaybackRate(curr);
							});

							// 监听清晰度
							this.onConfigChange('definition', (curr) => {
								processor.switchLine(curr);
							});

							/** 防止 onended 短时间内多次触发时重复进入掌握度练习 */
							let enteringMastery = false;

							/**
							 * 视频看完后进入掌握度练习（视频下方「去提升」）
							 *
							 * 点「去提升」是 `window.location.href` 整页跳到 studentexamcomh5 的试卷页，
							 * 本页 JS 当场销毁，所以跳转前必须先把返回地址与「返回后跳过重播」标记写进
							 * tab 级存储（跨域 localStorage 不通），由试卷页答完提交后再跳回来。
							 */
							const tryEnterMasteryImprove = async (): Promise<boolean> => {
								if (enteringMastery) return false;
								enteringMastery = true;
								try {
									if (!this.cfg.autoImproveMastery) return false;
									const baseLimit = this.cfg.masteryImproveTimes ?? 1;
									if (baseLimit <= 0) return false;

									/**
									 * 刚练完这一节就别再进了。
									 *
									 * 只靠次数不够：重做失败退回学习页时会把 retry.active 置 true，
									 * 学习页就按重做上限放行，一路走下来有概率又开一轮，
									 * 用户看到的就是「做完卷子回学习页又进去了」。
									 */
									const settledKey = location.pathname;
									const settled = ((await $store.getTab(ZHS_MASTERY_SETTLED_KEY)) || null) as {
										key?: string;
										at?: number;
									} | null;
									if (
										settled?.key === settledKey &&
										Date.now() - (settled.at || 0) < 5 * 60 * 1000
									) {
										await $store.setTab(ZHS_MASTERY_SETTLED_KEY, null);
										$console.log('本节刚练完，跳过掌握度练习，继续下一节');
										return false;
									}

									/**
									 * 「未满分重做」在解析页点不动「重新答题」时会退回学习页，
									 * 并把这个标记置为 active —— 这时按重做上限放行，
									 * 否则单节练习次数（默认 1）已经用完，就再也进不去了。
									 */
									const retryState = ((await $store.getTab(ZHS_MASTERY_RETRY_KEY)) || {}) as {
										count?: number;
										active?: boolean;
									};
									const limit =
										retryState.active && this.cfg.retryWhenNotFull
											? (this.cfg.retryMaxTimes ?? 3)
											: baseLimit;

									// 掌握度是接口回包后才渲染的，视频刚结束（或 PPT 刚打开）时可能还没出现，等它一会儿
									const btn = await waitMasteryImproveButton(12);
									if (!btn) {
										$console.log('未发现「去提升」按钮，继续下一节');
										return false;
									}

									const key = location.pathname;
									const times = ((await $store.getTab(ZHS_MASTERY_TIMES_KEY)) || {}) as Record<
										string,
										number
									>;
									const used = times[key] || 0;
									if (used >= limit) {
										$console.log(`本节已自动进入掌握度练习 ${used} 次（上限 ${limit}），继续下一节`);
										return false;
									}

									$message.info({ content: '检测到「去提升」，正在进入掌握度练习' });
									$console.log('检测到「去提升」，正在进入掌握度练习');

									// 先落盘再点击：跳转是整页的，点完之后就没有机会写了
									await $store.setTab(ZHS_MASTERY_RETURN_KEY, {
										url: location.href,
										at: Date.now(),
										skipReplay: true
									});
									await $store.setTab(ZHS_MASTERY_TIMES_KEY, { ...times, [key]: used + 1 });
									/**
									 * 只有真正的新一轮才把重做轮次清零。
									 * 重做路径（active）必须保留轮次，否则结果页的「还能重做几次」
									 * 永远从 0 算起，会无限重刷。
									 */
									if (!retryState.active) {
										await $store.setTab(ZHS_MASTERY_RETRY_KEY, { count: 0, active: false });
									}

									await $.sleep(500);
									// 学习页 →「知识点学习报告」→ 试卷，两层入口依次点；直接到试卷也认
									const ok = await advanceToPointExam(btn);
									if (ok) return true;

									await $store.setTab(ZHS_MASTERY_RETURN_KEY, null);
									await $store.setTab(ZHS_MASTERY_TIMES_KEY, { ...times, [key]: used });
									$message.warn({ content: '未能进入掌握度练习页面，继续学习', duration: 5 });
									$console.log('未能进入掌握度练习页面，继续学习');
									return false;
								} finally {
									enteringMastery = false;
								}
							};

							const doWork = async () => {
								await $.sleep(5 * 1000);

								const next = async () => {
									const nextJob = getNextJob();

									if (nextJob) {
										const nextJobTitle = nextJob.querySelector('.common-text') as HTMLElement;

										if (include_jobs.some((job) => nextJob.querySelector('.icon-box')?.classList.contains(job))) {
											await safeClick(nextJobTitle);
											await doWork();
										}
										// 链接任务
										else {
											/**
											 * 链接任务点不会自动取消 active 样式，导致无法获取下一个任务点
											 * 这里手动移除 active 样式，避免影响获取下一个任务点
											 */
											document
												.querySelectorAll('[class*="card-container"].active')
												.forEach((el) => el.classList.remove('active'));

											// 链接任务点不会自动附加 active 样式，这里手动添加
											nextJob?.classList.add('active');

											await $.sleep(1000);

											const _open = $gm.unsafeWindow.open;
											$gm.unsafeWindow.open = () => null;
											await safeClick(nextJobTitle);

											const msg = '链接任务完成，即将自动下一节！';
											$message.info(msg);
											setTimeout(async () => {
												$gm.unsafeWindow.open = _open;
												// 直接下一个
												await next();
											}, 3000);
										}
										return;
									}

									const nextEl = getNext();
									if (nextEl) {
										await safeClick(nextEl);
									} else {
										finishAlert();
									}
								};

								try {
									const wrapper = document.querySelector<HTMLElement>('.video-player-wrapper');
									if (!wrapper || wrapper.style.display === 'none') {
										throw new Error('视频加载失败');
									}
									await waitForMedia({
										timeout: 5 * 1000,
										filter: (m) => m.src.length !== 0
									});
								} catch {
									/**
									 * 非视频任务点（PPT / 文档等）没有 <video>，但视频下方那块
									 * 「知识点最高掌握度 + 去提升」照样存在。这里先试一次再跳下一节，
									 * 否则这类小节会被整段跳过，掌握度永远是 0。
									 */
									try {
										if (await tryEnterMasteryImprove()) return;
									} catch (e) {
										$console.warn('非视频任务点进入掌握度练习失败：' + e);
									}

									const msg = '未找到学习视频，即将自动下一节！';
									$message.error(msg);
									$console.error(msg);
									await $.sleep(3000);
									await next();
									return;
								}

								const set = async () => {
									// 上面操作会导致元素刷新，这里重新获取视频
									try {
										// 设置清晰度
										await processor.switchLine(this.cfg.definition || 'line1bq');
										await $.sleep(1000);
										// 设置播放速度
										await processor.switchPlaybackRate(this.cfg.playbackRate);
										await $.sleep(1000);
										const media = await waitForMedia({ timeout: 5 * 1000, filter: (m) => m.src.length !== 0 });
										await $.sleep(1000);
										state.study.currentMedia = media;
										if (media) {
											/**
											 * 刚练完掌握度跳回来：本节视频本来就已经看完，
											 * 再从 1 秒重播一遍纯属浪费（长视频要再等十几分钟），
											 * 直接把进度顶到末尾触发 ended，好接着去下一节。
											 * 标记带 3 分钟有效期，避免历史残留导致正常页面被跳过。
											 */
											const pending = (await $store.getTab(ZHS_MASTERY_RETURN_KEY)) as
												| { url?: string; at?: number; skipReplay?: boolean }
												| null;
											const justReturned =
												!!pending?.skipReplay && Date.now() - (pending.at || 0) < 3 * 60 * 1000;
											if (justReturned) {
												await $store.setTab(ZHS_MASTERY_RETURN_KEY, null);
												// duration 要等元数据加载才有值，拿不到就退回 1 秒（最多把这节重播一遍）
												for (let i = 0; i < 10 && !Number.isFinite(media.duration); i++) {
													await $.sleep(300);
												}
												const duration = Number.isFinite(media.duration) ? media.duration : 0;
												media.currentTime = duration > 2 ? duration - 1 : 1;
											} else {
												// 如果已经播放完了，则重置视频进度
												media.currentTime = 1;
											}
											// 音量
											media.volume = this.cfg.volume;
										}
										return state.study.currentMedia;
									} catch (e) {
										$console.log('视频加载失败，请尝试刷新页面！：' + e);
										$message.error({ content: '视频加载失败，请尝试刷新页面！：' + e, duration: 0 });
									}
								};

								const video = await set();
								if (!video) {
									return;
								}

								playMedia(() => video?.play()).then(() => {
									const cn = getChapterName();
									$message.info({ content: '正在学习：' + cn });
									$console.log('正在学习：' + cn);
								});

								video.onpause = async () => {
									if (!video?.ended && state.study.stop === false) {
										await $.sleep(1000);
										video?.play();
									}
								};

								video.onended = async () => {
									// 视频看完先尝试提升掌握度：进入练习页会整页跳走，本节流程到此为止
									try {
										if (await tryEnterMasteryImprove()) return;
									} catch (e) {
										// 找按钮/写存储出错不能把整条学习流程带死，继续下一节
										$console.warn('进入掌握度练习失败：' + e);
									}

									$message.info({ content: '即将自动跳转下一节' });
									await $.sleep(3000);

									await next();
								};
							};

							doWork();
						};
						try {
							await runStudy();
						} finally {
							// 页面直接关闭时走不到这里，由桌面端心跳租约 60 秒兜底回收。
							setExtensionAutomation(false, '智慧树课程学习');
						}
					}
				};
			}
		}),
		'smart-work': new Script({
			name: '新形态课程-作业/考试/掌握度脚本',
			matches: [
				['新形态课程作业页面', 'smartcourseexam.zhihuishu.com/ReviewExam'],
				['新形态课程-掌握提升页面', 'studentexamcomh5.zhihuishu.com/studentReviewTestOrExam'],
				['新形态课程-AI助教掌握度', 'fusioncourseh5.zhihuishu.com/exam'],
				['新形态课程-新AI助教掌握度', 'studywisdomh5.zhihuishu.com/exam'],
				['新形态课程-新AI学伴掌握度', 'wisdom-mooc.zhihuishu.com/exam']
			],
			namespace: 'zhs.smart.work',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'自动答题前请在 “通用-全局设置” 中设置题库配置。',
						'可以搭配 “通用-在线搜题” 一起使用。',
						'如果没开始答题，请尝试刷新页面。',
						'禁止一次性打开多个作业/考试页面。',
						...smartWorkNotes()
					]).outerHTML
				},
				workDelay: {
					label: '作业答题开始时间延迟（秒）',
					defaultValue: 3,
					attrs: { type: 'number', min: 1, step: 1, max: 10 }
				},
				autoSubmitPointExam: {
					label: '掌握度练习自动提交',
					attrs: {
						type: 'checkbox',
						title: '仅在新形态课程掌握度练习页（studentexamcomh5）生效：答完自动点「提交」，提交后自动返回课程继续学习。提交不可逆，如担心正确率可关闭此项手动提交'
					},
					defaultValue: true
				}
			},
			methods() {
				return {
					start: async () => {
						// 检查是否为软件环境
						CommonProject.scripts.render.methods.pin(this);

						let remotePage: RemotePage | undefined;
						// 掌握度
						const remote_not_required = remote_not_required_pages.some((domain) => location.href.includes(domain));
						// 掌握度练习页（学习页「去提升」跳过来的试卷页），没有桌面端也能靠 DOM 事件点
						const is_point_exam = location.href.includes(ZHS_POINT_EXAM_PAGE);

						if (is_point_exam) {
							// 从学习页「去提升」过来时可能先落在 AI 复习过渡页，需要点一下主按钮才进试卷
							const ready = await waitPointExamReady(60);
							if (!ready) {
								$message.warn({ content: '未检测到题目，请在页面上点一下「开始答题/继续」', duration: 0 });
								await waitForElement('.questionContent');
							}
						} else {
							remote_not_required ? await waitForElement('.exam-item') : await waitForElement('.questionContent');
						}

						if (remote_not_required) {
							// 这两个页面不需要软件辅助
						} else {
							remotePage = await BackgroundProject.scripts.dev.methods.getRemotePlaywrightCurrentPage();
							// 检查是否为软件环境
							if (!remotePage && !is_point_exam) {
								return $playwright.showError();
							}
							if (remotePage) {
								// 移动到左上角
								$render.moveToEdge();
								$message.warn({ content: '答题完毕之前请勿操作页面！', duration: 0 });
							}
						}

						commonWork(this, {
							workerProvider: (opts) => {
								if (remote_not_required) {
									return fusioncourseWork(remotePage, opts);
								} else {
									return smartWork(remotePage, opts);
								}
							},
							start_delay_seconds: this.cfg.workDelay ?? 3,
							onWorkerCreated: (worker) => {
								if (!is_point_exam) return;
								// 答完先提交、再跳回学习页，整个「视频 → 去提升 → 练习 → 返回」闭环在这里收口
								worker.once('done', () => {
									finishPointExamPractice(this.cfg.autoSubmitPointExam !== false);
								});
							}
						});
					}
				};
			},
			oncomplete() {
				this.methods.start();
			},
			onhistorychanged(type, ...args) {
				if (type === 'pushed') {
					this.methods.start();
				}
			}
		}),
		'smart-exam': new Script({
			name: '新形态课程-考试脚本',
			matches: [['新形态课程-考试界面', 'examloop.zhihuishu.com/exam']],
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'自动答题前请在 “通用-全局设置” 中设置题库配置。',
						'可以搭配 “通用-在线搜题” 一起使用。',
						'如果没开始答题，请尝试刷新页面。',
						'禁止一次性打开多个作业/考试页面。'
					]).outerHTML
				}
			},
			methods() {
				return {
					start: async () => {
						// 检查是否为软件环境
						CommonProject.scripts.render.methods.pin(this);
						await waitForElement('.question-area-content');

						// 考完后的试卷预览
						if (document.querySelector('[mode="REVIEW_MODE"]')) {
							$message.info('当前试卷状态已完成、脚本将停止运行。');
							return;
						}

						commonWork(this, {
							workerProvider: (opts) => {
								return smartExam(undefined, opts);
							}
						});
					}
				};
			},
			oncomplete() {
				this.methods.start();
			}
		}),
		'xnk-study': new Script({
			name: '校内课（翻转课）-学习脚本',
			matches: [['校内课学习页面', 'zhihuishu.com/aidedteaching/sourceLearning']],
			namespace: 'zhs.xnk.study',
			configs: {
				notes: {
					defaultValue: $ui.notes(['章节测试请大家观看完视频后手动打开。', '此课程不能使用倍速。']).outerHTML
				},
				restudy: restudy,
				volume: volume
			},
			oncomplete() {
				// 置顶当前脚本
				CommonProject.scripts.render.methods.pin(this);

				const finish = () => {
					$modal.alert({
						content: '检测到当前视频全部播放完毕，如果还有未完成的视频请刷新重试，或者打开复习模式。'
					});
					CommonProject.scripts.settings.methods.notificationBySetting(
						'检测到当前视频全部播放完毕，如果还有未完成的视频请刷新重试，或者打开复习模式。',
						{ duration: 0, extraTitle: '知道智慧树学习脚本' }
					);
				};

				// 监听音量
				this.onConfigChange('volume', (curr) => {
					state.study.currentMedia && (state.study.currentMedia.volume = curr);
				});

				const nextElement = () => {
					const list = document.querySelectorAll<HTMLElement>('.file-item');

					let passActive = false;
					for (let index = 0; index < list.length; index++) {
						const item = list[index];
						const finish = !!item.querySelector('.icon-finish');
						// 判断是否需要学习
						const needsStudy = !finish || (finish && this.cfg.restudy);

						if (item.classList.contains('active')) {
							if (needsStudy) {
								return list[index + 1];
							} else {
								passActive = true;
							}
						}

						if (passActive && needsStudy) {
							return item;
						}
					}
				};

				const interval = setInterval(async () => {
					/** 查找任务 */
					const next = nextElement();

					if (next) {
						clearInterval(interval);

						if (document.querySelector('#mediaPlayer')) {
							document.querySelector('.file-item.active')?.scrollIntoView();
							const name = next.querySelector('#sourceTit')?.textContent || '未知视频';
							$message.info('正在学习：' + name);
							watchXnk({ volume: this.cfg.volume }, () => {
								$message.info('视频完成播放，正在自动跳转下一节！');
								setTimeout(() => {
									/** 下一章 */
									const next = nextElement();
									if (next) trustedClick(next);
								}, 3000);
							});
						} else {
							setTimeout(() => {
								const msg = '未找到学习视频，即将自动下一节！';
								$message.warn(msg);
								$console.warn(msg);
								/** 下一章 */
								const next = nextElement();
								if (next) trustedClick(next);
							}, 3000);
						}
					}
				}, 1000);

				setTimeout(() => {
					if (!nextElement()) {
						finish();
						clearInterval(interval);
					}
				}, 10 * 1000);
			}
		}),
		'xnk-work': new Script({
			name: '校内课-作业考试脚本',
			matches: [
				['校内课作业页面', 'zhihuishu.com/atHomeworkExam/stu/homeworkQ/exerciseList'],
				['校内课考试页面', 'zhihuishu.com/atHomeworkExam/stu/examQ/examexercise']
			],
			namespace: 'zhs.xnk.work',
			configs: { notes: workNotes },
			onhistorychanged(type) {
				if (type === 'pushed') {
					this.oncomplete?.();
				}
			},
			async oncomplete() {
				commonWork(this, {
					workerProvider: xnkWork
				});
			}
		}),
		'wisdom-study': new Script({
			name: '新智慧学习-学习脚本',
			matches: [
				['2025-12月新智慧学习页面', 'wisdom-mooc.zhihuishu.com/study/index'],
				['学习提示', 'wisdom-mooc.zhihuishu.com/study/analysis']
			],
			namespace: 'zhs.wisdom.study',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'掌握度和作业请视频看完后自行手动进入',
						'不要最小化浏览器/关闭电脑屏幕，可能导致脚本暂停。',
						'请使用时关闭卡巴斯基软件，否则会被检测出异常脚本。',
						'运行中请将浏览器缩放调整至适合的大小，避免元素遮挡，无法点击',
						'例如：调整缩放到 50%，然后刷新页面即可'
					]).outerHTML
				},
				restudy: restudy,
				skipStudyTimeWarnDialog: {
					label: '忽略习惯分弹窗',
					attrs: {
						title: '如果课程有习惯分需要自行控制学习时长，如果忽略习惯分提示，则可能没有习惯分。',
						type: 'checkbox'
					},
					defaultValue: false
				},
				reloadWhenError: {
					label: '视频黑屏时自动刷新',
					attrs: { type: 'checkbox', title: '当视频出现加载失败，或者黑屏等异常时，自动刷新页面3次尝试修复' },
					defaultValue: true
				},
				volume: volume,
				definition: definition,
				playbackRate: {
					label: '视频倍速',
					tag: 'select',
					defaultValue: 1,
					attrs: { title: '目前智慧树倍速最高只能1.5x，超出有封号风险' },
					options: [
						['1', '1 x'],
						['1.25', '1.25 x'],
						['1.5', '1.5 x']
					]
				},
				videoQuizStrategy: {
					label: '视频内题目',
					tag: 'select',
					defaultValue: 'random' as VideoQuizStrategy,
					options: [
						['ai', 'AI题库答题', '连接题库（含AI答题）自动选择答案，题库未配置或未匹配时随机作答'],
						['random', '随机答题']
					],
					attrs: {
						title:
							'视频播放过程中弹出的测验题。选择 AI题库答题 后会自动连接题库选择答案（需先在 通用-全局设置 中配置题库或 AI 答题），题库搜不到时回退为随机作答。'
					}
				}
			},
			async oncomplete() {
				if (location.href.includes('https://wisdom-mooc.zhihuishu.com/study/analysis')) {
					return $message.info({ content: '请手动进入掌握度进行自动答题。', duration: 10 });
				}

				// 置顶当前脚本
				CommonProject.scripts.render.methods.pin(this);
				const processor = new WishdomH5();
				// 注入视频内题目作答策略
				processor.quizStrategy = (this.cfg.videoQuizStrategy as VideoQuizStrategy) || 'random';
				// 策略改动立即生效，无需停止脚本再重新运行
				this.onConfigChange('videoQuizStrategy', (curr) => {
					processor.quizStrategy = (curr as VideoQuizStrategy) || 'random';
					$console.log(`视频内题目策略已切换：${processor.quizStrategy === 'ai' ? 'AI题库答题' : '随机答题'}`);
				});

				// // 点击显示进度条，否则无法进行倍速，清晰度等操作
				// const showControlBar = async () => {
				// 	await processor.remotePage?.hover('.videoArea');
				// 	await processor.remotePage?.click('.videoArea', { button: 'middle' });
				// 	await processor.remotePage?.hover('.speedBox');
				// 	// 需要点击一下屏幕中心，否则视频控制菜单无法正常弹出
				// 	await processor.remotePage?.click('.speedBox', { button: 'middle' });
				// };

				// 监听音量
				this.onConfigChange('volume', (curr) => {
					state.study.currentMedia && (state.study.currentMedia.volume = curr);
				});

				// 监听速度
				this.onConfigChange('playbackRate', async (curr) => {
					if (typeof curr === 'string') {
						this.cfg.playbackRate = parseFloat(curr);
					}
					fixProcessBar();
					processor.switchPlaybackRate(curr);
				});

				// 监听清晰度
				this.onConfigChange('definition', async (curr) => {
					fixProcessBar();
					processor.switchLine(curr);
				});

				const next = async () => {
					const hidden = $el('.chapter-wrapper.hidden');
					if (hidden) {
						if (processor.remotePage) {
							await processor.remotePage.click('.collapse-box');
						} else {
							trustedClick(hidden);
						}
					}

					// 全部章节下拉展开
					document.querySelectorAll<HTMLElement>('.el-collapse-item__wrap').forEach((e) => (e.style.display = ''));
					await $.sleep(200);

					const nextJob = processor.getNext({ next: true, restudy: this.cfg.restudy });
					if (nextJob) {
						if (!this.cfg.skipStudyTimeWarnDialog && hasStudyTimeWarnDialog()) {
							$message.warn({
								content:
									'检测到习惯分弹窗，当天学习时间已满，如需继续学习，请手动关闭后，刷新页面重新运行脚本！（如想强制学习请前往脚本设置忽略弹窗）',
								duration: 0
							});
							return;
						} else {
							await closeStudyTimeWarnDialog();
						}
						await waitForMasteryLevelDialogClose();
						// 展开章节
						await processor.remotePage?.click(nextJob);
						nextJob.scrollIntoView({ behavior: 'smooth', block: 'center' });
						doWork();
					} else {
						finishAlert();
					}
				};

				// 实时检测关闭掌握度页面
				const closeMasteryLevelDialog = () => {
					return new Promise<void>((resolve, reject) => {
						const check = () => {
							if (document.querySelector('.masterylevel-body')) {
								processor.remotePage?.click('.header-box .close-box');
								$message.info('掌握度页面已关闭，即将继续学习！');
							}
							setTimeout(check, 3000);
						};
						check();
					});
				};

				const hasStudyTimeWarnDialog = () => {
					return !!Array.from(document.querySelectorAll('.el-overlay .content')).find((el) =>
						el.textContent?.includes('保持良好的学习习惯')
					);
				};

				const closeStudyTimeWarnDialog = () => {
					return new Promise<void>((resolve, reject) => {
						const interval = setInterval(() => {
							const dialog = Array.from(document.querySelectorAll('.el-overlay')).find((el) =>
								el.textContent?.includes('保持良好的学习习惯')
							);
							if (dialog) {
								const btn = dialog.querySelector('.el-dialog__header img');
								if (btn) processor.remotePage?.click(btn);
								clearInterval(interval);
								resolve();
							}
						}, 1000);

						// 3秒后自动结束
						setTimeout(() => {
							clearInterval(interval);
							resolve();
						}, 3 * 1000);
					});
				};

				const waitForMasteryLevelDialogClose = async () => {
					return new Promise<void>((resolve, reject) => {
						const check = () => {
							if (!document.querySelector('.masterylevel-body')) {
								resolve();
							} else {
								setTimeout(check, 200);
							}
						};
						check();
					});
				};

				const waitForLoad = () => {
					return new Promise<void>((resolve, reject) => {
						const check = () => {
							if (document.querySelector('.video-play')) {
								resolve();
							} else {
								setTimeout(check, 3000);
							}
						};
						check();
					});
				};

				await waitForLoad();

				await $.sleep(3000);
				closeMasteryLevelDialog();
				// 自动隐藏弹窗
				processor.hideDialog();

				// 初始化处理器
				await processor.init();
				// 自动过弹窗测验
				processor.handleTestDialog(processor.remotePage);

				setInterval(() => {
					// 定时显示进度条，防止消失
					fixProcessBar();
				}, 1000);

				$message.success({ content: '即将开始自动学习！' });

				const reload = async (e: any) => {
					$console.error(e);
					if (this.cfg.reloadWhenError) {
						const msg = '视频加载失败，即将刷新页面。';
						const reload_count = await $store.getTab('reload-count');
						if (reload_count && reload_count > 3) {
							const msg = '视频加载失败/黑屏导致重新加载页面次数超过3次，请尝试关闭页面重新打开，或者检查网络连接！';
							await $store.setTab('reload-count', 0);
							$message.error({ content: msg, duration: 0 });
							$console.log(msg);
							CommonProject.scripts.settings.methods.notificationBySetting(msg, {
								duration: 0,
								extraTitle: '知道智慧树学习脚本'
							});
							return;
						}
						await $store.setTab('reload-count', (reload_count ?? 0) + 1);
						$message.error(msg);
						$console.log(msg);
						setTimeout(() => {
							location.reload();
						}, 3000);
					} else {
						const msg = '视频加载失败，即将跳过。';
						$message.error(msg);
						$console.log(msg);
						next();
					}
				};

				const doWork = async () => {
					await waitForCaptcha();

					const set = async () => {
						// 上面操作会导致元素刷新，这里重新获取视频
						try {
							await $.sleep(1000);
							// 设置清晰度
							await processor.switchLine(this.cfg.definition || 'line1bq');
							await $.sleep(1000);
							// 设置播放速度
							await processor.switchPlaybackRate(this.cfg.playbackRate);
							await $.sleep(1000);
							const media = await waitForMedia({ timeout: 5 * 1000, filter: (m) => m.src.length !== 0 });
							await $.sleep(1000);
							state.study.currentMedia = media;
							if (media) {
								// 如果已经播放完了，则重置视频进度
								media.currentTime = 1;
								// 音量
								media.volume = this.cfg.volume;
							}
							return state.study.currentMedia;
						} catch (e) {
							reload(e);
						}
					};

					// 部分用户视频加载很慢，这里等待一下
					try {
						const media = await waitForMedia({
							timeout: 10 * 1000,
							filter: (m) => m.src.length !== 0
						});
						media.pause();
						// 固定进度条便于下方点击音量等按钮
						fixProcessBar();
					} catch (e) {
						reload(e);
						return;
					}

					await waitForCaptcha();
					const video = await set();
					if (!video) {
						return;
					}

					// 如果视频元素无法访问，证明已经切换了视频
					const videoCheckInterval = setInterval(async () => {
						if (!video?.isConnected) {
							clearInterval(videoCheckInterval);
							$message.info({ content: '检测到视频切换中...' });
							/**
							 * 元素无法访问证明用户切换视频了
							 * 所以不往下播放视频，而是重新播放用户当前选中的视频
							 */
							doWork();
						}
					}, 3000);

					$message.info('开始播放');
					playMedia(() => video?.play()).then(() => {
						const current = document.querySelector<HTMLElement>(
							'.chapter-item.current , .chapter-content-second.current'
						);
						const cn = current ? processor.getChapterName(current) : '未知章节';
						$message.info({ content: '正在学习：' + cn });
						$console.log('正在学习：' + cn);
					});

					video.onpause = async () => {
						if (!video?.isConnected) return;
						if (!video?.ended && state.study.stop === false) {
							await $.sleep(1000);
							video?.play();
						}
					};

					video.onended = async () => {
						if (!video?.isConnected) return;
						$message.info('即将自动跳转下一节');
						$console.info('即将自动跳转下一节');
						clearInterval(videoCheckInterval);
						await $.sleep(3000);
						await next();
					};
				};

				doWork();
			}
		}),
		hike: new Script({
			name: '教学空间-AI智慧课程-学习脚本',
			matches: [
				['学习首页', 'hike-teaching-center.polymas.com/stu-hike/agent-course-hike/ai-course-center'],
				['学习页面', 'tools-hike/studentStudyResource']
			],
			namespace: 'zhs.hike.study',
			configs: {
				notes: {
					defaultValue: $ui.notes(['请手动进入视频、作业、考试页面，脚本会自动运行。']).outerHTML
				},
				restudy: restudy,
				reloadWhenError: {
					label: '视频黑屏时自动刷新',
					attrs: { type: 'checkbox', title: '当视频出现加载失败，或者黑屏等异常时，自动刷新页面3次尝试修复' },
					defaultValue: true
				},
				volume: volume,
				definition: definition,
				playbackRate: {
					label: '视频倍速',
					tag: 'select',
					defaultValue: 1,
					attrs: { title: '目前智慧树倍速最高只能1.5x，超出有封号风险' },
					options: [
						['1', '1 x'],
						['1.25', '1.25 x'],
						['1.5', '1.5 x']
					]
				}
			},
			async oncomplete(...args) {
				// 置顶当前脚本
				CommonProject.scripts.render.methods.pin(this);
				if (location.href.includes('stu-hike/agent-course-hike/ai-course-center')) {
					$message.info({ content: '请手动进入视频、作业、考试页面，脚本会自动运行。', duration: 60 });
					return;
				}
				const processor = new Hike();
				// 监听音量
				this.onConfigChange('volume', (curr) => {
					state.study.currentMedia && (state.study.currentMedia.volume = curr);
				});

				// 监听速度
				this.onConfigChange('playbackRate', async (curr) => {
					if (typeof curr === 'string') {
						this.cfg.playbackRate = parseFloat(curr);
					}
					fixProcessBar();
					processor.switchPlaybackRate(curr);
				});

				// 监听清晰度
				this.onConfigChange('definition', async (curr) => {
					fixProcessBar();
					processor.switchLine(curr);
				});

				const getChapterName = () => document.querySelector('.active-file')?.textContent?.trim() || '未知章节';

				const next = async () => {
					const nextJob = processor.getNext({ next: true, restudy: this.cfg.restudy });
					if (nextJob) {
						await safeClick(nextJob);
						await $.sleep(3000);
						doWork();
					} else {
						finishAlert();
					}
				};
				const waitForLoad = () => {
					return new Promise<void>((resolve, reject) => {
						const check = () => {
							if (processor.hasJob()) {
								resolve();
							} else {
								setTimeout(check, 1000);
							}
						};
						check();
					});
				};

				await waitForLoad();

				await $.sleep(3000);

				setInterval(() => {
					// 定时显示进度条，防止消失
					fixProcessBar();
				}, 1000);

				$message.success({ content: '即将开始自动学习！' });

				const reload = async (e: any) => {
					$console.error(e);
					if (this.cfg.reloadWhenError) {
						const msg = '视频加载失败，即将刷新页面。';
						const reload_count = await $store.getTab('reload-count');
						if (reload_count && reload_count > 3) {
							const msg = '视频加载失败/黑屏导致重新加载页面次数超过3次，请尝试关闭页面重新打开，或者检查网络连接！';
							await $store.setTab('reload-count', 0);
							$message.error({ content: msg, duration: 0 });
							$console.log(msg);
							CommonProject.scripts.settings.methods.notificationBySetting(msg, {
								duration: 0,
								extraTitle: '知道智慧树学习脚本'
							});
							return;
						}
						await $store.setTab('reload-count', (reload_count ?? 0) + 1);
						$message.error(msg);
						$console.log(msg);
						setTimeout(() => {
							location.reload();
						}, 3000);
					} else {
						const msg = '视频加载失败，即将跳过。';
						$message.error(msg);
						$console.log(msg);
						next();
					}
				};

				const doWork = async () => {
					await waitForCaptcha();

					if (!document.querySelector('.active-file')?.parentElement?.parentElement?.querySelector('.icon-movie')) {
						$message.warn('当前章节不支持学习，即将跳转下一节');
						await $.sleep(3000);
						await next();
						return;
					}

					const set = async () => {
						// 上面操作会导致元素刷新，这里重新获取视频
						try {
							// 设置清晰度
							await processor.switchLine(this.cfg.definition || 'line1bq');
							await $.sleep(1000);
							// 设置播放速度
							await processor.switchPlaybackRate(this.cfg.playbackRate);
							await $.sleep(1000);
							const media = await waitForMedia({ timeout: 5 * 1000, filter: (m) => m.src.length !== 0 });
							await $.sleep(1000);
							state.study.currentMedia = media;
							if (media) {
								// 如果已经播放完了，则重置视频进度
								media.currentTime = 1;
								// 音量
								media.volume = this.cfg.volume;
							}
							return state.study.currentMedia;
						} catch (e) {
							reload(e);
						}
					};

					$message.info('开始播放');
					// 部分用户视频加载很慢，这里等待一下
					try {
						const media = await waitForMedia({
							timeout: 10 * 1000,
							filter: (m) => m.src.length !== 0
						});
						media.pause();
						// 固定进度条便于下方点击音量等按钮
						fixProcessBar();
					} catch (e) {
						reload(e);
						return;
					}

					await waitForCaptcha();
					const video = await set();
					if (!video) {
						return;
					}

					// 如果视频元素无法访问，证明已经切换了视频
					const videoCheckInterval = setInterval(async () => {
						if (!video?.isConnected) {
							clearInterval(videoCheckInterval);
							$message.info({ content: '检测到视频切换中...' });
							/**
							 * 元素无法访问证明用户切换视频了
							 * 所以不往下播放视频，而是重新播放用户当前选中的视频
							 */
							doWork();
						}
					}, 3000);

					playMedia(() => video?.play()).then(() => {
						const cn = getChapterName();
						$message.info({ content: '正在学习：' + cn });
						$console.log('正在学习：' + cn);
					});

					video.onpause = async () => {
						if (!video?.isConnected) return;
						if (!video?.ended && state.study.stop === false) {
							await $.sleep(1000);
							video?.play();
						}
					};

					video.onended = async () => {
						if (!video?.isConnected) return;
						$message.info('即将自动跳转下一节');
						$console.info('即将自动跳转下一节');
						clearInterval(videoCheckInterval);
						await $.sleep(3000);
						await next();
					};
				};

				doWork();
			}
		}),
		hike_v2: new Script({
			name: '教学空间-AI智慧课程-学习脚本',
			matches: [
				['学习首页', /polymas.com\/stu-hike\/agent-course-full\/.*\/stu\/(course-home|study)/],
				['学习页面', '/stu/study/resource-detail']
			],
			namespace: 'zhs.hike_v2.study',
			configs: {
				notes: {
					defaultValue: $ui.notes(['请手动进入视频、作业、考试页面，脚本会自动运行。']).outerHTML
				},
				restudy: restudy,
				reloadWhenError: {
					label: '视频黑屏时自动刷新',
					attrs: { type: 'checkbox', title: '当视频出现加载失败，或者黑屏等异常时，自动刷新页面3次尝试修复' },
					defaultValue: true
				},
				volume: volume
			},
			oncomplete(...args) {
				this.onhistorychange?.('push', ...args);
			},
			async onhistorychange(type) {
				if (type !== 'push') {
					return;
				}

				// 置顶当前脚本
				if (!location.href.includes('stu/study/resource-detail')) {
					$message.info({ content: '请手动进入视频、作业、考试页面，脚本会自动运行。', duration: 60 });
					return;
				}
				const processor = new HikeV2();
				// 监听音量
				this.onConfigChange('volume', (curr) => {
					state.study.currentMedia && (state.study.currentMedia.volume = curr);
				});

				const next = async () => {
					// 打开章节列表
					document.querySelector('.drawer-panel')?.classList.add('active');

					const nextJob = processor.getNext({ next: true, restudy: this.cfg.restudy });
					if (nextJob) {
						nextJob.scrollIntoView({ behavior: 'smooth', block: 'center' });
						await $.sleep(200);
						await safeClick(nextJob);
						await $.sleep(3000);
						doJob();
					} else {
						finishAlert();
					}
				};
				const waitForLoad = () => {
					return new Promise<void>((resolve, reject) => {
						const check = () => {
							if (processor.hasJob()) {
								resolve();
							} else {
								setTimeout(check, 1000);
							}
						};
						check();
					});
				};

				await waitForLoad();
				await $.sleep(3000);

				$message.success({ content: '即将开始自动学习！' });

				const reload = async (e: any) => {
					$console.error(e);
					if (this.cfg.reloadWhenError) {
						const msg = '视频加载失败，即将刷新页面。';
						const reload_count = await $store.getTab('reload-count');
						if (reload_count && reload_count > 3) {
							const msg = '视频加载失败/黑屏导致重新加载页面次数超过3次，请尝试关闭页面重新打开，或者检查网络连接！';
							await $store.setTab('reload-count', 0);
							$message.error({ content: msg, duration: 0 });
							$console.log(msg);
							CommonProject.scripts.settings.methods.notificationBySetting(msg, {
								duration: 0,
								extraTitle: '知道智慧树学习脚本'
							});
							return;
						}
						await $store.setTab('reload-count', (reload_count ?? 0) + 1);
						$message.error(msg);
						$console.log(msg);
						setTimeout(() => {
							location.reload();
						}, 3000);
					} else {
						const msg = '视频加载失败，即将跳过。';
						$message.error(msg);
						$console.log(msg);
						next();
					}
				};

				const doJob = async () => {
					await waitForCaptcha();

					if (!document.querySelector('.video-js')) {
						$message.warn('当前章节不支持学习，即将跳转下一节');
						await $.sleep(3000);
						await next();
						return;
					}

					const set = async () => {
						// 上面操作会导致元素刷新，这里重新获取视频
						try {
							await $.sleep(1000);
							const media = await waitForMedia({ timeout: 5 * 1000, filter: (m) => m.src.length !== 0 });
							await $.sleep(1000);
							state.study.currentMedia = media;
							if (media) {
								// 如果已经播放完了，则重置视频进度
								media.currentTime = 1;
								// 音量
								media.volume = this.cfg.volume;
							}
							return state.study.currentMedia;
						} catch (e) {
							reload(e);
						}
					};

					$message.info('开始播放');
					await waitForCaptcha();
					const video = await set();
					if (!video) {
						return;
					}
					const video_src = video.src;

					// 如果视频元素无法访问，证明已经切换了视频
					const videoCheckInterval = setInterval(async () => {
						if (!video?.isConnected || video.src !== video_src) {
							clearInterval(videoCheckInterval);
							$message.info({ content: '检测到视频切换中...' });
							/**
							 * 元素无法访问证明用户切换视频了
							 * 所以不往下播放视频，而是重新播放用户当前选中的视频
							 */
							doJob();
						}
					}, 3000);

					playMedia(() => video?.play()).then(() => {
						const cn = processor.getChapterName();
						$message.info({ content: '正在学习：' + cn });
						$console.log('正在学习：' + cn);
					});

					video.onpause = async () => {
						if (!video?.isConnected) return;
						if (!video?.ended && state.study.stop === false) {
							await $.sleep(1000);
							video?.play();
						}
					};

					video.onended = async () => {
						if (!video?.isConnected) return;
						$message.info('即将自动跳转下一节');
						$console.info('即将自动跳转下一节');
						clearInterval(videoCheckInterval);
						await $.sleep(3000);
						await next();
					};
				};

				doJob();
			}
		}),
		'hike-work': new Script({
			matches: [['AI教学中心-作业任务页面', '/stu-hike/stuHomeworkDo']],
			name: '教学空间-AI智慧课程-作业考试脚本',
			namespace: 'zhs.hike.work',
			configs: {
				notes: workNotes,
				workDelay: {
					label: '作业答题开始时间延迟（秒）',
					defaultValue: 3,
					attrs: { type: 'number', min: 1, step: 1, max: 10 }
				}
			},
			async oncomplete() {
				// 检查是否为软件环境
				CommonProject.scripts.render.methods.pin(this);

				await waitForElement('.q_main');

				commonWork(this, {
					workerProvider: (opts) => {
						return hikeWork(undefined, opts);
					},
					start_delay_seconds: this.cfg.workDelay ?? 3
				});
			}
		}),
		'hike-homework': new Script({
			matches: [
				['AI教学中心-题目作业', '/stu/answer-homework'],
				['AI教学中心-考试答题', '/stu-exam/answer-exam']
			],
			name: '教学空间-AI智慧课程-作业/考试答题脚本',
			namespace: 'zhs.hike.homework',
			configs: {
				notes: workNotes,
				workDelay: {
					label: '作业答题开始时间延迟（秒）',
					defaultValue: 3,
					attrs: { type: 'number', min: 1, step: 1, max: 10 }
				},
				retryTimes: {
					label: '漏题自动重试次数',
					defaultValue: 2,
					attrs: {
						type: 'number',
						min: 0,
						step: 1,
						max: 5,
						title: '答完后仍有题目没选上答案时，只针对这些题目重新搜一遍（填 0 关闭）'
					}
				},
				autoSubmit: {
					label: '考试自动交卷',
					// 交卷不可逆，默认关闭
					defaultValue: false,
					attrs: { type: 'checkbox', title: '仅在考试答题页生效：全部题目作答完成且没有漏题时自动提交试卷' }
				}
			},
			async oncomplete() {
				// 检查是否为软件环境
				CommonProject.scripts.render.methods.pin(this);

				await waitForElement('.question-item');

				commonWork(this, {
					workerProvider: (opts) => {
						return hikeHomework(undefined, opts, {
							autoSubmit: !!this.cfg.autoSubmit,
							retryTimes: Number(this.cfg.retryTimes ?? 2)
						});
					},
					enable_control_panel: true,
					start_delay_seconds: this.cfg.workDelay ?? 3
				});
			}
		})
	}
});

/**
 * 观看视频
 * @param setting
 * @returns
 */
async function watch(
	processor: ZHSProcessor,
	options: { reloadWhenError: boolean; volume: number; playbackRate: number; definition?: 'line1bq' | 'line1gq' },
	actions: {
		onended: (opts: { next: boolean }) => void;
		reload: () => void;
	}
) {
	const reload = async (e: any) => {
		$console.error(e);
		if (options.reloadWhenError) {
			const msg = '视频加载失败，即将刷新页面。';
			const reload_count = await $store.getTab('reload-count');
			if (reload_count && reload_count > 3) {
				const msg = '视频加载失败导致重新加载页面次数超过3次，请尝试关闭页面重新打开，或者检查网络连接！';
				await $store.setTab('reload-count', 0);
				$message.error({ content: msg, duration: 0 });
				$console.log(msg);
				CommonProject.scripts.settings.methods.notificationBySetting(msg, {
					duration: 0,
					extraTitle: '知道智慧树学习脚本'
				});
				return;
			}
			await $store.setTab('reload-count', (reload_count ?? 0) + 1);
			$message.error(msg);
			$console.log(msg);
			setTimeout(() => {
				actions.reload();
			}, 5000);
		} else {
			const msg = '视频加载失败，即将跳过。';
			$message.error(msg);
			$console.log(msg);
			actions.onended({ next: true });
		}
	};

	const set = async () => {
		// 上面操作会导致元素刷新，这里重新获取视频
		try {
			await $.sleep(1000);
			fixProcessBar();
			// 设置清晰度
			await processor.switchLine(options.definition || 'line1bq');
			await $.sleep(1000);
			fixProcessBar();
			// 设置播放速度
			await processor.switchPlaybackRate(options.playbackRate);
			await $.sleep(1000);
			const media = await waitForMedia({ timeout: 10 * 1000 });
			await $.sleep(1000);
			state.study.currentMedia = media;

			if (media) {
				// 如果已经播放完了，则重置视频进度
				media.currentTime = 1;
				// 音量
				media.volume = options.volume;
			}
			return state.study.currentMedia;
		} catch (e) {
			return await reload(e);
		}
	};

	$message.info('开始播放');

	// 部分用户视频加载很慢，这里等待一下
	try {
		const media = await waitForMedia({ timeout: 10 * 1000 });
		media.volume = options.volume;
		// 如果已经播放完了，则重置视频进度
		media.pause();
		// 固定进度条便于下方点击音量等按钮
		fixProcessBar();
	} catch (e) {
		return await reload(e);
	}
	await $.sleep(1000);

	const video = await set();
	if (!video) {
		return await reload('视频加载失败');
	}

	const videoCheckInterval = setInterval(async () => {
		// 如果视频元素无法访问，证明已经切换了视频
		if (video?.isConnected === false) {
			clearInterval(videoCheckInterval);
			$message.info({ content: '检测到视频切换中...' });
			/**
			 * 元素无法访问证明用户切换视频了
			 * 所以不往下播放视频，而是重新播放用户当前选中的视频
			 */
			actions.onended({ next: false });
		}
	}, 3000);

	playMedia(() => video?.play());

	video.onpause = async () => {
		if (!video?.ended && state.study.stop === false) {
			await waitForCaptcha();
			await $.sleep(1000);
			video?.play();
		}
	};

	video.onended = () => {
		clearInterval(videoCheckInterval);
		// 正常切换下一个视频
		actions.onended({ next: true });
	};
}

/**
 * 观看校内课
 */
async function watchXnk(options: { volume: number }, onended: () => void) {
	// 部分用户视频加载很慢，这里等待一下
	const media = await waitForMedia();
	media.volume = options.volume;
	media.currentTime = 1;
	state.study.currentMedia = media;

	playMedia(() => media?.play());

	media.onpause = async () => {
		if (!media?.ended) {
			await $.sleep(1000);
			media?.play();
		}
	};

	media.onended = () => {
		// 正常切换下一个视频
		onended();
	};
}
/**
 * 检测是否有验证码，并等待验证
 */

function checkForCaptcha(update: (hasCaptcha: boolean) => void) {
	let modal: HTMLDivElement | undefined;
	let notified = false;
	return setInterval(() => {
		if ($el('.yidun_popup')) {
			update(true);
			// 如果弹窗不存在，则显示
			if (modal === undefined) {
				modal = $modal.alert({ content: '当前检测到验证码，请输入后方可继续运行。' });
			}
			// 如果没有通知过，则通知
			if (!notified) {
				notified = true;
				CommonProject.scripts.settings.methods.notificationBySetting(
					'智慧树脚本：当前检测到验证码，请输入后方可继续运行。',
					{ duration: 0 }
				);
			}
		} else {
			if (modal) {
				update(false);
				// 关闭弹窗
				modal.remove();
				modal = undefined;
			}
		}
	}, 1000);
}

function waitForCaptcha(): void | Promise<void> {
	const popup = getPopupCaptcha();
	if (popup) {
		const message = $message.warn({ content: '当前检测到验证码，请输入后方可继续运行。', duration: 0 });
		CommonProject.scripts.settings.methods.notificationBySetting(
			'智慧树脚本：当前检测到验证码，请输入后方可继续运行。',
			{ duration: 0 }
		);

		return new Promise<void>((resolve, reject) => {
			const interval = setInterval(() => {
				const popup = getPopupCaptcha();
				if (popup === null) {
					message?.remove();
					clearInterval(interval);
					resolve();
				}
			}, 1000);
		});
	}
}

function getPopupCaptcha() {
	return document.querySelector('.yidun_popup');
}

/**
 * 共享课的作业和考试
 */
function gxkWorkAndExam(
	workInfo: any,
	{ answererWrappers, period, thread, stopSecondWhenFinish, redundanceWordsText, answerSeparators }: CommonWorkOptions
) {
	CommonProject.scripts.workResults.methods.init({
		questionPositionSyncHandlerType: 'zhs-gxk'
	});

	/**
	 * workExamParts 是个列表
	 * 里面包括一个题目类型的列表，第一个是单选，第二个是多选，第三个是判断
	 * 所以这里直接扁平化数组方便处理
	 */
	const allExamParts =
		((workInfo?.rt?.examBase?.workExamParts as any[]) || [])?.map((p) => p.questionDtos).flat() || [];

	const titleTransform = (_: any, index: number) => {
		const div = h('div');

		div.innerHTML = allExamParts[index]?.name || '题目读取失败';
		return removeRedundantWords(
			optimizationElementWithImage(div, true).innerText || '',
			redundanceWordsText.split('\n')
		);
	};
	let request_index = 0;
	/** 新建答题器 */
	const worker = new HonghuWorker({
		root: '.examPaper_subject',
		elements: {
			/**
			 * .subject_describe > div: 选择题题目
			 * .smallStem_describe > div:nth-child(2): 阅读理解小题题目
			 */
			title: '.subject_describe > div,.smallStem_describe > div:nth-child(2)',
			// 选项中图片识别
			options: (root) =>
				$$el('.subject_node .nodeLab', root).map((t) => {
					for (const img of Array.from(t.querySelectorAll<HTMLImageElement>('.node_detail img'))) {
						// zhs选项中如果已显示的图片则不存在 data-src，如果未显示则存在 data-src
						if (img.dataset.src) {
							img.src = img.dataset.src;
						}
						// 不使用 optimizationElementWithImage 是因为zhs的选项按钮也是一个图片
						createUnVisibleTextOfImage(img);
					}
					return t;
				})
		},
		thread: thread ?? 1,
		answerSeparators: answerSeparators.split(',').map((s) => s.trim()),
		/** 默认搜题方法构造器 */
		answerer: (elements, ctx) => {
			const index = request_index++;
			// 优先用页面实际题干，避免接口题目顺序与 DOM 顺序不一致导致错题/漏题
			const domTitle = (elements.title || [])
				.map((t) => (t ? optimizationElementWithImage(t, true).innerText : ''))
				.join(' ')
				.trim();
			const title = domTitle
				? removeRedundantWords(domTitle, redundanceWordsText.split('\n'))
				: titleTransform(undefined, index);
			if (title) {
				return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
					await $.sleep((period ?? 3) * 1000);
					return defaultAnswerWrapperHandler(answererWrappers, {
						type: ctx.type || 'unknown',
						title,
						options: ctx.elements.options.map((o) => o.innerText).join('\n')
					});
				});
			} else {
				throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
			}
		},
		work: {
			type(ctx) {
				const type = ctx.elements.title[0].parentElement?.parentElement
					?.querySelector('.subject_type')
					?.textContent?.trim();
				if (type?.includes('单选') || type?.includes('单项选择')) {
					return 'single';
				} else if (type?.includes('多选') || type?.includes('不定项') || type?.includes('多项选择')) {
					return 'multiple';
				} else if (type?.includes('判断')) {
					return 'judgement';
				} else if (type?.includes('填空') || type?.includes('问答')) {
					return 'completion';
				}

				// 题型文本缺失/特殊（如“选择题”“不定项”）时，按选项控件兜底
				const hasCheckbox = ctx.elements.options.some((o) =>
					o.querySelector('input[type="checkbox"], .el-checkbox__input')
				);
				if (hasCheckbox) return 'multiple';
				const hasRadio = ctx.elements.options.some((o) => o.querySelector('input[type="radio"], .el-radio__input'));
				if (hasRadio) return 'single';
				return undefined;
			},
			/** 自定义处理器 */
			async handler(type, answer, option) {
				if (type === 'judgement' || type === 'single' || type === 'multiple') {
					const input = option.querySelector<HTMLInputElement>('input');
					if (input && !input.checked) {
						await clickOptionUntilSelected(option, () => {
							const cur = option.querySelector<HTMLInputElement>('input');
							return !!cur && !cur.checked;
						});
					}
				} else if (type === 'completion' && answer.trim()) {
					const text = option.querySelector('textarea');
					if (text) {
						text.value = answer;
						await $.sleep(200);
					}
				}
			}
		},
		/** 完成答题后 */
		onResultsUpdate(curr, index, res) {
			CommonProject.scripts.workResults.methods.setResults(simplifyWorkResult(res, titleTransform));

			if (curr.result?.finish) {
				const title = allExamParts[index]?.name;
				if (title) {
					CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
						simplifyWorkResult([curr], (_: any, __: number) => title)
					);
				}
			}
			CommonProject.scripts.workResults.methods.updateWorkStateByResults(res);
		}
	});

	checkForCaptcha((hasCaptcha) => {
		if (hasCaptcha) {
			worker.emit('stop');
		} else {
			worker.emit('continuate');
		}
	});

	worker
		.doWork()
		.then(async (res) => {
			// 如果被强制关闭，则不进行保存操作
			if (worker.isClose === true) {
				return;
			}
			$message.success({ content: `答题完成，将等待 ${stopSecondWhenFinish} 秒后进行保存或提交。` });
			await $.sleep(stopSecondWhenFinish * 1000);
			// @ts-ignore
			if (worker.isClose === true) {
				return;
			}
			/**
			 * 保存题目，不在选择答案后保存的原因是，如果答题线程大于3会导致题目错乱，因为 resolverIndex 并不是顺序递增的
			 */
			for (let index = 0; index < worker.totalQuestionCount; index++) {
				// @ts-ignore
				if (worker.isClose === true) {
					return;
				}
				const modal = $modal.alert({
					title: '提示',
					content: `正在自动保存题目中，不然填写的答案将无效，<br>当前进度 ${index}/${worker.totalQuestionCount}<br>保存完毕前请勿操作...`,
					confirmButton: null,
					maskCloseable: false
				});
				await waitForCaptcha();
				await $.sleep(2000);
				// 跳转到该题目，防止用户在保存时切换题目
				trustedClick(document.querySelectorAll<HTMLElement>('.answerCard_list ul li').item(index));
				await $.sleep(200);
				// 下一页
				const next = $el('div.examPaper_box > div.switch-btn-box > button:nth-child(2)');
				if (next) {
					await safeClick(next);
				} else {
					$console.error('未找到下一页按钮。');
				}
				modal?.remove();
			}
			$message.info({ content: '作业/考试完成，请自行检查后保存或提交。', duration: 0 });
			worker.emit('done');
		})
		.catch((err) => {
			$message.error({ content: '答题程序发生错误 : ' + err.message, duration: 0 });
		});

	return worker;
}

/**
 * 校内学分课的作业
 */
function xnkWork({ answererWrappers, period, thread, answerSeparators }: CommonWorkOptions) {
	$message.info({ content: '开始作业' });

	CommonProject.scripts.workResults.methods.init();

	const titleTransform = (titles: (HTMLElement | undefined)[]) => {
		return titles
			.filter((t) => t?.innerText)
			.map((t) => (t ? optimizationElementWithImage(t).innerText : ''))
			.join(',');
	};

	const workResults: SimplifyWorkResult[] = [];
	let totalQuestionCount = 0;
	let requestedCount = 0;
	let resolvedCount = 0;

	const worker = new HonghuWorker({
		// .questionBox 有两个同样的，这里选择具有直接子元素questionContent的div元素，保证题目唯一
		root: 'div:has(> .questionContent)' /** .questionBox */,
		elements: {
			title: '.questionContent',
			options: '.optionUl label',
			questionTit: '.questionTit'
		},
		thread: thread ?? 1,
		answerSeparators: answerSeparators.split(',').map((s) => s.trim()),
		/** 默认搜题方法构造器 */
		answerer: (elements, ctx) => {
			const title = titleTransform(elements.title);
			if (title) {
				return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
					await $.sleep((period ?? 3) * 1000);
					return defaultAnswerWrapperHandler(answererWrappers, {
						type: ctx.type || 'unknown',
						title,
						options: ctx.elements.options.map((o) => o.innerText).join('\n')
					});
				});
			} else {
				throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
			}
		},
		work: {
			/** 自定义处理器 */
			async handler(type, answer, option, ctx) {
				if (type === 'judgement' || type === 'single' || type === 'multiple') {
					const input = option.querySelector<HTMLInputElement>('input');
					if (input && !input.checked) {
						await clickOptionUntilSelected(option, () => {
							const cur = option.querySelector<HTMLInputElement>('input');
							return !!cur && !cur.checked;
						});
					}
				} else if (type === 'completion' && answer.trim()) {
					const text = option.querySelector('textarea');
					if (text) {
						text.value = answer;
						await $.sleep(200);
					}
				}
			}
		},

		/**
		 * 因为校内课的考试和作业都是一题一题做的，不像其他自动答题一样可以获取全部试卷内容。
		 * 所以只能根据自定义的状态进行搜索结果的显示。
		 */
		onResultsUpdate(current, _, res) {
			if (current.result) {
				workResults.push(...simplifyWorkResult([current], titleTransform));
				CommonProject.scripts.workResults.methods.setResults(workResults);
				totalQuestionCount++;
				requestedCount++;
				resolvedCount++;
			}

			if (current.result?.finish) {
				CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
					simplifyWorkResult([current], titleTransform)
				);
			}
			CommonProject.scripts.workResults.methods.updateWorkState({
				totalQuestionCount,
				requestedCount,
				resolvedCount
			});
		}
	});

	const getBtn = () => document.querySelector('span.Topicswitchingbtn:nth-child(2)') as HTMLElement;
	let next = getBtn();

	(async () => {
		while (next && worker.isClose === false) {
			await worker.doWork();
			await $.sleep(1000);
			next = getBtn();
			if (next) await safeClick(next);
			await $.sleep(1000);
		}

		$message.info({ content: '作业/考试完成，请自行检查后保存或提交。', duration: 0 });
		worker.emit('done');
		// 答题完成后，题库选项点击才会同步题目，否则会导致题目错乱
		CommonProject.scripts.workResults.cfg.questionPositionSyncHandlerType = 'zhs-xnk';
	})();

	return worker;
}

/**
 * 智慧课程的作业
 */
function smartWork(
	remotePage: RemotePage | undefined,
	{ answererWrappers, period, thread, answerSeparators }: CommonWorkOptions
) {
	/** 掌握度练习页由脚本自动交卷，提示文案要跟着换，别再说「自行保存或提交」 */
	const autoSubmitOnThisPage = location.href.includes(ZHS_POINT_EXAM_HOST);

	$message.info({ content: autoSubmitOnThisPage ? '开始答题（答完自动提交）' : '开始作业' });
	$message.warn({
		content: autoSubmitOnThisPage
			? '答题中请勿操作页面，答完会自动提交试卷并返回课程。'
			: '答题中请勿进行任何操作，如需暂停答题，请等待全部题目搜索完成并执行自动保存功能后才能操作。',
		duration: 0,
		closeable: false
	});

	CommonProject.scripts.workResults.methods.init();

	const titleTransform = (titles: (HTMLElement | undefined)[]) => {
		return titles
			.filter((t) => t?.innerText)
			.map((t) => (t ? optimizationElementWithImage(t).innerText : ''))
			.join(',');
	};

	const workResults: SimplifyWorkResult[] = [];
	let totalQuestionCount = 0;
	let requestedCount = 0;
	let resolvedCount = 0;

	const worker = new HonghuWorker({
		root: '.questionContent',
		elements: {
			title: '.questionName .centent-pre',
			options: '.radio-view li.clearfix, .checkbox-views label.el-checkbox, .fillAnswer'
		},
		thread: thread ?? 1,
		answerSeparators: answerSeparators.split(',').map((s) => s.trim()),
		/** 默认搜题方法构造器 */
		answerer: async (elements, ctx) => {
			const title = titleTransform(elements.title);
			if (title) {
				/**
				 * 优先用解析页抄下来的答案：
				 * 掌握度重做轮用的就是这套题，比重新搜题又快又准。
				 */
				const collected = await lookupMasteryAnswer(title);
				if (collected) {
					return [
						{
							// 结果面板会显示这个来源，标明该题用的是「解析页抄下来的答案」
							name: MASTERY_ANSWER_SOURCE,
							homepage: '',
							results: [{ question: title, answer: collected, extra_data: { cache: true } }]
						}
					];
				}

				/**
				 * 掌握度练习页上没命中本地答案，说明题干对不上、或者这道是平台新抽的题。
				 * 记一条方便排查「明明抄过答案却走了 AI」的情况。
				 */
				if (location.href.includes(ZHS_POINT_EXAM_HOST)) {
					const total = await countMasteryAnswers();
					if (total > 0) {
						$console.log(`[掌握度] 未命中本地答案（表内 ${total} 条）：${title.slice(0, 40)}`);
					}
				}
				return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
					await $.sleep((period ?? 3) * 1000);
					return defaultAnswerWrapperHandler(answererWrappers, {
						type: ctx.type || 'unknown',
						title,
						options: ctx.elements.options.map((o) => o.innerText).join('\n')
					});
				});
			} else {
				throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
			}
		},
		work: {
			type(ctx) {
				const type = ctx.elements.title[0]?.parentElement?.querySelector('.letterSortNum')?.textContent;
				if (type?.includes('单选') || type?.includes('单项选择')) {
					return 'single';
				} else if (type?.includes('多选') || type?.includes('不定项') || type?.includes('多项选择')) {
					return 'multiple';
				} else if (type?.includes('判断')) {
					return 'judgement';
				} else if (type?.includes('填空') || type?.includes('问答')) {
					return 'completion';
				} else {
					return undefined;
				}
			},
			/** 自定义处理器 */
			async handler(type, answer, option, ctx) {
				if (type === 'judgement' || type === 'single' || type === 'multiple') {
					const selector = '.el-checkbox__input:not(.is-checked),i.iconfont:not(.checkedIcon)';
					const isNotSelected = () => !!option.querySelector(selector);
					if (isNotSelected()) {
						await clickOptionUntilSelected(option, isNotSelected, async (el) => {
							const target = el.querySelector<HTMLElement>(selector);
							if (!target) return;
							await clickElement(remotePage, target);
						});
					}
				} else if (type === 'completion') {
					const opt = option.querySelector<HTMLInputElement>('input');
					if (opt && answer.trim()) {
						if (remotePage) {
							await remotePage.click(opt);
							opt.value = '';
							await remotePage['keyboard.type'](answer, { delay: Math.floor(Math.random() * 100) });
						} else {
							opt.value = answer;
						}
						await $.sleep(200);
					}
				}
			}
		},
		/**
		 * 作业都是一题一题做的，不像其他自动答题一样可以获取全部试卷内容。
		 * 所以只能根据自定义的状态进行搜索结果的显示。
		 */
		onResultsUpdate(current, _, res) {
			if (current.result) {
				workResults.push(...simplifyWorkResult([current], titleTransform));
				CommonProject.scripts.workResults.methods.setResults(workResults);
				totalQuestionCount++;
				requestedCount++;
				resolvedCount++;
			}

			if (current.result?.finish) {
				const swr = simplifyWorkResult([current], titleTransform);
				/**
				 * 用「解析页抄下来的答案」答对的题不再写进题库缓存：
				 * 它本来就在本地答案表里，重复写只会挤占 localQuestionCaches 的 200 条额度。
				 */
				const cacheable = swr.filter(
					(r) => !r.searchInfos.some((i) => i.name === MASTERY_ANSWER_SOURCE)
				);
				if (cacheable.length) {
					CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(cacheable);
				}
			}
			CommonProject.scripts.workResults.methods.updateWorkState({
				totalQuestionCount,
				requestedCount,
				resolvedCount
			});
		}
	});

	const getNextBtn = () => {
		const byClass = document.querySelector<HTMLElement>('.next-topic.next-t');
		// 类名命中也要确认不是「提交/交卷」，否则最后一题会把提交按钮当下一题点掉
		if (byClass && !/提交|交卷/.test(byClass.textContent || '')) return byClass;

		/**
		 * 平台到底后的写法：`.next-topic.next-t` 换成 `.next-topic.noNext`（按钮置灰）。
		 * 这是最可靠的「最后一题」信号，直接返回 null 结束循环。
		 */
		const container = document.querySelector<HTMLElement>('.next-topic.next-t, .next-topic.noNext');
		if (container && /noNext/i.test(String(container.className))) return null;

		// 类名被平台改掉时按文案兜底，否则答完第一题就以为做完了
		return findVisibleClickableByText(/^下一题$/) || null;
	};

	/**
	 * 清掉当前题的旧选择
	 *
	 * 掌握度重做用的是同一个 examTestId，平台会把上一轮的作答带回来。
	 * 不清的话，之前选错的选项还亮着，脚本判断「已选中」就跳过，
	 * 这一轮改都改不动，重做等于白做。
	 */
	const clearCurrentQuestionSelections = async () => {
		const root = document.querySelector('.questionContent');
		if (!root) return;
		const checked = Array.from(
			root.querySelectorAll<HTMLElement>(
				'.el-radio__input.is-checked, .el-checkbox__input.is-checked, i.iconfont.checkedIcon'
			)
		);
		if (checked.length === 0) return;
		for (const el of checked) {
			await clickElement(remotePage, el);
			await $.sleep(150);
		}
		await $.sleep(300);
	};

	let next = null as HTMLElement | null;

	(async () => {
		// 从第一题开始
		const first = document.querySelector<HTMLElement>('[role="treeitem"] .font-sec-style-node');
		if (first) {
			if (remotePage) await remotePage.click(first);
			else trustedClick(first);
			await $.sleep(3000);
		}
		let count = 0;
		// 答题卡题数作为循环上限的参考（拿不到就退回固定 100），防止任何未知原因空转
		const cardCount = document.querySelectorAll('[role="treeitem"]').length;
		const maxRounds = cardCount > 0 ? cardCount + 10 : 100;
		while (worker.isClose === false) {
			if (count > maxRounds) {
				$console.log(`答题循环超过 ${maxRounds} 次，强制结束`);
				break;
			}

			await clearCurrentQuestionSelections();
			await worker.doWork({ enable_debug: BackgroundProject.scripts.dev.cfg.enable_answerer_debug });
			next = getNextBtn();
			if (!next) {
				break;
			}

			await $.sleep(1000);
			if (remotePage) await remotePage.click(next);
			else trustedClick(next);
			// 等待题目加载
			await $.sleep(1500);
			count++;
		}

		/**
		 * 掌握度练习页是脚本自动交卷的，别再说「请自行检查后保存或提交」误导人。
		 * 其它作业/考试页面保持原提示（那边确实要用户自己提交）。
		 */
		$message.info({
			content: autoSubmitOnThisPage
				? '答题完成，正在自动提交试卷…'
				: '作业/考试完成，请自行检查后保存或提交。',
			duration: autoSubmitOnThisPage
				? 8
				: // 题目过多则不自动关闭
				  count > 10
					? 0
					: 30
		});
		worker.emit('done');
		// 答题完成后，题库选项点击才会同步题目，否则会导致题目错乱
		CommonProject.scripts.workResults.cfg.questionPositionSyncHandlerType = 'zhs-smart';
	})();
	return worker;
}

/**
 * 等掌握度练习页出题。
 *
 * 从学习页「去提升」跳过来时可能先落在「AI 复习过渡页」（pointAIReviewTransitionPage），
 * 要先点一下主按钮才进试卷。这里一边等 `.questionContent`，一边尝试点一次
 * 「开始答题 / 继续 / 进入练习」这类短文案按钮，避免只认题号而卡在过渡页。
 */
async function waitPointExamReady(timeoutSeconds = 60): Promise<boolean> {
	const startedAt = Date.now();
	let triedStart = false;
	while (Date.now() - startedAt < timeoutSeconds * 1000) {
		if (document.querySelector('.questionContent')) return true;

		if (!triedStart) {
			const start = findVisibleClickableByText(/^(开始答题|开始练习|继续答题|进入练习|立即开始|开始作答)$/);
			if (start) {
				triedStart = true;
				$message.info({ content: '正在进入掌握度练习' });
				await safeClick(start);
				await $.sleep(3000);
				continue;
			}
		}

		await $.sleep(1000);
	}
	return !!document.querySelector('.questionContent');
}

/**
 * 提交掌握度练习试卷：先点「提交/交卷」，再处理「你还有 X 道题未作答，是否提交？」的确认弹窗。
 *
 * 平台各版本按钮文案不统一，所以用文案匹配；点击后靠「提交按钮消失」或成功文案判定结果，
 * 不能只 sleep 固定时间 —— 提交接口慢的时候会误判成已经提交，进而白跳回学习页丢掉答案。
 */
async function submitPointExamPaper(): Promise<boolean> {
	await $.sleep(2000);

	// 试卷页的按钮在右上角，文案是「提交作业」（不是「提交试卷」），且只是 div
	const submitText = /^(提交作业|提交试卷|提交答卷|提交答案|提交|交卷)$/;
	const submit = findVisibleClickableByText(submitText);
	if (!submit) {
		$message.warn({ content: '未找到「提交作业」按钮，请手动提交', duration: 0 });
		return false;
	}

	dispatchMouseSequence(submit);
	trustedClick(submit);
	await $.sleep(1500);

	// 有未作答题目时平台会弹确认框，确认按钮可能是「确定」也可能是「继续提交」
	const dialog = document.querySelector<HTMLElement>('.el-message-box, .el-dialog, .confirm-dialog-component');
	const confirm = dialog
		? findVisibleClickableByText(/^(确定|确认|提交作业|提交|继续提交)$/, dialog)
		: undefined;
	if (confirm) {
		dispatchMouseSequence(confirm);
		trustedClick(confirm);
		await $.sleep(1000);
	}

	for (let i = 0; i < 20; i++) {
		await $.sleep(1000);
		// 提交按钮消失，说明已经跳到结果页或试卷变为已提交状态
		if (!findVisibleClickableByText(submitText)) {
			$message.success({ content: '掌握度练习已提交', duration: 5 });
			return true;
		}
		if (/提交成功|交卷成功|试卷已提交|提交完成/.test(document.body?.innerText || '')) {
			$message.success({ content: '掌握度练习已提交', duration: 5 });
			return true;
		}
	}

	$message.warn({ content: '未能确认提交结果，请手动检查后返回学习页', duration: 0 });
	return false;
}

/**
 * 掌握度练习答完后收尾：提交试卷 → 跳回学习页继续。
 *
 * 只有从学习页「去提升」进来（tab 存储里有返回标记）的才跳回去，
 * 用户手动打开试卷页答完保持原样，不会突然把人踢走。
 */
async function finishPointExamPractice(autoSubmit: boolean) {
	const saved = (await $store.getTab(ZHS_MASTERY_RETURN_KEY)) as { url?: string; at?: number } | null;
	// 标记只认 2 小时内的：题目多的时候答上一个小时也正常，太短的窗口会让返回失效
	const back = saved?.url && Date.now() - (saved.at || 0) < 2 * 60 * 60 * 1000 ? saved : null;

	/**
	 * 只有从学习页「去提升」进来的（有返回标记）才自动提交并跳回。
	 * 手动打开的试卷页保持原样 —— 这个域名下也可能有正式考试，不能替用户交卷。
	 */
	if (!back) {
		$message.info({ content: '练习已完成，请手动检查后提交。', duration: 0 });
		return;
	}

	if (!autoSubmit) {
		$message.warn({ content: '已关闭自动提交，请手动提交试卷后返回学习页', duration: 0 });
		return;
	}

	const ok = await submitPointExamPaper();
	// 没提交成功就留在页面上让人工处理，跳走会把这份答案丢掉
	if (!ok) return;

	/**
	 * 提交成功后平台通常会自己整页跳到 `/point/...` 结果页，
	 * 判分、未满分重做都在那边接管（本页 JS 会被销毁，这里写什么都不会执行）。
	 * 所以先等它跳，没跳再自己回学习页 —— 不然会和平台的跳转打架。
	 */
	for (let i = 0; i < 15; i++) {
		await $.sleep(1000);
		if (!location.href.includes(ZHS_POINT_EXAM_HOST)) return;
	}

	/**
	 * 平台没跳：自己回学习页。
	 * 注意这里不能把标记清掉：学习页要靠它判断「刚练完回来」，
	 * 从而把视频进度顶到末尾而不是重播。
	 */
	await $store.setTab(ZHS_MASTERY_RETURN_KEY, { ...back, at: Date.now() });
	$message.success({ content: '掌握度练习已完成，即将返回课程继续学习', duration: 5 });
	await $.sleep(2000);
	location.replace(back.url!);
}

function smartExam(
	remotePage: RemotePage | undefined,
	{ answererWrappers, period, thread, answerSeparators }: CommonWorkOptions
) {
	$message.info({ content: '开始作业' });
	$message.warn({
		content: '答题中请勿进行任何操作，如需暂停答题，请等待全部题目搜索完成并执行自动保存功能后才能操作。',
		duration: 0,
		closeable: false
	});

	CommonProject.scripts.workResults.methods.init();

	const titleTransform = (titles: (HTMLElement | undefined)[]) => {
		return titles
			.filter((t) => t?.innerText)
			.map((t) => (t ? optimizationElementWithImage(t).innerText : ''))
			.join(',');
	};

	const workResults: SimplifyWorkResult[] = [];
	let totalQuestionCount = 0;
	let requestedCount = 0;
	let resolvedCount = 0;

	const worker = new HonghuWorker({
		root: '.question-area-content',
		elements: {
			type: 'div.flex.items-center.mb-\\[16px\\]',
			title: 'div.flex-1 .mb-\\[32px\\] .text-mainText.font-medium',
			options: 'label.user-select.group,div.real-editor'
		},
		thread: thread ?? 1,
		answerSeparators: answerSeparators.split(',').map((s) => s.trim()),
		/** 默认搜题方法构造器 */
		answerer: (elements, ctx) => {
			const title = titleTransform(elements.title);
			if (title) {
				return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
					await $.sleep((period ?? 3) * 1000);
					return defaultAnswerWrapperHandler(answererWrappers, {
						type: ctx.type || 'unknown',
						title,
						options: ctx.elements.options.map((o) => o.innerText).join('\n')
					});
				});
			} else {
				throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
			}
		},
		work: {
			type(ctx) {
				const type = ctx.elements.type[0].textContent;
				if (type?.includes('单选') || type?.includes('单项选择')) {
					return 'single';
				} else if (type?.includes('多选') || type?.includes('不定项') || type?.includes('多项选择')) {
					return 'multiple';
				} else if (type?.includes('判断')) {
					return 'judgement';
				} else if (type?.includes('填空') || type?.includes('问答')) {
					return 'completion';
				} else {
					return undefined;
				}
			},
			/** 自定义处理器 */
			async handler(type, answer, option, ctx) {
				if (type === 'judgement' || type === 'single' || type === 'multiple') {
					// mainBg 为已经选择的选项的背景色，未选择的选项没有这个类
					const isNotSelected = () => option.querySelector<HTMLElement>('div.bg-mainBg') === null;
					if (isNotSelected()) {
						await clickOptionUntilSelected(option, isNotSelected, (el) => clickElement(remotePage, el));
					}
				} else if (type === 'completion') {
					// 简答
					if (option.classList.contains('real-editor')) {
						// @ts-ignore
						option.ckeditorInstance.data.set(answer);
					} else {
						const input = option.querySelector<HTMLInputElement>('input');
						if (input) {
							input.value = answer;
							Reflect.set(input, 'composition', true);
							trustedDispatch(input, new OrigEvent('input', { bubbles: true, composed: true }));
						}
					}

					await $.sleep(200);
				}
			}
		},
		/**
		 * 作业都是一题一题做的，不像其他自动答题一样可以获取全部试卷内容。
		 * 所以只能根据自定义的状态进行搜索结果的显示。
		 */
		onResultsUpdate(current, _, res) {
			if (current.result) {
				workResults.push(...simplifyWorkResult([current], titleTransform));
				CommonProject.scripts.workResults.methods.setResults(workResults);
				totalQuestionCount++;
				requestedCount++;
				resolvedCount++;
			}

			if (current.result?.finish) {
				CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
					simplifyWorkResult([current], titleTransform)
				);
			}
			CommonProject.scripts.workResults.methods.updateWorkState({
				totalQuestionCount,
				requestedCount,
				resolvedCount
			});
		}
	});

	const getNextBtn = () =>
		Array.from(document.querySelectorAll('button')).find((btn) =>
			btn.textContent?.includes('下一题')
		) as HTMLElement | null;
	let next = null as HTMLElement | null;

	(async () => {
		// 从第一题开始
		const first = document.querySelector<HTMLElement>('.grid.grid-cols-7 > button');
		if (first) {
			if (remotePage) await remotePage.click(first);
			else trustedClick(first);
			await $.sleep(3000);
		}
		let count = 0;
		while (worker.isClose === false) {
			await worker.doWork({ enable_debug: BackgroundProject.scripts.dev.cfg.enable_answerer_debug });
			next = getNextBtn();
			if (!next) {
				break;
			}

			await $.sleep(1000);
			if (remotePage) await remotePage.click(next);
			else trustedClick(next);
			// 等待题目加载
			await $.sleep(1000);
			count++;
		}

		$message.info({
			content: '作业/考试完成，请自行检查后保存或提交。',
			duration:
				// 题目过多则不自动关闭
				count > 10 ? 0 : 30
		});
		worker.emit('done');
		// 答题完成后，题库选项点击才会同步题目，否则会导致题目错乱
		CommonProject.scripts.workResults.cfg.questionPositionSyncHandlerType = 'zhs-smart';
	})();
	return worker;
}

function fusioncourseWork(
	remotePage: RemotePage | undefined,
	{ answererWrappers, period, thread, answerSeparators }: CommonWorkOptions
) {
	$message.info({ content: '开始作业' });

	CommonProject.scripts.workResults.methods.init({
		questionPositionSyncHandlerType: 'zhs-fusion'
	});

	const titleTransform = (titles: (HTMLElement | undefined)[]) => {
		return titles
			.filter((t) => t?.innerText)
			.map((t) => (t ? optimizationElementWithImage(t).innerText : ''))
			.join(',');
	};

	const worker = new HonghuWorker({
		root: '.exam-item',
		elements: {
			type: '.quest-type',
			title: '.quest-title .option-name',
			options: 'label'
		},
		thread: thread ?? 1,
		answerSeparators: answerSeparators.split(',').map((s) => s.trim()),
		/** 默认搜题方法构造器 */
		answerer: (elements, ctx) => {
			const title = titleTransform(elements.title);
			if (title) {
				return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
					await $.sleep((period ?? 3) * 1000);
					return defaultAnswerWrapperHandler(answererWrappers, {
						type: ctx.type || 'unknown',
						title,
						options: ctx.elements.options.map((o) => o.innerText).join('\n')
					});
				});
			} else {
				throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
			}
		},
		work: {
			type(ctx) {
				const type = ctx.elements.type[0].textContent;
				if (type?.includes('单选') || type?.includes('单项选择')) {
					return 'single';
				} else if (type?.includes('多选') || type?.includes('不定项') || type?.includes('多项选择')) {
					return 'multiple';
				} else if (type?.includes('判断')) {
					return 'judgement';
				} else if (type?.includes('填空') || type?.includes('问答')) {
					return 'completion';
				} else {
					return undefined;
				}
			},
			/** 自定义处理器 */
			async handler(type, answer, option, ctx) {
				if (type === 'judgement' || type === 'single' || type === 'multiple') {
					const selector = '.el-checkbox__input:not(.is-checked),.el-radio__input:not(.is-checked)';
					const isNotSelected = () => !!option.querySelector(selector);
					if (isNotSelected()) {
						await clickOptionUntilSelected(option, isNotSelected, async (el) => {
							const target = el.querySelector<HTMLElement>(selector);
							if (!target) return;
							await clickElement(remotePage, target);
						});
					}
				}
			}
		},

		/**
		 * 作业都是一题一题做的，不像其他自动答题一样可以获取全部试卷内容。
		 * 所以只能根据自定义的状态进行搜索结果的显示。
		 */
		onResultsUpdate(current, _, res) {
			if (current.result) {
				CommonProject.scripts.workResults.methods.setResults(simplifyWorkResult(res, titleTransform));
			}

			if (current.result?.finish) {
				CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
					simplifyWorkResult([current], titleTransform)
				);
			}
			CommonProject.scripts.workResults.methods.updateWorkStateByResults(res);
		}
	});

	worker
		.doWork()
		.then(async (res) => {
			// 如果被强制关闭，则不进行保存操作
			if (worker.isClose === true) {
				return;
			}

			// @ts-ignore
			if (worker.isClose === true) {
				return;
			}

			$message.info({
				content: '作业/考试完成，请自行检查后保存或提交。',
				// 题目过多则不自动关闭
				duration: res.length > 10 ? 0 : 30
			});
			worker.emit('done');
		})
		.catch((err) => {
			$message.error({ content: '答题程序发生错误 : ' + err.message, duration: 0 });
		});

	return worker;
}

function hikeWork(
	remotePage: RemotePage | undefined,
	{ answererWrappers, period, thread, answerSeparators }: CommonWorkOptions
) {
	$message.info({ content: '开始作业' });

	CommonProject.scripts.workResults.methods.init({
		questionPositionSyncHandlerType: 'zhs-hike'
	});

	const titleTransform = (titles: (HTMLElement | undefined)[]) => {
		return titles
			.filter((t) => t?.innerText)
			.map((t) => (t ? optimizationElementWithImage(t).innerText : ''))
			.join(',');
	};

	const worker = new HonghuWorker({
		root: '.q_main',
		elements: {
			type: '.question_score',
			title: '.question-topic',
			options: 'label'
		},
		thread: thread ?? 1,
		answerSeparators: answerSeparators.split(',').map((s) => s.trim()),
		/** 默认搜题方法构造器 */
		answerer: (elements, ctx) => {
			const title = titleTransform(elements.title);
			if (title) {
				return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
					await $.sleep((period ?? 3) * 1000);
					return defaultAnswerWrapperHandler(answererWrappers, {
						type: ctx.type || 'unknown',
						title,
						options: ctx.elements.options.map((o) => o.innerText).join('\n')
					});
				});
			} else {
				throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
			}
		},
		work: {
			type(ctx) {
				const type = ctx.elements.type[0].textContent;
				if (type?.includes('单选') || type?.includes('单项选择')) {
					return 'single';
				} else if (type?.includes('多选') || type?.includes('不定项') || type?.includes('多项选择')) {
					return 'multiple';
				} else if (type?.includes('判断')) {
					return 'judgement';
				} else if (type?.includes('填空') || type?.includes('问答')) {
					return 'completion';
				} else {
					return undefined;
				}
			},
			/** 自定义处理器 */
			async handler(type, answer, option, ctx) {
				if (type === 'judgement' || type === 'single' || type === 'multiple') {
					const selector = '.el-checkbox__input:not(.is-checked),.el-radio__input:not(.is-checked)';
					const isNotSelected = () => !!option.querySelector(selector);
					if (isNotSelected()) {
						await clickOptionUntilSelected(option, isNotSelected, async (el) => {
							const target = el.querySelector<HTMLElement>(selector);
							if (!target) return;
							await clickElement(remotePage, target);
						});
					}
				}
			}
		},

		/**
		 * 作业都是一题一题做的，不像其他自动答题一样可以获取全部试卷内容。
		 * 所以只能根据自定义的状态进行搜索结果的显示。
		 */
		onResultsUpdate(current, _, res) {
			if (current.result) {
				CommonProject.scripts.workResults.methods.setResults(simplifyWorkResult(res, titleTransform));
			}

			if (current.result?.finish) {
				CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
					simplifyWorkResult([current], titleTransform)
				);
			}
			CommonProject.scripts.workResults.methods.updateWorkStateByResults(res);
		}
	});

	const getNextBtn = () => document.querySelector<HTMLElement>('.check_btn:not(.is-disabled)');
	let next = getNextBtn();
	let count = 0;

	(async () => {
		// 从第一题开始
		const first = document.querySelector<HTMLElement>('.card_ul .card_li');
		if (first) {
			if (remotePage) await remotePage.click(first);
			else trustedClick(first);
			await $.sleep(3000);
		}

		while (next && worker.isClose === false) {
			await worker.doWork({ enable_debug: BackgroundProject.scripts.dev.cfg.enable_answerer_debug });
			next = getNextBtn();
			if (next) {
				await $.sleep(1000);
				if (remotePage) await remotePage.click(next);
				else trustedClick(next);
				// 等待题目加载
				await $.sleep(1000);
				count++;
			}
		}

		$message.info({ content: '作业/考试完成，请自行检查后保存或提交。', duration: count > 10 ? 0 : 30 });
		worker.emit('done');
		// 答题完成后，题库选项点击才会同步题目，否则会导致题目错乱
		CommonProject.scripts.workResults.cfg.questionPositionSyncHandlerType = 'zhs-hike';
	})();

	return worker;
}

function hikeHomework(
	remotePage: RemotePage | undefined,
	{ answererWrappers, period, thread, answerSeparators }: CommonWorkOptions,
	options: { autoSubmit?: boolean; retryTimes?: number } = {}
) {
	/** 智慧树 AI 教学中心的新版考试答题页 */
	const isExam = location.pathname.includes('/stu-exam/answer-exam');

	$message.info({ content: isExam ? '开始考试答题' : '开始作业' });

	// CommonProject.scripts.workResults.methods.init({
	// 	questionPositionSyncHandlerType: 'zhs-hike'
	// });

	const titleTransform = (titles: (HTMLElement | undefined)[]) => {
		return (
			titles
				.filter((t) => t?.innerText)
				// 克隆后再补图片地址，避免改动答题页本身
				.map((t) => (t ? optimizationElementWithImage(t, true).innerText : ''))
				.join(',')
		);
	};

	/** 创建答题器；漏题重试时只把剩下的题目交给它 */
	const createWorker = (cfg: { roots?: HTMLElement[]; silentResults?: boolean } = {}) =>
		new HonghuWorker({
			root: cfg.roots ?? '.question-item',
			elements: {
				type: '.title-box,.combination-title',
				title: '.qeustion-content , .combination-content ',
				options: '.option-item, .vditor-content'
			},
			thread: thread ?? 1,
			answerSeparators: answerSeparators.split(',').map((s) => s.trim()),
			/** 默认搜题方法构造器 */
			answerer: (elements, ctx) => {
				const title = titleTransform(elements.title);
				if (title) {
					return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
						await $.sleep((period ?? 3) * 1000);
						return defaultAnswerWrapperHandler(answererWrappers, {
							type: ctx.type || 'unknown',
							title,
							options: ctx.elements.options.map((o) => o.innerText).join('\n')
						});
					});
				} else {
					throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
				}
			},
			work: {
				type(ctx) {
					const type = ctx.elements.type[0].textContent;
					if (type?.includes('单选') || type?.includes('单项选择')) {
						return 'single';
					} else if (type?.includes('多选') || type?.includes('不定项') || type?.includes('多项选择')) {
						return 'multiple';
					} else if (type?.includes('判断')) {
						return 'judgement';
					} else if (type?.includes('填空') || type?.includes('问答')) {
						return 'completion';
					} else {
						return undefined;
					}
				},
				/** 自定义处理器 */
				async handler(type, answer, option, ctx) {
					if (type === 'judgement' || type === 'single' || type === 'multiple') {
						const input = option.querySelector<HTMLInputElement>('input');
						if (input) {
							// 老版作业页：选项里带原生 input，用 checked 判断是否已选
							if (!input.checked) {
								await clickOptionUntilSelected(
									option,
									() => {
										const cur = option.querySelector<HTMLInputElement>('input');
										return !!cur && !cur.checked;
									},
									(el) => clickElement(remotePage, el)
								);
							}
						} else if (!isOptionChosen(option)) {
							/**
							 * 新版考试答题页（polymas exam-hub）：选项里没有 input，
							 * 选中状态写在 class 上（is-choose），且只认真实鼠标事件序列，
							 * 直接 el.click() 选不上。
							 */
							await clickOptionUntilChosen(option, (el) => clickOptionNatively(remotePage, el));
						}
					} else if (type === 'completion') {
						const editor = option.querySelector('.vditor-reset');
						if (editor) {
							editor.innerHTML = `<p data-block="0">${answer.trim()}</p>`;
						} else {
							const field = option.querySelector<HTMLTextAreaElement>(
								'textarea, input[type="text"], .el-textarea__inner'
							);
							if (field) setNativeValue(field, answer.trim());
						}
					}
				}
			},

			/**
			 * 作业都是一题一题做的，不像其他自动答题一样可以获取全部试卷内容。
			 * 所以只能根据自定义的状态进行搜索结果的显示。
			 */
			onResultsUpdate(current, _, res) {
				// 重试时保留首次作答的完整列表，避免结果面板被局部结果覆盖
				if (current.result && !cfg.silentResults) {
					CommonProject.scripts.workResults.methods.setResults(simplifyWorkResult(res, titleTransform));
				}

				if (current.result?.finish) {
					CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
						simplifyWorkResult([current], titleTransform)
					);
				}
				CommonProject.scripts.workResults.methods.updateWorkStateByResults(res);
			}
		});

	const worker = createWorker();

	/**
	 * 漏题自动重试：只把还没选上答案的题目交给一个新的答题器重新搜一遍，
	 * 已答好的题目不会被重复搜索、也不会被改动。
	 */
	const retryMissingQuestions = async (times: number) => {
		let stats = summarizeHikeQuestions();

		for (let round = 1; round <= times && stats.missing.length && !worker.isClose; round++) {
			// 稍等一下，给页面留出把上次选中态渲染完的时间，再重新取节点
			await $.sleep(1500);
			const roots = getUnansweredQuestionRoots();
			if (!roots.length) break;

			$message.warn({ content: `还有 ${roots.length} 题没答上，开始第 ${round}/${times} 次自动重试`, duration: 4 });
			$console.log(`漏题重试 ${round}/${times}：剩余 ${roots.length} 题`);

			const retryWorker = createWorker({ roots, silentResults: true });
			// 面板上的暂停 / 继续 / 关闭 也要作用到重试中的答题器
			const forward = {
				stop: () => retryWorker.emit('stop'),
				continuate: () => retryWorker.emit('continuate'),
				close: () => retryWorker.emit('close')
			};
			worker.on('stop', forward.stop);
			worker.on('continuate', forward.continuate);
			worker.on('close', forward.close);
			try {
				await retryWorker.doWork({ enable_debug: BackgroundProject.scripts.dev.cfg.enable_answerer_debug });
			} catch (e) {
				$console.error(e);
			} finally {
				worker.off('stop', forward.stop);
				worker.off('continuate', forward.continuate);
				worker.off('close', forward.close);
			}

			stats = summarizeHikeQuestions();
		}

		return stats;
	};

	worker.doWork({ enable_debug: BackgroundProject.scripts.dev.cfg.enable_answerer_debug }).then(async () => {
		const retryTimes = options.retryTimes ?? 0;
		let stats = summarizeHikeQuestions();

		// 有漏题且开启了重试时才多跑一轮
		if (retryTimes > 0 && stats.missing.length) {
			stats = await retryMissingQuestions(retryTimes);
		}

		$console.log(`作答结束：共 ${stats.total} 题，已选中 ${stats.answered} 题`);

		if (stats.missing.length) {
			const retried = retryTimes > 0 ? `自动重试 ${retryTimes} 次后` : '';
			$message.warn({
				content: `第 ${stats.missing.join('、')} 题${retried}仍没选出答案，请手动处理。`,
				duration: 0
			});
		} else if (isExam) {
			$message.info({
				content: '全部题目已作答（每次选择都会自动保存），请核对后点击「提交试卷」。',
				duration: 0
			});
			if (options.autoSubmit) await submitHikeExamPaper();
		} else {
			$message.info({ content: '作业/考试完成，请自行检查后保存或提交。', duration: 0 });
		}

		worker.emit('done');
		// 答题完成后，题库选项点击才会同步题目，否则会导致题目错乱
		CommonProject.scripts.workResults.cfg.questionPositionSyncHandlerType = 'zhs-hike';
	});

	return worker;
}

/** 智慧树考试页的选项选中态 class */
const HIKE_CHOSEN_CLASSES = ['is-choose', 'is-checked', 'is-selected'];

/** 判断考试页选项是否已被选中 */
function isOptionChosen(option: HTMLElement) {
	return HIKE_CHOSEN_CLASSES.some((c) => option.classList.contains(c));
}

/**
 * 派发完整的鼠标事件序列
 * 智慧树新版考试页的选项只认真实事件序列，单独 el.click() 不会触发选中
 */
function dispatchMouseSequence(el: HTMLElement) {
	const rect = el.getBoundingClientRect();
	const init = {
		bubbles: true,
		cancelable: true,
		/** 不能用沙箱里的 `window`（Proxy）当 view，构造事件时会被内核拒收 */
		view: (document.defaultView || window),
		button: 0,
		clientX: rect.left + rect.width / 2,
		clientY: rect.top + rect.height / 2
	};
	for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
		try {
			trustedDispatch(el, new OrigMouseEvent(type, init));
		} catch {
			// 单个事件类型不可用时跳过，不中断整串序列
		}
	}
}

/** 点击选项：软件环境用 Playwright 真实点击，浏览器内用鼠标事件序列 */
async function clickOptionNatively(remotePage: RemotePage | undefined, el: HTMLElement) {
	if (remotePage) {
		await remotePage.click(el);
	} else {
		dispatchMouseSequence(el);
	}
}

/** 点击选项直到它真的变成选中态，失败时再点内部的文字/图标兜底 */
async function clickOptionUntilChosen(option: HTMLElement, click: (el: HTMLElement) => Promise<void> | void) {
	for (let attempt = 0; attempt < 3 && !isOptionChosen(option); attempt++) {
		try {
			option.scrollIntoView({ block: 'center', inline: 'nearest' });
			await $.sleep(120);
			await click(option);
			await $.sleep(350);
		} catch (e) {}
	}

	if (!isOptionChosen(option)) {
		const inner = option.querySelector<HTMLElement>('.option-content, .CharCode, i');
		if (inner) {
			try {
				dispatchMouseSequence(inner);
				await $.sleep(350);
			} catch (e) {}
		}
	}

	if (!isOptionChosen(option)) {
		$console.warn(`选项未能选中：${(option.innerText || '').trim().slice(0, 30)}`);
	}
}

/** 统计作答情况（填空题等非选项题不参与漏题判断） */
function summarizeHikeQuestions() {
	const items = Array.from(document.querySelectorAll<HTMLElement>('.question-item'));
	const missing: number[] = [];
	let answered = 0;
	items.forEach((item, i) => {
		const options = Array.from(item.querySelectorAll<HTMLElement>('.option-item'));
		if (!options.length) return;
		if (options.some(isOptionChosen)) {
			answered++;
		} else {
			missing.push(i + 1);
		}
	});
	return { total: items.length, answered, missing };
}

/** 取出还没选上答案的题目节点，作为重试答题器的 root */
function getUnansweredQuestionRoots() {
	return Array.from(document.querySelectorAll<HTMLElement>('.question-item')).filter((item) => {
		const options = Array.from(item.querySelectorAll<HTMLElement>('.option-item'));
		return options.length > 0 && !options.some(isOptionChosen);
	});
}

/** 按文案找可点击元素 */
function findClickableByText(text: RegExp, root: Document | HTMLElement = document) {
	return Array.from(root.querySelectorAll<HTMLElement>('button, .el-button, [class*="btn"], [class*="button"]')).find(
		(el) => text.test((el.innerText || '').replace(/\s+/g, ' ').trim())
	);
}

/** 提交试卷（先点「提交试卷」，再在确认弹窗里点「提交试卷」） */
async function submitHikeExamPaper() {
	const submit = findClickableByText(/^提\s*交\s*试\s*卷$/);
	if (!submit) {
		$message.warn({ content: '未找到「提交试卷」按钮，请手动提交。', duration: 0 });
		return;
	}
	// 事件序列 + 原生 click 一起给，避免某个组件只认其中一种
	dispatchMouseSequence(submit);
	trustedClick(submit);
	await $.sleep(1200);

	// 确认弹窗里还有一个「提交试卷」主按钮
	const dialog = document.querySelector<HTMLElement>('.confirm-dialog-component, .el-dialog, .el-message-box');
	const confirm = dialog ? findClickableByText(/^提\s*交\s*试\s*卷$/, dialog) : undefined;
	if (confirm) {
		dispatchMouseSequence(confirm);
		trustedClick(confirm);
		$message.success({ content: '已自动提交试卷，请确认成绩页面。', duration: 0 });
	} else {
		$message.warn({ content: '未找到交卷确认按钮，请手动确认提交。', duration: 0 });
	}
}

/** 给 input/textarea 赋值并触发 input/change，保证 Vue 双向绑定能拿到值 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
	const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
	const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
	if (setter) setter.call(el, value);
	else el.value = value;
	trustedDispatch(el, new OrigEvent('input', { bubbles: true }));
	trustedDispatch(el, new OrigEvent('change', { bubbles: true }));
}

/**
 * 将秒数转换为小时或分钟
 * @param second 秒
 */
function optimizeSecond(second: number) {
	if (second > 3600) {
		return `${Math.floor(second / 3600)}小时${Math.floor((second % 3600) / 60)}分钟`;
	} else if (second > 60) {
		return `${Math.floor(second / 60)}分钟${second % 60}秒`;
	} else {
		return `${second}秒`;
	}
}

/** 点击元素；有 remotePage 时优先用 Playwright，失败则回退 DOM 点击 */
async function clickElement(remotePage: RemotePage | undefined, el: HTMLElement | null | undefined) {
	if (!el) return;
	if (remotePage) await remotePage.click(el);
	else await safeClick(el);
}

/**
 * 点击选项并确认真的选中。页面重渲染、元素被遮挡或点击被吞掉时自动重试，
 * 避免智慧树答题出现中间某一题选项没选上的情况。
 */
async function clickOptionUntilSelected(
	option: HTMLElement,
	isNotSelected: () => boolean,
	click: (el: HTMLElement) => Promise<void> | void = safeClick
) {
	for (let attempt = 0; attempt < 3 && isNotSelected(); attempt++) {
		try {
			option.scrollIntoView({ block: 'center', inline: 'nearest' });
			await $.sleep(120);
			await click(option);
			await $.sleep(250);
		} catch (e) {}
	}
	if (isNotSelected()) {
		const input = option.querySelector<HTMLInputElement>('input');
		if (input && !input.checked) {
			try {
				input.click();
			} catch (e) {}
			await $.sleep(200);
		}
	}
}

/** 把分钟数格式化为“X小时Y分钟” */
function formatStopDuration(minutes: number) {
	const totalSeconds = Math.round(minutes * 60);
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	const s = totalSeconds % 60;
	if (h && m) return `${h}小时${m}分钟`;
	if (h) return `${h}小时`;
	if (m && s) return `${m}分钟${s}秒`;
	if (m) return `${m}分钟`;
	return `${s}秒`;
}

/** 桌面端定时任务下发的「定时停止」覆盖 */
type DesktopStopOverride = { active: boolean; pause: boolean; endAt: number };

/** 上一次已生效的设定，避免每分钟的确认把计时器/提示反复重建 */
let appliedStopKey = '';

/**
 * 连续探测失败次数
 *
 * 扩展也会在普通浏览器里单独使用（没有桌面端），那种环境下 `/hh-autostop` 只会被
 * 站点当作不存在的路径。失败几次之后就不再问，免得每个学习页每分钟发一次无效请求。
 * 桌面端自己启动的浏览器上路由一直在，探测会一直成功，计数保持 0。
 */
let desktopProbeFailures = 0;

const DESKTOP_PROBE_MAX_FAILURES = 3;

/**
 * 向桌面端询问：本浏览器此刻有没有正在执行的定时任务
 *
 * 桌面端用 Playwright 路由拦截 `/hh-autostop`，返回的正是这台浏览器的方案；
 * 不是桌面端启动的浏览器、没有定时任务、或请求失败都返回 null，
 * 此时继续用扩展自己保存的 `stopTimeMinutes`。
 */
async function fetchDesktopStopOverride(): Promise<DesktopStopOverride | null> {
	if (desktopProbeFailures >= DESKTOP_PROBE_MAX_FAILURES) return null;
	try {
		const res = await request('/hh-autostop', { type: 'fetch', method: 'get' });
		/** 桌面端的应答一定带 environment 标记；不是它的应答就当作没有桌面端 */
		if (!res || res.environment !== 'playwright') {
			desktopProbeFailures = DESKTOP_PROBE_MAX_FAILURES;
			return null;
		}
		desktopProbeFailures = 0;
		if (!res.autoStop || !res.autoStop.active) return null;

		/** 桌面方案「到点不处理」：任务期间连扩展自己的定时停止也不要用 */
		if (!res.autoStop.pause) return { active: true, pause: false, endAt: 0 };

		const endAt = Number(res.autoStop.endAt) || 0;
		if (endAt <= 0) return null;
		return { active: true, pause: true, endAt };
	} catch {
		/** 普通脚本环境（没有桌面端）请求会失败；下次再试，连续失败就停手 */
		desktopProbeFailures++;
		return null;
	}
}

/**
 * 应用「定时停止」
 *
 * - 桌面定时任务期间：按桌面方案的截止时间倒计时（方案要求「到点不处理」时完全不计时）；
 * - 其余时候：按扩展自己保存的 `stopTimeMinutes`。
 *
 * 每 20 秒重新确认一次（与桌面调度节拍一致）：任务开始、方案在运行中被加长/缩短/关闭
 * 都能在同样的时间内跟上，不会出现「桌面已经改成不处理、扩展还按旧时间暂停」。
 */
async function applyAutoStop(configMinutes: number): Promise<void> {
	try {
		const minutes = parseFloat(String(configMinutes));
		const override = await fetchDesktopStopOverride();

		const key =
			override && override.active
				? override.pause
					? `desktop:${override.endAt}`
					: 'desktop:none'
				: `config:${isFinite(minutes) && minutes > 0 ? minutes : 0}`;
		if (key === appliedStopKey) return;

		if (!override || !override.active) {
			/** 回到扩展自己的设置；0 会清掉正在走的计时 */
			autoStop(minutes);
		} else if (!override.pause) {
			autoStop(0);
			state.study.stopMessage = $message.info({
				duration: 0,
				content: '桌面定时任务进行中：方案设置了到点不处理，本页的定时停止已关闭'
			});
		} else {
			/** 用剩余的分钟数交给原来的倒计时：到点与桌面方案一致，不会提前暂停 */
			const remainMinutes = (override.endAt - Date.now()) / 60000;
			autoStop(remainMinutes > 0 ? remainMinutes : 0, { desktop: true });
		}

		/** 真正生效之后才记账：中途出错下次还能重试 */
		appliedStopKey = key;
	} catch {
		/** 定时停止只是辅助，出错不能影响刷课主流程 */
	}
}

function autoStop(stopTime: string | number, opts?: { desktop?: boolean }) {
	clearInterval(state.study.stopInterval);
	state.study.stopMessage?.remove();
	const minutes = parseFloat(String(stopTime));
	if (!isFinite(minutes) || minutes <= 0) return;

	let stopCount = Math.round(minutes * 60);
	state.study.stopInterval = setInterval(() => {
		if (stopCount > 0) {
			// 如果有弹窗验证码则暂停自动停止的计时
			if (getPopupCaptcha() === null) {
				stopCount--;
			}
		} else {
			clearInterval(state.study.stopInterval);
			state.study.stop = true;
			$el<HTMLVideoElement>('video')?.pause();
			$modal.alert({ content: '脚本暂停，已获得今日平时分，如需继续观看，请刷新页面。' });
		}
	}, 1000);

	const date = new Date();
	date.setSeconds(date.getSeconds() + Math.round(minutes * 60));
	state.study.stopMessage = $message.info({
		duration: 0,
		content: opts?.desktop
			? `桌面定时任务将在 ${date.toLocaleTimeString()} 暂停（${formatStopDuration(minutes)}后）`
			: `在 ${date.toLocaleTimeString()} 脚本将自动暂停（${formatStopDuration(minutes)}后）`
	});
}
/** 固定视频进度 */
function fixProcessBar() {
	const bar = document.querySelector<HTMLElement>('.controlsBar');
	if (bar) {
		bar.style.display = 'block';
		// 适配 wisdomh5
		bar.style.zIndex = '2';
		bar.style.overflow = '';
	}
}

function closeDialogRead() {
	const div = document.querySelector<HTMLElement>('.dialog-read');
	if (div) {
		div.style.display = 'none';
	}
}

function finishAlert() {
	$modal.alert({
		content: '检测到当前视频全部播放完毕，如果还有未完成的视频请刷新重试，或者打开复习模式。'
	});
}
