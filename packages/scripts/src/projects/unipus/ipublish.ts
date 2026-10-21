/* eslint-disable no-unused-vars */

import { Script, $message, $ui, h, $gm } from 'easy-us';
import { CommonProject } from '../common';
import { $, RemotePage, request, defaultAnswerWrapperHandler } from '@ocsjs/core';
import { waitForElement } from '../../utils/study';
import { createLocalRemotePage } from '../../utils/app';
import { BackgroundProject } from '../background';
import { CommonWorkOptions, $msg } from '../../utils';
import { answerWrapperEmptyWarning } from '../../utils/work';
import { translate } from './cloud';

const supported_question_types = {
	discussion_group: '讨论题',
	true_false_group: '判断题',
	short_answer_group: '简答题',
	single_choice_group: '单选题',
	multi_choice_group: '多选题',
	fill_blanks_group: '填空题',
	fill_blanks_choice_group: '选词填空题',
	translation_group: '翻译题',
	fill_blanks_dropdown_group: '下拉填空题',
	evaluation_group: '评价题'
};

export type UnipusMedia = {
	element?: HTMLElement;
	mediaFile: {
		fileUrl: string;
		fileName?: string;
		mediaName?: string;
		// 视频才有
		coverImage?: string;
		duration?: number;
		fileSize?: number;
		// 视频字幕
		videoSubtitleFile?: {
			fileUrl: string;
			fileName: string;
			fileType: 'text/vtt';
			fileSize: number;
			suffix: 'vtt';
			type: 'Subtitle';
		}[];
	};
	type: 'insert-image' | 'insert-video' | 'insert-audio';
};

export const UnipusIpublishScript = new Script({
	name: '新AI版-课程学习',
	namespace: 'unipus.ipublish.study',
	matches: [
		['新AI学习页面', 'unipus.cn/_ipublishpc_default/pc.html'],
		['内部页面', 'ipub.unipus.cn/learner/textbook/book']

	],
	configs: {
		notes: {
			defaultValue: $ui.notes(['测试']).outerHTML
		},
		translate: {
			defaultValue: false
		},
		/**
		 * AI提示词
		 */
		prompts: {
			defaultValue: [
				{
					discussion_group:
						'请帮我写一个关于以下主题的讨论题答案，要求内容充实，逻辑清晰，字数在200字以上：\n{{question}}\n{{option}}',
					true_false_group:
						'请帮我判断以下陈述是否正确，如果正确请回答“正确”，如果错误请帮我输出正确陈述句：\n{{question}}\n{{option}}'
				}
			] as Record<keyof typeof supported_question_types, string>[]
		},
		other_mode: {
			label: '答题模式',
			attrs: { title: '此设置包含 判断、简答、选择、填空等类型题目\n\n“跳过”则不进行该题型的自动作答' },
			tag: 'select',
			options: [
				['ai', 'AI答题'],
				['custom', '自定义回答'],
				['manually', '跳过']
			],
			defaultValue: 'ai' as 'ai' | 'custom' | 'manually'
		},
		other_mode_custom: {
			showIf: ['unipus.ai.study.other_mode', (val: string) => val === 'custom'],
			label: '自定义答题内容',
			tag: 'textarea',
			attrs: {
				type: 'text',
				title: '在此输入自定义回答内容，每行一个随机填写\n此设置包含 判断、简答、单选、填空等类型题目'
			},
			defaultValue: "不知道\n不会\n不清楚\n不懂\ni don't know\nno idea"
		},
		discussion_mode: {
			label: '讨论题模式',
			tag: 'select',
			options: [
				['copy', '随机复制其他讨论'],
				['ai', 'AI生成'],
				['manually', '跳过']
			],
			defaultValue: 'copy' as 'copy' | 'ai' | 'manually'
		},

		translation_mode: {
			label: '翻译题模式',
			tag: 'select',
			options: [
				['ai', 'AI翻译'],
				['manually', '跳过']
			],
			defaultValue: 'ai' as 'ai' | 'manually'
		},
		evaluation_mode: {
			label: '自我评分题模式',
			tag: 'select',
			options: [
				['random', '随机评分'],
				['fix', '固定评分'],
				['1r', '1-2分随机'],
				['2r', '1-3分随机'],
				['3r', '2-4分随机'],
				['4r', '3-5分随机'],
				['5r', '4-5分随机'],
				['manually', '跳过']
			],
			defaultValue: '5r' as 'random' | 'fix' | '1r' | '2r' | '3r' | '4r' | '5r' | 'manually'
		},
		evaluation_fix: {
			showIf: ['unipus.ai.study.evaluation_mode', (val: string) => val === 'fix'],
			label: '固定自我评分分数',
			defaultValue: 5,
			attrs: {
				type: 'number',
				min: 1,
				max: 5,
				step: 1
			}
		}
	},
	async oncomplete() {
		CommonProject.scripts.render.methods.pin(this);
		if (location.href.includes('learner/textbook/book') === false) {
			return;
		}
		const rp: RemotePage = createLocalRemotePage();
		await work(this.cfg, rp);
	},
	onbeforeunload() {
		this.cfg.translate = false;
	},
	async onstart() {
		if (location.href.includes('learner/textbook/book') === false) {
			return;
		}
		// 纯浏览器扩展环境即可运行
		const rp: RemotePage = createLocalRemotePage();
		// 初始化设置
		this.cfg.translate = false;

		this.onConfigChange('translate', async () => {
			if (!this.cfg.translate) {
				console.log('翻译已暂停');
				// translateBtn.textContent = '整页翻译';
				return;
			}
			// translateBtn.textContent = '翻译中...（点击暂停）';
			// const cloudApis = CommonProject.scripts.settings.cfg.cloudApis.trim();
			// if (!cloudApis) {
			// 	return $message.error('请先配置通用-全局设置-云接口的地址！');
			// }

			console.log('翻译中...');

			const texts = Array.from(
				document.querySelectorAll(
					'.editor-unordered-list,.editor-heading,.editor-heading,.editor-paragraph,.editor-content,.question-block'
				)
			)
				// 去掉New Word读写翻译
				.filter((el) => !el.querySelector('.speaker_svgView__kIA2V'))
				.filter((i) => (i?.textContent?.trim() ? /[A-Za-z0-9]/.test(i.textContent.trim()) : false))
				.map((el) => {
					return Array.from(
						el.querySelectorAll('[data-lexical-text="true"],[data-lexical-node-type="base-paragraph"]')
					);
				})
				.flat()
				.map((el) => {
					return findTextNodes(el);
				})
				.flat();

			console.log('翻译文本：', texts.length, '段');

			// for (const node of texts) {
			// 	if (!this.cfg.translate) break;
			// 	if (!node.textContent?.trim()) continue;
			// 	const res = await translate(cloudApis, node.textContent || '');
			// 	if (!this.cfg.translate) break;
			// 	if (!res.data || !res.data?.result?.trim()) continue;
			// 	console.log(node.textContent, '=>', res.data?.result?.trim());
			// 	node.textContent = res.data?.result?.trim() || node.textContent;
			// 	node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			// 	await $.sleep(100);
			// }
		});

		await waitForElement('.editor');

		// const result = await remotePage.waitForResponse('studentContent.json');
		async function loadVtt() {
			const medias = await getPageMediasByElement();
			// 找到视频
			for (const media of medias) {
				if (media.type === 'insert-video') {
					const result = await getSubtitlesFromMedia(media);
					const vtt = parseVTT(result, 1000);

					console.log({
						el: media.element,
						name: media.mediaFile.mediaName,
						fileName: media.mediaFile.fileName,
						vtt,
						text: vtt
							.map((l) => l.text)
							.map((t) => t.trim())
							.join('\n')
					});
				}
			}
		}
		loadVtt();
		$gm.unsafeWindow.loadVtt = loadVtt;
	},
	onrender(elements) {
		const translateBtn = h(
			'button',
			{
				className: 'base-style-button',
				style: { marginBottom: '10px' }
			},
			'整页翻译'
		);
		translateBtn.onclick = () => {
			this.cfg.translate = !this.cfg.translate;
			if (!this.cfg.translate) {
				translateBtn.textContent = '整页翻译';
			} else {
				translateBtn.textContent = '翻译中...（点击暂停）';
			}
		};
		elements.panel.body?.replaceWith(h('div', { className: 'card' }, [translateBtn]));
	}
});

function findTextNodes(node: Node) {
	const textNodes: Node[] = [];
	function recurse(n: Node) {
		if (n.nodeType === Node.TEXT_NODE) {
			textNodes.push(n);
		} else {
			n.childNodes.forEach(recurse);
		}
	}
	recurse(node);
	return textNodes;
}

function deepFinds(obj: any, finder: (obj: any) => boolean): any {
	const results = [];
	if (finder(obj)) {
		results.push(obj);
	}
	if (typeof obj === 'object' && obj !== null) {
		for (const key of Object.keys(obj)) {
			results.push(...deepFinds(obj[key], finder));
		}
	}
	return results;
}

/**
 * （后期反作弊升级后推荐使用）
 * 使用截获的网络数据获取页面的多媒体资源
 * @param remotePage
 */
async function getPageMediasByHack(remotePage: RemotePage) {
	const result = await remotePage.waitForResponse('studentContent.json');
	const medias: UnipusMedia[] = deepFinds(result, (obj) => !!obj?.mediaFile);
	return medias;
}

/**
 * 使用元素属性获取页面的多媒体资源
 * @param remotePage
 */
async function getPageMediasByElement() {
	const els = Array.from(
		document.querySelectorAll<HTMLElement>(
			'[data-lexical-node-type="insert-video"],[data-lexical-node-type="insert-audio"],[data-lexical-node-type="insert-image"]'
		)
	);

	const medias: UnipusMedia[] = [];

	for (const el of els) {
		const dataset = el.dataset;
		const type = dataset.lexicalNodeType as 'insert-video' | 'insert-audio' | 'insert-image';
		let media: UnipusMedia['mediaFile'] | null = null;
		if (type === 'insert-video') {
			const subtitle = dataset.subtitleArray ? JSON.parse(dataset.subtitleArray) : [];
			media = {
				coverImage: dataset.coverImage || '',
				duration: dataset.mediaDuration ? Number(dataset.mediaDuration) : undefined,
				fileUrl: dataset.videoUrl || '',
				videoSubtitleFile: subtitle,
				fileName: subtitle[0]?.fileName || '',
				mediaName: dataset.title || ''
			};
		} else if (type === 'insert-audio') {
			media = {
				duration: dataset.mediaDuration ? Number(dataset.mediaDuration) : undefined,
				fileUrl: el.querySelector('audio')?.src || ''
			};
		} else if (type === 'insert-image') {
			media = {
				fileUrl: el.querySelector('img')?.src || ''
			};
		}

		if (media) {
			medias.push({
				element: el,
				mediaFile: media,
				type: type
			});
		}
	}

	return medias;
}

async function work(cfg: typeof UnipusIpublishScript.cfg, rp: RemotePage) {
	const opts = CommonProject.scripts.settings.methods.getWorkOptions();

	if (!opts.answererWrappers || opts.answererWrappers.length === 0) {
		await answerWrapperEmptyWarning(0);
		return;
	}

	await waitForElement('.editor');
	await $.sleep(2000);

	const els = Array.from(
		document.querySelectorAll<HTMLElement>(
			Object.values(supported_question_types)
				.map((t) => `[data-ipublish-question-group-type="${t}"]`)
				.join(',')
		)
	);

	if (els.length === 0) {
		$msg.info('未找到题目，可能当前页面没有题目或已全部完成');
		return;
	}

	$msg.info(`找到 ${els.length} 道题目，开始答题`);

	for (let i = 0; i < els.length; i++) {
		const el = els[i];
		const type = el.dataset.ipublishQuestionGroupType as keyof typeof supported_question_types;
		if (!type) continue;

		$msg.info(`正在处理第 ${i + 1}/${els.length} 题：${supported_question_types[type]}`);
		el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		await $.sleep(500);

		try {
			await handleQuestion(rp, cfg, opts, el, type);
		} catch (err) {
			$msg.error(`第 ${i + 1} 题处理出错: ${(err as Error).message}`);
		}
		await $.sleep(500);
	}

	await submitIpublishAnswer(rp);
	$msg.success('答题完成');
}

async function handleQuestion(
	rp: RemotePage,
	cfg: typeof UnipusIpublishScript.cfg,
	opts: CommonWorkOptions,
	el: HTMLElement,
	type: keyof typeof supported_question_types
) {
	if (isQuestionAnswered(el)) {
		$msg.info('该题已作答，跳过');
		return;
	}

	const questionText = extractQuestionText(el);
	if (!questionText.trim()) {
		$msg.warn('题目内容为空，跳过');
		return;
	}

	switch (type) {
		case 'single_choice_group':
			await handleChoiceQuestion(rp, cfg, opts, el, questionText, false);
			break;
		case 'multi_choice_group':
			await handleChoiceQuestion(rp, cfg, opts, el, questionText, true);
			break;
		case 'true_false_group':
			await handleTrueFalseQuestion(rp, cfg, opts, el, questionText);
			break;
		case 'fill_blanks_group':
		case 'fill_blanks_choice_group':
		case 'fill_blanks_dropdown_group':
			await handleFillBlanksQuestion(rp, cfg, opts, el, questionText);
			break;
		case 'short_answer_group':
			await handleShortAnswerQuestion(rp, cfg, opts, el, questionText);
			break;
		case 'translation_group':
			await handleTranslationQuestion(rp, cfg, opts, el, questionText);
			break;
		case 'discussion_group':
			await handleDiscussionQuestion(rp, cfg, opts, el, questionText);
			break;
		case 'evaluation_group':
			await handleEvaluationQuestion(rp, cfg, el);
			break;
		default:
			$msg.warn(`未知题型：${type}，跳过`);
	}
}

function isQuestionAnswered(el: HTMLElement): boolean {
	const selected = el.querySelector('.selected, .checked, [aria-checked="true"], [data-checked="true"]');
	if (selected) return true;
	const inputs = Array.from(el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], textarea'));
	let filledCount = 0;
	for (const input of inputs) {
		if (input.value.trim()) filledCount++;
	}
	if (filledCount > 0 && filledCount === inputs.length) return true;
	return false;
}

function extractQuestionText(el: HTMLElement): string {
	const stemSelectors = [
		'.question-title',
		'.question-stem',
		'.ques-title',
		'[data-lexical-node-type="question-title"]',
		'.question-content',
		'.question-desc',
		'.question-block-title'
	];
	for (const selector of stemSelectors) {
		const stem = el.querySelector(selector);
		if (stem?.textContent?.trim()) return stem.textContent.trim();
	}
	return el.innerText?.trim() || '';
}

function extractOptions(el: HTMLElement): HTMLElement[] {
	const optionSelectors = [
		'.option-item',
		'.option',
		'.choice-option',
		'.answer-option',
		'[data-lexical-node-type="option"]',
		'[role="radio"]',
		'[role="checkbox"]',
		'.question-option',
		'.ipublish-option'
	];
	for (const selector of optionSelectors) {
		const options = Array.from(el.querySelectorAll<HTMLElement>(selector));
		if (options.length > 0) return options;
	}
	return [];
}

function extractInputs(el: HTMLElement): (HTMLInputElement | HTMLTextAreaElement | HTMLElement)[] {
	return Array.from(
		el.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLElement>(
			'input[type="text"], textarea, [contenteditable="true"]'
		)
	);
}

async function searchAnswer(opts: CommonWorkOptions, question: string, type: string): Promise<string> {
	const searchedInfos = await CommonProject.scripts.apps.methods.searchAnswerInCaches(question, async () => {
		return defaultAnswerWrapperHandler(opts.answererWrappers, {
			type: type,
			title: question
		});
	});

	if (!searchedInfos || searchedInfos.length === 0) {
		return '';
	}

	for (const info of searchedInfos) {
		if (info.results && info.results.length > 0) {
			return info.results[0].answer || '';
		}
	}
	return '';
}

function getCustomAnswer(cfg: typeof UnipusIpublishScript.cfg): string {
	const customs = (cfg.other_mode_custom || '').split('\n').map((s) => s.trim()).filter(Boolean);
	if (customs.length === 0) return '不知道';
	return customs[Math.floor(Math.random() * customs.length)];
}

function matchOption(answer: string, options: HTMLElement[]): HTMLElement | null {
	const normalizedAnswer = answer.trim().toLowerCase();
	if (!normalizedAnswer) return null;

	for (const opt of options) {
		if (opt.textContent?.trim().toLowerCase() === normalizedAnswer) {
			return opt;
		}
	}

	for (const opt of options) {
		const optText = opt.textContent?.trim().toLowerCase() || '';
		if (optText && (optText.includes(normalizedAnswer) || normalizedAnswer.includes(optText))) {
			return opt;
		}
	}

	if (/^[a-z]$/i.test(normalizedAnswer)) {
		const index = normalizedAnswer.toUpperCase().charCodeAt(0) - 65;
		if (index >= 0 && index < options.length) {
			return options[index];
		}
	}

	return null;
}

async function handleChoiceQuestion(
	rp: RemotePage,
	cfg: typeof UnipusIpublishScript.cfg,
	opts: CommonWorkOptions,
	el: HTMLElement,
	questionText: string,
	isMultiple: boolean
) {
	if (cfg.other_mode === 'manually') {
		$msg.warn('选择题已跳过');
		return;
	}

	const options = extractOptions(el);
	if (options.length === 0) {
		$msg.warn('未找到选项，跳过');
		return;
	}

	let answers: string[] = [];

	if (cfg.other_mode === 'custom') {
		answers = [getCustomAnswer(cfg)];
	} else {
		const answer = await searchAnswer(opts, questionText, isMultiple ? 'multiple' : 'single');
		if (!answer) {
			$msg.warn('未搜到答案，跳过');
			return;
		}
		const separators = opts.answerSeparators.split(',').map((s) => s.trim()).filter(Boolean);
		if (isMultiple) {
			answers = [answer];
			for (const sep of separators) {
				if (answers.length === 1 && answers[0].includes(sep)) {
					answers = answers[0].split(sep).map((s) => s.trim());
					break;
				}
			}
		} else {
			answers = [answer];
		}
	}

	for (const answer of answers) {
		const option = matchOption(answer, options);
		if (option) {
			await rp.click(option);
			await $.sleep(200);
		} else {
			$msg.warn(`未找到匹配选项: ${answer}`);
		}
	}
}

async function handleTrueFalseQuestion(
	rp: RemotePage,
	cfg: typeof UnipusIpublishScript.cfg,
	opts: CommonWorkOptions,
	el: HTMLElement,
	questionText: string
) {
	if (cfg.other_mode === 'manually') {
		$msg.warn('判断题已跳过');
		return;
	}

	const options = extractOptions(el);
	if (options.length === 0) {
		$msg.warn('未找到选项，跳过');
		return;
	}

	let answer = '';
	if (cfg.other_mode === 'custom') {
		answer = getCustomAnswer(cfg);
	} else {
		answer = await searchAnswer(opts, questionText, 'judgement');
	}

	if (!answer) {
		$msg.warn('未搜到答案，跳过');
		return;
	}

	const normalizedAnswer = answer.trim().toLowerCase();
	const isTrue = ['正确', '对', 'true', 't', '√', 'yes', 'y', '是'].includes(normalizedAnswer);
	const isFalse = ['错误', '错', 'false', 'f', '×', 'no', 'n', '否'].includes(normalizedAnswer);

	for (const opt of options) {
		const optText = opt.textContent?.trim().toLowerCase() || '';
		if (
			(isTrue && (optText.includes('正确') || optText.includes('对') || optText === 't' || optText === 'true')) ||
			(isFalse && (optText.includes('错误') || optText.includes('错') || optText === 'f' || optText === 'false'))
		) {
			await rp.click(opt);
			await $.sleep(200);
			return;
		}
	}

	const option = matchOption(answer, options);
	if (option) {
		await rp.click(option);
		await $.sleep(200);
	} else {
		$msg.warn(`未找到匹配选项: ${answer}`);
	}
}

async function handleFillBlanksQuestion(
	rp: RemotePage,
	cfg: typeof UnipusIpublishScript.cfg,
	opts: CommonWorkOptions,
	el: HTMLElement,
	questionText: string
) {
	if (cfg.other_mode === 'manually') {
		$msg.warn('填空题已跳过');
		return;
	}

	const inputs = extractInputs(el);
	if (inputs.length === 0) {
		$msg.warn('未找到输入框，跳过');
		return;
	}

	let answers: string[] = [];

	if (cfg.other_mode === 'custom') {
		answers = inputs.map(() => getCustomAnswer(cfg));
	} else {
		const answer = await searchAnswer(opts, questionText, 'completion');
		if (!answer) {
			$msg.warn('未搜到答案，跳过');
			return;
		}
		const separators = opts.answerSeparators.split(',').map((s) => s.trim()).filter(Boolean);
		answers = [answer];
		for (const sep of separators) {
			if (answers.length === 1 && answers[0].includes(sep)) {
				answers = answers[0].split(sep).map((s) => s.trim());
				break;
			}
		}

		if (answers.length === 1 && inputs.length > 1) {
			answers = answers[0].split(/\n|;|；/).map((s) => s.trim());
		}
	}

	for (let i = 0; i < inputs.length && i < answers.length; i++) {
		const input = inputs[i];
		if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
			if ((input as HTMLInputElement | HTMLTextAreaElement).value) continue;
			await rp.click(input);
			await rp['keyboard.type'](answers[i]);
			await $.sleep(200);
		} else if (input.getAttribute('contenteditable') === 'true') {
			await rp.click(input);
			await rp['keyboard.type'](answers[i]);
			await $.sleep(200);
		}
	}
}

async function handleShortAnswerQuestion(
	rp: RemotePage,
	cfg: typeof UnipusIpublishScript.cfg,
	opts: CommonWorkOptions,
	el: HTMLElement,
	questionText: string
) {
	if (cfg.other_mode === 'manually') {
		$msg.warn('简答题已跳过');
		return;
	}

	const inputs = extractInputs(el);
	if (inputs.length === 0) {
		$msg.warn('未找到输入框，跳过');
		return;
	}

	let answer = '';
	if (cfg.other_mode === 'custom') {
		answer = getCustomAnswer(cfg);
	} else {
		answer = await searchAnswer(opts, questionText, 'completion');
	}

	if (!answer) {
		$msg.warn('未搜到答案，跳过');
		return;
	}

	const input = inputs[0];
	await rp.click(input);
	await rp['keyboard.type'](answer);
	await $.sleep(200);
}

async function handleTranslationQuestion(
	rp: RemotePage,
	cfg: typeof UnipusIpublishScript.cfg,
	opts: CommonWorkOptions,
	el: HTMLElement,
	questionText: string
) {
	if (cfg.translation_mode === 'manually') {
		$msg.warn('翻译题已跳过');
		return;
	}

	const inputs = extractInputs(el);
	if (inputs.length === 0) {
		$msg.warn('未找到输入框，跳过');
		return;
	}

	let answer = await searchAnswer(opts, questionText, 'completion');
	if (!answer) {
		const prompt = cfg.prompts[0]?.translation_group || '';
		if (prompt) {
			answer = await searchAnswer(opts, prompt.replace('{{question}}', questionText), 'completion');
		}
	}

	if (!answer) {
		$msg.warn('未搜到答案，跳过');
		return;
	}

	const input = inputs[0];
	await rp.click(input);
	await rp['keyboard.type'](answer);
	await $.sleep(200);
}

async function handleDiscussionQuestion(
	rp: RemotePage,
	cfg: typeof UnipusIpublishScript.cfg,
	opts: CommonWorkOptions,
	el: HTMLElement,
	questionText: string
) {
	if (cfg.discussion_mode === 'manually') {
		$msg.warn('讨论题已跳过，请稍后自行手动完成');
		return;
	}

	const inputs = extractInputs(el);
	if (inputs.length === 0) {
		$msg.warn('未找到输入框，跳过');
		return;
	}

	let answer = '';

	if (cfg.discussion_mode === 'copy') {
		const discussions = Array.from(
			document.querySelectorAll<HTMLElement>(
				'[data-ipublish-question-group-type="讨论题"] .discussion-content, .discussion-answer, .discussion-reply, .discussion-item'
			)
		);
		const answeredDiscussions = discussions.filter((d) => d.textContent?.trim());
		if (answeredDiscussions.length > 0) {
			answer = answeredDiscussions[Math.floor(Math.random() * answeredDiscussions.length)].textContent?.trim() || '';
		}
		if (!answer) {
			$msg.warn('未找到其他讨论内容，尝试使用AI生成');
		}
	}

	if (!answer) {
		const prompt = cfg.prompts[0]?.discussion_group || '';
		if (prompt) {
			answer = await searchAnswer(opts, prompt.replace('{{question}}', questionText), 'completion');
		} else {
			answer = await searchAnswer(opts, questionText, 'completion');
		}
	}

	if (!answer) {
		$msg.warn('未搜到答案，跳过');
		return;
	}

	const input = inputs[0];
	await rp.click(input);
	await rp['keyboard.type'](answer);
	await $.sleep(200);
}

function getEvaluationScore(cfg: typeof UnipusIpublishScript.cfg): number {
	const mode = cfg.evaluation_mode;
	if (mode === 'manually') return -1;
	if (mode === 'fix') return cfg.evaluation_fix;
	if (mode === 'random') return Math.floor(Math.random() * 5) + 1;
	if (mode === '1r') return Math.floor(Math.random() * 2) + 1;
	if (mode === '2r') return Math.floor(Math.random() * 3) + 1;
	if (mode === '3r') return Math.floor(Math.random() * 3) + 2;
	if (mode === '4r') return Math.floor(Math.random() * 3) + 3;
	if (mode === '5r') return Math.floor(Math.random() * 2) + 4;
	return 5;
}

async function handleEvaluationQuestion(
	rp: RemotePage,
	cfg: typeof UnipusIpublishScript.cfg,
	el: HTMLElement
) {
	const score = getEvaluationScore(cfg);
	if (score < 0) {
		$msg.warn('评价题已跳过');
		return;
	}

	const ratingSelectors = [
		'.rate-star',
		'.star',
		'.rating-item',
		'[data-lexical-node-type="rating"]',
		'.ant-rate-star',
		'.evaluation-star',
		'.star-item'
	];

	let ratingEls: HTMLElement[] = [];
	for (const selector of ratingSelectors) {
		ratingEls = Array.from(el.querySelectorAll<HTMLElement>(selector));
		if (ratingEls.length > 0) break;
	}

	if (ratingEls.length === 0) {
		const radios = Array.from(el.querySelectorAll<HTMLElement>('input[type="radio"], [role="radio"]'));
		if (radios.length >= score) {
			await rp.click(radios[score - 1]);
			await $.sleep(200);
			return;
		}
		$msg.warn('未找到评分元素，跳过');
		return;
	}

	if (score <= ratingEls.length) {
		await rp.click(ratingEls[score - 1]);
		await $.sleep(200);
	} else {
		$msg.warn(`评分 ${score} 超出范围，跳过`);
	}
}

async function submitIpublishAnswer(rp: RemotePage) {
	const btns = Array.from(document.querySelectorAll<HTMLElement>('button, .btn, [role="button"]'));
	const submitBtn = btns.find((btn) => {
		const text = btn.textContent?.replace(/\s/g, '') || '';
		return text.includes('提交') || text.includes('保存');
	});

	if (submitBtn) {
		await rp.click(submitBtn);
		await $.sleep(3000);
		$msg.success('已提交答案');
	} else {
		$msg.warn('未找到提交按钮');
	}
}

async function getSubtitlesFromMedia(media: UnipusMedia) {
	let result = '';
	for (const info of media.mediaFile.videoSubtitleFile || []) {
		if (info.fileType === 'text/vtt') {
			const res = await request(info.fileUrl, {
				responseType: 'text',
				type: 'fetch'
			});
			result += res + '\n';
		}
	}
	return result;
}

export function parseVTT(content = '', tolerance = 0) {
	const lines = content.split(/\r?\n/);
	const cues = [];
	let cue = null;
	const timePattern = /^(\d{2}:\d{2}(?::\d{2})?\.\d{3})\s-->\s(\d{2}:\d{2}(?::\d{2})?\.\d{3})$/;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		const match = line.match(timePattern);
		if (match) {
			if (cue) {
				cues.push({ ...cue, text: cue.text.trim() });
			}
			cue = {
				start: toSeconds(match[1]),
				end: toSeconds(match[2]),
				text: ''
			};
		} else if (cue) {
			// 跳过数字行
			if (/^\n\d+$/.test(line)) {
				continue;
			}
			cue.text += (cue.text ? '\n' : '') + line;
		}
	}
	if (cue) {
		cues.push({ ...cue, text: cue.text.trim() });
	}

	// 合并重叠的 cues，允许 tolerance 容差
	const merged = [];
	for (const current of cues) {
		const last = merged[merged.length - 1];
		if (last && current.start < last.end - tolerance) {
			last.end = Math.max(last.end, current.end);
			last.text += '\n' + current.text;
		} else {
			merged.push({ ...current });
		}
	}
	return merged;
}

function toSeconds(timeStr: string) {
	if (!timeStr || typeof timeStr !== 'string') return 0;
	const parts = timeStr.split(':'); // e.g. ['00', '09.600'] or ['00', '00', '09.600']
	let hours = 0;
	let minutes = 0;
	let seconds = 0;

	if (parts.length === 3) {
		[hours, minutes] = parts.map(Number);
		const [s, ms = '0'] = parts[2].split('.');
		seconds = Number(s) + Number(ms) / 1000;
	} else if (parts.length === 2) {
		[minutes] = parts.map(Number);
		const [s, ms = '0'] = parts[1].split('.');
		seconds = Number(s) + Number(ms) / 1000;
	} else {
		return 0; // invalid format
	}

	return hours * 3600 + minutes * 60 + seconds;
}

function findQuestionBlockPreviousContent(questionBlock: HTMLElement) {
	let prev = questionBlock.previousElementSibling as HTMLElement | null;

	while (prev) {
		const ctx = prev.querySelector(
			'[data-lexical-node-type="insert-video"], [data-lexical-node-type="insert-audio"], [data-lexical-node-type="insert-image"]'
		);
		if (ctx) {
			return ctx;
		}
		prev = prev.previousElementSibling as HTMLElement | null;
	}
}
