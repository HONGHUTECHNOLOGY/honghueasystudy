import { $, HonghuWorker, defaultAnswerWrapperHandler, QuestionTypes } from '@honghu/core';
import { $message, Project, Script, $ui, h } from 'easy-us';
import { playMedia } from '../utils';
import { CommonWorkOptions } from '../utils';
import { playbackRate, volume } from '../utils/configs';
import { waitForElement } from '../utils/study';
import { commonWork, simplifyWorkResult } from '../utils/work';
import { CommonProject } from './common';

/**
 * 实验室安全教育考试平台（labsafe.shiep.edu.cn）
 *
 * 平台为 Vue2 + vue-router 的 hash 路由 SPA（ant-design-vue），课程视频使用腾讯云 TCPlayer。
 * 已确认的点：
 * 1. 视频页路由：#/course/videoPlay?subChapterId=<id>，播放器为单个 video.video-player 直链。
 * 2. 播放过程中页面每 10 秒 POST /app/app-client/learning-heartbeat
 *    body { id: subChapterId, watchTime: 视频位置秒, learningTime: 本次会话秒 }。
 * 3. 视频播放结束或切换小节时，页面 POST /app/user-exam-task/student-learning-duration
 *    body { contentId: subChapterId, contentType: 0, duration: 本次会话秒 }，
 *    服务端按 duration 直接累加 learningDuration（实测无长度校验）。
 * 4. 页面无弹题，无 iframe，鉴权走 localStorage 里的 JWT（Client-Access-Token）+ tenant。
 */

const API_BASE = '/exam/api/';

const state = {
	running: false,
	media: null as HTMLVideoElement | null
};

/** 从 localStorage 读取，兼容 JSON 字符串与裸字符串两种存法 */
function readStorage(key: string) {
	const raw = localStorage.getItem(key) || '';
	if (!raw) return '';
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === 'string' ? parsed : raw;
	} catch {
		return raw;
	}
}

/** 平台接口需要的鉴权头，token 与 tenant 都取自页面 localStorage */
function authHeaders(): Record<string, string> {
	const token = readStorage('Client-Access-Token');
	const tenant = readStorage('tenant');
	return {
		Accept: 'application/json, text/plain, */*',
		'Content-Type': 'application/json;charset=utf-8',
		Authorization: /^Bearer\s/i.test(token) ? token : 'Bearer ' + token,
		__tenant: tenant,
		'X-Tenant-ID': tenant
	};
}

async function api(path: string, init?: RequestInit) {
	const res = await fetch(API_BASE + path, {
		credentials: 'include',
		...init,
		headers: { ...authHeaders(), ...((init && init.headers) || {}) }
	});
	if (res.status === 204) return null;
	const text = await res.text();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** 读取当前考试任务的学习时长（分钟） */
async function getTaskInfo() {
	const data = await api('app/user-exam-task/user-information-and-task');
	const task = data && data.data && data.data.examTasks && data.data.examTasks[0];
	if (!task) return null;
	return {
		duration: Number(task.learningDuration) || 0,
		target: Number(task.targetLearningDuration) || 0,
		name: String(task.dataName || '')
	};
}

/** 当前小节 id，来自 hash 路由的 subChapterId */
function getChapterId() {
	const query = location.hash.split('?')[1] || '';
	return new URLSearchParams(query).get('subChapterId') || '';
}

/** 右侧目录的小节节点 */
function getChapterItems() {
	return Array.from(document.querySelectorAll<HTMLElement>('.ant-menu-root .ant-menu-sub .ant-menu-item'));
}

function getSelectedChapterIndex(items: HTMLElement[]) {
	return items.findIndex((el) => el.classList.contains('ant-menu-item-selected'));
}

/** 等待 hash 里的 subChapterId 变化（切换小节完成） */
async function waitChapterSwitch(fromId: string, timeout = 20000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const id = getChapterId();
		if (id && id !== fromId) return id;
		await $.sleep(500);
	}
	return '';
}

/* ======================== 考试 / 测验（参考超星作业考试脚本） ======================== */

/** 题目根节点 */
const QUESTION_ROOT = '.questionBox';

function getQuestions() {
	return Array.from(document.querySelectorAll<HTMLElement>(QUESTION_ROOT));
}

/** 题型标签文案：单选 / 多选 / 判断 */
function getQuestionTypeLabel(root: HTMLElement) {
	return (root.querySelector('.classTitle .ant-tag')?.textContent || '').trim();
}

/** 从 DOM 判断题型 */
function getQuestionType(root: HTMLElement): QuestionTypes {
	const label = getQuestionTypeLabel(root);
	if (label.includes('多选')) return 'multiple';
	if (label.includes('判断')) return 'judgement';
	if (label.includes('填空')) return 'completion';
	if (root.querySelector('.ant-checkbox-wrapper')) return 'multiple';

	const radios = Array.from(root.querySelectorAll<HTMLElement>('.ant-radio-wrapper'));
	if (radios.length === 2) {
		const texts = radios.map((r) => (r.innerText || '').replace(/^[A-Za-z]\s*[.、，,]?\s*/, '').trim());
		if (texts.every((t) => /^(对|错|正确|错误|是|否|√|×|T|F)$/i.test(t))) return 'judgement';
	}
	return 'single';
}

/** 题干（剔除题型标签和题号） */
function getQuestionTitle(root: HTMLElement) {
	const spans = Array.from(root.querySelectorAll<HTMLElement>('.classTitle span')).filter(
		(s) => !s.classList.contains('ant-tag')
	);
	const texts = spans
		.map((s) => (s.innerText || '').trim())
		.filter((t) => t && !/^\d+\s*[.、]?$/.test(t));
	return texts.sort((a, b) => b.length - a.length)[0] || '';
}

/** 题目是异步拉取渲染的（试卷接口约几十秒），答题前先等一等 */
async function waitForQuestions(timeout = 90000) {
	if (getQuestions().length > 0) return true;
	const start = Date.now();
	while (Date.now() - start < timeout) {
		await $.sleep(1000);
		if (getQuestions().length > 0) return true;
	}
	return false;
}

/** 在 popover / modal 里找确认按钮并点击 */
function clickConfirmButton() {
	const scope =
		document.querySelector<HTMLElement>('.ant-popover:not(.ant-popover-hidden)') ||
		document.querySelector<HTMLElement>('.ant-modal-wrap:not([style*="display: none"])') ||
		document.body;
	return (
		Array.from(scope.querySelectorAll<HTMLElement>('button')).find((b) =>
			/^确\s*(定|认)$/.test((b.innerText || '').trim())
		) || null
	);
}

/** 交卷：点提交 -> 确认弹层 */
async function submitExamPaper() {
	const submit = Array.from(document.querySelectorAll<HTMLElement>('button')).find((b) =>
		/^提\s*交$/.test((b.innerText || '').trim())
	);
	if (!submit) {
		$message.warn('未找到提交按钮，请手动交卷');
		return;
	}
	submit.click();
	await $.sleep(1200);

	const ok = clickConfirmButton();
	if (ok) {
		ok.click();
		$message.success('已自动交卷');
	} else {
		$message.warn('未找到交卷确认按钮，请手动确认');
	}
}

/** 构造答题器（与超星作业考试脚本同一套 HonghuWorker 架构） */
function labsafeExamWork({ answererWrappers, period, thread, answerSeparators }: CommonWorkOptions) {
	$message.info('开始自动答题');
	CommonProject.scripts.workResults.methods.init();

	const titleTransform = (titles: (HTMLElement | undefined)[]) =>
		titles
			.filter((t) => t?.innerText)
			.map((t) => (t ? (t.innerText || '').trim() : ''))
			.join(',');

	const worker = new HonghuWorker({
		root: QUESTION_ROOT,
		elements: {
			title: (root) => {
				const spans = Array.from(
					(root as HTMLElement).querySelectorAll<HTMLElement>('.classTitle span')
				).filter((s) => !s.classList.contains('ant-tag'));
				const candidates = spans.filter((s) => {
					const t = (s.innerText || '').trim();
					return t && !/^\d+\s*[.、]?$/.test(t);
				});
				if (!candidates.length) return [];
				return [candidates.sort((a, b) => (b.innerText || '').length - (a.innerText || '').length)[0]];
			},
			options: '.ant-radio-wrapper, .ant-checkbox-wrapper'
		},
		thread: thread ?? 1,
		answerSeparators: answerSeparators.split(',').map((s) => s.trim()).filter(Boolean),
		answerer: (elements, ctx) => {
			const title = getQuestionTitle(ctx.root);
			if (!title) throw new Error('题目为空，已跳过');
			const type = getQuestionType(ctx.root);
			return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, async () => {
				await $.sleep((period ?? 3) * 1000);
				return defaultAnswerWrapperHandler(answererWrappers, {
					type,
					title,
					options: (ctx.elements.options || []).map((o) => (o.innerText || '').trim()).join('\n')
				});
			});
		},
		work: {
			type: (ctx) => getQuestionType(ctx.root),
			handler(type, answer, option) {
				if (type === 'single' || type === 'multiple' || type === 'judgement') {
					const input = option.querySelector<HTMLInputElement>('input');
					// 已经选中的不再点击，避免多选被反选
					if (!input || !input.checked) option.click();
				} else if (type === 'completion' && answer.trim()) {
					const input = option.querySelector<HTMLInputElement | HTMLTextAreaElement>('input, textarea');
					if (input) {
						input.value = answer;
						input.dispatchEvent(new Event('input', { bubbles: true }));
					}
				}
			}
		},
		onResultsUpdate(_current, _index, results) {
			// 注意：每题会回调两次（搜到答案后一次、答完后一次），
			// 所以这里统一用整卷 results 刷新，避免计数翻倍。
			CommonProject.scripts.workResults.methods.setResults(simplifyWorkResult(results, titleTransform));
			CommonProject.scripts.workResults.methods.updateWorkStateByResults(results);
		}
	});

	(async () => {
		try {
			if (!(await waitForQuestions())) {
				$message.error({ content: '等待题目加载超时，请确认已进入答题页面后重试。', duration: 0 });
				return;
			}
			const results = await worker.doWork();
			const finished = results.filter((r) => r.result?.finish).length;
			$message.success({
				content: `答题完成：共 ${results.length} 题，成功作答 ${finished} 题，请检查后提交。`,
				duration: 0
			});
		} catch (err) {
			$message.error({ content: `答题出错：${(err as Error)?.message || err}`, duration: 0 });
		} finally {
			worker.emit('done');
		}
	})();

	return worker;
}

export const LabsafeProject = Project.create({
	name: '实验室安全考试平台',
	domains: ['labsafe.shiep.edu.cn'],
	scripts: {
		study: new Script({
			name: '在线学习',
			namespace: 'labsafe.study',
			matches: [['实验室安全考试平台', 'labsafe.shiep.edu.cn']],
			notes: ['请在“在线学习中心”中打开任意一节课的视频页面后再运行。'],
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'自动播放右侧目录中的小节，播完自动切换下一节。',
						'平台的学习时长按真实时间累计，倍速只会加快视频进度，不会缩短总时长。',
						['快速完成模式会直接提交学习时长，', '属于伪造学习记录，请自行评估风险。']
					]).outerHTML
				},
				mode: {
					label: '运行模式',
					tag: 'select',
					defaultValue: 'play' as 'play' | 'fast',
					options: [
						['play', '自动播放（真实挂机）'],
						['fast', '快速完成（提交时长）']
					]
				},
				playbackRate: playbackRate,
				volume: volume,
				autoNext: {
					label: '播完自动切下一节',
					attrs: { type: 'checkbox' },
					defaultValue: true
				},
				batchMinutes: {
					label: '快速模式每批提交（分钟）',
					attrs: { type: 'number', step: '5', min: '5', max: '120' },
					defaultValue: 30
				}
			},
			oncomplete() {
				this.onConfigChange('playbackRate', (rate) => {
					if (state.media) state.media.playbackRate = parseFloat(rate.toString());
				});
				this.onConfigChange('volume', (v) => {
					if (state.media) {
						state.media.volume = parseFloat(v.toString());
						state.media.muted = parseFloat(v.toString()) === 0;
					}
				});
			},
			methods() {
				return {
					/** 播放单个小节，直到播放结束或用户切换了页面 */
					playOne: async (id: string, rate: number, vol: number) => {
						const media = (await waitForElement('video.video-player', {
							timeout_seconds: 20
						})) as HTMLVideoElement | undefined;
						if (!media) {
							$message.error('未找到视频播放器，请确认当前页面已加载完成');
							return false;
						}
						state.media = media;
						media.muted = vol === 0;
						media.volume = vol;
						media.playbackRate = rate;
						await playMedia(() => media.play());

						const start = Date.now();
						while (state.running) {
							if (getChapterId() !== id) return true; // 用户手动切走了
							if (media.ended) break;
							if (media.paused && Date.now() - start > 5000) {
								// 有些情况下 TCPlayer 会暂停，尝试续播
								await playMedia(() => media.play());
							}
							await $.sleep(1000);
						}
						// 播放结束后页面会自动结算，等待一下再切下一节
						await $.sleep(2000);
						return true;
					},

					/** 真实挂机：逐节播放 */
					play: async () => {
						const rate = parseFloat(this.cfg.playbackRate.toString());
						const vol = parseFloat(this.cfg.volume.toString());
						const autoNext = Boolean(this.cfg.autoNext);

						let guard = 0;
						while (state.running && guard++ < 500) {
							const id = getChapterId();
							if (!id) {
								$message.error('当前不在视频播放页面，请进入课程视频后再运行');
								return;
							}
							$message.info('正在学习当前小节…');
							const done = await this.methods.playOne(id, rate, vol);
							if (!done || !state.running) return;

							if (!autoNext) {
								$message.success('当前小节已播放完毕');
								return;
							}

							const items = getChapterItems();
							const index = getSelectedChapterIndex(items);
							const next = index >= 0 ? items[index + 1] : undefined;
							if (!next) {
								$message.success('本课程所有小节已播放完毕，请返回课程列表继续下一门课程');
								return;
							}
							next.click();
							const nextId = await waitChapterSwitch(id);
							if (!nextId) {
								$message.error('切换小节超时，请手动点击右侧目录的下一节');
								return;
							}
							await $.sleep(1500);
						}
					},

					/** 快速完成：直接提交学习时长 */
					fast: async () => {
						const contentId = getChapterId();
						if (!contentId) {
							$message.error('请先打开任意一节课的视频页面，再运行快速完成');
							return;
						}
						const info = await getTaskInfo();
						if (!info) {
							$message.error('获取学习任务信息失败，请刷新页面后重试');
							return;
						}
						if (!(info.target > 0)) {
							$message.error('未找到学习时长要求');
							return;
						}
						let remain = Math.round((info.target - info.duration) * 60);
						if (remain <= 0) {
							$message.success(`学习时长已达标（${info.duration}/${info.target} 分钟）`);
							return;
						}
						const batch = Math.max(60, Math.min(7200, Math.round(Number(this.cfg.batchMinutes) * 60)));
						$message.info(`需补 ${Math.ceil(remain / 60)} 分钟，开始提交…`);
						while (remain > 0 && state.running) {
							const duration = Math.min(batch, remain);
							await api('app/user-exam-task/student-learning-duration', {
								method: 'POST',
								body: JSON.stringify({ contentId, contentType: 0, duration })
							});
							remain -= duration;
							await $.sleep(600);
						}
						const after = await getTaskInfo();
						if (after) {
							$message.success(`已提交完成，当前学习时长 ${after.duration.toFixed(1)}/${after.target} 分钟`);
						} else {
							$message.success('已提交完成');
						}
					},

					main: async () => {
						if (state.running) {
							state.running = false;
							// 停止时把播放器一起暂停，否则视频会继续播下去
							if (state.media && !state.media.paused) state.media.pause();
							$message.warn('已停止');
							return;
						}
						state.running = true;
						CommonProject.scripts.render.methods.pin(this);
						try {
							if (this.cfg.mode === 'fast') {
								await this.methods.fast();
							} else {
								await this.methods.play();
							}
						} catch (err) {
							$message.error('运行出错：' + String(err));
						} finally {
							state.running = false;
						}
					}
				};
			},
			onrender({ panel }) {
				const body = panel.body;
				if (!body) return;

				const btn = h(
					'button',
					{ className: 'base-style-button', style: { width: '100%' } },
					'开始学习'
				) as HTMLButtonElement;
				const tip = h(
					'div',
					{ className: 'secondary', style: { marginTop: '8px', textAlign: 'center' } },
					'未运行'
				) as HTMLElement;

				btn.onclick = () => {
					// main 内部会切换 running 状态，按钮文案由下面的定时器同步
					void this.methods.main();
				};

				body.replaceChildren(h('div', { className: 'card' }, [btn, tip]));

				// 面板重复渲染时旧的节点会被替换，定时器随节点断开自动退出
				const timer = setInterval(() => {
					if (!tip.isConnected) {
						clearInterval(timer);
						return;
					}
					btn.textContent = state.running ? '停止' : '开始学习';
					tip.textContent = !state.running
						? '未运行'
						: this.cfg.mode === 'fast'
							? '正在提交学习时长…'
							: '正在学习中…';
				}, 500);
			}
		}),
		exam: new Script({
			name: '考试脚本',
			namespace: 'labsafe.exam',
			matches: [['实验室安全考试平台', 'labsafe.shiep.edu.cn']],
			notes: ['请在“安全考试”进入答题页面后再运行。'],
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'自动识别单题题型（单选/多选/判断），按题库答案点击对应选项。',
						'进入答题页后面板会等待题目加载，加载完成即开始答题。',
						'每题作答后平台会立即保存，交卷需要你确认或开启下方自动交卷。',
						['考试通常只有一次机会，', '请务必在练习页面先验证题库匹配效果。']
					]).outerHTML
				},
				autoSubmit: {
					label: '答完自动交卷',
					attrs: { type: 'checkbox', title: '开启：所有题目答完后自动提交试卷' },
					defaultValue: false
				}
			},
			async oncomplete() {
				// 平台是 SPA：进入答题页不会重新执行本脚本，且试卷接口较慢（几十秒）。
				// 所以这里不看路由，而是等答题区真正出现后再挂载控制面板；
				// 视频页等无关页面等不到题目就安静退出。
				if (getQuestions().length === 0 && !(await waitForQuestions(300000))) return;

				commonWork(this, {
					workerProvider: (opts) => labsafeExamWork(opts),
					enable_control_panel: true,
					onWorkerCreated: (worker) => {
						worker.on('done', () => {
							if (this.cfg.autoSubmit) void submitExamPaper();
						});
					}
				});
			}
		})
	}
});
