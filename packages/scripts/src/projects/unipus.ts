/* eslint-disable no-unused-vars */

import { Project, Script, $message, $ui, h, $gm } from 'easy-us';
import { CommonProject } from './common';
import { $, RemotePage, request, defaultAnswerWrapperHandler } from '@honghu/core';
import { waitForElement } from '../utils/study';
import { createLocalRemotePage } from '../utils/app';
import { BackgroundProject } from './background';
import { CommonWorkOptions, $msg } from '../utils';
import { answerWrapperEmptyWarning } from '../utils/work';
import { UnipusIpublishScript } from './unipus/ipublish';
import { UnipusExplorationScript } from './unipus/exploration';

export const UnipusProject = Project.create({
	name: 'U校园',
	domains: ['unipus.cn'],
	scripts: {
		guid: new Script({
			name: '使用提示',
			matches: [
				['我的课程页', '/app/cmgt/course-management'],
				['首页', '/home']
			],
			configs: {
				notes: {
					defaultValue: $ui.notes(['打开任意课程进行自动学习！']).outerHTML
				}
			},
			onrender(elements) {},
			oncomplete() {
				CommonProject.scripts.render.methods.pin(this);
			}
		}),
		'default-study': new Script({
			name: '普通版-课程学习',
			namespace: 'unipus.default.study',
			matches: [['普通学习页面', 'unipus.cn/_pc_default/pc.html']],
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'打开任意课程进行自动学习！',
						'如果脚本错乱请刷新界面',
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
				}
			},
			async oncomplete() {
				CommonProject.scripts.render.methods.pin(this);

				const rp: RemotePage = createLocalRemotePage();
				const opts = CommonProject.scripts.settings.methods.getWorkOptions();

				if (!opts.answererWrappers || opts.answererWrappers.length === 0) {
					await answerWrapperEmptyWarning(0);
					return;
				}

				$msg.info('普通版课程学习已启动，正在检测题目...');

				await waitForElement('.question-wrap, .question-container, .question, [class*="question"]', {
					check_period_ms: 3000
				});
				await $.sleep(2000);

				await defaultStudyJob(this.cfg, rp, opts);
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
					translateBtn.textContent = '学习中...（点击暂停）';
				};
				elements.panel.body?.replaceWith(h('div', { className: 'card' }, [translateBtn]));
			}
		}),
		'exploration-study': UnipusExplorationScript,
		'ipublish-study': UnipusIpublishScript
	}
});
async function defaultStudyJob(
	cfg: { switchMode: 'auto' | 'manual' },
	rp: RemotePage,
	opts: CommonWorkOptions
) {
	const wrap = await waitForElement('.question-wrap, .question-container, .question', {
		check_period_ms: 3000
	});
	const wrap_content = (wrap?.childNodes[0] as HTMLElement) || (wrap as HTMLElement);
	if (!wrap_content) {
		$msg.error('未找到任务内容区域，跳过该任务');
		return;
	}

	const canRun = () => !!wrap_content?.isConnected;

	const matches = (...selectors: string[]) => selectors.every((s) => !!document.querySelector(s));

	await (async () => {
		if (matches('.question-wrap .video-box, .video-container, video')) {
			$msg.info('检测到视频任务，请自行观看完成');
			return;
		}

		if (matches('.question-wrap [class*=bgimg] [class*=picture]')) {
			$msg.info('检测到图片任务，即将跳过');
			return;
		}

		if (matches('.question-wrap .upload-container, .upload-box')) {
			$msg.info('检测到上传任务，请自行手动完成，即将跳过');
			return;
		}

		if (matches('.option-wrap, .option-list, .options-container')) {
			$msg.info('检测到选择题任务，即将开始答题');
			await doDefaultChoice(rp, opts);
			return;
		}

		if (matches('textarea, input[type="text"]')) {
			$msg.info('检测到填空/简答任务，即将开始答题');
			await doDefaultFillBlanks(rp, opts);
			return;
		}

		$msg.info('未知任务类型，即将跳过');
	})();

	if (cfg.switchMode === 'manual') {
		const el = $message.warn({ content: '当前为手动切换模式，已暂停，请手动切换。', duration: 0 });
		await waitFor(() => !wrap_content.isConnected);
		el?.remove();
		await defaultStudyJob(cfg, rp, opts);
		return;
	}

	$msg.success('任务完成，即将进入下一个任务');
	await $.sleep(3 * 1000);

	if (!(await defaultNext(rp))) {
		$msg.success('已完成所有任务');
		CommonProject.scripts.settings.methods.notificationBySetting('已完成所有任务', {
			duration: 0,
			extraTitle: '普通版-课程学习'
		});
		return;
	}
	await defaultStudyJob(cfg, rp, opts);
}

async function doDefaultChoice(rp: RemotePage, opts: CommonWorkOptions) {
	const questionEls = Array.from(
		document.querySelectorAll<HTMLElement>('.question-wrap, .question-container, .question')
	);

	for (const questionEl of questionEls) {
		try {
			const titleEl = questionEl.querySelector<HTMLElement>(
				'.ques-title, .question-title, .question-stem, .title'
			);
			const title = titleEl?.innerText?.trim() || questionEl.innerText?.trim() || '';
			if (!title) continue;

			const optionEls = Array.from(
				questionEl.querySelectorAll<HTMLElement>(
					'.option-wrap .option, .option-list .option-item, .options-container .option, .option'
				)
			);
			if (optionEls.length === 0) continue;

			const isMultiple = !!questionEl.querySelector('.multipleChoice, [class*="multiple"]');

			$msg.info(`正在搜索答案: ${title.substring(0, 50)}...`);

			const searchedInfos = await CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
				return defaultAnswerWrapperHandler(opts.answererWrappers, {
					type: isMultiple ? 'multiple' : 'single',
					title,
					options: optionEls.map((o) => o.innerText).join('\n')
				});
			});

			if (!searchedInfos || searchedInfos.length === 0) {
				$msg.warn('未搜到答案，跳过该题');
				continue;
			}

			let answer = '';
			for (const info of searchedInfos) {
				if (info.results && info.results.length > 0) {
					answer = info.results[0].answer || '';
					break;
				}
			}

			if (!answer) {
				$msg.warn('未搜到答案，跳过该题');
				continue;
			}

			if (isMultiple) {
				const separators = opts.answerSeparators.split(',').map((s) => s.trim()).filter(Boolean);
				let answers = [answer];
				for (const sep of separators) {
					if (answers.length === 1 && answers[0].includes(sep)) {
						answers = answers[0].split(sep).map((s) => s.trim());
						break;
					}
				}
				for (const ans of answers) {
					const opt = findMatchingOption(ans, optionEls);
					if (opt) {
						await rp.click(opt);
						await $.sleep(200);
					}
				}
			} else {
				const opt = findMatchingOption(answer, optionEls);
				if (opt) {
					await rp.click(opt);
					await $.sleep(200);
				} else {
					$msg.warn(`未找到匹配选项: ${answer}`);
				}
			}
		} catch (err) {
			$msg.error(`选择题处理出错: ${(err as Error).message}`);
		}
		await $.sleep(500);
	}

	await submitDefaultAnswer(rp);
}

async function doDefaultFillBlanks(rp: RemotePage, opts: CommonWorkOptions) {
	const questionEls = Array.from(
		document.querySelectorAll<HTMLElement>('.question-wrap, .question-container, .question')
	);

	for (const questionEl of questionEls) {
		try {
			const titleEl = questionEl.querySelector<HTMLElement>(
				'.ques-title, .question-title, .question-stem, .title'
			);
			const title = titleEl?.innerText?.trim() || questionEl.innerText?.trim() || '';
			if (!title) continue;

			const inputs = Array.from(
				questionEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('textarea, input[type="text"]')
			).filter((input) => !input.value || !input.value.trim());

			if (inputs.length === 0) continue;

			$msg.info(`正在搜索答案: ${title.substring(0, 50)}...`);

			const searchedInfos = await CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
				return defaultAnswerWrapperHandler(opts.answererWrappers, {
					type: 'completion',
					title
				});
			});

			if (!searchedInfos || searchedInfos.length === 0) {
				$msg.warn('未搜到答案，跳过该题');
				continue;
			}

			let answer = '';
			for (const info of searchedInfos) {
				if (info.results && info.results.length > 0) {
					answer = info.results[0].answer || '';
					break;
				}
			}

			if (!answer) {
				$msg.warn('未搜到答案，跳过该题');
				continue;
			}

			const separators = opts.answerSeparators.split(',').map((s) => s.trim()).filter(Boolean);
			let answers = [answer];
			for (const sep of separators) {
				if (answers.length === 1 && answers[0].includes(sep)) {
					answers = answers[0].split(sep).map((s) => s.trim());
					break;
				}
			}

			if (answers.length === 1 && inputs.length > 1) {
				answers = answers[0].split(/\n|;|；/).map((s) => s.trim());
			}

			for (let i = 0; i < inputs.length && i < answers.length; i++) {
				const input = inputs[i];
				await rp.click(input);
				await rp['keyboard.type'](answers[i]);
				await $.sleep(200);
			}
		} catch (err) {
			$msg.error(`填空题处理出错: ${(err as Error).message}`);
		}
		await $.sleep(500);
	}

	await submitDefaultAnswer(rp);
}

function findMatchingOption(answer: string, options: HTMLElement[]): HTMLElement | null {
	const normalizedAnswer = answer.trim().toLowerCase();
	if (!normalizedAnswer) return null;

	for (const opt of options) {
		if (opt.textContent?.trim().toLowerCase() === normalizedAnswer) return opt;
	}

	for (const opt of options) {
		const optText = opt.textContent?.trim().toLowerCase() || '';
		if (optText && (optText.includes(normalizedAnswer) || normalizedAnswer.includes(optText))) return opt;
	}

	if (/^[a-z]$/i.test(normalizedAnswer)) {
		const index = normalizedAnswer.toUpperCase().charCodeAt(0) - 65;
		if (index >= 0 && index < options.length) return options[index];
	}

	return null;
}

async function submitDefaultAnswer(rp: RemotePage) {
	const btns = Array.from(document.querySelectorAll<HTMLElement>('button, .btn, [role="button"]'));
	const submitBtn = btns.find((btn) => {
		const text = btn.textContent?.replace(/\s/g, '') || '';
		return text.includes('提交') || text.includes('保存') || text.includes('下一题');
	});

	if (submitBtn) {
		await rp.click(submitBtn);
		await $.sleep(3000);
		$msg.success('已提交答案');
	}
}

async function defaultNext(rp: RemotePage): Promise<boolean> {
	const tasks = Array.from(document.querySelectorAll<HTMLElement>('.pc-header-tasks-row .pc-task, .task-item'));
	for (let i = 0; i < tasks.length; i++) {
		if (tasks[i].classList.contains('pc-header-task-activity') || tasks[i].classList.contains('active')) {
			const next = tasks[i + 1];
			if (next) {
				await rp.click(next);
				return true;
			}
		}
	}

	const tabs = Array.from(document.querySelectorAll<HTMLElement>('.pc-tab-row .tab, .tab-item'));
	for (let i = 0; i < tabs.length; i++) {
		if (tabs[i].classList.contains('pc-header-tab-activity') || tabs[i].classList.contains('active')) {
			const next = tabs[i + 1];
			if (next) {
				await rp.click(next);
				return true;
			}
		}
	}

	const elements = Array.from(
		document.querySelectorAll<HTMLElement>('.pc-slider-content [data-role="micro"], .pc-slider-content [data-role="node"], .chapter-item')
	);
	for (let i = 0; i < elements.length; i++) {
		if (elements[i].classList.contains('pc-menu-activity') || elements[i].classList.contains('active')) {
			const next = elements[i + 1];
			if (next) {
				await rp.click(next);
				return true;
			}
		}
	}

	return false;
}

function waitFor(condition: () => boolean) {
	return new Promise<void>((resolve) => {
		const interval = setInterval(() => {
			if (condition()) {
				clearInterval(interval);
				resolve();
			}
		}, 1000);
	});
}
