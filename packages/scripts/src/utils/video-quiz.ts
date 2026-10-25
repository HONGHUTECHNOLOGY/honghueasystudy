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
		// 只提示一次，避免每道弹题都弹窗
		if (!quizNoWrapperWarned) {
			quizNoWrapperWarned = true;
			try {
				$message.warn({
					content: '视频内题目已选择 AI题库答题，但还没有配置题库，本次将随机作答。请前往 通用-全局设置 配置题库或 AI 答题。',
					duration: 10
				});
			} catch {
				// 弹窗失败不影响主流程
			}
		}
		throw new Error('未配置题库，请前往 通用-全局设置 配置题库或 AI 答题');
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
	click: (el: HTMLElement) => void | Promise<void>;
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
		return { ok: false, title, answers: [], error: '答案与选项不匹配' };
	}

	for (const el of picked) {
		await opts.click(el);
		await $.sleep(200);
	}

	return { ok: true, title, answers: picked.map(getQuizOptionText) };
}
