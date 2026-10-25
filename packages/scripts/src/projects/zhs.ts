import { $ui, Project, Script, $el, h, $$el, $message, $, $modal, MessageElement, $store, $gm } from 'easy-us';
import { RemotePage, SimplifyWorkResult, HonghuWorker, defaultAnswerWrapperHandler } from '@honghu/core';
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
import { safeClick, trustedClick, trustedDispatch, OrigEvent, OrigMouseEvent } from '../utils/safe-click';
import { waitForMedia, waitForElement } from '../utils/study';
import { $playwright } from '../utils/app';
import { $render } from '../utils/render';
import { answerVideoQuiz, VideoQuizStrategy } from '../utils/video-quiz';

const state = {
	study: {
		/**
		 * 学习是否暂停
		 */
		stop: false,
		currentMedia: undefined as HTMLMediaElement | undefined,
		stopInterval: 0 as any,
		stopMessage: undefined as MessageElement | undefined
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

const gxk_read_notes = [
	'如果未开始答题，请尝试刷新页面。',
	'禁止同时打开多个作业/考试页面。',
	['答题中请勿进行任何操作，如需暂停答题', '请等待全部题目搜索完成并执行自动保存功能后才能操作。'],
	['暂停后手动操作请确保每个题目都点击下一题', '进行答案保存（不然不会保存，提交没分）']
];

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
			if (remotePage) {
				await remotePage.click(el);
			} else {
				await trustedClick(el);
			}
			await $.sleep(300);
		};

		if (this.quizStrategy === 'ai') {
			try {
				$console.log('正在使用 AI 题库作答视频内题目...');
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
		const isFinished = (el: HTMLElement) => el.querySelector('.time_icofinish') !== null;

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

	async handleTestDialog() {
		const items = $$el('#playTopic-dialog .el-pager .number');
		if (items.length) {
			for (const item of items) {
				if (item.classList.contains('active') === false) {
					await safeClick(item);
					await $.sleep(500);
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
						await this.answerQuiz({
							root: group.root,
							optionElements: group.optionElements,
							// 智慧树共享课弹题一般为单选，多选容器带 checkbox 类名
							type: group.optionElements[0]?.closest('.checkbox') ? 'multiple' : 'single',
							remotePage: this.remotePage || undefined
						});
						await $.sleep(500);
					}

					await $.sleep(1000);
				}
			}
			await $.sleep(1000);
			// 关闭弹窗
			const close_btn_selector = '#playTopic-dialog .close-btn,#playTopic-dialog .btn';
			if (this.remotePage) {
				await this.remotePage.click(close_btn_selector);
			} else {
				trustedClick($el(close_btn_selector));
			}
		}

		/**
		 * 每过三秒递归检测是否有弹窗
		 */
		await $.sleep(3000);
		await this.handleTestDialog();
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
				return !(progress < total);
			}
			const num_el = el.querySelector('.progress-num');
			return num_el !== null && num_el.textContent === '100%';
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
		const isFinished = (el: HTMLElement) => !!el.parentElement?.querySelector('.finish-icon');

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
		const isFinished = (el: HTMLElement) => !!el.querySelector('.finish-icon');

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
			jobs = jobs.filter((el) => {
				if (el.querySelector('i.select')) {
					return false;
				}
				return true;
			});
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
			jobs = jobs.filter((el) => {
				if (el.querySelector('label.success')) {
					return false;
				}
				return true;
			});
		}

		for (let i = 0; i < jobs.length; i++) {
			const item = jobs[i];
			if (item.classList.contains('.is-current')) {
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
						autoStop(0);
					} else {
						autoStop(value);
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
				// 自动暂停任务
				autoStop(this.cfg.stopTimeMinutes);
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
						const item = processor.getNext({ next: opts.next, restudy: this.cfg.restudy });
						if (item) {
							const msg = '即将学习：' + processor.getChapterName(item);
							$message.info({ content: msg });
							$console.log(msg);
							await $.sleep(3000);
							// 最小化脚本窗口
							$render.moveToEdge();
							// 点击侧边栏任务
							if (remotePage) {
								if (type === '新共享课') {
									await remotePage.click('.title-box');
									await $.sleep(200);
								}
								await remotePage.click(item);
								await $.sleep(1000);
								// 两次点击修复黑屏问题
								await remotePage.click(item);
								await $.sleep(1000);
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
				['新形态课程首页', 'smartcoursestudent.zhihuishu.com/singleCourse'],
				['新形态课程新域名课程首页', 'ai-smart-course-student-pro.zhihuishu.com/singleCourse']
			],
			namespace: 'zhs.smart.study',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'掌握度和作业请视频看完后自行手动进入',
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
					start: async () => {
						if (location.href.includes('singleCourse')) {
							$message.info({ content: '请点击任意章节开始进行自动学习', duration: 60 });
							return;
						}
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
										// 如果已经播放完了，则重置视频进度
										media.currentTime = 1;
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
								$message.info({ content: '即将自动跳转下一节' });
								await $.sleep(3000);

								await next();
							};
						};

						doWork();
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
						...(remote_not_required_pages.some((domain) => location.href.includes(domain))
							? []
							: ['答题中请勿进行任何操作，如需暂停答题', '请等待全部题目搜索完成并执行自动保存功能后才能操作。'])
					]).outerHTML
				},
				workDelay: {
					label: '作业答题开始时间延迟（秒）',
					defaultValue: 3,
					attrs: { type: 'number', min: 1, step: 1, max: 10 }
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

						remote_not_required ? await waitForElement('.exam-item') : await waitForElement('.questionContent');

						if (remote_not_required) {
							// 这两个页面不需要软件辅助
						} else {
							remotePage = await BackgroundProject.scripts.dev.methods.getRemotePlaywrightCurrentPage();
							// 检查是否为软件环境
							if (!remotePage) {
								return $playwright.showError();
							}
							// 移动到左上角
							$render.moveToEdge();
							$message.warn({ content: '答题完毕之前请勿操作页面！', duration: 0 });
						}

						commonWork(this, {
							workerProvider: (opts) => {
								if (remote_not_required) {
									return fusioncourseWork(remotePage, opts);
								} else {
									return smartWork(remotePage, opts);
								}
							},
							start_delay_seconds: this.cfg.workDelay ?? 3
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
		root: '.questionContent',
		elements: {
			title: '.questionName .centent-pre',
			options: '.radio-view li.clearfix, .checkbox-views label.el-checkbox, .fillAnswer'
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

	const getNextBtn = () => document.querySelector<HTMLElement>('.next-topic.next-t');
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
		view: window,
		button: 0,
		clientX: rect.left + rect.width / 2,
		clientY: rect.top + rect.height / 2
	};
	for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
		trustedDispatch(el, new OrigMouseEvent(type, init));
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

function autoStop(stopTime: string | number) {
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
		content: `在 ${date.toLocaleTimeString()} 脚本将自动暂停（${formatStopDuration(minutes)}后）`
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
