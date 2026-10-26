import { createDefaultQuestionResolver, defaultAnswerWrapperHandler } from '@honghu/core';
import type { AnswererWrapper, SearchInformation } from '@honghu/core';
import { $, $message } from 'easy-us';
import { CommonProject } from '../projects/common';
import { optimizationElementWithImage } from './work';

/**
 * 视频内题目（弹题）的作答策略
 *
 * - ai : 连接题库（含 AI 答题）自动选择答案，未匹配时由调用方随机兜底
 * - random : 随机作答
 * - ignore : 不处理
 */
export type VideoQuizStrategy = 'ai' | 'random' | 'ignore';

/** 视频内题目题型，未指定时自动推断 */
export type VideoQuizType = 'single' | 'multiple' | 'judgement';

const DEFAULT_ANSWER_SEPARATORS = ['===', '#', '---', '###', '|', ';', '；'];

/** 题干中常见的噪音文案（按钮、分值、题型标签等） */
const QUIZ_NOISE_TEXT = /(提交答案|提交|确定|确认|取消|关闭|跳过|下一题|上一题|交卷)/g;

/**
 * 归一化题目/选项文本，仅用于比较，不影响实际提交的内容
 */
export function normalizeQuizText(text: string): string {
	return String(text || '')
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, '')
		.replace(/^[A-Za-z][.、．,，)）:：]/, '')
		.replace(/[，。、；;：:？！,.?!"'“”‘’`（）()【】\[\]《》<>]/g, '')
		.toLowerCase();
}

/**
 * 获取选项的文本内容（图片会追加隐藏的地址文本，便于题库匹配）
 */
export function getQuizOptionText(el: HTMLElement): string {
	const clean = (text: string | undefined) => String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

	let text = '';
	try {
		text = clean(optimizationElementWithImage(el, true).innerText);
	} catch {
		text = '';
	}

	// innerText 在元素隐藏时可能为空，使用 textContent 兜底
	return text || clean(el.textContent || '');
}

/**
 * 从题目容器中提取题干
 *
 * 采用「克隆后移除选项节点」的方式，避免直接对 innerText 做行过滤时，
 * 因选项文本换行或带前缀残留而污染题干。
 */
export function extractVideoQuizTitle(root: HTMLElement, optionTexts: string[]): string {
	const normalizedOptions = optionTexts.map(normalizeQuizText).filter(Boolean);

	let text = '';
	try {
		const clone = root.cloneNode(true) as HTMLElement;
		// 弹题的页码条（1 / 2 / 3…）会被算进题干，导致题干变成「1 以下程序段…」，先摘掉
		clone.querySelectorAll('.el-pagination, .el-pager').forEach((node) => node.remove());
		// 由深到浅移除与选项文本一致的节点
		const nodes = Array.from(clone.querySelectorAll<HTMLElement>('*')).reverse();
		for (const node of nodes) {
			const nodeText = normalizeQuizText(node.textContent || '');
			if (!nodeText) continue;
			if (normalizedOptions.includes(nodeText)) {
				node.remove();
			}
		}
		text = clone.textContent || '';
	} catch {
		text = root.textContent || '';
	}

	return (
		text
			.replace(/\u00a0/g, ' ')
			.replace(/\s+/g, ' ')
			.replace(/\d+(\.\d+)?\s*分/g, ' ') // 分值
			.replace(/[（(【\[]?\s*(单选题|多选题|判断题|填空题)\s*[)）】\]]?/g, ' ')
			.replace(QUIZ_NOISE_TEXT, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			// 去掉题号、题型标记
			.replace(/^(\d+[、.．)）]\s*|第\s*\d+\s*题\s*[:：]?\s*)/, '')
			.replace(/^[[【(（]\s*(单选题|多选题|判断题|填空题)\s*[\]】)）]\s*/, '')
			.trim()
	);
}

/**
 * 推断题目题型，判断题会被 core 的单选题处理器内部自动识别，
 * 所以这里只需要区分「是否多选」。
 */
export function guessVideoQuizType(optionElements: HTMLElement[], root?: HTMLElement): VideoQuizType {
	const first = optionElements[0];
	if (!first) return 'single';

	const hasCheckbox = (el: HTMLElement) =>
		!!el.querySelector('input[type="checkbox"]') ||
		!!el.closest('label')?.querySelector('input[type="checkbox"]');

	let node: HTMLElement | null = first;
	while (node) {
		const cls = typeof node.className === 'string' ? node.className : '';
		if (/checkbox|multiple|多选/i.test(cls)) return 'multiple';
		if (root && node === root) break;
		node = node.parentElement;
	}

	return optionElements.some(hasCheckbox) ? 'multiple' : 'single';
}

function getAnswerSeparators(): string[] {
	try {
		return String(CommonProject.scripts.settings.cfg.answerSeparators || '')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	} catch {
		return DEFAULT_ANSWER_SEPARATORS;
	}
}

function getAnswererWrappers(explicit?: AnswererWrapper[]): AnswererWrapper[] {
	if (explicit && explicit.length) return explicit;
	try {
		return CommonProject.scripts.settings.methods.getWorkOptions().answererWrappers || [];
	} catch {
		try {
			return (CommonProject.scripts.settings.cfg.answererWrappers || []) as AnswererWrapper[];
		} catch {
			return [];
		}
	}
}

/** 相同题目的答案缓存，避免弹题重复渲染时反复请求题库 */
const quizAnswerCache = new Map<string, SearchInformation[]>();
const QUIZ_ANSWER_CACHE_MAX = 200;

/** 判断题的「对」「错」关键词，长词在前，避免「不对」被「对」抢先命中 */
const JUDGE_FALSE_WORDS = [
	'不正确',
	'不对',
	'不是的',
	'不是',
	'错误',
	'错的',
	'错',
	'否',
	'非',
	'×',
	'false',
	'no'
];
const JUDGE_TRUE_WORDS = ['正确', '对的', '是的', '对', '是', '√', 'true', 'yes'];

/**
 * 把一段文本判定成「对 / 错 / 认不出来」
 *
 * 先判错再判对：`不正确`、`不对` 这类词里都含 `对`，顺序反了会把错题判成对题。
 */
export function judgeAnswerOf(text: string): 'true' | 'false' | undefined {
	const normalized = normalizeQuizText(text);
	if (!normalized) return undefined;
	// 单字符答案（T / F）单独判定，避免把 t、f 当子串误判整段英文
	if (normalized === 'f') return 'false';
	if (normalized === 't') return 'true';
	if (JUDGE_FALSE_WORDS.some((word) => normalized.includes(normalizeQuizText(word)))) return 'false';
	if (JUDGE_TRUE_WORDS.some((word) => normalized.includes(normalizeQuizText(word)))) return 'true';
	return undefined;
}

/** 取选项的前缀字母（"A.对" → "A"） */
function optionLabel(text: string): string {
	const match = /^\s*([A-Za-z])\s*[.、．,，)）:：]/.exec(text || '');
	return match ? match[1].toUpperCase() : '';
}

/**
 * 答案直接给字母时（B / 选B / 答案：B）按选项前缀字母定位
 *
 * 判断题走的是专用匹配分支，core 里的 ABCD 兜底不会执行，所以这里补一层。
 *
 * @returns 命中的选项下标，未命中返回 -1
 */
function pickByOptionLetter(infos: SearchInformation[], optionTexts: string[]): number {
	const labels = optionTexts.map(optionLabel);
	if (labels.some((label) => !label)) return -1;

	for (const info of infos) {
		for (const result of info.results) {
			const answer = String((result as any).answer || '').trim();
			if (answer.length > 8) continue;
			const match = /(?:选|答案|正确答案)?\s*[:：]?\s*([A-Za-z])(?![A-Za-z])/.exec(answer);
			if (!match) continue;
			const index = labels.indexOf(match[1].toUpperCase());
			if (index !== -1) return index;
		}
	}
	return -1;
}

/**
 * 判断题兜底匹配
 *
 * core 的判断题匹配是「严格相等」，而大模型经常回「错误。因为……只执行一次」这类长句，
 * 一旦不等就整题匹配失败、退回随机作答 —— 用户看到的就是「AI 明明答了却没选上」。
 * 这里改成关键词判定：答案里出现「错/错误/不正确」就选「错」那一项，反之亦然。
 *
 * @returns 命中的选项下标，未命中返回 -1
 */
function pickJudgementIndex(infos: SearchInformation[], optionTexts: string[]): number {
	if (optionTexts.length !== 2) return -1;

	const polarities = optionTexts.map(judgeAnswerOf);
	if (polarities.filter(Boolean).length !== 2) return -1;
	if (polarities[0] === polarities[1]) return -1;

	for (const info of infos) {
		for (const result of info.results) {
			const wanted = judgeAnswerOf(String((result as any).answer || ''));
			if (!wanted) continue;
			const index = polarities.indexOf(wanted);
			if (index !== -1) return index;
		}
	}
	return -1;
}


/** 未配置题库是否已经提示过 */
let quizNoWrapperWarned = false;

/**
 * 查询视频内题目的答案
 */
export async function searchVideoQuizAnswer(opts: {
	title: string;
	optionTexts: string[];
	type: VideoQuizType;
	answererWrappers?: AnswererWrapper[];
}): Promise<SearchInformation[]> {
	const cacheKey = normalizeQuizText(opts.title);
	if (cacheKey && quizAnswerCache.has(cacheKey)) {
		return quizAnswerCache.get(cacheKey)!;
	}

	const wrappers = getAnswererWrappers(opts.answererWrappers);

	if (wrappers.length === 0) {
		// 区分「一个都没配」和「配了但全被禁用」，否则提示语会误导
		let total = 0;
		try {
			total = (CommonProject.scripts.settings.cfg.answererWrappers || []).length;
		} catch {
			total = 0;
		}
		const reason =
			total > 0
				? `题库共 ${total} 个，但全部被禁用，本次将随机作答。请前往 通用-全局设置 启用至少一个题库。`
				: '还没有配置题库，本次将随机作答。请前往 通用-全局设置 配置题库或 AI 答题。';

		// 只提示一次，避免每道弹题都弹窗
		if (!quizNoWrapperWarned) {
			quizNoWrapperWarned = true;
			try {
				$message.warn({ content: `视频内题目已选择 AI题库答题，但${reason}`, duration: 10 });
			} catch {
				// 弹窗失败不影响主流程
			}
		}
		throw new Error(reason);
	}

	const infos = await defaultAnswerWrapperHandler(wrappers, {
		title: opts.title,
		options: opts.optionTexts.join('\n'),
		type: opts.type
	});

	// 只有在确实搜索到内容时才缓存，避免因网络抖动把空结果缓存下来
	if (cacheKey && infos.some((info) => info.results.length > 0)) {
		quizAnswerCache.set(cacheKey, infos);
		if (quizAnswerCache.size > QUIZ_ANSWER_CACHE_MAX) {
			const first = quizAnswerCache.keys().next().value;
			if (first) quizAnswerCache.delete(first);
		}
	}

	return infos;
}

export interface VideoQuizAnswerResult {
	/** 是否成功选出并点击了选项 */
	ok: boolean;
	/** 识别到的题干 */
	title: string;
	/** 最终选中的选项文本 */
	answers: string[];
	/** 失败原因 */
	error?: string;
}

/**
 * 使用题库（含 AI 答题）作答一组视频内题目选项
 *
 * 复用答题器的匹配算法（归一化匹配 / 相似度匹配 / ABCD 兜底），
 * 因此题库返回「选项文本」或「字母」都可以正确命中。
 *
 * @returns 未命中时 ok 为 false，由调用方决定是否随机兜底
 */
export async function answerVideoQuiz(opts: {
	/** 题目容器，用于提取题干 */
	root: HTMLElement;
	/** 选项元素 */
	optionElements: (HTMLElement | null | undefined)[];
	/** 题目类型，不填则自动推断 */
	type?: VideoQuizType;
	/** 点击选项的方法（兼容远程控制页面） */
	/** 点击选项；返回 false 表示点击后页面没有回显选中态（可能没生效） */
	click: (el: HTMLElement) => boolean | void | Promise<boolean | void>;
	/** 题库配置，不填则读取全局配置 */
	answererWrappers?: AnswererWrapper[];
}): Promise<VideoQuizAnswerResult> {
	const optionElements = opts.optionElements.filter((el): el is HTMLElement => !!el);

	if (optionElements.length === 0) {
		return { ok: false, title: '', answers: [], error: '未找到选项' };
	}

	const optionTexts = optionElements.map(getQuizOptionText);
	const title = extractVideoQuizTitle(opts.root, optionTexts);

	if (!title) {
		return { ok: false, title: '', answers: [], error: '未识别到题干' };
	}

	const type = opts.type || guessVideoQuizType(optionElements, opts.root);

	let infos: SearchInformation[] = [];
	try {
		infos = await searchVideoQuizAnswer({
			title,
			optionTexts,
			type,
			answererWrappers: opts.answererWrappers
		});
	} catch (error: any) {
		return { ok: false, title, answers: [], error: (error && error.message) || String(error) };
	}

	if (!infos.some((info) => info.results.length > 0)) {
		return { ok: false, title, answers: [], error: '题库未返回答案' };
	}

	const picked: HTMLElement[] = [];
	try {
		const resolver = (createDefaultQuestionResolver as any)({
			answerSeparators: getAnswerSeparators()
		})[type] as (
			searchInfos: SearchInformation[],
			options: HTMLElement[],
			handler: (t: any, answer: string, option: HTMLElement) => void | Promise<void>
		) => Promise<{ finish: boolean }>;

		await resolver(infos, optionElements, async (_t, _answer, option) => {
			if (option && picked.indexOf(option) === -1) {
				picked.push(option);
			}
		});
	} catch (error: any) {
		return { ok: false, title, answers: [], error: (error && error.message) || String(error) };
	}

	if (picked.length === 0) {
		// 判断题兜底：题库/大模型回的是长句时，严格相等匹配不到，用关键词再判一次
		const judgeIndex = pickJudgementIndex(infos, optionTexts);
		if (judgeIndex !== -1) {
			picked.push(optionElements[judgeIndex]);
		}
	}

	if (picked.length === 0) {
		// 答案直接给字母时按选项前缀字母定位
		const letterIndex = pickByOptionLetter(infos, optionTexts);
		if (letterIndex !== -1) {
			picked.push(optionElements[letterIndex]);
		}
	}

	if (picked.length === 0) {
		// 把题库原始答案带出来，否则「答案与选项不匹配」根本没法排查
		const raw = infos
			.map((info) =>
				info.results
					.map((res) => String((res as any).answer || '').replace(/\s+/g, ' ').slice(0, 40))
					.filter(Boolean)
					.join(' | ')
			)
			.filter(Boolean)
			.join(' ; ');
		return {
			ok: false,
			title,
			answers: [],
			error: raw ? `答案与选项不匹配，题库返回「${raw}」，选项「${optionTexts.join(' / ')}」` : '答案与选项不匹配'
		};
	}

	// 逐个点击；只要有一个选项确认选中就算作答成功，
	// 全都没回显选中态就如实报失败（旧实现无条件返回 ok，
	// 日志一直打「作答成功」但页面上什么都没选中，问题被完全掩盖）
	let confirmed = 0;
	for (const el of picked) {
		const ret = await opts.click(el);
		if (ret !== false) confirmed++;
		await $.sleep(200);
	}

	if (confirmed === 0) {
		return {
			ok: false,
			title,
			answers: picked.map(getQuizOptionText),
			error: '选项点击后页面未回显选中态，作答可能未生效'
		};
	}

	return { ok: true, title, answers: picked.map(getQuizOptionText) };
}
