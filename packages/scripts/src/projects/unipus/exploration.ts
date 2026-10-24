import { $, Script, $message, $el, $$el, h, MessageElement, $ui } from 'easy-us';
import { CommonProject } from '../common';
import { waitForElement, waitForMedia } from '../../utils/study';
import { dropdownStyle, playbackRate, volume } from '../../utils/configs';
import { CommonWorkOptions, $msg, playMedia } from '../../utils';
import {
	defaultAnswerWrapperHandler,
	createDefaultQuestionResolver,
	RemotePage,
	QuestionTypes,
	WorkResult,
	HonghuWorker,
	WorkOptions,
	WorkContext
} from '@honghu/core';
import { BackgroundProject } from '../background';
import { createLocalRemotePage } from '../../utils/app';
import { answerWrapperEmptyWarning, simplifyWorkResult } from '../../utils/work';

const state = {
	current_media: null as HTMLMediaElement | null,
	starting: true
};

export const UnipusExplorationScript = new Script({
	name: '经典AI版-课程学习',
	namespace: 'unipus.exploration.study',
	matches: [
		['经典AI学习页面', 'unipus.cn/_explorationpc_default/pc.html'],
		['课程列表', 'unipus.cn/app/cmgt/resource-detail']
	],
	configs: {
		notes: {
			defaultValue: $ui.notes([
				'如果脚本错乱请刷新界面',
				['如想选其他章节重新开始，请选择后刷新页面让脚本重新运行'],
				'上传视频、录音等任务请自行完成'
			]).outerHTML
		},

		switchMode: {
			label: '切换模式',
			tag: 'select',
			options: [
				['auto', '自动切换下一章'],
				['manual', '手动跳转']
			],
			defaultValue: 'auto' as 'auto' | 'manual'
		},
		playbackRate: playbackRate,
		audioPlaybackRate: {
			label: '音频倍速',
			attrs: { title: '最高1.2倍' },
			tag: 'select',
			options: [0.8, 1, 1.2].map((rate) => [rate.toString(), rate + ' x']),
			defaultValue: 1
		},
		volume: volume,
		readTranslate: {
			label: '精读任务显示翻译',
			attrs: { type: 'checkbox' },
			defaultValue: true
		},
		enables: {
			...dropdownStyle,
			label: '任务开关',
			attrs: { type: 'checkbox' },
			defaultValue: true
		},
		enable_media: {
			label: '视频/音频任务',
			showIf: 'unipus.exploration.study.enables',
			elementClassName: 'config-details',
			defaultValue: true,
			attrs: { type: 'checkbox' }
		},
		enable_choice: {
			label: '选择题',
			showIf: 'unipus.exploration.study.enables',
			elementClassName: 'config-details',
			defaultValue: true,
			attrs: { type: 'checkbox' }
		},
		enable_banked_cloze: {
			label: '选词填空题',
			showIf: 'unipus.exploration.study.enables',
			elementClassName: 'config-details',
			defaultValue: true,
			attrs: { type: 'checkbox', title: '包含选词填空和下拉框选词填空' }
		},
		enable_reading: {
			label: '阅读理解题',
			showIf: 'unipus.exploration.study.enables',
			elementClassName: 'config-details',
			defaultValue: true,
			attrs: { type: 'checkbox' }
		},
		enable_completion: {
			label: '填空、翻译题',
			showIf: 'unipus.exploration.study.enables',
			elementClassName: 'config-details',
			defaultValue: true,
			attrs: { type: 'checkbox' }
		},
		enable_line_matching: {
			label: '连线配对题',
			showIf: 'unipus.exploration.study.enables',
			elementClassName: 'config-details',
			defaultValue: true,
			attrs: { type: 'checkbox' }
		},
		enable_ppt: {
			label: '翻页PPT任务',
			showIf: 'unipus.exploration.study.enables',
			elementClassName: 'config-details',
			defaultValue: true,
			attrs: { type: 'checkbox' }
		}
	},
	async oncomplete() {
		if (location.href.includes('cmgt/resource-detail')) {
			$msg.info('请打开任意课程的章节进行自动学习');
			return;
		}

		CommonProject.scripts.render.methods.pin(this);

		// 纯浏览器扩展环境即可运行，使用本地 RemotePage（原生 DOM 事件）
		const rp: RemotePage = createLocalRemotePage();

		this.onConfigChange('playbackRate', (value) => {
			if (state.current_media) {
				state.current_media.playbackRate = value;
			}
		});
		this.onConfigChange('volume', (value) => {
			if (state.current_media) {
				state.current_media.volume = value;
			}
		});

		// 常驻轮询关闭平台的确认弹窗（学习时长提示、笔记习惯提示、长时间未操作提示等）。
		// 注意：不能跟着 job() 结束就退出，因为 SPA 换任务不会再触发 oncomplete，
		// 弹窗留着会盖住整页导致后续点击全部失效。
		const pickConfirmButton = () => {
			const direct = $el<HTMLElement>('.system-info-cloud-ok-button, button[class*=mask_notice]');
			if (direct) return direct;
			const modal = $el<HTMLElement>('.ant-modal-wrap:not([style*="display: none"])');
			if (!modal) return null;
			// 交卷、提交、删除这类弹窗不能替用户点确定
			if (/提交|交卷|删除/.test(modal.innerText || '')) return null;
			return modal.querySelector<HTMLElement>('.ant-modal-body .ant-btn-primary');
		};
		(async () => {
			for (;;) {
				await $.sleep(2000);
				const btn = pickConfirmButton();
				if (!btn) continue;
				try {
					await rp.click(btn);
				} catch {
					// 模拟点击失败时走原生点击兜底
				}
				// 部分弹窗只监听原生 click，模拟事件点不掉，这里补一次
				if (btn.isConnected) {
					btn.click();
				}
			}
		})();
		console.log('[U校园调试] oncomplete 开始执行, readyState:', document.readyState);
		console.log('[U校园调试] 当前URL:', location.href);
		const wrap = await waitForElement('.question-wrap', { timeout_seconds: 30 });
		if (!wrap) {
			console.error('[U校园调试] 未找到 .question-wrap！页面DOM可能已变更');
			$msg.error('未找到题目容器 .question-wrap，可能页面结构已变更或页面未完全加载');
			return;
		}
		console.log('[U校园调试] .question-wrap 已找到，开始答题');
		$msg.info('题目容器已找到，开始答题');
		await job(this.cfg, rp);
	},
	onrender(elements) {
		const translateBtn = h(
			'button',
			{
				className: 'base-style-button',
				style: { marginBottom: '10px' }
			},
			'开始学习'
		);
		translateBtn.onclick = () => {
			state.starting = !state.starting;
			if (!state.starting) {
				translateBtn.textContent = '开始学习';
			} else {
				translateBtn.textContent = '学习中...（点击暂停）';
			}
		};
		elements.panel.body?.replaceWith(h('div', { className: 'card' }, [translateBtn]));
	},
	async onstart() {
		console.log(1);
	}
});

/**
 * U 校园 5.x（经典 AI 版）把每道题统一收进 `.question-common-abs-reply`，一题一个。
 * 内部的作答控件决定题型：
 *   .option-wrap .option                → 选择（单选/多选）
 *   textarea                            → 填空 / 翻译 / 简答
 *   .question-common-abs-scoop          → 表格填分（每行填一个分值）
 *   .evaluation-slider-reply-wrapper    → 打分量表（每行点一个档位）
 *   input                               → 单行填空
 */
const QUESTION_ROOT = '.question-common-abs-reply';

type QuestionKind = 'choice' | 'textarea' | 'scoop' | 'slider' | 'input' | 'other';

/** 判断单个题目根的作答类型 */
function getQuestionKind(root: Element): QuestionKind {
	if (root.querySelector('.option-wrap .option')) return 'choice';
	if (root.querySelector('textarea')) return 'textarea';
	if (root.querySelector('.question-common-abs-scoop')) return 'scoop';
	// 打分量表（Reading the text 里 "Rate each statement 1~5" 那种）
	if (root.querySelector('.evaluation-slider-reply-wrapper')) return 'slider';
	if (root.querySelector('input')) return 'input';
	return 'other';
}

/**
 * 给某一类题目根打临时标记，返回可用于 HonghuWorker 的 root 选择器。
 * 新版一份试卷里可能混排选择题和填空题，只能先分组再分别作答。
 */
function markQuestions(kind: QuestionKind) {
	const attr = `data-hh-qk-${kind}`;
	$$el(QUESTION_ROOT).forEach((root) => {
		if (getQuestionKind(root) === kind) {
			root.setAttribute(attr, '1');
		}
	});
	return {
		selector: `[${attr}="1"]`,
		clear() {
			$$el(`[${attr}]`).forEach((root) => root.removeAttribute(attr));
		}
	};
}

/** 带标记地执行某个题型的作答，结束后一定清理标记 */
async function withMarkedQuestions<T>(kind: QuestionKind, run: (rootSelector: string) => Promise<T>) {
	const mark = markQuestions(kind);
	try {
		return await run(mark.selector);
	} finally {
		mark.clear();
	}
}

async function job(cfg: typeof UnipusExplorationScript.cfg, rp: RemotePage) {
	const wrap = await waitForElement('.question-wrap', { check_period_ms: 3000 });
	const wrap_content = wrap?.childNodes[0] as HTMLElement;
	const canRun = () => !!wrap_content?.isConnected;
	await waitFor(() => state.starting);

	const matches = (...selectors: string[]) => {
		return selectors.every((selector) => {
			return !!document.querySelector(selector);
		});
	};

	// 输出当前任务的题型识别结果，方便排查
	const debugKinds = $$el(QUESTION_ROOT).map(getQuestionKind);
	console.log('[U校园调试] 题目根数量:', debugKinds.length, '题型分布:', debugKinds.reduce<Record<string, number>>((acc, k) => {
		acc[k] = (acc[k] || 0) + 1;
		return acc;
	}, {}));

	await (async () => {
		if (!wrap_content) {
			$msg.error('未找到任务内容区域，跳过该任务');
			return;
		}

		if (matches('.unipus-upload-container')) {
			$msg.info('检测到上传任务，请自行手动完成，即将跳过');
			return;
		}

		if (matches('.question-wrap [class*=bgimg] [class*=picture]')) {
			$msg.info('检测到图片任务，即将跳过');
			return;
		}

		// 不支持图片题：只有图片出现在「作答区 / 选项」里才算图片题，
		// 阅读材料里的配图不影响搜题，不能误判成图片题直接跳过。
		if (matches('.question-common-abs-reply .component-htmlview img, .option-wrap .option img, textarea ~ .component-htmlview img')) {
			$msg.error('检测到题目中包含图片，暂时无法处理，即将跳过该任务');
			return;
		}

		if (matches('.question-wrap .video-box')) {
			$msg.info('检测到视频任务，即将播放');
			const media = await waitForMedia();
			if (!media) {
				$msg.error('未找到视频，即将跳过该任务');
				return;
			}
			if (!cfg.enable_media) {
				$msg.warn('视频/音频任务已关闭，即将跳过该任务');
				return;
			}

			media.currentTime = 0;
			media.volume = cfg.volume;
			media.playbackRate = cfg.playbackRate;
			return await new Promise<void>((resolve, reject) => {
				playMedia(() => media.play())
					.then(() => {
						state.current_media = media;
						media.volume = cfg.volume;
						media.playbackRate = cfg.playbackRate;
						media.addEventListener('pause', async () => {
							if (!canRun()) return;
							// 视频弹窗检测
							$msg.info('视频已暂停，继续播放中...');
							const el = $el('.popupBox .questionBox');
							if (el) {
								$msg.info('检测到视频弹窗，随机答题中...');
								await $.sleep(1000);
								const options = Array.from(el.querySelectorAll('div.option'));
								const randomIndex = Math.floor(Math.random() * options.length);
								await rp.click(options[randomIndex]);
							}

							setTimeout(() => {
								media.volume = cfg.volume;
								media.playbackRate = cfg.playbackRate;
								media.play();
							}, 1000);
						});
						media.addEventListener('ended', () => {
							if (!canRun()) return;
							$msg.success('视频播放完成，即将进入下一个任务');
							setTimeout(resolve, 3000);
						});
					})
					.catch(reject);
			});
		}

		// ===============================  精读内容 ===============================
		if (matches('.question-wrap .question-rich-text-read')) {
			$msg.info('检测到阅读任务，即将播放');

			const media = await waitForMedia({ timeout: 10000 });
			if (!media) {
				$msg.error('未找到阅读音频，即将跳过该任务');
				return;
			}
			if (!cfg.enable_media) {
				$msg.warn('视频/音频任务已关闭，即将跳过该任务');
				return;
			}

			if (cfg.readTranslate) {
				const btn = $el('.audioBox .btn-switch.close');
				if (btn) {
					await rp.click(btn);
				}
				// 翻译按钮
				const btns = $$el('div.audioBox .control-block.open');
				const translateBtn = btns[1]?.querySelectorAll('.btn-text')[0];
				if (translateBtn) {
					await rp.click(translateBtn);
				}
			}

			media.currentTime = 0;
			media.volume = cfg.volume;
			media.playbackRate = cfg.audioPlaybackRate;
			return await new Promise<void>((resolve, reject) => {
				playMedia(() => media.play())
					.then(() => {
						state.current_media = media;
						media.addEventListener('pause', async () => {
							if (!canRun()) return;
							$msg.info('音频已暂停，继续播放中...');
							setTimeout(() => media.play(), 1000);
						});
						media.addEventListener('ended', () => {
							if (!canRun()) return;
							$msg.success('阅读音频播放完成，即将进入下一个任务');
							setTimeout(resolve, 3000);
						});
					})
					.catch(reject);
			});
		}

		// =============================== 词汇PPT ===============================
		if (matches('.vocabulary-wrapper', '.swiper-slide')) {
			if (!cfg.enable_ppt) {
				$msg.warn('翻页PPT任务已关闭，即将跳过该任务');
				return;
			}

			$msg.info('检测到词汇PPT任务，即将开始学习');
			const countStr = ($el('.vocabulary-wrapper .ratio')?.innerText.trim() || '').split('/')[1] || '0';
			const totalCount = parseInt(countStr);
			let index = 0;
			let el = $el('.vocActions .action.next:not(.disabled)');
			while (el) {
				await rp.click(el);
				await $.sleep(1000);
				el = $el('.vocActions .action.next:not(.disabled)');

				index++;
				if (index >= totalCount) {
					break;
				}
			}
			return;
		}

		// ===============================  自检题 ===============================
		if (matches('[data-row-key="Review & check"]')) {
			$msg.info('检测到自检任务，即将开始填写');

			const got_its = $$el('.ant-table-cell .anticon-border');
			const reviews = $$el('.ant-table-cell .anticon-file-done');

			for (const got_it of got_its) {
				await rp.click(got_it);
				await $.sleep(500);
			}

			for (const review of reviews) {
				await rp.click(review);
				// 已掌握
				await rp.click('.modal-ok-btn');
				await $.sleep(500);
			}

			return;
		}

		// =============================== 新版通用题型（选择 / 填空 / 翻译 / 表格填分）===============================
		// U 校园 5.x 把每道题都收进 .question-common-abs-reply，一题一个；
		// 同一份试卷里可能混排选择题和填空题，所以先按题型分组，再分别作答。
		const questionRoots = $$el(QUESTION_ROOT);
		const questionKinds = questionRoots.map(getQuestionKind);
		const countKind = (kind: QuestionKind) => questionKinds.filter((k) => k === kind).length;
		const choiceCount = countKind('choice');
		const blankCount = countKind('textarea');
		const scaleCount = countKind('scoop') + countKind('slider') + countKind('input');
		const hasMaterial = !!(questionRoots.length && $el('.question-common-abs-material, .layout-material-container'));

		if (choiceCount + blankCount + scaleCount > 0) {
			// 判断已经完成
			if (checkUniTestIsDone()) {
				$msg.success('当前任务已完成，即将跳过该任务');
				return;
			}

			// 按题型分组，混排试卷（选择题 + 填空题）会依次作答
			const groups: { label: string; run: (sub: CommonWorkOptions) => Promise<unknown> }[] = [];

			if (choiceCount > 0) {
				if (!cfg.enable_choice) {
					$msg.warn('选择题任务开关已关闭，跳过选择题');
				} else if (hasMaterial) {
					groups.push({
						label: '阅读理解选择题',
						run: (sub) => withMarkedQuestions('choice', (root) => doReading(rp, sub, root))
					});
				} else {
					groups.push({
						label: '选择题',
						run: (sub) => withMarkedQuestions('choice', (root) => doChoice(rp, sub, root))
					});
				}
			}

			if (blankCount > 0) {
				if (hasMaterial && cfg.enable_reading) {
					groups.push({
						label: '阅读理解填空题',
						run: (sub) => withMarkedQuestions('textarea', (root) => doUnderstandingText(rp, sub, root))
					});
				} else if (cfg.enable_completion) {
					groups.push({
						label: '填空题',
						run: (sub) => withMarkedQuestions('textarea', (root) => doCompletion(rp, sub, root))
					});
				} else {
					$msg.warn('填空题任务开关已关闭，跳过填空题');
				}
			}

			if (scaleCount > 0) {
				if (!cfg.enable_completion) {
					$msg.warn('表格填分任务开关已关闭，跳过表格填分');
				} else {
					groups.push({ label: '表格填分', run: () => doRatingScale(rp) });
				}
			}

			if (groups.length === 0) {
				$msg.warn('当前任务的所有题型均已关闭，即将跳过该任务');
				return;
			}

			const workOptions = CommonProject.scripts.settings.methods.getWorkOptions();
			for (let index = 0; index < groups.length; index++) {
				const group = groups[index];
				// 多组题型时，前面的分组先保存，最后一组才交给平台提交
				const sub = index === groups.length - 1 ? workOptions : { ...workOptions, upload: 'save' as const };
				$msg.info(`检测到${group.label}任务，即将开始作答（${index + 1}/${groups.length}）`);
				await group.run(sub);
			}
			return;
		}

		// =============================== 选词填空 ===============================
		if (
			matches(
				// 选词填空按钮
				'.question-material-banked-cloze-reply',
				// 填空横线
				'.input-wrapper'
			)
		) {
			if (!cfg.enable_banked_cloze) {
				$msg.warn('选词填空任务开关已关闭，即将跳过该任务');
				return;
			}
			// 判断已经完成
			if (checkUniTestIsDone()) {
				$msg.success('选词填空任务已完成，即将跳过该任务');
				return;
			}
			$msg.info('检测到选词填空任务，即将开始答题');

			const direction = $el('.abs-direction')?.innerText.trim() || '';

			const blanks = $$el('.question-material-banked-cloze-reply .option-wrapper')
				.map((el) => el.querySelector('.option') || el.querySelector('.option-placeholder'))
				.map((el) => el?.textContent || '')
				.join('\n');

			const questions = resoleInputWrapLines($el('.question-material-banked-cloze-scoop') as HTMLElement);

			if (!blanks.trim()) {
				$msg.error('未找到题目内容，跳过该任务');
				return;
			}

			try {
				const res = await singleQuestionHandle({
					rp,
					question: [direction, '-'.repeat(10), blanks, '-'.repeat(10), questions].join('\n'),
					type: 'completion',
					options: $$el('.question-wrap .input-wrapper input'),
					handler: async (type, answer, option) => {
						const input = option as HTMLInputElement;
						if (input.value) {
							return;
						}
						await rp.click(input);
						await rp['keyboard.type'](answer, { delay: 20 });
						await $.sleep(200);
					}
				});

				if (res.finish) {
					$msg.success('选词填空任务答题完成');
				} else {
					$msg.error('选词填空任务未完成，可能是答案不匹配');
				}
			} catch (err) {
				$msg.error((err as Error).message || '选词填空任务答题出错，跳过该任务');
			}
			return;
		}

		// =============================== 下拉框选词填空 ===============================
		if (
			matches(
				// 下拉框选词填空
				'.input-wrapper .ant-dropdown-trigger'
			)
		) {
			if (!cfg.enable_banked_cloze) {
				$msg.warn('选词填空任务开关已关闭，即将跳过该任务');
				return;
			}
			// 判断已经完成
			if (checkUniTestIsDone()) {
				$msg.success('选词填空任务已完成，即将跳过该任务');
				return;
			}
			$msg.info('检测到选词填空任务，即将开始答题');

			// 将下拉框文本前方的 1) 2) 换成空格，避免影响匹配
			const ques = ($el('.question-wrap')?.innerText.trim() || '')
				.replace(/\s\d+\)点击选择/g, ' _____ ')
				// 已经选择了的选项
				.replace(/\s\d+\)\n+[a-zA-Z]+\n+/g, ' _____ ');

			if (!ques.trim()) {
				$msg.error('未找到题目内容，跳过该任务');
				return;
			}

			const options = $$el('.scoop-select-wrapper i').map((e) => e.textContent);

			try {
				const res = await singleQuestionHandle({
					rp,
					question: [ques, '-'.repeat(10), ...options].join('\n'),
					type: 'completion',
					options: $$el('.scoop-select-wrapper'),
					handler: async (type, answer, option) => {
						await rp.click(option);
						await $.sleep(200);
						const target = Array.from(option.querySelectorAll('.ant-dropdown-menu-item')).find(
							(el) => el.textContent?.trim() === answer.trim()
						);
						if (target) {
							await rp.click(target);
						}
						await $.sleep(200);
					}
				});

				if (res.finish) {
					$msg.success('选词填空任务答题完成');
				} else {
					$msg.error('选词填空任务未完成，可能是答案不匹配');
				}
			} catch (err) {
				$msg.error((err as Error).message || '选词填空任务答题出错，跳过该任务');
			}
			return;
		}

		// =============================== 自由填空题 ===============================
		// 例如：单个阅读理解下的表格填写题
		if (
			matches(
				'.layout-reply-container',
				// 填空横线
				'.fe-scoop .scoop-input-wrapper',
				'input'
			)
		) {
			if (!cfg.enable_completion) {
				$msg.warn('自由填空题任务开关已关闭，即将跳过该任务');
				return;
			}
			// 判断已经完成
			if (checkUniTestIsDone()) {
				$msg.success('自由填空题任务已完成，即将跳过该任务');
				return;
			}
			$msg.info('检测到自由填空题任务，即将开始答题');

			const direction = $el('.abs-direction')?.innerText.trim() || '';

			const text_context = $el('.layout-material-container')?.innerText.trim() || '';

			const questions = resoleInputWrapLines($el('.layout-reply-container ') as HTMLElement);

			if (!questions.trim()) {
				$msg.error('未找到题目内容，跳过该任务');
				return;
			}

			try {
				const res = await singleQuestionHandle({
					rp,
					question: [
						direction,
						'-'.repeat(10),
						...(text_context ? [text_context, '-'.repeat(10)] : []),
						questions
					].join('\n'),
					type: 'completion',
					// 支持单列和双列的自由填空题
					options: $$el('.layout-reply-container .fe-scoop input'),
					handler: async (type, answer, option) => {
						const input = option as HTMLInputElement;
						if (input.value) {
							return;
						}
						await rp.click(input);
						await rp['keyboard.type'](answer, { delay: 20 });
						await $.sleep(200);
					}
				});

				if (res.finish) {
					$msg.success('自由填空题任务答题完成');
				} else {
					$msg.error('自由填空题任务未完成，可能是答案不匹配');
				}
			} catch (err) {
				$msg.error((err as Error).message || '自由填空题任务答题出错，跳过该任务');
			}

			return;
		}

		// =============================== 连线配对题 ===============================
		if (matches('.sequence-reply-view-item-text')) {
			if (!cfg.enable_line_matching) {
				$msg.warn('连线配对任务开关已关闭，即将跳过该任务');
				return;
			}
			// 判断已经完成
			if (checkUniTestIsDone()) {
				$msg.success('连线配对题任务已完成，即将跳过该任务');
				return;
			}
			$msg.info('检测到连线配对题任务，即将开始答题');

			const moveOption = async (opt: HTMLElement) => {
				opt.setAttribute('testid', 'to-move');
				opt.scrollIntoView({ block: 'center', behavior: 'smooth' });
				await rp.hover('[testid="to-move"]');
				await rp['mouse.down']();
				// 移动选项到界面最上方，然后平台会自己排列到最上面
				await rp.hover('.abs-direction');
				await rp['mouse.up']();
				opt.removeAttribute('testid');
				await $.sleep(500);
			};

			try {
				const queryItems = () => $$el('.question-wrap .sequence-reply-view-item-text');

				$msg.warn('正在检测连线配对题顺序中...请勿操作');
				const checkOrder = async (skip_count = 0) => {
					// 如果发现选项乱序，先摆正顺序
					const options = queryItems();
					const option_data: { el: HTMLElement; index: number }[] = [];
					for (const opt of options) {
						const text = opt.innerText.trim();
						const match = text.match(/^([A-Z])\./);
						if (match) {
							option_data.push({ el: opt, index: match[1].charCodeAt(0) });
						}
					}
					// 检测顺序是否错误
					const is_ordered = option_data.every((data, i, arr) => {
						if (i === 0) return true;
						return data.index >= arr[i - 1].index;
					});
					if (is_ordered) {
						return;
					}
					// 排序，每次移动都会更新dom元素，这里移动一次直接返回 false，知道没有元素可以移动位置
					// 则代表已经全部排列完成
					const first = option_data.slice(skip_count).sort((a, b) => b.index - a.index)[0];
					if (!first) {
						return;
					}
					await moveOption(first.el);
					await checkOrder(skip_count + 1);
				};
				await checkOrder();
				$msg.info('连线配对题选项已排序完成，开始作答');

				const seq = $el('.sequence-view')?.innerText.trim() || '';
				const direction = $el('.abs-direction')?.innerText.trim() || '';
				if (!seq || !direction) {
					$msg.error('未找到题目内容，跳过该任务');
					return;
				}
				const texts = seq.match(/\d+.+\n/g)?.map((line) => line.trim()) || [];
				const options = seq.match(/\n[A-Z]\..+/g)?.map((line) => line.trim()) || [];

				const result_answers: string[] = [];

				const res = await singleQuestionHandle({
					rp,
					question: [direction, '-'.repeat(10), texts, '-'.repeat(10), options].flat().join('\n'),
					type: 'completion',
					options: queryItems(),
					// 手动执行提交操作
					custom_upload_handler: true,
					handler: async (type, answer, option) => {
						if (!answer.match(/^[A-Z]$/)) {
							throw new Error('答案格式不正确，无法作答连线配对题，跳过该任务');
						}
						result_answers.push(answer);
					}
				});

				const msg = $message.warn({ content: '移动顺序中...请勿操作', duration: result_answers.length * 1000 });
				// 因为答案顺序是从第一个开始的，所以需要倒序一个个移动到最上方，让平台自己排列
				for (const answer of result_answers.reverse()) {
					const items = queryItems();
					const index = items.findIndex((item) => {
						const text = item.innerText.trim();
						const match = text.match(/^([A-Z])\./);
						return match && match[1] === answer;
					});
					await moveOption(items[index]);
					await $.sleep(500);
				}
				msg?.remove();

				if (res.finish) {
					// 手动提交
					await submitAnswer(rp);
					$msg.success('连线配对题任务答题完成');
				} else {
					$msg.error('连线配对题任务未完成，可能是答案不匹配');
				}
			} catch (err) {
				$msg.error((err as Error).message || '自由填空题任务答题出错，跳过该任务');
			}
		}

		// =============================== 纯文本阅读题（Structure analysis / Reading skills / Collocation），阅读一段时间后跳过 ===============================
		if (matches('.text-material-wrapper') || matches('.question-common-abs-material')) {
			const textLength = ($el('.text-material-wrapper, .question-common-abs-material')?.innerText || '').trim().length;
			if (textLength > 0) {
				$msg.info('检测到文本阅读任务，阅读 10 秒后跳过');
				await $.sleep(10 * 1000);
				return;
			}
		}

		// 兜底：未识别的内容（Quotation、Stories of China 等纯展示任务，
		// 平台的样式类是哈希生成的，无法稳定定位），直接交给平台自动标记完成。
		console.log('[U校园调试] 未识别的任务内容:', {
			className: wrap_content.className,
			text: (wrap_content.innerText || '').replace(/\s+/g, ' ').slice(0, 200),
			video: document.querySelectorAll('video').length,
			audio: document.querySelectorAll('audio').length,
			iframe: document.querySelectorAll('iframe').length
		});

		$msg.info('未知任务类型，即将跳过');
	})();
	if (cfg.switchMode === 'manual') {
		const el = $message.warn({ content: '当前为手动切换模式，已暂停，请手动切换。', duration: 0 });
		await waitFor(() => !wrap_content.isConnected, { show_msg: false });
		el?.remove();
		await job(cfg, rp);
		return;
	}

	$msg.success('任务完成，即将进入下一个任务');
	await $.sleep(3 * 1000);
	await waitFor(() => state.starting);

	if (!(await next(rp))) {
		$msg.success('已完成所有任务');
		CommonProject.scripts.settings.methods.notificationBySetting('已完成所有任务', {
			duration: 0,
			extraTitle: UnipusExplorationScript.name
		});
		return;
	}
	await job(cfg, rp);
}

/** 等待页面 hash 变化，作为「跳转成功」的判据 */
async function waitHashChange(hash: string, timeout = 8000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		await $.sleep(500);
		if (location.hash !== hash) return true;
	}
	return false;
}

/**
 * 进入下一个任务。
 * 光点击不判断结果的话，一旦平台没响应就会在同一个任务上无限空转，
 * 所以这里统一用 hash 是否变化来确认跳转成功，并补一次原生 click 兜底。
 */
async function next(rp: RemotePage) {
	const hash = location.hash;

	const go = async (el?: HTMLElement) => {
		if (!el) return false;
		await rp.click(el);
		if (await waitHashChange(hash, 5000)) return true;
		// 模拟点击被平台忽略时，用原生 click 再试一次
		if (el.isConnected) {
			el.click();
			if (await waitHashChange(hash, 5000)) return true;
		}
		return false;
	};

	const findNext = async (selector: string, activeClass: string) => {
		const elements = $$el<HTMLElement>(selector) as HTMLElement[];
		for (let index = 0; index < elements.length; index++) {
			if (elements[index].classList.contains(activeClass)) {
				return await go(elements[index + 1]);
			}
		}
		return false;
	};

	// 小任务
	if (await findNext('.pc-header-tasks-row .pc-task', 'pc-header-task-activity')) return true;
	// 小章节
	if (await findNext('.pc-tab-row .tab', 'pc-header-tab-activity')) return true;
	// 大章节，好像有两个UI版本
	if (await findNext('.pc-slider-content [data-role="micro"],.pc-slider-content [data-role="node"]', 'pc-menu-activity')) {
		return true;
	}

	return false;
}

// function getCurrentTaskName() {
// 	return $el('.pc-header-tasks-row .pc-header-task-activity')?.textContent.trim() || '';
// }

// function getCurrentTabName() {
// 	return $el('.pc-tab-row .pc-header-tab-activity')?.textContent.trim() || '';
// }

function waitFor(condition: () => boolean, opts: { show_msg: boolean } = { show_msg: true }) {
	let msg: MessageElement | undefined;
	return new Promise<void>((resolve) => {
		const interval = setInterval(() => {
			if (condition()) {
				msg?.remove();
				clearInterval(interval);
				resolve();
			} else {
				if (!msg && opts.show_msg) {
					msg = $message.info({ content: '学习已暂停，点击开始按钮继续学习', duration: 0 });
				}
			}
		}, 1000);
	});
}

/**
 * 适用于单次题型的答题处理
 */
async function singleQuestionHandle({
	rp,
	question,
	type,
	options,
	handler,
	custom_upload_handler = false
}: {
	rp: RemotePage;
	question: string;
	type: QuestionTypes;
	options: HTMLElement[];
	handler: (type: QuestionTypes, answer: string, option: HTMLElement) => any;
	custom_upload_handler?: boolean;
}) {
	if (!type) throw new Error('未识别题目类型，无法作答');

	const { answererWrappers, answerSeparators } = CommonProject.scripts.settings.methods.getWorkOptions();

	if (answererWrappers === undefined || answererWrappers.length === 0) {
		await answerWrapperEmptyWarning(0);
		return { finish: false };
	}

	const visual_state = CommonProject.scripts.render.cfg.visual;
	// 最大化面板
	CommonProject.scripts.render.methods.normal();
	CommonProject.scripts.workResults.methods.init();
	// 固定显示答题结果面板
	CommonProject.scripts.render.methods.pin(CommonProject.scripts.workResults);
	console.log('question', question);

	// ====================== 搜题 ======================
	const searchedInfos = await CommonProject.scripts.apps.methods.searchAnswerInCaches(question, async () => {
		return defaultAnswerWrapperHandler(answererWrappers, {
			type: type,
			title: question
		});
	});

	if (!searchedInfos || searchedInfos.length === 0) {
		throw new Error('未搜到到任何答案。');
	}

	const ctx: WorkContext<any> = {
		searchInfos: searchedInfos,
		answerSeparators: answerSeparators.split(','),
		type: type,
		root: document.body,
		elements: {}
	};

	// ====================== 显示搜题结果 ======================
	const workResults: WorkResult<any>[] = [
		{
			ctx,
			requested: true,
			resolved: false
		}
	];
	const update = () => {
		CommonProject.scripts.workResults.methods.setResults(simplifyWorkResult(workResults, () => question));
		CommonProject.scripts.workResults.methods.updateWorkStateByResults(workResults);
	};
	update();

	const action = type === 'completion' ? '填写' : '选择';
	const msg = $message.warn({ content: `正在${action}答案中...请勿操作`, duration: 0 });
	// ====================== 答案答题自动处理程序 ======================
	const resolver = createDefaultQuestionResolver(ctx);
	const result = await resolver[type](searchedInfos, options, handler);
	msg?.remove();

	// ====================== 显示答题结果 ======================
	workResults[0].resolved = true;
	workResults[0].result = result;
	if (result?.finish) {
		CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
			simplifyWorkResult([workResults[0]], () => question)
		);
	}
	update();

	// ====================== 还原尺寸状态 ======================
	if (visual_state === 'minimize' && CommonProject.scripts.render.cfg.visual !== 'minimize') {
		CommonProject.scripts.render.methods.minimize();
	}

	const { upload } = CommonProject.scripts.settings.methods.getWorkOptions();
	if (result.finish) {
		// 提交
		if (upload !== 'nomove') {
			if (!custom_upload_handler) {
				await submitAnswer(rp);
			}
			return { upload: !custom_upload_handler, finish: true };
		} else {
			return { upload: false, finish: true };
		}
	} else {
		return { upload: false, finish: false };
	}
}

function doChoice(rp: RemotePage, opts: CommonWorkOptions, root = '.question-common-abs-choice') {
	const is_multiple = !!$el('.multipleChoice');
	return handleCommonUnitTest(rp, opts, {
		type: is_multiple ? 'multiple' : 'single',
		test_type: 'choice',
		root,
		elements: {
			title: '.ques-title',
			options: '.option-wrap .option .content'
		}
	});
}

function doReading(rp: RemotePage, opts: CommonWorkOptions, root = '.question-common-abs-choice') {
	const is_multiple = !!$el('.multipleChoice');
	return handleCommonUnitTest(rp, opts, {
		type: is_multiple ? 'multiple' : 'single',
		test_type: 'reading-choice',
		root,
		elements: {
			// 将题目和选项一起搜索
			title: '.ques-title,.option-wrap',
			options: '.option-wrap .option .content'
		},
		questionTitleTransform(ques) {
			// 指导内容，比如说：选择最佳匹配的选项...
			const direction = $el('.question-wrap .abs-direction')?.innerText.trim() || '';
			// 阅读理解主要内容
			const ctx = $el('.question-wrap .question-common-abs-material')?.innerText.trim() || '';
			// ques 就是小标题
			return [direction, '-'.repeat(10), ctx, '-'.repeat(10), ques].filter(Boolean).join('\n');
		}
	});
}

function doUnderstandingText(rp: RemotePage, opts: CommonWorkOptions, root = '.question-common-abs-reply') {
	return handleCommonUnitTest(rp, opts, {
		type: 'completion',
		test_type: 'reading-replay',
		root,
		elements: {
			// 将题目和选项一起搜索
			title: '.question-inputbox-header',
			options: 'textarea'
		},
		questionTitleTransform(ques) {
			// 指导内容，比如说：选择最佳匹配的选项...
			const direction = $el('.question-wrap .abs-direction')?.innerText.trim() || '';
			// 阅读理解主要内容
			const ctx = $el('.question-wrap .question-common-abs-material')?.innerText.trim() || '';
			// ques 就是小标题
			return [direction, '-'.repeat(10), ctx, '-'.repeat(10), ques].filter(Boolean).join('\n');
		}
	});
}

function doCompletion(rp: RemotePage, opts: CommonWorkOptions, root = '.question-common-abs-reply') {
	return handleCommonUnitTest(rp, opts, {
		type: 'completion',
		test_type: 'complete',
		root,
		elements: {
			title: '.question-inputbox-header',
			options: '.question-inputbox-body textarea'
		},
		questionTitleTransform(ques) {
			// 指导内容，比如说：选翻译以下内容成中文或者英文
			const direction = $el('.question-wrap .abs-direction')?.innerText.trim() || '';
			// ques 就是翻译内容
			return [direction, '-'.repeat(10), ques].filter(Boolean).join('\n');
		}
	});
}

/**
 * 量表题（Reading the text 里的自我评估 / 打分题）。
 * 两类形态：
 *   1. 表格填分：每行一个空格，填 1~N 的分值（.question-common-abs-scoop）
 *   2. 点击打分：每题一排档位格子，点中间那格（.evaluation-slider-reply-wrapper）
 * 这两种题都没有标准答案，题库也搜不到，所以统一取量表的中间值，
 * 保证题目被平台标记为「已作答」，不至于卡住整个学习流程。
 */
async function doRatingScale(rp: RemotePage) {
	const marks = [markQuestions('scoop'), markQuestions('slider'), markQuestions('input')];
	try {
		let filled = 0;

		// ===== 点击打分：每题点中间档位 =====
		const sliderRoots = $$el<HTMLElement>('[data-hh-qk-slider="1"]') as HTMLElement[];
		for (const root of sliderRoots) {
			const items = Array.from(
				root.querySelectorAll<HTMLElement>('.evaluation-slider-reply-component-wrapper_option_item')
			);
			if (items.length === 0) continue;
			await rp.click(items[Math.floor((items.length - 1) / 2)]);
			await $.sleep(300);
			filled++;
		}
		if (sliderRoots.length > 0) {
			$msg.success(`打分题已选择 ${filled}/${sliderRoots.length} 项（统一选中间档位）`);
		}

		// ===== 表格填分：空格填中间值 =====
		const inputRoots = $$el<HTMLElement>(`${marks[0].selector},${marks[2].selector}`) as HTMLElement[];
		const inputs = inputRoots
			.flatMap((root) => Array.from(root.querySelectorAll<HTMLInputElement>('input')))
			.filter((input) => !input.disabled && !['radio', 'checkbox', 'file', 'hidden'].includes(input.type));

		if (inputs.length > 0) {
			// 从题面里解析量表范围，例如 "1 = Strongly disagree ... 7 = Strongly agree"
			const legend = $el('.question-common-abs-scoop')?.innerText || $el('.question-common-abs-material')?.innerText || '';
			const scaleValues = (legend.match(/(?:^|\s)(\d{1,2})\s*=/g) || [])
				.map((s) => parseInt(s.replace(/\D/g, ''), 10))
				.filter((n) => n >= 1 && n <= 10);
			const max = scaleValues.length ? Math.max(...scaleValues) : 5;
			const value = String(Math.round((1 + max) / 2));

			let inputFilled = 0;
			for (const input of inputs) {
				if (input.value) continue;
				await rp.click(input);
				await rp['keyboard.type'](value);
				await $.sleep(200);
				if (input.value) inputFilled++;
			}
			filled += inputFilled;
			if (inputFilled > 0) {
				$msg.success(`表格填分已填写 ${inputFilled}/${inputs.length} 项（量表 1~${max}，统一填 ${value}）`);
			}
		}

		return filled;
	} finally {
		marks.forEach((mark) => mark.clear());
	}
}

async function handleCommonUnitTest(
	rp: RemotePage,
	opts: CommonWorkOptions,
	config: {
		type: QuestionTypes;
		root: string;
		elements: WorkOptions<any>['elements'];
		onUpload?: (uploadable: boolean) => any;
		questionTitleTransform?: (ques: string, result_transform?: boolean) => string;
		test_type: 'reading-choice' | 'reading-replay' | 'choice' | 'complete';
	}
) {
	if (opts.answererWrappers === undefined || opts.answererWrappers.length === 0) {
		return await answerWrapperEmptyWarning(0);
	}
	const visual_state = CommonProject.scripts.render.cfg.visual;
	// 最大化面板
	CommonProject.scripts.render.methods.normal();
	CommonProject.scripts.workResults.methods.init();
	// 固定显示答题结果面板
	CommonProject.scripts.render.methods.pin(CommonProject.scripts.workResults);

	const titleTransform = (titles: (HTMLElement | undefined)[]) => {
		const res = titles.map((t) => (t ? t.innerText : '')).join('\n\n');
		return config.questionTitleTransform ? config.questionTitleTransform(res) : res;
	};

	/** 新建答题器 */
	const worker = new HonghuWorker({
		root: config.root,
		elements: {
			title: config.elements.title,
			options: config.elements.options
		},
		thread: opts.thread ?? 1,
		answerSeparators: opts.answerSeparators.split(',').map((s) => s.trim()),
		/** 默认搜题方法构造器 */
		answerer: async (elements, ctx) => {
			const title = titleTransform(elements.title);
			console.log('title', title);
			if (title.trim()) {
				return CommonProject.scripts.apps.methods.searchAnswerInCaches(title.trim(), async () => {
					await $.sleep((opts.period ?? 3) * 1000);
					return defaultAnswerWrapperHandler(opts.answererWrappers, {
						type: ctx.type,
						title,
						options: ctx.type === 'completion' ? '' : ctx.elements.options.map((o) => o.innerText).join('\n')
					});
				});
			} else {
				throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
			}
		},

		work: {
			type(ctx) {
				return config.type;
			},
			async handler(type, answer, option, ctx) {
				if (type === 'judgement' || type === 'single' || type === 'multiple') {
					// 这里只用判断多选题是否选中，如果选中就不用再点击了，单选题是 radio，所以不用判断。
					const opt = option.parentElement as HTMLElement;
					if (opt.classList.contains('selected')) {
						return;
					}
					const btn = opt.querySelector('.caption');
					if (btn) {
						await rp.click(btn);
						await $.sleep(200);
					}
				} else if (type === 'completion') {
					const input = option as HTMLTextAreaElement;
					if (input.value) {
						return;
					}
					await rp.click(input);
					await rp['keyboard.type'](answer);
					await $.sleep(200);
				}
			}
		},

		/** 完成答题后 */
		async onResultsUpdate(curr, _, res) {
			/**
			 * 阅读理解题目格式化显示，否则会超长
			 */
			const readingResultTitleTransform = (t: any, index: number) => {
				const ctx = res[index].ctx;

				const body = [
					`<span title="${[titleTransform(ctx?.elements.title || [])]
						.join('\n')
						.replace(/"/g, '&quot;')
						.replace(/</g, '&lt;')
						.replace(/>/g, '&gt;')}">[阅读理解上下文]</span><br>`,
					...(config.test_type === 'reading-choice'
						? [
								...$$el('.ques-title', ctx?.root).map((e) => e.innerText.trim()),
								...$$el('.option-wrap .option .content', ctx?.root)
									.map((e) => e.innerText.trim())
									.map((o, i) => {
										const charCode = 65 + i;
										return `${String.fromCharCode(charCode)}. ${o}`;
									})
						  ]
						: []),
					...(config.test_type === 'reading-replay'
						? [...$$el('.question-inputbox-header', ctx?.root).map((e) => e.innerText.trim())]
						: [])
				];
				return body.filter(Boolean).join('<br>');
			};
			if (curr.result?.finish) {
				CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
					simplifyWorkResult(
						[curr],
						config.test_type === 'reading-choice' || config.test_type === 'reading-replay'
							? readingResultTitleTransform
							: titleTransform
					)
				);
			}
			CommonProject.scripts.workResults.methods.setResults(
				simplifyWorkResult(
					res,
					config.test_type === 'reading-choice' || config.test_type === 'reading-replay'
						? readingResultTitleTransform
						: titleTransform
				)
			);
			CommonProject.scripts.workResults.methods.updateWorkStateByResults(res);
		}
	});

	const results = await worker.doWork({ enable_debug: BackgroundProject.scripts.dev.cfg.enable_answerer_debug });
	// 停顿等待
	const msg = `答题完成，将等待 ${opts.stopSecondWhenFinish} 秒后进行保存或提交。`;
	$msg.info({ content: msg, duration: opts.stopSecondWhenFinish });
	await $.sleep(opts.stopSecondWhenFinish * 1000);
	// 处理提交
	await worker.uploadHandler({
		type: opts.upload,
		results,
		async callback(finishedRate, uploadable) {
			const msg = `完成率 ${finishedRate.toFixed(2)}% :  ${uploadable ? '3秒后将自动提交' : '3秒后将自动保存'} `;
			$msg.success({ content: msg, duration: 3 });

			await $.sleep(3000);

			if (config.onUpload) {
				await config.onUpload(uploadable);
			} else {
				if (uploadable) {
					await submitAnswer(rp);
				} else {
					// U校园选择了就会自动保存答案
				}
			}
		}
	});

	// 还原尺寸状态
	if (visual_state === 'minimize' && CommonProject.scripts.render.cfg.visual !== 'minimize') {
		CommonProject.scripts.render.methods.minimize();
	}

	worker.emit('done');
}

function checkUniTestIsDone() {
	// 判断已经完成
	if ($el('.question-common-course-page')?.innerText.includes('答题小结')) {
		return true;
	}
	return false;
}

// function waitForMessageContinue() {
// 	return new Promise<void>((resolve, reject) => {
// 		const button = h('button', { className: 'base-style-button' }, '继续学习');
// 		button.onclick = () => {
// 			msg?.remove();
// 			resolve();
// 		};
// 		const el = h('div', ['学习已暂停，点击开始按钮继续学习', button]);
// 		const msg = $message.info({ content: el, duration: 0 });
// 	});
// }

async function submitAnswer(rp: RemotePage) {
	// 部分 job 会有内置多个题目，此时会有多个按钮，上一题、下一题、提 交（中间有个空格）
	const btn = $$el('.question-common-course-page .btn').find((e) => {
		const btn = e.innerText.replace(/\s/g, '');
		return btn.includes('提交') || btn.includes('下一题');
	});
	if (btn) {
		await rp.click(btn);
	}

	//  等久点，可能存在AI判分
	await $.sleep(3000);
	// 可能出现的结果：答题小结、下一题
	await waitForElement('.summary-tab-container,.question-common-course-page .btn');
	// 这里不需要再点击了，外层会继续处理下一章跳转
}

/**
 * 解决选词填空、填空题等存在横线的题目，这里吧横线（innerText无法读取）替换成 _____ 以便搜题
 * @param root
 */
function resoleInputWrapLines(root: HTMLElement) {
	let temp_ques = '\n' + root?.innerText.trim() || '';
	if (temp_ques.match(/\s\d+\)/)) {
		// 如果有序号，则替换成空格，避免影响匹配
		temp_ques = temp_ques.replace(/\s(\d+)\)/g, ' ($1) _____ ');
	} else {
		const wrap = root.cloneNode(true) as HTMLElement;
		for (const input of Array.from(wrap.querySelectorAll('.fe-scoop'))) {
			input.replaceChildren(' _____ ');
		}
		document.body.appendChild(wrap);
		temp_ques = wrap.innerText.trim();
		document.body.removeChild(wrap);
	}
	return temp_ques;
}
