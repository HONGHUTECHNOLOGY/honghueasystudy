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
import { trustedPointerClick } from '../../utils/safe-click';
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
		/**
		 * 新版 U 校园（uai.unipus.cn）把课程目录做成了 SPA：从目录点进章节
		 * 不会重新加载页面，oncomplete 也就不会再执行一次。
		 *
		 * 所以这里只提示、**不能 return** —— 一旦提前返回，下面的轮询就不会启动，
		 * 表现就是「点进任意章节都不自动学习」。
		 */
		if (location.href.includes('cmgt/resource-detail')) {
			$msg.info('已就绪，点开任意章节会自动开始学习');
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

		/**
		 * 题目容器的等待策略
		 *
		 * 从课程列表点进任务是 SPA 软导航，oncomplete 早已执行完、不会重跑；
		 * 而首次进入时任务还没点开，容器根本不存在。旧逻辑等 30 秒就报错退出，
		 * 用户看到的就是「必须手动刷新一次才行」——刷新是硬导航，脚本会在答题页重新初始化。
		 *
		 * 现在：先等 30 秒（正常进入会立刻命中）；没命中就转入持续观察，
		 * 用户什么时候点开任务，就什么时候开始答题，不再需要刷新。
		 */
		/**
		 * 常驻观察驱动答题。
		 *
		 * oncomplete 只在页面加载时执行一次，而任务入口随时可能被打开
		 * （从课程列表点进去、或在页面内切换题目）。原来「等 30 秒 → 循环等待」
		 * 有一个致命缺陷：只要 waitForElement 返回过元素就直接 job()，
		 * 而那个元素可能已经被 Vue 重新渲染掉，job 在失效节点上静默失败，
		 * 表现就是「必须手动刷新一次才行」——刷新是硬导航，脚本会重新初始化。
		 *
		 * 改成低频轮询统一驱动：任何时刻出现题目容器就开始答题。
		 * 用题干签名去重，同一道题不会被反复处理。
		 */
		let answering = false;
		let lastSignature = '';
		const tick = async () => {
			if (answering) return;
			/**
			 * 域名而不是路径判断：旧版课程页在 ucontent.unipus.cn/_explorationpc_xxx，
			 * 新版在 uai.unipus.cn/app/cmgt/...，写死 _explorationpc 会让新版永远不触发。
			 * 两者都在 unipus.cn 下，没题目时下一行就返回，开销可忽略。
			 */
			if (!location.hostname.endsWith('unipus.cn')) return;
			const wrap = document.querySelector<HTMLElement>('.question-wrap');
			if (!wrap) return;
			const signature = (wrap.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120);
			if (!signature || signature === lastSignature) return;

			answering = true;
			try {
				lastSignature = signature;
				console.log('[U校园调试] 检测到题目，开始答题');
				$msg.info('题目容器已找到，开始答题');
				await job(this.cfg, rp);
			} catch (err) {
				console.error('[鸿鹄] 自动答题出错', err);
			} finally {
				answering = false;
			}
		};
		setInterval(tick, 2000);
		tick();
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

			const questions = resoleInputWrapLines(
				$el('.question-material-banked-cloze-scoop') as HTMLElement | undefined
			);

			if (!blanks.trim()) {
				$msg.error(
					`未找到候选词（.option-wrapper 命中 ${$$el('.question-material-banked-cloze-reply .option-wrapper').length} 个），跳过该任务`
				);
				return;
			}
			if (!questions.trim()) {
				$msg.error('未提取到题干文本（.question-material-banked-cloze-scoop 为空或不可见），跳过该任务');
				return;
			}
			console.log(
				'[U校园调试] 选词填空：题干长度',
				questions.length,
				'候选词',
				blanks.split('\n').filter(Boolean).length,
				'空位',
				$$el('.question-wrap .input-wrapper input').length
			);

			try {
				// 先清掉上一次的草稿，否则答案会与残留值整体串位
				await clearBlankInputs('.question-wrap .input-wrapper input');
				const res = await singleQuestionHandle({
					rp,
					question: [direction, '-'.repeat(10), blanks, '-'.repeat(10), questions].join('\n'),
					type: 'completion',
					options: $$el('.question-wrap .input-wrapper input'),
					handler: async (type, answer) => {
						await writeBlank('.question-wrap .input-wrapper input', answer);
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
				const freeSelector = '.layout-reply-container .fe-scoop input';
				await clearBlankInputs(freeSelector);
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
					options: $$el(freeSelector),
					handler: async (type, answer) => {
						await writeBlank(freeSelector, answer);
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
	 * 等待顶部 Learning / Practicing 页签的激活位置移动到目标页签。
	 *
	 * 两个关键约束：
	 * 1. 页签切换**不改变 URL hash**，hash 判据永远超时失败，会让 next() 落到
	 *    目录树级直接切下一个板块 —— Practicing 整个被跳过；
	 * 2. React 平台点击页签后会**重建整个 tab 行**，旧元素引用随即 disconnect，
	 *    盯着旧元素的 classList 检查同样永远失败（第一版修复就栽在这里）。
	 *
	 * 所以判据必须是：在**最新 DOM** 里找带激活类的页签，比对它的文字。
	 */
	async function waitTabSwitch(targetLabel: string, activeClass: string, timeout = 3000) {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			await $.sleep(400);
			const active = (($$el('.pc-tab-row .tab') as HTMLElement[]) || []).find((t) =>
				t.classList.contains(activeClass)
			);
			if (active && (active.textContent || '').trim() === targetLabel) return true;
		}
		return false;
	}

/** 页签点击的候选层：外层 .tab 或内层 .pc-tab-view-container */
type TabLayer = 'outer' | 'inner';
/** 页签点击的候选方式 */
type TabHow = 'rp' | 'pointer' | 'native';

/**
 * 页签点击的「层 + 方式」组合。
 *
 * 已在 U 校园实测确认（2026-11-09，渲染端日志可见）：
 * **内层 `.pc-tab-view-container` + 模拟点击**是唯一生效的组合 ——
 * 外层 `.tab` 点不动（平台把事件绑在内层），完整鼠标序列也不必要。
 *
 * 所以直接把它作为默认值，页面每次加载后第一次切页签就命中，
 * 不再空跑「外层/内层 × 三种方式」的矩阵（每次失败都要等一次激活类轮询）。
 * 矩阵仍然保留为兜底：万一平台改版或某些板块结构不同，会自动回退试完再更新记忆。
 */
let tabHit: { layer: TabLayer; how: TabHow } | null = { layer: 'inner', how: 'rp' };

const TAB_HOW_LABEL: Record<TabHow, string> = {
	rp: '模拟点击',
	pointer: '完整鼠标序列',
	native: '原生 click'
};

/**
 * 点击顶部 Learning / Practicing 页签并等待切换成功。
 *
 * 判据用 waitTabSwitch（按页签文字在最新 DOM 里找激活项）。
 * 点击则穷举「两层 × 三种方式」—— 页签是 React 自绘控件，任何一个环节不匹配
 * 都会静默失败：
 * 1. 事件可能绑在**外层 .tab**，也可能绑在**内层 .pc-tab-view-container**；
 *    点外层不会冒泡进内层的事件处理器，反之亦然，两层都要点；
 * 2. 监听的事件可能是 click，也可能是 mousedown/pointerdown（自绘 tab 常见），
 *    单一 el.click() 只发 click，必须再补完整鼠标序列。
 *
 * 生效过的组合会被 tabHit 记住并优先尝试。
 */
async function goTab(el: HTMLElement | undefined, rp: RemotePage) {
	/** 当前激活的已经是最后一个页签时，target 为 undefined，必须直接返回 */
	if (!el) return false;
	const label = (el.textContent || '').trim();
	const check = () => waitTabSwitch(label, 'pc-header-tab-activity', 2000);

	const combos: { target: HTMLElement; layer: TabLayer; how: TabHow }[] = [];
	const outer = el;
	const inner = el.querySelector<HTMLElement>('.pc-tab-view-container');
	if (outer) for (const how of ['rp', 'pointer', 'native'] as TabHow[]) combos.push({ target: outer, layer: 'outer', how });
	if (inner) for (const how of ['rp', 'pointer', 'native'] as TabHow[]) combos.push({ target: inner, layer: 'inner', how });

	/** 命中过的组合提到最前，其余保持原有顺序作为回退 */
	if (tabHit) {
		const idx = combos.findIndex((c) => c.layer === tabHit!.layer && c.how === tabHit!.how);
		if (idx > 0) combos.unshift(combos.splice(idx, 1)[0]);
	}

	for (const { target, layer, how } of combos) {
		try {
			if (how === 'rp') await rp.click(target);
			else if (how === 'pointer') trustedPointerClick(target);
			else target.click();
			if (await check()) {
				const name = (layer === 'outer' ? '外层 .tab' : '内层 .pc-tab-view-container') + ' + ' + TAB_HOW_LABEL[how];
				if (!tabHit || tabHit.layer !== layer || tabHit.how !== how) {
					tabHit = { layer, how };
					console.log('[U校园调试] 页签生效方式：' + name + '（已记忆，后续优先复用）');
				} else {
					console.log('[U校园调试] 页签切换命中记忆方式：' + name);
				}
				return true;
			}
		} catch (err) {
			/** 任何一种点击方式抛错都不能中断整条答题链，继续换下一种 */
			console.warn('[U校园调试] 页签点击异常，换下一种方式:', err instanceof Error ? err.message : String(err));
		}
	}
	console.error('[U校园调试] 页签「' + label + '」所有点击方式都未生效');
	return false;
}

/**
 * 进入下一个任务。
 * 光点击不判断结果的话，一旦平台没响应就会在同一个任务上无限空转，
 * 所以这里统一用 hash 是否变化来确认跳转成功，并补一次原生 click 兜底。
 *
 * 例外是顶部 Learning / Practicing 页签：切换不改 hash，走 goTab。
 */
async function next(rp: RemotePage) {
	const hash = location.hash;

	const go = async (el?: HTMLElement) => {
		if (!el) return false;
		console.log('[U校园调试] next: 点击目标「' + (el.textContent || '').trim().slice(0, 20) + '」');
		try {
			await rp.click(el);
			if (await waitHashChange(hash, 5000)) return true;
			// 模拟点击被平台忽略时，用原生 click 再试一次
			if (el.isConnected) {
				el.click();
				if (await waitHashChange(hash, 5000)) return true;
			}
		} catch (err) {
			/** 点击环节任何异常都只算这一级失败，继续尝试下一级，不能让整条链崩掉 */
			console.warn('[U校园调试] 点击异常:', err instanceof Error ? err.message : String(err));
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
	// 学习模式页签（Learning / Practicing）：切换不改 hash，按页签文字判断成功
	const tabEls = $$el<HTMLElement>('.pc-tab-row .tab') as HTMLElement[];
	for (let index = 0; index < tabEls.length; index++) {
		if (tabEls[index].classList.contains('pc-header-tab-activity')) {
			if (await goTab(tabEls[index + 1], rp)) return true;
		}
	}
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

	console.log(
		'[U校园调试] 搜题结果',
		JSON.stringify(
			searchedInfos.map((info) => ({
				name: info.name,
				error: info.error,
				answers: info.results.map((r) => r.answer)
			}))
		).slice(0, 600),
		'空位数量',
		options.length,
		'题型',
		type
	);

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

/**
 * 提交前用 DOM 实测一遍「仍未作答」的控件。
 *
 * `uploadHandler` 的完成率是按 `results` 算的，而 `results` 只包含**脚本真正
 * 遍历到的题**：一旦某题的 root 或内部元素没被选择器命中（平台改过容器类名、
 * 题目分批懒加载、同一 wrap 里混排了别的形态），这题根本不在 results 里，
 * 完成率依然是 100% → 被判为可提交 → 漏题直接交卷。
 *
 * 这里不看 results，只数页面上真实存在的作答控件，有空白就不自动提交
 * （U 校园选择即自动保存，不提交不会丢答案，下次进任务继续答）。
 */
function countUnansweredControls() {
	let total = 0;
	let empty = 0;
	const isVisible = (el: HTMLElement) => {
		const rect = el.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	};

	// 文本类：填空 / 简答 / 翻译
	$$el<HTMLTextAreaElement | HTMLInputElement>(
		'.question-wrap textarea, .question-wrap input[type="text"]'
	).forEach((el) => {
		if (!el.isConnected || !isVisible(el)) return;
		// 排除非作答控件：笔记框、选项卡搜索框
		if (el.closest('.mark-info-in, .pc-header-tasks-row, .pc-header-tabs-container')) return;
		total++;
		if (!String(el.value || '').trim()) empty++;
	});

	// 选项类：一个 option-wrap 算一组，组内至少选中一个才算作答
	$$el<HTMLElement>('.question-wrap .option-wrap').forEach((group) => {
		const options = Array.from(group.querySelectorAll<HTMLElement>('.option'));
		if (!options.length) return;
		if (!isVisible(group)) return;
		total++;
		const chosen = options.some(
			(option) => option.classList.contains('selected') || !!option.querySelector('input:checked')
		);
		if (!chosen) empty++;
	});

	return { total, empty };
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

	/**
	 * 提交前补答
	 *
	 * 搜题是概率性失败（网络抖动、题库限流、模型返回空 content），core 层已经
	 * 对单题做了 3 次重试；这里再从「页面实际空白」的角度补一轮：
	 * 已作答的题在 handler 里会自行跳过（`input.value` / `selected` 判断），
	 * 所以重跑只会对仍空白的题重新搜一遍，正常情况一次都不会触发。
	 */
	const MAX_RETRY_ROUNDS = 2;
	for (let round = 1; round <= MAX_RETRY_ROUNDS; round++) {
		const before = countUnansweredControls();
		if (before.empty === 0) break;
		$msg.info(`发现有 ${before.empty}/${before.total} 处未作答，开始第 ${round} 轮补答…`);
		await $.sleep(800);
		try {
			await worker.doWork({ enable_debug: BackgroundProject.scripts.dev.cfg.enable_answerer_debug });
		} catch (err) {
			$msg.warn(`第 ${round} 轮补答异常：${err instanceof Error ? err.message : String(err)}`);
			break;
		}
		const after = countUnansweredControls();
		$msg.info(`第 ${round} 轮补答结束，剩余 ${after.empty}/${after.total} 处未作答`);
		if (after.empty === 0) break;
	}

	// 停顿等待
	const msg = `答题完成，将等待 ${opts.stopSecondWhenFinish} 秒后进行保存或提交。`;
	$msg.info({ content: msg, duration: opts.stopSecondWhenFinish });
	await $.sleep(opts.stopSecondWhenFinish * 1000);
	// 处理提交
	await worker.uploadHandler({
		type: opts.upload,
		results,
		async callback(finishedRate, uploadable) {
			/**
			 * 提交前再用 DOM 兜一道：results 只覆盖脚本遍历到的题，
			 * 没命中的题不在里面，完成率照旧 100%。页面还有空白控件时不提交。
			 */
			const domCheck = countUnansweredControls();
			if (domCheck.empty > 0) {
				/** 题目可能还在懒加载，稍等再复查一次，避免把「还没渲染出来」当成漏题 */
				await $.sleep(2000);
				const again = countUnansweredControls();
				if (again.empty > 0) {
					uploadable = false;
					$msg.warn(
						`提交前复查发现 ${again.empty}/${again.total} 处仍未作答，本次只保存不提交（下次进入会继续作答）`
					);
				}
			} else if (domCheck.total > 0 && opts.upload !== 'save' && !uploadable) {
				/**
				 * 页面上的题已经全部作答（补答轮把第一轮搜题失败的补上了），
				 * 但 results 用的是第一轮、那些题被记成未完成，完成率被低估。
				 * 以页面实际状态为准放行提交。
				 */
				uploadable = true;
				$msg.info('补答后页面题目已全部作答，按完整作答提交');
			}

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
function resoleInputWrapLines(root?: HTMLElement) {
	/**
	 * 两处必须兜底，否则题干会被污染成 "undefined" 或空串，搜题必然失败：
	 *   1. root 为空（选择器没命中）时，`'\n' + undefined` 会得到字符串 "undefined"；
	 *   2. innerText 对不可见元素返回空串，要退回 textContent。
	 */
	if (!root) return '';

	let temp_ques = '\n' + (root.innerText || root.textContent || '').trim();
	if (temp_ques.match(/\s\d+\)/)) {
		// 如果有序号，则替换成空格，避免影响匹配
		temp_ques = temp_ques.replace(/\s(\d+)\)/g, ' ($1) _____ ');
	} else {
		const wrap = root.cloneNode(true) as HTMLElement;
		for (const input of Array.from(wrap.querySelectorAll('.fe-scoop'))) {
			input.replaceChildren(' _____ ');
		}
		document.body.appendChild(wrap);
		temp_ques = (wrap.innerText || wrap.textContent || '').trim();
		document.body.removeChild(wrap);
	}
	return temp_ques;
}

/**
 * 清空所有空位。
 *
 * 平台会把上一次的作答作为草稿持久化，重新进入时输入框里已经有旧值。
 * 如果直接往上写，答案会与残留值错位（实测第 1 个空是上次的答案，
 * 本次第 1 题的答案被挤到第 2 个空，整体串位）。
 */
async function clearBlankInputs(selector: string) {
	for (const el of $$el(selector) as HTMLInputElement[]) {
		if (!el.value) continue;
		if (el.getBoundingClientRect().height <= 0) continue;
		el.focus();
		try {
			el.select();
		} catch {
			// 忽略不支持 select 的输入类型
		}
		let cleared = false;
		try {
			cleared = document.execCommand('delete', false);
		} catch {
			cleared = false;
		}
		if (!cleared || el.value) {
			el.value = '';
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}
		await $.sleep(50);
	}
}

/**
 * 往「当前第一个空位」写入答案。
 *
 * 不按索引定位：实测初始数组与实时 DOM 的节点顺序会错位，
 * 按索引写会把答案写到别的空里（第 1 题的值落到第 2 个空）。
 * 答案本身是按题号顺序给出的，空位也按顺序排列，所以「填第一个空」
 * 天然与题号对齐，不依赖任何索引假设。
 *
 * 写入用 execCommand('insertText')：它产生的是浏览器原生输入事件
 * （isTrusted 为 true），受控组件一定接受；合成 InputEvent 会被忽略，
 * 值写进去后下一次渲染就被数据模型里的旧值覆盖。
 */
async function writeBlank(selector: string, answer: string) {
	if (!answer) return;
	for (let attempt = 0; attempt < 3; attempt++) {
		const inputs = ($$el(selector) as HTMLInputElement[]).filter(
			(el) => el.getBoundingClientRect().height > 0
		);
		const target = inputs.find((el) => !el.value.trim());
		if (!target) return;

		target.focus();
		try {
			target.select();
		} catch {
			// 忽略
		}
		let inserted = false;
		try {
			inserted = document.execCommand('insertText', false, answer);
		} catch {
			inserted = false;
		}
		if (!inserted || target.value !== answer) {
			const proto =
				target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
			const desc = Object.getOwnPropertyDescriptor(proto, 'value');
			if (desc && desc.set) {
				try {
					desc.set.call(target, answer);
				} catch {
					target.value = answer;
				}
			} else {
				target.value = answer;
			}
			target.dispatchEvent(
				new InputEvent('input', {
					bubbles: true,
					data: answer,
					view: document.defaultView || window,
					composed: true
				})
			);
			target.dispatchEvent(new Event('change', { bubbles: true }));
		}
		await $.sleep(200);
		if (target.value === answer) return;
	}
}
