import debounce from 'lodash/debounce';
import {
	defaultAnswerWrapperHandler,
	AnswerWrapperParser,
	request,
	SimplifyWorkResult,
	$,
	WorkUploadType,
	AnswerWrapperHandlerConfig,
	setSizeErrorRetryHandler,
	setQuestionImageResolver,
	setAnswerProgressListener
} from '@honghu/core';
import { $message, h, $gm, $store, Project, Script, $modal, StoreListenerType, $ui, cors } from 'easy-us';
import type { AnswererWrapper, SearchInformation } from '@honghu/core';
import { CXProject, ICourseProject, IcveMoocProject, YKTProject, ZHSProject, ZJYProject } from '../index';
import { markdown } from '../utils/markdown';
import { enableCopy } from '../utils';
import { SearchInfosElement } from '../elements/search.infos';
import { RenderScript } from '../render';
import { dropdownStyle } from '../utils/configs';
import { trustedClick } from '../utils/safe-click';
import { OFFICIAL_SITE, GITHUB_REPO, GITCODE_REPO, GITHUB_ISSUES, GITCODE_ISSUES } from '../utils/links';

const TAB_WORK_RESULTS_KEY = 'common.work-results.results';

/**
 * AI 的默认接口与模型
 *
 * 必须和「AI 答题配置」输入框的占位符一致，且是当前官方模型名：
 * `deepseek-chat` / `deepseek-reasoner` 已于 2026-07-24 停用，
 * 现行模型是 `deepseek-flash`（DeepSeek-V4.1-Flash）。
 *
 * 留空时一律回退到这两个值 —— 桌面端统一配置只下发它自己保存过的键，
 * 用户没填模型时下发的是空串，不兜底就会「配置看着填了、却答不了题」。
 */
const DEFAULT_AI_ENDPOINT = 'https://api.deepseek.com';
const DEFAULT_AI_MODEL = 'deepseek-flash';

/**
 * 答题请求的实时进度（显示在结果面板底部）
 *
 * AI 答题一次要等几十秒，面板上原本只有「已搜题 x/y」，看起来像卡死。
 *
 * 关键：脚本是 `all_frames: true` 注入的 —— 超星的题目在 iframe 里答题，
 * 面板通常画在顶层 frame，两个 frame 各有一份模块实例，模块级变量不互通。
 * 所以状态除了本地更新，还要经 `$store`（GM 跨 frame 共享存储）广播；
 * 面板所在 frame 监听同一个 key，才能把「AI 思考中」显示出来。
 */
const ANSWER_PROGRESS_KEY = 'common.answer-progress';
/** 超过这个时间没更新就当失效：答题 frame 被销毁时不会发 end，会留下僵尸状态 */
const ANSWER_PROGRESS_TTL = 5 * 60 * 1000;

let answerProgressActive = 0;
let answerProgressLabel = '';
let answerProgressStartedAt = 0;
let answerProgressTimer: any;

/**
 * 每个结果面板各持有一份进度行
 *
 * 面板不止一个：通用「结果」tab 与超星/智慧树的刷课面板都会 `replaceChildren`
 * 清空自己的容器。用单例会互相抢节点（最后挂载的那个才显示），所以按宿主分开；
 * 节点被 re-render 摘掉后，下一次刷状态再挂回去。
 */
const answerProgressRows: { host: HTMLElement; el: HTMLElement }[] = [];

function progressRowFor(host: HTMLElement): HTMLElement {
	let row = answerProgressRows.find((item) => item.host === host);
	if (!row) {
		const el = h('div', '');
		el.style.color = '#a1a1a1';
		el.style.fontWeight = '600';
		el.style.textAlign = 'center';
		el.style.fontSize = '12px';
		el.style.marginTop = '4px';
		row = { host, el: el as HTMLElement };
		answerProgressRows.push(row);
	}
	if (!row.el.isConnected && host.isConnected) host.append(row.el);
	return row.el;
}

function paintAnswerProgress() {
	const active = answerProgressActive > 0;
	const seconds = Math.max(0, Math.round((Date.now() - answerProgressStartedAt) / 1000));
	const text = active ? `${answerProgressLabel} ${seconds}s` : '';

	for (let i = answerProgressRows.length - 1; i >= 0; i--) {
		const row = answerProgressRows[i];
		/** 宿主与节点都脱离 DOM，说明这个面板已经销毁 */
		if (!row.host.isConnected && !row.el.isConnected) {
			answerProgressRows.splice(i, 1);
			continue;
		}
		if (!row.el.isConnected && row.host.isConnected) row.host.append(row.el);
		if (active) {
			row.el.textContent = text;
			row.el.style.color = '#ff9f0a';
		} else {
			row.el.textContent = 'AI 状态：空闲';
			row.el.style.color = '#a1a1a1';
		}
	}

	if (!active && answerProgressTimer) {
		clearInterval(answerProgressTimer);
		answerProgressTimer = undefined;
	}
}

/** 应用一份进度状态（本地事件与跨 frame 广播共用） */
function applyProgressState(state: any) {
	if (!state || typeof state !== 'object') return;
	let active = Math.max(0, Number(state.active) || 0);
	const at = Number(state.at) || 0;
	if (active > 0 && at > 0 && Date.now() - at > ANSWER_PROGRESS_TTL) {
		/** 答题页面被关掉/跳走时不会有 end，过期的「思考中」必须自己清掉 */
		active = 0;
	}
	answerProgressActive = active;
	answerProgressLabel = active > 0 ? String(state.label || '') : '';
	answerProgressStartedAt = active > 0 ? Number(state.startedAt) || Date.now() : 0;
	if (active > 0 && !answerProgressTimer && typeof setInterval === 'function') {
		answerProgressTimer = setInterval(paintAnswerProgress, 1000);
	}
	paintAnswerProgress();
}

/**
 * 展开「结果」面板
 *
 * 答题可能发生在题目 iframe 里，而 pin 依赖 setTab（当前标签页存储），
 * 必须由顶层 frame 执行 —— 所以用 defineTopFunction 跨 frame 调用。
 * 第一题一开始「思考」就展开，不能等答案回来才弹面板。
 */
const pinWorkResultsPanel = cors.defineTopFunction(() => {
	CommonProject.scripts.render.methods.pin(CommonProject.scripts.workResults);
});

setAnswerProgressListener((event) => {
	if (event.phase === 'start') {
		answerProgressActive += 1;
		/** AI 答题固定叫「AI答题」；其它题库显示名字，方便判断卡在哪个源 */
		answerProgressLabel = /AI/i.test(event.name || '') ? 'AI 思考中…' : `正在查询 ${event.name}…`;
		if (!answerProgressStartedAt) answerProgressStartedAt = Date.now();
		/** 从空闲进入答题的第一刻就展开结果面板（后面几题不再重复打扰） */
		if (answerProgressActive === 1) {
			pinWorkResultsPanel()?.catch?.(() => {});
		}
	} else {
		answerProgressActive = Math.max(0, answerProgressActive - 1);
		if (answerProgressActive === 0) {
			answerProgressLabel = '';
			answerProgressStartedAt = 0;
		}
	}

	const state = {
		active: answerProgressActive,
		label: answerProgressLabel,
		startedAt: answerProgressStartedAt,
		at: Date.now()
	};
	/** 本 frame 立即生效，不用等存储回流 */
	applyProgressState(state);
	/** 广播到其它 frame：面板在顶层、答题在题目 iframe 的常见情形 */
	try {
		$store.set(ANSWER_PROGRESS_KEY, state);
	} catch (err) {
		console.log('答题进度广播失败', err);
	}
});

/** 接收其它 frame 的进度广播（含自己写的那次，值相同，无副作用） */
$store.addChangeListener(ANSWER_PROGRESS_KEY, (curr: any) => applyProgressState(curr));

/**
 * 顶部提示区用的紧凑 Issue 链接片段。
 * 悬浮窗 container-element 只有 min-width:300px，宽度随内容自适应，
 * 所以这里必须保持单行短文案，不能放长仓库路径，否则整个面板会被撑宽。
 */
function issueLinks(prefix: string) {
	const link = (label: string, href: string) =>
		h(
			'a',
			{
				href,
				target: '_blank',
				rel: 'noopener noreferrer',
				style: { color: '#007aff', textDecoration: 'none' }
			},
			label
		);
	return h('span', [prefix, link('GitHub', GITHUB_ISSUES), ' / ', link('GitCode', GITCODE_ISSUES), ' 提 Issue']);
}

/**
 * 两个等宽的 Issue 入口，用 flex 锁死一行。
 * 不能用 inline-block：它会跟着前面的标题文字挤在同一行，
 * 宽度不够时第二个按钮就掉到下一行，排版会乱。
 */
function issueButtons() {
	const link = (label: string, href: string) =>
		h(
			'a',
			{
				href,
				target: '_blank',
				rel: 'noopener noreferrer',
				className: 'base-style-button-secondary',
				style: {
					flex: '1',
					minWidth: '0',
					margin: '0',
					padding: '2px 8px',
					fontSize: '12px',
					lineHeight: '18px',
					textAlign: 'center',
					whiteSpace: 'nowrap',
					textDecoration: 'none'
				}
			},
			label
		);
	return h('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } }, [
		link('GitHub 提 Issue', GITHUB_ISSUES),
		link('GitCode 提 Issue', GITCODE_ISSUES)
	]);
}

const state = {
	workResult: {
		/**
		 * 题目位置同步处理器
		 */
		questionPositionSyncHandler: {
			cx: (index: number) => {
				const el = document.querySelectorAll<HTMLElement>('[id*="sigleQuestionDiv"], .questionLi')?.item(index);
				if (el) {
					window.scrollTo({
						top: el.getBoundingClientRect().top + window.pageYOffset - 50,
						behavior: 'smooth'
					});
				}
			},
			'zhs-gxk': (index: number) => {
				trustedClick(document.querySelectorAll<HTMLElement>('.answerCard_list ul li').item(index));
			},
			'zhs-xnk': (index: number) => {
				trustedClick(document.querySelectorAll<HTMLElement>('.jobclassallnumber-div li[questionid]').item(index));
			},
			'zhs-smart': (index: number) => {
				trustedClick(document.querySelectorAll<HTMLElement>('[role="treeitem"] .font-sec-style-node').item(index));
			},
			'zhs-fusion': (index: number) => {
				trustedClick(document.querySelectorAll<HTMLElement>('.right-box .list .item').item(index));
			},
			'zhs-hike': (index: number) => {
				trustedClick(document.querySelectorAll<HTMLElement>('.q_main_right .card_ul .card_li').item(index));
			},
			icve: (index: number) => {
				trustedClick(document.querySelectorAll<HTMLElement>(`.sheet_nums [id*="sheetSeq"]`).item(index));
			},
			zjy: (index: number) => {
				document
					.querySelectorAll<HTMLElement>('.subjectDet')
					.item(index)
					?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			},
			icourse: (index: number) => {
				document
					.querySelectorAll<HTMLElement>('.u-questionItem,[class*=questionBody]')
					.item(index)
					?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
		}
	},
	setting: {
		listenerIds: {
			aw: 0 as StoreListenerType,
			/** AI 配置三个输入框：配置被外部（桌面端同步 / 其它标签页）改动后需要回填 */
			aiEndpoint: 0 as StoreListenerType,
			aiApiKey: 0 as StoreListenerType,
			aiModel: 0 as StoreListenerType
		}
	}
};

/**
 * 题库缓存类型
 */
type QuestionCache = { title: string; answer: string; from: string; homepage: string; ai?: boolean };

export const CommonProject = Project.create({
	name: '通用',
	domains: [],
	scripts: {
		guide: new Script({
			name: '使用教程',
			matches: [['所有页面', /.*/]],
			namespace: 'common.guide',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'打开任意网课平台，进入视频、作业页面等待脚本运行，',
						'禁止与其他脚本一起使用（不兼容），也不能开多个相同脚本',
						'禁止最小化浏览器、切屏，否则可能导致脚本无法运行！',
						issueLinks('遇到问题？')
					]).outerHTML
				}
			},
			onrender({ panel }) {
				const guide = createGuide();
				panel.body.replaceChildren(guide);
			}
		}),
		feedback: new Script({
			name: '问题反馈',
			matches: [['所有页面', /.*/]],
			namespace: 'common.feedback',
			configs: {
				notes: {
					defaultValue: $ui.notes(['欢迎提 Issue，附上「日志」报错能更快定位。']).outerHTML
				}
			},
			onrender({ panel }) {
				panel.body.replaceChildren(createFeedback());
			}
		}),
		settings: new Script({
			name: '全局设置',
			matches: [['所有页面', /.*/]],
			namespace: 'common.settings',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'鼠标移动到按钮或者输入框，可以看到提示！',
						'想要自动答题必须设置 “题库配置” ',
						'设置后进入章节测试，作业，考试页面即可自动答题。',
						issueLinks('脚本异常？')
					]).outerHTML
				},
				answererWrappers: {
					separator: '自动答题设置',
					defaultValue: [] as AnswererWrapper[],
					/** 走 answer-config-sync 的双向通道，不再参与桌面端的全量配置同步，避免两条通道互相覆盖 */
					extra: { appConfigSync: false }
				},
				/**
				 * 禁用的题库
				 */
				disabledAnswererWrapperNames: {
					defaultValue: [] as string[],
					extra: { appConfigSync: false }
				},
				answererWrappersButton: {
					label: '题库配置',
					defaultValue: '点击配置',
					attrs: {
						type: 'button'
					},
					onload() {
						/** 统一配置模式：只给提示和跳转，不给编辑入口 */
						if (isUsingDesktopConfig()) {
							this.value = '已开启同步桌面端统一配置';
							this.onclick = () => openDesktopSettings();
							return;
						}
						const aws: any[] = CommonProject.scripts.settings.cfg.answererWrappers || [];
						this.value = aws.length ? aws.length + ' 个可用题库（点击进入配置）' : '点击进入配置';

						this.onclick = () => {
							const aw: any[] = CommonProject.scripts.settings.cfg.answererWrappers || [];
							const copy = $ui.copy('复制题库配置', JSON.stringify(aw, null, 4));

							const list = h('div', [
								h('div', { style: { marginTop: '8px' } }, aw.length ? ['以下是已经解析过的题库配置：', copy] : ''),
								...createAnswererWrapperList(aw)
							]);
							const textarea = h(
								'textarea',
								{
									className: 'modal-input',
									style: { minHeight: '250px', width: 'calc(100% - 20px)', maxWidth: '100%' },
									placeholder: aw.length ? '重新输入题库配置' : '输入你的题库配置...，不会请看上方填写教程'
								},
								aw.length === 0 ? '' : JSON.stringify(aw, null, 4)
							);

							const select = $ui.tooltip(
								h(
									'select',
									{
										className: 'base-style-active-form-control',
										style: { backgroundColor: '#eef2f7', borderRadius: '2px', padding: '2px 8px' }
									},
									[
										h('option', '默认'),
										h(
											'option',
											{
												title:
													'大学生网课题库接口适配器: 将不同的题库整合为一个API接口。详细查看 https://github.com/DokiDoki1103/tikuAdapter'
											},
											'TikuAdapter'
										),
										h(
											'option',
											{
												title:
													'使用 AI 大模型答题，填写 JSON 配置：{ "endpoint": "https://api.openai.com/v1/chat/completions", "apiKey": "sk-xxx", "model": "gpt-4o" }'
											},
											'AI答题'
										)
									]
								)
							);

							const modal = $modal.prompt({
								width: 600,
								maskCloseable: false,
								content: $ui.notes([
									[h('div', { style: { fontSize: '16px', marginBottom: '8px' } }, [h('b', '题库配置填写教程：')])],
									[
										h(
											'div',
											{
												className: 'secondary'
											},
											[
												'如果无法粘贴，请点->：',
												h('button', '读取剪贴板', (btn) => {
													btn.classList.add('base-style-button');
													btn.onclick = () => {
														navigator.clipboard.readText().then((result) => {
															textarea.value = result;
														});
													};
												}),
												'，并同意浏览器上方的剪贴板读取申请。'
											]
										)
									],
									[
										h(
											'div',
											{ className: 'secondary' },
											'如果想添加多个不同的题库配置，请在每个配置之间使用三个井号隔开: ###。'
										)
									],
									[h('div', { className: 'secondary' }, '配置第三方题库出现网页弹窗的，点击永久允许连接。')],
									...(aw.length ? [list] : [])
								]),
								footer: h('div', { style: { width: '100%' } }, [
									h('div', { className: 'separator secondary' }, '题库配置填写/修改区'),
									textarea,
									h('div', { style: { display: 'flex', flexWrap: 'wrap', marginTop: '12px', fontSize: '12px' } }, [
										h('div', ['解析器：', select], (div) => {
											div.style.marginRight = '12px';
											div.style.flex = '1';
										}),
										h('div', { style: { flex: '1', display: 'flex', flexWrap: 'wrap', justifyContent: 'end' } }, [
											h('button', '清空题库配置', (btn) => {
												btn.className = 'modal-cancel-button';
												btn.style.marginRight = '48px';
												btn.onclick = () => {
													$modal.confirm({
														content: '确定要清空题库配置吗？',
														onConfirm: () => {
															$message.success({ content: '已清空，在答题前请记得重新配置。' });
															modal?.remove();
															CommonProject.scripts.settings.cfg.answererWrappers = [];
															this.value = '点击配置';
														}
													});
												};
											}),
											h('button', '关闭', (btn) => {
												btn.className = 'modal-cancel-button';
												btn.style.marginRight = '12px';
												btn.onclick = () => modal?.remove();
											}),
											h('button', '保存配置', (btn) => {
												btn.className = 'modal-confirm-button';
												btn.onclick = async () => {
													const connects: string[] = $gm.getMetadataFromScriptHead('connect');

													const value = textarea.value;

													if (!value) {
														$modal.alert({
															content: h('div', '不能为空！')
														});
														return;
													}
													if (value.includes('adapter-service/search') && (select.value === 'TikuAdapter') === false) {
														$modal.alert({
															content: h('div', [
																'检测到您可能正在使用 ',
																h(
																	'a',
																	{ href: 'https://github.com/DokiDoki1103/tikuAdapter#readme' },
																	'TikuAdapter 题库'
																),
																'，但是您选择的解析器不是 TikuAdapter，请选择 TikuAdapter 解析器，并填写接口地址即可，例如：http://localhost:8060/adapter-service/search，或者忽略此警告。'
															]),
															confirmButtonText: '切换至 TikuAdapter 解析器，并识别接口地址',
															onConfirm() {
																const origin =
																	textarea.value.match(/http:\/\/(.+)\/adapter-service\/search/)?.[1] || '';
																textarea.value = `http://${origin}/adapter-service/search`;
																select.value = 'TikuAdapter';
															}
														});
														return;
													}

													try {
														let awsResult: AnswererWrapper[] = [];
														if (select.value === 'AI答题') {
															let aiConfig: { endpoint: string; apiKey: string; model: string };
															try {
																aiConfig = JSON.parse(value);
															} catch {
																$modal.alert({
																	content:
																		'AI 配置格式错误，请输入 JSON，例如：{ "endpoint": "https://api.openai.com/v1/chat/completions", "apiKey": "sk-xxx", "model": "gpt-4o" }'
																});
																return;
															}
															if (!aiConfig.endpoint || !aiConfig.apiKey || !aiConfig.model) {
																$modal.alert({ content: 'AI 配置缺少 endpoint / apiKey / model 字段' });
																return;
															}
															select.value = '默认';
															awsResult.push({
																name: 'AI答题',
																url: aiConfig.endpoint,
																homepage: 'AI 大模型答题',
																method: 'post',
																type: 'GM_xmlhttpRequest',
																contentType: 'json',
																headers: {
																	'Content-Type': 'application/json',
																	Authorization: 'Bearer ' + aiConfig.apiKey
																},
																data: {
																	model: aiConfig.model,
																	messages: [
																		{
																			role: 'system',
																			content:
																				'你是一个考试答题助手。根据题目、选项和题型选出正确答案。规则：单选题(single)只输出一个选项字母如 A；多选题(multiple)输出多个字母用 # 分隔如 A#B#C；判断题(judgement)输出"正确"或"错误"；填空题(completion)直接输出答案。只输出答案，不要解释。'
																		},
																		{
																			role: 'user',
																			content: '题目：${title}\n选项：${options}\n题型：${type}'
																		}
																	],
																	temperature: 0,
																	...aiThinkingPayload(aiConfig.endpoint)
																},
																handler:
																	'return (res)=>{ var c = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content; return [undefined, c ? String(c).trim() : undefined] }'
															});
														} else if (select.value === 'TikuAdapter') {
															if (value.startsWith('http') === false) {
																$modal.alert({
																	content: h('div', [
																		'格式错误，TikuAdapter解析器只能解析 url 链接，请重新输入！或者查看：',
																		h(
																			'a',
																			{ href: 'https://github.com/DokiDoki1103/tikuAdapter#readme' },
																			'https://github.com/DokiDoki1103/tikuAdapter#readme'
																		)
																	])
																});
																return;
															}
															select.value = '默认';
															awsResult.push({
																name: 'TikuAdapter题库',
																url: value,
																homepage: 'https://github.com/DokiDoki1103/tikuAdapter',
																method: 'post',
																type: 'GM_xmlhttpRequest',
																contentType: 'json',
																headers: {},
																data: {
																	// eslint-disable-next-line no-template-curly-in-string
																	question: '${title}',
																	options: {
																		handler: "return (env)=>env.options?.split('\\n')"
																	},
																	type: {
																		handler:
																			" return (env)=> env.type === 'single' ? 0 : env.type === 'multiple' ? 1 : env.type === 'completion' ? 3 : env.type === 'judgement' ? 4 : undefined"
																	}
																},
																handler: "return (res)=>res.answer.allAnswer.map(i=>([res.question,i.join('#')]))"
															});
														} else {
															const contents = value
																.split('###')
																.map((i) => i.trim())
																.filter(Boolean);
															for (const content of contents) {
																awsResult.push(...(await AnswerWrapperParser.from(content)));
															}
														}

														// 为空判断
														if (awsResult.length === 0) {
															$modal.alert({ content: '题库配置不能为空，请重新配置。' });
															return;
														}

														// 唯一化处理
														const result_set: AnswererWrapper[] = [];
														for (const res of awsResult) {
															if (result_set.find((i) => JSON.stringify(i) === JSON.stringify(res))) {
																continue;
															}
															result_set.push(res);
														}
														awsResult = result_set;

														// 判断新旧是否一致，如果一致则提示
														if (
															JSON.stringify(CommonProject.scripts.settings.cfg.answererWrappers) ===
															JSON.stringify(awsResult)
														) {
															$modal.alert({ content: h('div', ['题库配置没有变化，请重新配置！']) });
															return;
														}

														// 判断题库是否超过限制（10个），如果超过则提示
														if (awsResult.length > 10) {
															$modal.alert({
																content: h('div', [
																	'题库配置过多可能会导致答题效率降低，建议不超过10个题库，目前解析到' +
																		awsResult.length +
																		'个题库，请删除一些不必要的题库后重新配置！'
																])
															});
															return;
														}

														CommonProject.scripts.settings.cfg.answererWrappers = awsResult;
														this.value = '当前有' + awsResult.length + '个可用题库';
														$modal.confirm({
															width: 600,
															content: h('div', [
																h('div', [
																	'配置成功，',
																	h('b', ' 刷新网页后 '),
																	'重新进入',
																	h('b', ' 答题页面 '),
																	'即可。',
																	'解析到的题库如下所示:'
																]),
																...createAnswererWrapperList(awsResult)
															]),
															onConfirm: () => {
																if ($gm.isInGMContext()) {
																	top?.document.location.reload();
																}
															},
															...($gm.isInGMContext()
																? {
																		confirmButtonText: '立即刷新',
																		cancelButtonText: '稍后刷新'
																  }
																: {})
														});

														// 格式化文本
														textarea.value = JSON.stringify(awsResult, null, 4);

														// 检测 connects.length 是因为 如果在软件的软件设置全局配置中，上下文的 GM_info 会变成空
														if (connects.length) {
															// 检测是否有域名白名单
															const notAllowed: string[] = [];

															// 如果是通用版本，则不检测
															if (connects.includes('*')) {
																return;
															}

															for (const aw of awsResult) {
																if (connects.some((connect) => new URL(aw.url).hostname.includes(connect)) === false) {
																	notAllowed.push(aw.url);
																}
															}
															if (notAllowed.length) {
																$modal.alert({
																	width: 600,
																	maskCloseable: false,
																	title: '警告',
																	content: h('div', [
																		h('div', [
																			'配置成功，但检测到以下 域名/ip 不在脚本的白名单中，请安装 : ',
																			'鸿鹄易学全域名通用版本',
																			'，或者手动添加 @connect ，否则无法进行请求。',
																			h(
																				'ul',
																				notAllowed.map((url) => h('li', new URL(url).hostname))
																			)
																		])
																	])
																});
															}
														}
													} catch (e: any) {
														$modal.alert({
															content: h('div', [h('div', '解析失败，原因如下 :'), h('div', e.message)])
														});
													}
												};
											})
										])
									])
								])
							});
						};
					}
				},
				/**
				 * 题库 + AI 配置是否使用桌面端的统一配置
				 *
				 * 打开（默认）：扩展面板不提供编辑入口，配置统一在桌面端「题库与 AI 配置」页维护。
				 *   客户端启动浏览器时注入一次；浏览器运行期间桌面端有改动，5 秒内下发到扩展。
				 * 关闭：本浏览器单独配置，不与桌面端同步，桌面端也不再下发。
				 * 开关本身是「这台浏览器怎么用」的本地决定，所以不参与全量同步。
				 */
				/**
				 * 由桌面端管理（一次性标记）
				 *
				 * 桌面端第一次往扩展注入配置时把它置 true，之后**永不改变**。
				 * 扩展只认这一个标记决定面板是不是只读：
				 * - 从没装过桌面端 → 没有这个键 → 面板可正常编辑
				 * - 装过桌面端 → true → 只读，题库/AI 统一在桌面端维护
				 *
				 * 相比原来的「开关 + 心跳时间戳 + 7 天有效期」，少了两层会失效的东西：
				 * 浏览器挂着不关、卸载了桌面端、客户端版本没更新，都不会让状态漂移。
				 */
				desktopManaged: {
					defaultValue: false,
					extra: { appConfigSync: false },
					/** 纯内部标记，不渲染（`showIf` 指向不存在的键） */
					showIf: 'common.settings.zzInternalOnlyNeverRendered'
				},
				/**
				 * 使用桌面端统一配置
				 *
				 * 只在「由桌面端管理的浏览器」上出现：`showIf` 依赖 `desktopManaged`，
				 * 那个标记只有桌面端注入时才为 true。纯扩展用户（从没装过桌面端）看不到这一项，
				 * 面板就是普通的本地配置，不会被一个用不上的开关占位。
				 *
				 * 桌面端浏览器里它是可见的、默认勾选；用户主动取消即可回到本浏览器独立配置。
				 */
				useDesktopAnswerConfig: {
					label: '使用桌面端统一配置',
					defaultValue: true,
					extra: { appConfigSync: false },
					attrs: {
						type: 'checkbox',
						title:
							'开启后题库与 AI 统一在桌面端「题库与 AI 配置」页维护，自动下发到本浏览器；关闭则本浏览器单独配置，不与桌面端同步。'
					},
					showIf: 'common.settings.desktopManaged'
				},
				upload: {
					label: '答题完成后',
					tag: 'select',
					defaultValue: 80 as WorkUploadType,
					options: [
						['save', '自动保存', '完成后自动保存答案, 注意如果你开启了随机作答, 有可能分辨不出答案是否正确。'],
						['nomove', '不保存也不提交', '等待时间过后将会自动下一节, 适合在测试脚本时使用。'],
						...([10, 20, 30, 40, 50, 60, 70, 80, 90].map((rate) => [
							rate,
							`搜到${rate}%的题目则自动提交`,
							`例如: 100题中查询到 ${rate} 题的答案,（答案不一定正确）, 则会自动提交。`
						]) as [any, string, string][]),
						['100', '每个题目都查到答案才自动提交', '答案不一定正确'],
						['force', '强制自动提交', '不管答案是否正确直接强制自动提交，如需开启，请配合随机作答谨慎使用。']
					],
					attrs: {
						title:
							'自动答题完成后的设置，目前仅在 超星学习通的章节测试 中生效, 鼠标悬浮在选项上可以查看每个选项的具体解释。'
					}
				},
				thread: {
					label: '线程数量（个）',
					attrs: {
						type: 'number',
						min: 1,
						step: 1,
						max: 3,
						title:
							'同一时间内答题线程工作的数量（例子：三个线程则代表一秒内同时搜索三道题），过多可能导致题库服务器压力过大，请适当调低。'
					},
					defaultValue: 1
				},
				'work-when-no-job': {
					defaultValue: false,
					label: '(仅超星)强制答题',
					attrs: {
						type: 'checkbox',
						title:
							'当章节测试左上角并没有黄色任务点的时候依然进行答题（没有任务点说明此作业可能不计入总成绩，如果老师要求则可以开启）'
					}
				},
				'randomWork-choice': {
					defaultValue: false,
					label: '(仅超星)随机选择',
					attrs: { type: 'checkbox', title: '题库搜索不到答案时，随机选择任意一个选项，仅支持超星章节测试' }
				},
				'randomWork-complete': {
					defaultValue: false,
					label: '(仅超星)随机填空',
					attrs: { type: 'checkbox', title: '题库搜索不到答案时，随机填写以下任意一个文案，仅支持超星章节测试' }
				},
				'randomWork-completeTexts-textarea': {
					defaultValue: ['不会', '不知道', '不清楚', '不懂', '不会写'].join('\n'),
					label: '(仅超星)随机填空文案',
					tag: 'textarea',
					showIf: 'common.settings.randomWork-complete',
					attrs: { title: '每行一个，随机填入', style: { minWidth: '200px', minHeight: '50px' } },
					onload(el) {
						el.addEventListener('change', () => {
							if (String(el.value).trim() === '') {
								el.value = el.defaultValue;
							}
						});
					}
				},
				advancedSettings: {
					...dropdownStyle,
					defaultValue: false,
					label: '高级设置',
					attrs: { type: 'checkbox', title: '请谨慎使用高级设置，可能会影响答题效果，小白在未理解的情况下谨慎调整。' }
				},
				answerWrapperHandlerTimeout: {
					showIf: 'common.settings.advancedSettings',
					elementClassName: 'config-details',
					label: '搜题最大耗时（秒）',
					attrs: {
						type: 'number',
						min: 10,
						step: 1,
						max: 3 * 60,
						title: '搜题超时时间，单位为秒，超过这个时间直接放弃，进行下一题搜索。'
					},
					defaultValue: 120
				},
				stopSecondWhenFinish: {
					showIf: 'common.settings.advancedSettings',
					elementClassName: 'config-details',
					label: '答题结束后暂停（秒）',
					attrs: {
						type: 'number',
						min: 3,
						step: 1,
						max: 9999,
						title: '自动答题脚本结束后暂停的时间（方便查看和检查）。'
					},
					defaultValue: 3
				},
				period: {
					showIf: 'common.settings.advancedSettings',
					elementClassName: 'config-details',
					label: '搜题间隔（秒）',
					attrs: {
						type: 'number',
						min: 1,
						step: 1,
						max: 60,
						title: '每道题的搜题间隔时间，不建议太低，避免增加服务器压力。'
					},
					defaultValue: 3
				},
				answerSeparators: {
					showIf: 'common.settings.advancedSettings',
					elementClassName: 'config-details',
					label: '答案分隔符',
					attrs: {
						title: "分隔答案的符号，例如：答案1#答案2#答案3，分隔符为 #， 使用英文逗号进行隔开 : ',' "
					},
					defaultValue: ['===', '#', '---', '###', '|', ';', '；'].join(','),
					onload(el) {
						el.addEventListener('change', () => {
							if (String(el.value).trim() === '') {
								el.value = el.defaultValue;
							}
						});
					}
				},
				redundanceWordsText: {
					showIf: 'common.settings.advancedSettings',
					elementClassName: 'config-details',
					defaultValue: [
						'单选题(必考)',
						'填空题(必考)',
						'多选题(必考)',
						'(单选题)',
						'(多选题)',
						'(判断题)',
						'(填空题)',
						'【单选题】',
						'【多选题】',
						'【填空题】',
						'【判断题】',
						'【單選题】',
						'【多選题】',
						'【判斷题】',
						'【Single Choice】',
						'【Multiple Choice】',
						'【single choice】',
						'【multiple choice】',
						'【True or False】'
					].join('\n'),
					label: '题目冗余字段自动删除',
					tag: 'textarea',
					attrs: {
						title: '在搜题的时候自动删除多余的文字，以便提高搜题的准确度，每行一个。',
						style: { minWidth: '200px', minHeight: '50px' }
					},
					onload(el) {
						el.addEventListener('change', () => {
							if (String(el.value).trim() === '') {
								el.value = el.defaultValue;
							}
						});
					}
				},
				notification: {
					separator: '其他设置',
					label: '系统通知',
					attrs: {
						title:
							'允许脚本发送系统通知，只有重要事情发生时会发送系统通知，尽量避免用户受到骚扰（在电脑屏幕右侧显示通知弹窗，例如脚本执行完毕，图形验证码，版本更新等通知）。'
					},
					tag: 'select',
					defaultValue: 'only-notify' as 'only-notify' | 'notify-and-voice' | 'all' | 'no-notify',
					options: [
						['only-notify', '只显示右下角通知'],
						['notify-and-voice', '通知以及提示音（叮的一声）'],
						['all', '通知，提示音，以及任务栏闪烁提示'],
						['no-notify', '关闭系统通知']
					]
				},
				notificationWebhooks: {
					label: '通知回调',
					attrs: {
						title:
							// eslint-disable-next-line no-template-curly-in-string
							'发送系统通知时发送回调请求，用于专业开发人员对接其他通知系统。（每行填写一个URL，顺序发送GET请求，${message} 为消息占位符，可用于消息变量替换）'
					},
					tag: 'textarea',
					defaultValue: ''
				},
				enableQuestionCaches: {
					label: '题库缓存功能',
					defaultValue: true,
					attrs: { type: 'checkbox', title: '详情请前往 通用-其他应用-题库拓展查看。' }
				}
			},
			methods() {
				return {
					/**
					 * 获取自动答题配置，包括题库配置
					 */
					getWorkOptions: () => {
						// 使用 json 深拷贝，防止修改原始配置
						const workOptions: typeof this.cfg = JSON.parse(JSON.stringify(this.cfg));

						const disabled = this.cfg.disabledAnswererWrapperNames || [];
						/** 用户是否显式停用了 AI（题库列表里的「禁用」） */
						const aiDisabled = disabled.includes('AI答题');

						/**
						 * 过滤掉被禁用的题库
						 */
						workOptions.answererWrappers = (workOptions.answererWrappers || []).filter(
							(aw) => !disabled.includes(aw.name)
						);

						/**
						 * 桌面端统一配置模式下补一份 `AI答题`
						 *
						 * 这种模式下扩展面板的 AI 卡片被提示卡替代（没有「启用」按钮），
						 * 桌面端保存时也只保留已有的 AI 条目、从不创建 —— 不补的话
						 * 所有平台都会误报「你还没设置题库」，用户在扩展里也没有自救入口。
						 *
						 * 纯扩展端不自动补：那里有「启用」按钮，保持「填配置 ≠ 启用」的语义，
						 * 免得用户只是试填了 key 就被每题都调用 AI。
						 */
						if (!aiDisabled && isUsingDesktopConfig()) {
							ensureAiAnswererWrapper(workOptions.answererWrappers);
						}

						// AI 题库的提示词/模型在「启用」时就被写死进配置了，这里按当前代码刷新副本
						refreshAiAnswererWrapper(workOptions.answererWrappers);

						return workOptions;
					},
					/**
					 * 根据全局设置的配置，发起通知
					 * @param content
					 * @param opts
					 */
					notificationBySetting: (
						content: string,
						opts?: {
							extraTitle?: string;
							/** 显示时间，单位为秒，默认为 30 秒， 0 则表示一直存在 */
							duration?: number;
							/** 通知点击时 */
							onclick?: () => void;
							/** 通知关闭时 */
							ondone?: () => void;
						}
					) => {
						if (this.cfg.notification !== 'no-notify') {
							$gm.notification(content, {
								extraTitle: opts?.extraTitle,
								duration: opts?.duration ?? 30,
								important: this.cfg.notification === 'all',
								silent: this.cfg.notification === 'only-notify'
							});

							const message = (opts?.extraTitle ? opts?.extraTitle + '：' : '') + content;

							const webhooks = this.cfg.notificationWebhooks
								.split('\n')
								.map((i) => i.trim())
								.filter(Boolean);

							for (const webhook of webhooks) {
								let resolved_webhook = webhook;
								// eslint-disable-next-line no-template-curly-in-string
								resolved_webhook = webhook.replace('${message}', encodeURIComponent(message));
								request(resolved_webhook, {
									method: 'get',
									type: 'GM_xmlhttpRequest'
								})
									.then((result) => {
										console.debug('通知回调成功', { webhook: resolved_webhook, result });
									})
									.catch((err) => {
										console.debug('通知回调失败', { webhook: resolved_webhook, err });
									});
							}
						}
					}
				};
			},
			// 实时更新内部设置
			oncomplete() {
				AnswerWrapperHandlerConfig.timeout_seconds = this.cfg.answerWrapperHandlerTimeout;
				this.onConfigChange('answerWrapperHandlerTimeout', (sec) => {
					AnswerWrapperHandlerConfig.timeout_seconds = sec;
				});
			},
			onrender({ panel }) {
				// 因为需要用到 GM_xhr 所以判断是否处于用户脚本环境
				if ($gm.isInGMContext()) {
					panel.body.replaceChildren(...(this.cfg.answererWrappers.length ? [h('hr')] : []));
					const testNotification = h(
						'button',
						{ className: 'base-style-button', disabled: this.cfg.answererWrappers.length === 0 },
						'测试系统通知'
					);
					testNotification.onclick = () => {
						this.methods.notificationBySetting('这是一条测试通知');
					};
					const refresh = h(
						'button',
						{ className: 'base-style-button', disabled: this.cfg.answererWrappers.length === 0 },
						'刷新题库状态'
					);

					refresh.onclick = () => {
						updateState();
					};
					const tableContainer = h('div');
					refresh.style.display = 'none';
					tableContainer.style.display = 'none';
					panel.body.append(h('div', { style: { display: 'flex' } }, [testNotification, refresh]), tableContainer);

					// 更新题库状态
					const updateState = async () => {
						// 清空元素
						tableContainer.replaceChildren();

						let loadedCount = 0;

						if (this.cfg.answererWrappers.length) {
							refresh.style.display = 'block';
							tableContainer.style.display = 'block';
							refresh.textContent = '正在加载题库状态...';
							refresh.setAttribute('disabled', 'true');

							const table = h('table');
							table.style.width = '100%';
							this.cfg.answererWrappers.forEach(async (item) => {
								if (item.name === 'AI答题') {
									const aiBody = h('tbody');
									aiBody.append(h('td', item.name));
									aiBody.append(
										h('td', [
											$ui.tooltip(
												h('span', { title: 'AI 答题无需题库健康检查，请在「AI 答题配置」面板测试连接' }, 'AI 答题')
											)
										])
									);
									aiBody.append(h('td', '—'));
									table.append(aiBody);
									loadedCount++;
									if (loadedCount === this.cfg.answererWrappers.length) {
										setTimeout(() => {
											refresh.textContent = '刷新题库状态';
											refresh.removeAttribute('disabled');
										}, 2000);
									}
									return;
								}
								const t = Date.now();
								let success = false;
								let error;
								const isDisabled = this.cfg.disabledAnswererWrapperNames.find((name) => name === item.name);

								const res = isDisabled
									? false
									: await Promise.race([
											(async () => {
												try {
													return await request(new URL(item.url).origin + '/?t=' + t, {
														type: 'GM_xmlhttpRequest',
														method: 'head',
														responseType: 'text'
													});
												} catch (err) {
													error = err;
													return false;
												}
											})(),
											(async () => {
												await $.sleep(10 * 1000);
												return false;
											})()
									  ]);
								if (typeof res === 'string') {
									success = true;
								} else {
									success = false;
								}

								const body = h('tbody');
								body.append(h('td', item.name));
								body.append(
									h('td', [
										$ui.tooltip(
											h(
												'span',
												{ title: isDisabled ? '题目已经被停用，请在上方题库配置中点击开启。' : '' },
												success ? '连接成功' : isDisabled ? '已停用' : error ? '连接失败' : '连接超时'
											)
										)
									])
								);
								body.append(h('td', `延迟 : ${success ? Date.now() - t : '---'}/ms`));
								table.append(body);
								loadedCount++;

								if (loadedCount === this.cfg.answererWrappers.length) {
									setTimeout(() => {
										refresh.textContent = '刷新题库状态';
										refresh.removeAttribute('disabled');
									}, 2000);
								}
							});
							tableContainer.append(table);
						} else {
							refresh.style.display = 'none';
							tableContainer.style.display = 'none';
						}
					};

					updateState();

					this.offConfigChange(state.setting.listenerIds.aw);
					state.setting.listenerIds.aw = this.onConfigChange('answererWrappers', (_, __, remote) => {
						if (remote === false) {
							updateState();
						}
					});
				}
			}
		}),
		aiSettings: new Script({
			name: 'AI 答题配置',
			matches: [['所有页面', /.*/]],
			namespace: 'common.ai-settings',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'填写 AI API 信息后，点击「启用 AI 答题」，将自动替代题库进行答题。',
						'兼容 OpenAI 接口格式（OpenAI / DeepSeek / 智谱 GLM / Kimi / 硅基流动等）。',
						'API 地址可只填域名（如 https://api.deepseek.com），将自动补全 /v1/chat/completions；若已含完整路径则保持不变。',
						'API Key 仅保存在本地，不会上传到任何第三方服务器。'
					]).outerHTML
				},
				aiEndpoint: {
					defaultValue: DEFAULT_AI_ENDPOINT,
					extra: { appConfigSync: false }
				},
				aiApiKey: {
					defaultValue: '',
					extra: { appConfigSync: false }
				},
				aiModel: {
					defaultValue: DEFAULT_AI_MODEL,
					extra: { appConfigSync: false }
				},
				referenceDocs: {
					defaultValue: [] as ReferenceDoc[],
					extra: { appConfigSync: false }
				}
			},
			onrender({ panel }) {
				panel.body.replaceChildren(createAiConfigCard());
			},
			/**
			 * 把 AI 配置写进「AI答题」wrapper
			 *
			 * 答题时实际用的是 `answererWrappers` 里 `AI答题` 那一项的 `url` /
			 * `headers.Authorization` / `data.messages`，不是 `aiApiKey` 这些配置项。
			 * 原来只在 AI 配置卡片渲染时（`updateBtns()`）才同步一次 ——
			 * 但统一配置模式下那张卡片被提示卡替代，不再渲染，
			 * 结果就是「桌面端改了 key、扩展里 wrapper 还挂着旧 key」，答题一直失败。
			 *
			 * 现在改成配置项一变就同步，和面板是否渲染无关。
			 */
			onstart() {
				const syncWrapper = () => {
					const aws: any[] = CommonProject.scripts.settings.cfg.answererWrappers || [];
					const idx = aws.findIndex((w: any) => w && w.name === 'AI答题');
					/** 没有 AI wrapper 说明用户没启用 AI 答题，不主动创建 */
					if (idx === -1) return;
					/**
					 * Key 为空时**什么都不改**
					 *
					 * 配置可能在别处被清空（面板里清掉输入框、桌面端保存了空白表单），
					 * 以前这里会无条件写回 `Bearer ` + 空串和 normalize('') 得到的
					 * 相对地址 `/v1/chat/completions` —— 一个原本能用的 wrapper 被就地写坏，
					 * 而 refreshAiAnswererWrapper 因为「配置不完整」又不会修它，只能靠用户重填。
					 */
					const ai = resolveAiConfig();
					if (!ai) return;
					const next = [...aws];
					next[idx] = {
						...next[idx],
						url: normalizeAiEndpoint(ai.endpoint),
						headers: {
							...(next[idx].headers || {}),
							'Content-Type': 'application/json',
							Authorization: 'Bearer ' + ai.apiKey
						},
						data: {
							...(next[idx].data || {}),
							model: ai.model,
							messages: buildAiMessages(buildAiReferenceDocs()),
							...aiThinkingPayload(ai.endpoint)
						},
						inlineImages: true
					};
					CommonProject.scripts.settings.cfg.answererWrappers = next;
				};

				syncWrapper();
				this.onConfigChange('aiApiKey', syncWrapper);
				this.onConfigChange('aiEndpoint', syncWrapper);
				this.onConfigChange('aiModel', syncWrapper);
				this.onConfigChange('referenceDocs', syncWrapper);
			}
		}),
		workResults: new Script({
			name: '搜索结果',
			matches: [['所有页面', /.*/]],
			namespace: 'common.work-results',
			configs: {
				notes: {
					defaultValue: $ui.notes(['点击题目序号，查看搜索结果', '如果没有搜到，可能是题库没有收录该题目答案'])
						.outerHTML
				},
				/**
				 * 显示类型
				 * list: 显示为题目列表
				 * numbers: 显示为序号列表
				 */
				type: {
					label: '显示类型',
					tag: 'select',
					options: [
						['numbers', '序号列表'],
						['questions', '题目列表']
					],
					attrs: {
						title: '使用题目列表可能会造成页面卡顿。'
					},
					defaultValue: 'numbers' as 'questions' | 'numbers'
				},
				totalQuestionCount: {
					defaultValue: 0
				},
				requestedCount: {
					defaultValue: 0
				},
				resolvedCount: {
					defaultValue: 0
				},
				currentResultIndex: {
					defaultValue: 0
				},
				questionPositionSyncHandlerType: {
					defaultValue: undefined as keyof typeof state.workResult.questionPositionSyncHandler | undefined
				}
			},
			methods() {
				return {
					/**
					 * 从搜索结果中计算状态，并更新
					 */
					updateWorkStateByResults: (results: { requested: boolean; resolved: boolean }[]) => {
						this.cfg.totalQuestionCount = results.length;
						this.cfg.requestedCount = results.filter((result) => result.requested).length;
						this.cfg.resolvedCount = results.filter((result) => result.resolved).length;
					},
					/**
					 * 更新状态
					 */
					updateWorkState: (state: { totalQuestionCount: number; requestedCount: number; resolvedCount: number }) => {
						this.cfg.totalQuestionCount = state.totalQuestionCount;
						this.cfg.requestedCount = state.requestedCount;
						this.cfg.resolvedCount = state.resolvedCount;
					},
					/**
					 * 刷新状态
					 */
					refreshState: () => {
						this.cfg.totalQuestionCount = 0;
						this.cfg.requestedCount = 0;
						this.cfg.resolvedCount = 0;
					},
					/**
					 * 清空搜索结果
					 */
					clearResults: () => {
						return $store.setTab(TAB_WORK_RESULTS_KEY, []);
					},
					getResults(): Promise<SimplifyWorkResult[]> | undefined {
						return $store.getTab(TAB_WORK_RESULTS_KEY) || undefined;
					},
					setResults(results: SimplifyWorkResult[]) {
						return $store.setTab(TAB_WORK_RESULTS_KEY, results);
					},
					async appendResults(results: SimplifyWorkResult[]) {
						const data = (await $store.getTab(TAB_WORK_RESULTS_KEY)) || [];
						data.push(...results);
						return $store.setTab(TAB_WORK_RESULTS_KEY, data);
					},
					/**
					 * 刷新搜索结果状态，清空搜索结果，置顶搜索结果面板
					 */
					init(opts?: { questionPositionSyncHandlerType?: keyof typeof state.workResult.questionPositionSyncHandler }) {
						CommonProject.scripts.workResults.cfg.questionPositionSyncHandlerType =
							opts?.questionPositionSyncHandlerType;
						// 刷新搜索结果状态
						CommonProject.scripts.workResults.methods.refreshState();
						// 清空搜索结果
						CommonProject.scripts.workResults.methods.clearResults();
					},
					/**
					 * 创建搜索结果面板
					 * @param mount 挂载点
					 */
					createWorkResultsPanel: (mount?: HTMLElement) => {
						const container = mount || h('div');
						container.style.width = '400px';
						/** 进度行常驻：面板一渲染就能显示「AI 思考中」，不必等第一题结果回来 */
						container.append(progressRowFor(container));
						/** 记录滚动高度 */
						let scrollPercent = 0;

						/** 列表 */
						const list = h('div', { className: 'work-result-list' });

						/** 是否悬浮在题目上 */
						let mouseoverIndex = -1;

						list.onscroll = () => {
							scrollPercent = list.scrollTop / list.scrollHeight;
						};

						/** 给序号设置样式 */
						const setNumStyle = (result: SimplifyWorkResult, num: HTMLElement, index: number) => {
							if (result.requested) {
								num.classList.add('requested');
							}

							if (index === this.cfg.currentResultIndex) {
								num.classList.add('active');
							}

							if (result.finish) {
								num.classList.add('finish');
							} else {
								if (
									result.requested &&
									result.resolved &&
									(result.error?.trim().length !== 0 || result.searchInfos.length === 0 || result.finish === false)
								) {
									num.classList.add('error');
								}
							}
						};

						/** 渲染结果面板 */
						const render = debounce(async () => {
							const results: SimplifyWorkResult[] | undefined =
								await CommonProject.scripts.workResults.methods.getResults();

							if (results?.length) {
								// 如果序号指向的结果为空，则代表已经被清空，则重新让index变成0
								if (results[this.cfg.currentResultIndex] === undefined) {
									this.cfg.currentResultIndex = 0;
								}

								// 渲染序号或者题目列表
								if (this.cfg.type === 'numbers') {
									const resultContainer = h('div', { className: 'work-result-container' });

									list.style.marginBottom = '12px';
									list.style.overflow = 'auto';
									list.style.maxHeight = '300px';

									/** 渲染序号 */
									const nums = results.map((result, index) => {
										return h('span', { className: 'search-infos-num', innerText: (index + 1).toString() }, (num) => {
											setNumStyle(result, num, index);

											num.onclick = () => {
												for (const n of nums) {
													n.classList.remove('active');
												}
												num.classList.add('active');
												// 更新显示序号
												this.cfg.currentResultIndex = index;
												// 重新渲染结果列表
												resultContainer.replaceChildren(createResult(result));
												// 触发页面题目元素同步器
												if (this.cfg.questionPositionSyncHandlerType) {
													state.workResult.questionPositionSyncHandler[this.cfg.questionPositionSyncHandlerType]?.(
														index
													);
												}
											};
										});
									});

									list.replaceChildren(...nums);
									// 初始显示指定序号的结果
									resultContainer.replaceChildren(createResult(results[this.cfg.currentResultIndex]));

									container.replaceChildren(list, resultContainer);
								} else {
									/** 左侧题目列表 */

									list.style.overflow = 'auto';
									list.style.maxHeight = window.innerHeight / 2 + 'px';

									/** 右侧结果 */
									const resultContainer = h('div', { className: 'work-result-question-container' });
									const nums: HTMLSpanElement[] = [];
									/** 左侧渲染题目列表 */
									const questions = results.map((result, index) => {
										/** 左侧序号 */
										const num = h(
											'span',
											{
												className: 'search-infos-num',
												innerHTML: (index + 1).toString()
											},
											(num) => {
												num.style.marginRight = '12px';
												num.style.display = 'inline-block';
												setNumStyle(result, num, index);
											}
										);

										nums.push(num);

										return h(
											'div',

											[num, result.question],
											(question) => {
												question.onmouseover = () => {
													mouseoverIndex = index;
													// 重新渲染结果列表
													resultContainer.replaceChildren(createResult(result));
												};

												question.onmouseleave = () => {
													mouseoverIndex = -1;
													// 重新显示指定序号的结果
													resultContainer.replaceChildren(createResult(results[this.cfg.currentResultIndex]));
												};

												question.onclick = () => {
													for (const n of nums) {
														n.classList.remove('active');
													}
													for (const q of questions) {
														q.classList.remove('active');
													}
													nums[index].classList.add('active');
													question.classList.add('active');
													// 更新显示序号
													this.cfg.currentResultIndex = index;
													// 重新渲染结果列表
													resultContainer.replaceChildren(createResult(result));
													// 触发页面题目元素同步器
													if (this.cfg.questionPositionSyncHandlerType) {
														state.workResult.questionPositionSyncHandler[this.cfg.questionPositionSyncHandlerType]?.(
															index
														);
													}
												};
											}
										);
									});

									list.replaceChildren(...questions);
									// 初始显示指定序号的结果
									if (mouseoverIndex === -1) {
										resultContainer.replaceChildren(createResult(results[this.cfg.currentResultIndex]));
									} else {
										resultContainer.replaceChildren(createResult(results[mouseoverIndex]));
									}

									container.replaceChildren(
										h('div', [list, h('div', {}, [resultContainer])], (div) => {
											div.style.display = 'flex';
										})
									);
								}
							} else {
								container.replaceChildren(
									h('div', { className: 'alert-info-wrapper' }, [
										h('div', '暂无任何搜索结果~', (div) => {
											div.style.marginTop = '12px';
											div.className = 'result-info no-answer';
										})
									])
								);
							}

							/** 恢复高度 */
							list.scrollTo({
								top: scrollPercent * list.scrollHeight,
								behavior: 'auto'
							});

							const tip = h('div', [
								h('div', { className: 'search-infos-num' }, '1'),
								' 表示等待处理中',
								h('br'),
								h('div', { className: 'search-infos-num requested' }, '1'),
								' 表示已完成搜索 ',
								h('br'),
								h('div', { className: 'search-infos-num finish' }, '1'),
								' 表示已搜索已答题 '
							]);

							/**
							 * 实时进度节点
							 *
							 * 用常驻节点，不新建：答题刚开始时 render 可能还没被触发，
							 * 节点必须早就在面板里，状态一到就能直接改文本。
							 */
							const progress = progressRowFor(container);
							paintAnswerProgress();

							/** 添加信息 */
							container.prepend(
								h('hr'),
								h(
									'div',
									[
										$ui.space(
											[
												h('span', `已搜题: ${this.cfg.requestedCount}/${this.cfg.totalQuestionCount}`),
												h('span', `已答题: ${this.cfg.resolvedCount}/${this.cfg.totalQuestionCount}`),
												h('a', '提示', (btn) => {
													btn.style.cursor = 'pointer';
													btn.onclick = () => {
														$modal.confirm({ content: tip, footer: undefined });
													};
												}),
												$ui.tooltip(
													h('a', '清空结果', (btn) => {
														btn.title = '仅用于不会自动清空搜索结果的场景，例如超星非整卷预览模式';
														btn.style.cursor = 'pointer';
														btn.onclick = () => {
															this.methods.clearResults();
															const { panel, header } = CXProject.scripts.work;
															if (panel && header) {
																CXProject.scripts.work.onrender?.({ panel, header });
																CommonProject.scripts.workResults.onrender?.({ panel, header });
															}
														};
													})
												)
											],
											{ separator: '|' }
										),
										progress
									],
									(div) => {
										div.style.textAlign = 'center';
										div.style.fontSize = '12px';
									}
								)
							);
						}, 100);

						/** 渲染结果列表 */
						const createResult = (result: SimplifyWorkResult | undefined) => {
							if (result) {
								return h('div', [
									createSearchResultAlertElement(result),
									h(SearchInfosElement, {
										infos: result.searchInfos,
										question: result.question,
										type: result.type
									})
								]);
							} else {
								return h('div', 'undefined');
							}
						};

						render();
						this.onConfigChange('type', render);
						this.onConfigChange('requestedCount', render);
						this.onConfigChange('resolvedCount', render);
						$store.addChangeListener(TAB_WORK_RESULTS_KEY, render);

						return container;
					}
				};
			},
			onrender({ panel }) {
				panel.body.replaceChildren(this.methods.createWorkResultsPanel());
			}
		}),
		onlineSearch: new Script({
			name: '在线搜题',
			matches: [['所有页面', /.*/]],
			namespace: 'common.online-search',
			configs: {
				notes: {
					defaultValue: '查题前请在 “通用-全局设置” 中设置题库配置，才能进行在线搜题。'
				},

				selectSearch: {
					label: '划词搜索',
					defaultValue: true,
					attrs: { type: 'checkbox', title: '使用鼠标滑动选择页面中的题目进行搜索。' }
				},
				searchValue: {
					sync: true,
					label: '搜索题目',
					tag: 'textarea',
					attrs: {
						placeholder: '输入题目，请尽量保证题目完整，不要漏字',
						style: {
							minWidth: '300px',
							minHeight: '64px'
						}
					},
					defaultValue: ''
				}
			},
			oncomplete() {
				document.addEventListener(
					'selectionchange',
					debounce(() => {
						if (this.cfg.selectSearch) {
							const val = document.getSelection()?.toString() || '';
							if (val) {
								this.cfg.searchValue = val;
							}
						}
					}, 500)
				);
			},
			onrender({ panel }) {
				const content = h('div', '', (content) => {
					content.style.marginBottom = '12px';
				});

				const search = async (value: string) => {
					/** 用工作配置：里面已按 AI 配置补齐 `AI答题`，也过滤了被禁用的题库 */
					const workOptions = CommonProject.scripts.settings.methods.getWorkOptions();
					if (workOptions.answererWrappers.length === 0) {
						$modal.alert({ content: '请先在 通用-全局设置 配置题库，或到 AI 页填写并启用 AI 答题。' });
						return;
					}

					content.replaceChildren(h('span', '搜索中...'));

					if (value) {
						const t = Date.now();
						const infos = await defaultAnswerWrapperHandler(workOptions.answererWrappers, {
							title: value
						});
						// 耗时计算
						const resume = ((Date.now() - t) / 1000).toFixed(2);

						content.replaceChildren(
							h(
								'div',
								[
									h('hr'),
									h(
										'div',
										{ style: { color: '#a1a1a1' } },
										`搜索到 ${infos.map((i) => i.results).flat().length} 个结果，共耗时 ${resume} 秒`
									),
									h(SearchInfosElement, {
										infos: infos.map((info) => ({
											results: info.results.map(
												(res) => [res.question, res.answer, res.extra_data] as [string, string, object]
											),
											homepage: info.homepage,
											name: info.name,
											error: info.error
										})),
										question: value
									})
								],
								(div) => {
									div.classList.add('card');
									div.style.width = '480px';
								}
							)
						);
					} else {
						content.replaceChildren(h('span', '题目不能为空！'));
					}
				};

				const button = h('button', '搜索', (button) => {
					button.className = 'base-style-button';
					button.style.width = '120px';
					button.onclick = () => {
						search(this.cfg.searchValue);
					};
				});
				const searchContainer = h('div', { style: { textAlign: 'end' } }, [button]);

				panel.body.append(h('div', [content, searchContainer]));
			}
		}),
		/** 渲染脚本，窗口渲染主要脚本 */
		render: RenderScript,
		hack: new Script({
			name: '页面复制粘贴限制解除',
			matches: [['所有页面', /.*/]],
			hideInPanel: true,
			onactive() {
				enableCopy([document, document.body]);
			},
			oncomplete() {
				enableCopy([document, document.body]);
				insertCopyableStyle();
				setTimeout(() => {
					enableCopy([document, document.body]);
					insertCopyableStyle();
				}, 3000);
			}
		}),
		disableDialog: new Script({
			name: '禁止弹窗',
			matches: [['所有页面', /.*/]],
			hideInPanel: true,
			priority: 1,
			onstart() {
				function disableDialog(msg: string) {
					$modal.alert({
						profile: '弹窗来自：' + location.origin,
						content: msg
					});
				}

				try {
					$gm.unsafeWindow.alert = disableDialog;
					window.alert = disableDialog;
				} catch (e) {
					console.error(e);
				}
			}
		}),
		apps: new Script({
			name: '拓展应用',
			matches: [['', /.*/]],
			namespace: 'common.apps',
			configs: {
				notes: {
					defaultValue: '这里是一些其他的应用或者拓展功能。'
				},
				/**
				 * 题库缓存
				 */
				localQuestionCaches: {
					defaultValue: [] as QuestionCache[],
					extra: {
						appConfigSync: false
					}
				}
			},
			methods() {
				return {
					/**
					 * 添加题库缓存
					 */
					addQuestionCache: async (...questionCacheItems: QuestionCache[]) => {
						const questionCaches: QuestionCache[] = this.cfg.localQuestionCaches;
						for (const item of questionCacheItems) {
							// 去重
							if (questionCaches.find((c) => c.title === item.title && c.answer === item.answer) === undefined) {
								questionCaches.unshift(item);
							}
						}

						// 限制数量
						questionCaches.splice(200);
						this.cfg.localQuestionCaches = questionCaches;
					},
					addQuestionCacheFromWorkResult(swr: SimplifyWorkResult[]) {
						CommonProject.scripts.apps.methods.addQuestionCache(
							...swr
								.map((r) =>
									r.searchInfos
										.map((i) =>
											i.results
												.filter((res) => res[1])
												.map((res) => ({
													title: r.question,
													answer: res[1],
													from: i.name.replace(/【题库缓存】/g, ''),
													homepage: i.homepage || ''
												}))
												.flat()
										)
										.flat()
								)
								.flat()
						);
					},
					/**
					 * 将题库缓存作为题库并进行题目搜索
					 * @param title 题目
					 * @param whenSearchEmpty 当搜索结果为空，或者题库缓存功能被关闭时执行的函数
					 */
					searchAnswerInCaches: async (
						title: string,
						whenSearchEmpty: () => SearchInformation[] | Promise<SearchInformation[]>
					): Promise<SearchInformation[]> => {
						if (CommonProject.scripts.settings.cfg.enableQuestionCaches === false) {
							return await whenSearchEmpty();
						}

						let results: SearchInformation[] = [];
						const caches = this.cfg.localQuestionCaches;
						for (const cache of caches) {
							if (cache.title.trim() === title.trim()) {
								results.push({
									name: cache.from,
									homepage: cache.homepage,
									results: [{ answer: cache.answer, question: cache.title, extra_data: { ai: cache.ai, cache: true } }]
								});
							}
						}
						if (results.length === 0) {
							results = await whenSearchEmpty();
						}
						return results;
					},
					/**
					 * 查看更新日志
					 */
					async showChangelog() {
						$modal.simple({
							width: 600,
							content: h('div', { className: 'notes card' }, '暂无更新日志。')
						});
					}
				};
			},
			onrender({ panel }) {
				const btnStyle: Partial<CSSStyleDeclaration> = {
					padding: '6px 12px',
					margin: '4px',
					marginBottom: '8px',
					boxShadow: '0px 0px 4px #bebebe',
					borderRadius: '8px',
					cursor: 'pointer'
				};

				const cachesBtn = h('div', { innerText: '题库缓存', style: btnStyle }, (btn) => {
					btn.onclick = () => {
						const questionCaches = this.cfg.localQuestionCaches;

						const list = questionCaches.map((c) =>
							h(
								'div',
								{
									className: 'question-cache',
									style: {
										margin: '8px',
										border: '1px solid lightgray',
										borderRadius: '4px',
										padding: '8px'
									}
								},
								[
									h('div', { className: 'title' }, [
										$ui.tooltip(
											h(
												'span',
												{
													title: `来自：${c.from || '未知题库'}\n主页：${c.homepage || '未知主页'}`,
													style: { fontWeight: 'bold' }
												},
												c.title
											)
										)
									]),
									h('div', { className: 'answer', style: { marginTop: '6px' } }, c.answer)
								]
							)
						);

						const countEl = h('span', ['当前缓存数量：' + questionCaches.length]);

						$modal.simple({
							width: 800,
							content: h('div', [
								h('div', { className: 'notes card' }, [
									$ui.notes([
										'题库缓存是将题库的题目和答案保存在内存，在重复使用时可以直接从内存获取，不需要再次请求题库。',
										'以下是当前存储的题库，默认存储200题，当前页面关闭后会自动清除。'
									])
								]),
								h('div', { className: 'card' }, [
									$ui.space(
										[
											countEl,
											$ui.button('清空题库缓存', {}, (btn) => {
												btn.onclick = () => {
													this.cfg.localQuestionCaches = [];
													countEl.innerText = '当前缓存数量：0';
													list.forEach((el) => el.remove());
												};
											})
										],
										{ separator: '|' }
									)
								]),

								h(
									'div',
									questionCaches.length === 0 ? [h('div', { style: { textAlign: 'center' } }, '暂无题库缓存')] : list
								)
							])
						});
					};
				});

				const exportSetting = $ui.tooltip(
					h(
						'div',
						{
							innerText: '导出全部设置',
							style: btnStyle,
							title: '导出全部页面的设置，包括全局设置，题库配置，学习设置等等。（文件后缀名为：.hhsetting）'
						},
						(btn) => {
							btn.onclick = () => {
								const setting = Object.create({});
								for (const key of $store.list()) {
									const val = $store.get(key);
									if (val) {
										Reflect.set(setting, key, val);
									}
								}
								const blob = new Blob([JSON.stringify(setting, null, 2)], { type: 'text/plain' });
								const url = URL.createObjectURL(blob);
								const a = h('a', { href: url, download: 'hh-setting-export.hhsetting' });
								a.click();
								URL.revokeObjectURL(url);
							};
						}
					)
				);

				const importSetting = $ui.tooltip(
					h(
						'div',
						{
							innerText: '导入全部设置',
							style: btnStyle,
							title: '导入并且覆盖当前的全部设置。（文件后缀名为：.hhsetting）'
						},
						(btn) => {
							btn.onclick = () => {
								const input = h('input', { type: 'file', accept: '.hhsetting' });
								input.onchange = async () => {
									const file = input.files?.[0];
									if (file) {
										const setting = await file.text();
										const obj = JSON.parse(setting);
										for (const key of Object.keys(obj)) {
											$store.set(key, obj[key]);
										}
										$message.success({ content: '设置导入成功，页面即将刷新。', duration: 3 });
										setTimeout(() => {
											location.reload();
										}, 3000);
									}
								};
								input.click();
							};
						}
					)
				);

				[cachesBtn, exportSetting, importSetting].forEach((btn) => {
					btn.onmouseover = () => {
						btn.style.boxShadow = '0px 0px 4px #0099ff9c';
					};
					btn.onmouseout = () => {
						btn.style.boxShadow = '0px 0px 4px #bebebe';
					};
				});

				const sep = (text: string) => h('div', { className: 'separator', style: { padding: '4px 0px' } }, text);

				panel.body.replaceChildren(
					h('div', [sep('题库拓展'), cachesBtn, sep('其他功能'), exportSetting, importSetting])
				);
			}
		})
	}
});

function insertCopyableStyle() {
	const style = document.createElement('style');
	style.innerHTML = `
		html * {
		  -webkit-user-select: text !important;
		  -khtml-user-select: text !important;
		  -moz-user-select: text !important;
		  -ms-user-select: text !important;
		  user-select: text !important;
		}`;

	document.head.append(style);
}

function createAnswererWrapperList(aw: AnswererWrapper[]) {
	return aw.map((item) =>
		h(
			'details',
			[
				h('summary', [
					$ui.space([
						(() => {
							let isDisabled = CommonProject.scripts.settings.cfg.disabledAnswererWrapperNames.includes(item.name);

							const checkbox = h('input', { type: 'checkbox', checked: !isDisabled, className: 'base-style-switch' });

							checkbox.onclick = () => {
								isDisabled = !isDisabled;
								if (isDisabled) {
									CommonProject.scripts.settings.cfg.disabledAnswererWrapperNames = [
										...CommonProject.scripts.settings.cfg.disabledAnswererWrapperNames,
										item.name
									];
									$message.warn({
										content: '题库：' + item.name + ' 已被停用，如需开启请在：通用-全局设置-题库配置中开启。',
										duration: 30
									});
								} else {
									CommonProject.scripts.settings.cfg.disabledAnswererWrapperNames =
										CommonProject.scripts.settings.cfg.disabledAnswererWrapperNames.filter(
											(name) => name !== item.name
										);
									$message.success({
										content: '题库：' + item.name + ' 已启用。',
										duration: 3
									});
								}
							};

							checkbox.title = '点击停用或者启用题库，停用题库后将无法在自动答题中查询题目';

							return $ui.tooltip(checkbox);
						})(),
						h('span', item.name)
					])
				]),
				h('ul', [
					h('li', ['名字\t', item.name]),
					h('li', { innerHTML: `官网\t<a target="_blank" href=${item.homepage}>${item.homepage || '无'}</a>` }),
					h('li', ['接口\t', item.url]),
					h('li', ['请求方法\t', item.method]),
					h('li', ['请求类型\t', item.type]),
					h('li', ['请求头\t', JSON.stringify(item.headers, null, 4) || '无']),
					h('li', ['请求体\t', JSON.stringify(item.data, null, 4) || '无'])
				])
			],
			(details) => {
				details.style.paddingLeft = '12px';
			}
		)
	);
}

interface ReferenceDoc {
	id: string;
	name: string;
	type: 'text' | 'image';
	content: string;
	enabled: boolean;
}

const AI_SYSTEM_PROMPT =
	'你是一个答题助手。请严格依据给出的「题目」和「选项」作答，只能从给定选项里选，禁止编造选项，也不允许给出选项之外的内容。\n' +
	'输出要求（必须严格遵守；只输出答案本身，不要解释、不要理由、不要标点、不要引号、不要重复题干）：\n' +
	'1. 单选题(single)：只输出所选项的字母，例如 A；不要输出选项文字。\n' +
	'2. 多选题(multiple)：只输出所有正确选项的字母，用 # 分隔，例如 A#B#C。\n' +
	'3. 判断题(judgement)：只输出所选项的文字，不要输出字母。选项写作「A.对」「B.错」时就输出「对」或「错」；写作「A.正确」「B.错误」时就输出「正确」或「错误」；必须与所选项的文字完全一致。\n' +
	'4. 填空题(completion)：直接输出要填的内容，多个空用 # 分隔。\n' +
	'禁止输出「正确答案是」「答案是」「因为」等任何前缀或解析，禁止输出多个选项。\n' +
	'必须给出答案：无论题目是否完整、公式是否看得清、你是否确定，都必须输出一个最可能的答案。' +
	'绝对禁止留空，禁止只输出「无法确定」「不知道」「看不清」「略」「无」这类说明，禁止输出空行。';
const AI_USER_PROMPT = '题目：${title}\n选项：\n${options}\n题型：${type}\n请只输出答案（必须作答，禁止留空）：';

/**
 * 取出「实际生效」的 AI 配置
 *
 * API Key 是唯一必须项：接口地址、模型留空时回退到默认值。
 *
 * 为什么不能三个都要求非空：桌面端统一配置是「按保存过的键下发」的，
 * 用户只在桌面端填了 Key（模型框留空，占位符写着 deepseek-flash 很容易被忽略），
 * 下发的就是空串，三个都校验的结果是**整条链路静默失效** ——
 * 面板报「还没设置题库」，而统一配置模式下扩展里没有自救入口。
 *
 * @returns null 表示没有可用的 AI 配置（连 Key 都没有）
 */
function resolveAiConfig(): { endpoint: string; apiKey: string; model: string } | null {
	let aiCfg: any;
	try {
		aiCfg = CommonProject.scripts.aiSettings.cfg;
	} catch {
		return null;
	}
	const apiKey = String(aiCfg?.aiApiKey || '').trim();
	if (!apiKey) return null;
	return {
		endpoint: String(aiCfg?.aiEndpoint || '').trim() || DEFAULT_AI_ENDPOINT,
		apiKey,
		model: String(aiCfg?.aiModel || '').trim() || DEFAULT_AI_MODEL
	};
}

/**
 * AI 配置齐全、但 `answererWrappers` 里还没有 `AI答题` 条目时补一份
 *
 * 为什么必须补：桌面端「使用桌面端统一配置」模式下，扩展面板的 AI 卡片被
 * `createDesktopConfigTip()` 替代（**没有「启用」按钮**），桌面端的 AI 配置区
 * 也只存 aiEndpoint / aiApiKey / aiModel 三个键，保存时只「保留」已存在的
 * AI wrapper、从不创建 —— 于是用户明明填好了 AI，`answererWrappers` 仍是空数组，
 * 所有平台都报「你还没设置题库」，而且在扩展里没有自救入口。
 *
 * 只改传入的副本、不写存储：真正的「停用 AI」由题库列表的「禁用」表达，
 * 调用方会在补之前先看禁用列表。
 */
function ensureAiAnswererWrapper(wrappers: any[]) {
	if (!Array.isArray(wrappers)) return;
	if (wrappers.some((aw) => aw && aw.name === 'AI答题')) return;

	const ai = resolveAiConfig();
	if (!ai) return;

	wrappers.push({
		name: 'AI答题',
		url: normalizeAiEndpoint(ai.endpoint),
		homepage: 'AI 大模型答题',
		method: 'post',
		type: 'GM_xmlhttpRequest',
		contentType: 'json',
		headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.apiKey },
		data: {
			model: ai.model,
			messages: buildAiMessages(buildAiReferenceDocs()),
			temperature: 0,
			...aiThinkingPayload(ai.endpoint)
		},
		handler:
			'return (res)=>{ var c = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content; return [undefined, c ? String(c).trim() : undefined] }',
		inlineImages: true
	} as any);
}

/**
 * 按当前代码刷新「AI答题」题库条目的地址、鉴权与提示词
 *
 * 这些内容在点「启用」的瞬间就被固化进 answererWrappers 里了，
 * 之后升级代码（改提示词、换模型字段）对老配置完全无效 ——
 * 所以在取工作配置时刷新一份副本：既能让新提示词对已配置用户立即生效，也不写存储。
 */
function refreshAiAnswererWrapper(wrappers: AnswererWrapper[] | undefined) {
	if (!wrappers || wrappers.length === 0) return;
	const wrapper: any = wrappers.find((aw) => aw && aw.name === 'AI答题');
	if (!wrapper) return;

	const ai = resolveAiConfig();
	if (!ai) return;

	wrapper.url = normalizeAiEndpoint(ai.endpoint);
	wrapper.headers = {
		...((wrapper.headers as any) || {}),
		'Content-Type': 'application/json',
		Authorization: 'Bearer ' + ai.apiKey
	};
	wrapper.data = {
		...((wrapper.data as any) || {}),
		model: ai.model,
		messages: buildAiMessages(buildAiReferenceDocs()),
		temperature: 0,
		...aiThinkingPayload(ai.endpoint)
	};
	/** 题目里带图（公式/图表）时转成 base64 一起发给模型 */
	wrapper.inlineImages = true;
}

/** 参考资料：读配置失败时按「没有参考资料」处理，不能因此让 AI 不可用 */
function buildAiReferenceDocs(): ReferenceDoc[] {
	try {
		return ((CommonProject.scripts.aiSettings.cfg as any).referenceDocs as ReferenceDoc[]) || [];
	} catch {
		return [];
	}
}

function buildAiMessages(referenceDocs: ReferenceDoc[]) {
	const enabled = (referenceDocs || []).filter((r) => r.enabled && r.content);
	const textRefs = enabled.filter((r) => r.type === 'text');
	const imageRefs = enabled.filter((r) => r.type === 'image');

	if (imageRefs.length > 0) {
		const textPart =
			(textRefs.length > 0 ? '【参考资料】\n' + textRefs.map((r) => r.content).join('\n\n') + '\n\n' : '') +
			AI_USER_PROMPT;
		const userContent: any[] = [{ type: 'text', text: textPart }];
		for (const img of imageRefs) {
			userContent.push({ type: 'image_url', image_url: { url: img.content } });
		}
		return [
			{ role: 'system', content: AI_SYSTEM_PROMPT },
			{ role: 'user', content: userContent }
		];
	} else if (textRefs.length > 0) {
		return [
			{ role: 'system', content: AI_SYSTEM_PROMPT },
			{
				role: 'user',
				content: '【参考资料】\n' + textRefs.map((r) => r.content).join('\n\n') + '\n\n' + AI_USER_PROMPT
			}
		];
	} else {
		return [
			{ role: 'system', content: AI_SYSTEM_PROMPT },
			{ role: 'user', content: AI_USER_PROMPT }
		];
	}
}

function compressDataUrl(dataUrl: string, maxSize = 2 * 1024 * 1024, maxDim = 1920): Promise<string> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => {
			const nw = img.naturalWidth;
			const nh = img.naturalHeight;
			let w = nw;
			let h = nh;
			if (w > maxDim || h > maxDim) {
				const ratio = Math.min(maxDim / w, maxDim / h);
				w = Math.round(w * ratio);
				h = Math.round(h * ratio);
			}
			const canvas = document.createElement('canvas');
			canvas.width = w;
			canvas.height = h;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				resolve(dataUrl);
				return;
			}
			/** 转 JPEG 时透明区域会变黑（公式图常见），先铺白底 */
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, w, h);
			ctx.drawImage(img, 0, 0, w, h);
			let quality = 0.85;
			let result = canvas.toDataURL('image/jpeg', quality);
			while (result.length > maxSize * 1.37 && quality > 0.3) {
				quality -= 0.1;
				result = canvas.toDataURL('image/jpeg', quality);
			}
			resolve(result);
		};
		img.onerror = () => resolve(dataUrl);
		img.src = dataUrl;
	});
}

/** 题干里内联的 base64 图片 */
const INLINE_IMAGE_RE = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;

async function compressMessagesForRetry(messages: any[]): Promise<any[] | undefined> {
	let compressed = false;
	const shrink = async (text: string) => {
		const matches = text.match(INLINE_IMAGE_RE);
		if (!matches || !matches.length) return text;
		let out = text;
		for (const dataUrl of matches) {
			const smaller = await compressDataUrl(dataUrl, 24 * 1024, 640);
			if (smaller.length < dataUrl.length) {
				compressed = true;
				out = out.split(dataUrl).join(smaller);
			}
		}
		return out;
	};
	const newMessages: any[] = [];
	for (const msg of messages) {
		if (typeof msg?.content === 'string') {
			newMessages.push({ ...msg, content: await shrink(msg.content) });
		} else if (Array.isArray(msg?.content)) {
			const newContent: any[] = [];
			for (const part of msg.content) {
				if (part && part.type === 'text' && typeof part.text === 'string') {
					newContent.push({ ...part, text: await shrink(part.text) });
				} else {
					newContent.push(part);
				}
			}
			newMessages.push({ ...msg, content: newContent });
		} else {
			newMessages.push(msg);
		}
	}
	return compressed ? newMessages : undefined;
}

setSizeErrorRetryHandler(async (_error: any, data: any) => {
	if (!data || !Array.isArray(data.messages)) return undefined;
	const newMessages = await compressMessagesForRetry(data.messages);
	if (!newMessages) return undefined;
	return { ...data, messages: newMessages };
});

/** 题目图片 → data URL 的缓存，避免同一张图（同一节里的重复公式）反复下载压缩 */
const aiImageCache = new Map<string, string>();

/**
 * 下载图片并转成 data URL
 *
 * 走后台 `fetch` 而不是页面里的 `GM_xmlhttpRequest`：桥接通道只回文本，
 * 二进制会被 `res.text()` 弄坏；后台是扩展上下文，拥有全部站点的 host 权限，
 * 还能带上 cookie 取超星那种防盗链的图。
 * 脚本管理器环境（没有 chrome.runtime）退回原生 GM 的 arraybuffer。
 */
function fetchImageAsDataUrl(url: string): Promise<string> {
	const runtime = (globalThis as any).chrome?.runtime;
	if (runtime?.sendMessage) {
		return new Promise((resolve, reject) => {
			try {
				runtime.sendMessage({ __HH__: 'fetchImage', payload: { url } }, (resp: any) => {
					const err = runtime.lastError;
					if (err) {
						reject(new Error(err.message));
						return;
					}
					if (resp && resp.dataUrl) resolve(String(resp.dataUrl));
					else reject(new Error((resp && resp.error) || '图片下载失败'));
				});
			} catch (e) {
				reject(e);
			}
		});
	}

	return new Promise((resolve, reject) => {
		try {
			// eslint-disable-next-line no-undef
			GM_xmlhttpRequest({
				url,
				method: 'GET',
				responseType: 'arraybuffer',
				onload: (resp: any) => {
					if (resp.status !== 200 || !resp.response) {
						reject(new Error('HTTP ' + resp.status));
						return;
					}
					try {
						const blob = new Blob([resp.response]);
						const reader = new FileReader();
						reader.onload = () => resolve(String(reader.result || ''));
						reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
						reader.readAsDataURL(blob);
					} catch (e) {
						reject(e);
					}
				},
				onerror: (err: any) => reject(new Error(String((err && err.error) || err || '图片下载失败')))
			});
		} catch (e) {
			reject(e);
		}
	});
}

/**
 * 把题目里的图片整理成 base64 文本
 *
 * 超星这类平台的公式图地址往往要带 cookie / referer，模型侧去下载大概率 403，
 * 所以先在本地取回，再压到 800px / 48KB 以内。
 *
 * 这里压缩不是为了「限制输入长度」，而是因为 base64 是以纯文本内联进题干的，
 * 每 3~4 个字符就是 1 个 token：一张 200KB 的原图 ≈ 7 万 token，4 张就能把
 * 上下文直接撑爆。压到 48KB 后单张约 1.7 万 token，属于能发得出去的范围。
 * 任何一张失败都只是少一张图，不能让整道题失败。
 */
async function resolveQuestionImagesInline(urls: string[]): Promise<string[]> {
	const out: string[] = [];
	/** 所有图片 base64 字符数之和的上限，超了就丢弃后面的图 */
	const TOTAL_LIMIT = 200 * 1024;
	let total = 0;
	for (const url of urls) {
		try {
			let dataUrl = aiImageCache.get(url);
			if (!dataUrl) {
				dataUrl = url.startsWith('data:') ? url : await fetchImageAsDataUrl(url);
				dataUrl = await compressDataUrl(dataUrl, 48 * 1024, 800);
				if (aiImageCache.size > 40) aiImageCache.clear();
				aiImageCache.set(url, dataUrl);
			}
			if (!dataUrl || !/^data:image\//i.test(dataUrl)) continue;
			if (total + dataUrl.length > TOTAL_LIMIT) {
				console.log('题目图片总量过大，剩余图片不再发送');
				break;
			}
			total += dataUrl.length;
			out.push(dataUrl);
		} catch (e) {
			console.log('题目图片读取失败，已跳过：' + url, e);
		}
	}
	return out;
}

setQuestionImageResolver(resolveQuestionImagesInline);

function buildAiTestMessages(customText: string, referenceDocs: ReferenceDoc[]) {
	const enabled = (referenceDocs || []).filter((r) => r.enabled && r.content);
	const textRefs = enabled.filter((r) => r.type === 'text');
	const imageRefs = enabled.filter((r) => r.type === 'image');
	const refPrefix = textRefs.length > 0 ? '【参考资料】\n' + textRefs.map((r) => r.content).join('\n\n') + '\n\n' : '';

	if (imageRefs.length > 0) {
		const userContent: any[] = [{ type: 'text', text: refPrefix + customText }];
		for (const img of imageRefs) {
			userContent.push({ type: 'image_url', image_url: { url: img.content } });
		}
		return [
			{ role: 'system', content: '你是一个考试答题助手。请根据提供的参考资料和用户问题进行回答。' },
			{ role: 'user', content: userContent }
		];
	} else {
		return [
			{ role: 'system', content: '你是一个考试答题助手。请根据提供的参考资料和用户问题进行回答。' },
			{ role: 'user', content: refPrefix + customText }
		];
	}
}

function aiSendTestMessageRaw(endpoint: string, apiKey: string, model: string, messages: any[]): Promise<string> {
	const fullEndpoint = normalizeAiEndpoint(endpoint);
	return new Promise((resolve, reject) => {
		try {
			// eslint-disable-next-line no-undef
			GM_xmlhttpRequest({
				url: fullEndpoint,
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
				data: JSON.stringify({
					model,
					messages,
					temperature: 0,
					...aiThinkingPayload(endpoint)
				}),
				responseType: 'json',
				onload: (resp: any) => {
					if (resp.status === 200) {
						let body = resp.response;
						if (body == null && resp.responseText) {
							try {
								body = JSON.parse(resp.responseText);
							} catch (e) {
								body = resp.responseText;
							}
						}
						const content =
							body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
						resolve(content ? String(content).trim() : '(AI 未返回内容)');
					} else {
						reject(new Error('HTTP ' + resp.status + '：' + String(resp.responseText || '').slice(0, 300)));
					}
				},
				onerror: (err: any) => reject(new Error(String((err && err.error) || err || '请求失败')))
			});
		} catch (e) {
			reject(e);
		}
	});
}

async function aiSendTestMessage(endpoint: string, apiKey: string, model: string, messages: any[]): Promise<string> {
	try {
		return await aiSendTestMessageRaw(endpoint, apiKey, model, messages);
	} catch (error) {
		const errStr = typeof error === 'string' ? error : (error as any)?.message || String(error);
		if (/413|too large|too long|payload|entity|size.*limit|max.*size|request.*large|body.*limit/i.test(errStr)) {
			const compressed = await compressMessagesForRetry(messages);
			if (compressed) {
				return await aiSendTestMessageRaw(endpoint, apiKey, model, compressed);
			}
		}
		throw error;
	}
}

function createReferenceArea(onChange: () => void) {
	const aiCfg = CommonProject.scripts.aiSettings.cfg;
	const areaCss = `.ai-ref-area{margin-top:16px;border-top:1px dashed rgba(0,0,0,.1);padding-top:14px;}
.ai-ref-title{font-size:15px;font-weight:600;margin-bottom:4px;color:#1d1d1f;}
.ai-ref-desc{color:#6e6e73;font-size:12px;margin-bottom:10px;line-height:1.5;}
.ai-ref-btn-row{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;}
.ai-ref-btn{padding:6px 14px;border:1px dashed rgba(0,122,255,.4);border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;background:rgba(0,122,255,.06);color:#007aff;transition:background .2s ease;}
.ai-ref-btn:hover{background:rgba(0,122,255,.12);}
.ai-ref-list{display:flex;flex-direction:column;gap:8px;}
.ai-ref-item{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border:1px solid rgba(0,0,0,.08);border-radius:8px;background:#fafafa;}
.ai-ref-item-info{flex:1;min-width:0;overflow:hidden;}
.ai-ref-item-name{font-size:13px;font-weight:500;color:#1d1d1f;word-break:break-all;}
.ai-ref-item-meta{font-size:11px;color:#8e8e93;margin-top:2px;}
.ai-ref-item-thumb{max-width:60px;max-height:60px;border-radius:4px;margin-top:4px;display:block;}
.ai-ref-item-del{padding:4px 8px;border:none;border-radius:6px;font-size:12px;cursor:pointer;background:#ff3b30;color:#fff;flex-shrink:0;}
.ai-ref-item-del:hover{background:#d8302a;}
.ai-ref-empty{color:#8e8e93;font-size:12px;padding:8px 0;}
.ai-ref-edit{border:1px solid #007aff;border-radius:8px;padding:10px;margin-bottom:8px;background:#fff;}
.ai-ref-edit-input{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid rgba(0,0,0,.1);border-radius:6px;font-size:13px;margin-bottom:6px;outline:none;}
.ai-ref-edit-input:focus{border-color:#007aff;}
.ai-ref-edit-textarea{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid rgba(0,0,0,.1);border-radius:6px;font-size:13px;resize:vertical;min-height:80px;font-family:inherit;outline:none;}
.ai-ref-edit-textarea:focus{border-color:#007aff;}
.ai-ref-edit-row{display:flex;gap:6px;margin-top:6px;}
.ai-ref-edit-btn{padding:5px 12px;border:none;border-radius:6px;font-size:12px;cursor:pointer;color:#fff;}
.ai-ref-edit-save{background:#34c759;}
.ai-ref-edit-cancel{background:#8e8e93;}
.ai-ref-test-area{margin-top:12px;border:1px dashed rgba(0,122,255,.3);border-radius:8px;padding:10px;background:rgba(0,122,255,.03);}
.ai-ref-test-textarea{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid rgba(0,0,0,.1);border-radius:6px;font-size:13px;resize:vertical;min-height:60px;font-family:inherit;outline:none;margin-bottom:6px;}
.ai-ref-test-textarea:focus{border-color:#007aff;}
.ai-ref-test-result{margin-top:8px;padding:8px 10px;border-radius:6px;font-size:13px;background:#fff;border:1px solid rgba(0,0,0,.06);white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;line-height:1.5;}
.ai-ref-test-result.err{background:#fff5f5;border-color:#ff3b30;color:#d8302a;}
.ai-ref-test-result.loading{color:#8e8e93;}
.ai-ref-test-send{background:#007aff;}`;

	const listEl = h('div', { className: 'ai-ref-list' });

	const getDocs = () => ((aiCfg.referenceDocs as any) || []) as ReferenceDoc[];
	const saveDocs = (docs: ReferenceDoc[]) => {
		aiCfg.referenceDocs = docs as any;
		onChange();
	};

	const renderList = () => {
		const docs = getDocs();
		listEl.replaceChildren();
		if (docs.length === 0) {
			listEl.appendChild(h('div', { className: 'ai-ref-empty' }, '暂无参考资料，答题时仅发送题目本身。'));
			return;
		}
		for (const doc of docs) {
			const checkbox = h('input', { type: 'checkbox' }) as HTMLInputElement;
			checkbox.checked = doc.enabled;
			checkbox.style.marginTop = '4px';
			checkbox.onchange = () => {
				const next = getDocs().map((d) => (d.id === doc.id ? { ...d, enabled: checkbox.checked } : d));
				saveDocs(next);
			};

			const delBtn = h('button', { className: 'ai-ref-item-del' }, '删除');
			delBtn.onclick = () => {
				saveDocs(getDocs().filter((d) => d.id !== doc.id));
				renderList();
			};

			const infoChildren: any[] = [
				h('div', { className: 'ai-ref-item-name' }, doc.name || '(未命名)'),
				h('div', { className: 'ai-ref-item-meta' }, doc.type === 'text' ? '文字资料' : '图片资料')
			];
			if (doc.type === 'image') {
				const thumb = h('img', { className: 'ai-ref-item-thumb' }) as HTMLImageElement;
				thumb.src = doc.content;
				infoChildren.push(thumb);
			}

			listEl.appendChild(
				h('div', { className: 'ai-ref-item' }, [
					checkbox,
					h('div', { className: 'ai-ref-item-info' }, infoChildren),
					delBtn
				])
			);
		}
	};

	const editArea = h('div');

	const addTextBtn = h('button', { className: 'ai-ref-btn' }, '+ 添加文字');
	addTextBtn.onclick = () => {
		const nameInput = h('input', {
			className: 'ai-ref-edit-input',
			placeholder: '资料名称（如：教材第三章知识点）'
		}) as HTMLInputElement;
		const contentInput = h('textarea', {
			className: 'ai-ref-edit-textarea',
			placeholder: '粘贴或输入参考资料内容...'
		}) as HTMLTextAreaElement;
		const saveBtn = h('button', { className: 'ai-ref-edit-btn ai-ref-edit-save' }, '保存');
		const cancelBtn = h('button', { className: 'ai-ref-edit-btn ai-ref-edit-cancel' }, '取消');

		saveBtn.onclick = () => {
			const name = nameInput.value.trim();
			const content = contentInput.value.trim();
			if (!content) {
				$message.error({ content: '内容不能为空' });
				return;
			}
			saveDocs([
				...getDocs(),
				{
					id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
					name: name || '文字资料',
					type: 'text',
					content,
					enabled: true
				}
			]);
			renderList();
			editArea.replaceChildren();
		};
		cancelBtn.onclick = () => editArea.replaceChildren();

		editArea.replaceChildren(
			h('div', { className: 'ai-ref-edit' }, [
				nameInput,
				contentInput,
				h('div', { className: 'ai-ref-edit-row' }, [saveBtn, cancelBtn])
			])
		);
		nameInput.focus();
	};

	const addImageBtn = h('button', { className: 'ai-ref-btn' }, '+ 添加图片');
	const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true }) as HTMLInputElement;
	fileInput.style.display = 'none';
	addImageBtn.onclick = () => fileInput.click();
	fileInput.onchange = async () => {
		const files = fileInput.files;
		if (!files || files.length === 0) return;
		const newDocs: ReferenceDoc[] = [];
		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const dataUrl = await new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = () => reject(new Error('读取失败'));
				reader.readAsDataURL(file);
			}).catch(() => '');
			if (dataUrl) {
				newDocs.push({
					id: 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
					name: file.name,
					type: 'image',
					content: dataUrl,
					enabled: true
				});
			} else {
				$message.error({ content: '图片「' + file.name + '」读取失败' });
			}
		}
		if (newDocs.length > 0) {
			saveDocs([...getDocs(), ...newDocs]);
			renderList();
			$message.success({
				content:
					'已添加 ' +
					newDocs.length +
					' 张图片' +
					(newDocs.length < files.length ? '（' + (files.length - newDocs.length) + ' 张失败）' : '')
			});
		}
		fileInput.value = '';
	};

	const testBtn = h('button', { className: 'ai-ref-btn' }, '测试资料');
	const testArea = h('div');
	testBtn.onclick = () => {
		const testInput = h('textarea', {
			className: 'ai-ref-test-textarea',
			placeholder: '输入测试文字，如：请根据参考资料回答：1+1=?'
		}) as HTMLTextAreaElement;
		const sendBtn = h('button', { className: 'ai-ref-edit-btn ai-ref-test-send' }, '发送给 AI');
		const resultEl = h(
			'div',
			{ className: 'ai-ref-test-result' },
			'点击「发送给 AI」，将把上方文字连同已启用的参考资料一并发送给 AI。'
		);

		sendBtn.onclick = async () => {
			const text = testInput.value.trim();
			if (!text) {
				$message.error({ content: '请输入测试文字' });
				return;
			}
			const { aiEndpoint, aiApiKey, aiModel } = aiCfg;
			if (!aiEndpoint || !aiApiKey || !aiModel) {
				$message.error({ content: '请先填写完整的 AI API 地址、Key、模型' });
				return;
			}
			sendBtn.textContent = '发送中...';
			sendBtn.setAttribute('disabled', 'true');
			resultEl.className = 'ai-ref-test-result loading';
			resultEl.textContent = '正在等待 AI 回复...';
			try {
				const messages = buildAiTestMessages(text, getDocs());
				const reply = await aiSendTestMessage(aiEndpoint, aiApiKey, aiModel, messages);
				resultEl.className = 'ai-ref-test-result';
				resultEl.textContent = reply;
			} catch (e) {
				resultEl.className = 'ai-ref-test-result err';
				resultEl.textContent = '发送失败：' + ((e as any)?.message || String(e));
			} finally {
				sendBtn.textContent = '发送给 AI';
				sendBtn.removeAttribute('disabled');
			}
		};

		testArea.replaceChildren(
			h('div', { className: 'ai-ref-test-area' }, [
				testInput,
				h('div', { className: 'ai-ref-edit-row' }, [sendBtn]),
				resultEl
			])
		);
		testInput.focus();
	};

	renderList();

	return h('div', { className: 'ai-ref-area' }, [
		h('style', areaCss),
		h('div', { className: 'ai-ref-title' }, '参考资料'),
		h('div', { className: 'ai-ref-desc' }, [
			'答题时将参考资料一并发给 AI 供其参考。资料可以是文字或图片（图片需 AI 模型支持视觉，如 deepseek-v4.1-flash/kimi-k3）。',
			h('br'),
			'勾选资料前的复选框可控制是否发送该条资料；不勾选任何资料时仅发送题目本身。大图会自动压缩。'
		]),
		h('div', { className: 'ai-ref-btn-row' }, [addTextBtn, addImageBtn, testBtn]),
		editArea,
		listEl,
		testArea,
		fileInput
	]);
}

function normalizeAiEndpoint(raw: string) {
	let ep = (raw || '').trim().replace(/\/+$/, '');
	if (!/\/chat\/completions$/i.test(ep)) {
		if (/\/v\d+$/i.test(ep)) {
			ep = ep + '/chat/completions';
		} else {
			ep = ep + '/v1/chat/completions';
		}
	}
	return ep;
}

/**
 * DeepSeek 官方接口默认开着「思考模式」，答题时主动关掉
 *
 * 官方文档写明 `deepseek-flash` 默认 thinking 开启。答题只要最终答案，
 * 开着思考的代价是：每题多等十几秒（面板上就是「AI 思考中…」一直跳），
 * 而且思考内容同样计入输出 token —— 输出被截断时 `content` 会是空串、
 * 只剩 `reasoning_content`，整道题判失败。
 *
 * ⚠️ 只对 DeepSeek 官方域名下发：`thinking` 是 DeepSeek 私有字段，
 * 第三方 OpenAI 兼容网关（硅基流动、Azure、OneAPI 等）遇到不认识的字段
 * 可能直接 400，那才是真正的「配好了也答不了」。
 */
function aiThinkingPayload(endpoint: string): Record<string, any> {
	return /api\.deepseek\.com/i.test(String(endpoint || '')) ? { thinking: { type: 'disabled' } } : {};
}

function aiTestConnection(endpoint: string, apiKey: string, model: string) {
	return new Promise<{ ok: boolean; status: number; body: any; error?: string }>((resolve) => {
		try {
			// eslint-disable-next-line no-undef
			GM_xmlhttpRequest({
				url: endpoint,
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
				data: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
				responseType: 'json',
				onload: (resp: any) => {
					let body: any = resp.response;
					if (body == null && resp.responseText) {
						try {
							body = JSON.parse(resp.responseText);
						} catch (e) {
							body = resp.responseText;
						}
					}
					resolve({ ok: resp.status === 200 && !!(body && body.choices), status: resp.status, body });
				},
				onerror: (err: any) => {
					resolve({ ok: false, status: 0, body: undefined, error: String((err && err.error) || err || '请求失败') });
				}
			});
		} catch (e) {
			resolve({ ok: false, status: 0, body: undefined, error: String(e) });
		}
	});
}

/**
 * 是否使用「桌面端统一配置」
 *
 * 只看一个一次性标记 `desktopManaged`：桌面端第一次注入配置时置 true，之后再不改变。
 * 开启时题库 / AI 一律在桌面端维护，由客户端启动浏览器时单向注入扩展 storage。
 *
 * 为什么不用「开关 + 心跳 + 有效期」：那套东西有三处会漂 ——
 * 浏览器长期不关会让心跳过期、客户端版本没更新会不写心跳、卸载桌面端后标记还在但心跳停了。
 * 一次性标记没有这些问题，代价只是「装过桌面端的机器，卸了也保持只读」。
 */
function isUsingDesktopConfig() {
	/** 桌面端管理标记：只有它存在（桌面端注入过）时才谈得上统一配置 */
	if (CommonProject.scripts.settings.cfg.desktopManaged !== true) return false;
	/** 用户在面板上主动取消勾选 → 回到本浏览器独立配置 */
	return CommonProject.scripts.settings.cfg.useDesktopAnswerConfig !== false;
}

/**
 * 唤起桌面端「软件设置」
 *
 * 用 `new Image().src` 发请求：img 不受 CORS / Private Network Access 限制，
 * 也不需要读返回值 —— 这正是绕开沙箱里 `fetch` 不 settle 的办法。
 */
function openDesktopSettings() {
	try {
		const img = new Image();
		img.src = `http://localhost:15319/api/open-settings?_=${Date.now()}`;
	} catch (e) {
		/* 桌面端没启动时静默失败，下面的提示仍然会给出去设置页的路径 */
	}
	$message.info({ content: '已切换到桌面端「软件设置」，请在其中配置题库与 AI' });
}

/** 开启统一配置时，替换掉题库 / AI 的编辑区 */
function createDesktopConfigTip() {
	/**
	 * 把「桌面端到底有没有下发 AI」说清楚
	 *
	 * 统一配置模式下这里没有编辑入口，用户看到「未设置题库」时无从判断是
	 * 桌面端没填、还是下发了但没启用 —— 直接把当前状态摆出来。
	 */
	let statusText = '';
	try {
		const aiCfg: any = CommonProject.scripts.aiSettings.cfg;
		const wrappers: any[] = CommonProject.scripts.settings.cfg.answererWrappers || [];
		const hasAiWrapper = wrappers.some((w) => w && w.name === 'AI答题');
		const aiFilled = !!(aiCfg.aiEndpoint && aiCfg.aiApiKey && aiCfg.aiModel);
		if (hasAiWrapper) {
			statusText = `当前 AI：已启用（模型 ${aiCfg.aiModel || '?'}）`;
		} else if (aiFilled) {
			statusText = `当前 AI：配置已下发，答题时会自动启用（模型 ${aiCfg.aiModel || '?'}）`;
		} else {
			statusText = '当前 AI：桌面端还没有填写 API 配置，答题会提示「未设置题库」';
		}
	} catch {
		statusText = '';
	}

	return h('div', {}, [
		h(
			'div',
			{ className: 'secondary', style: { marginBottom: '10px', lineHeight: '1.7' } },
			'已开启「使用桌面端统一配置」。题库与 AI 在桌面端统一维护，浏览器启动时自动同步，这里不再单独编辑。'
		),
		statusText
			? h(
					'div',
					{ className: 'secondary', style: { marginBottom: '10px', fontSize: '12px', lineHeight: '1.6' } },
					statusText
			  )
			: '',
		h('button', '前往桌面端配置', (btn: HTMLButtonElement) => {
			btn.classList.add('base-style-button');
			btn.onclick = () => openDesktopSettings();
		}),
		h(
			'div',
			{ className: 'secondary', style: { marginTop: '10px', fontSize: '12px', lineHeight: '1.6' } },
			'想在本浏览器单独配置？到「全局设置」取消勾选「使用桌面端统一配置」，再打开这个面板。'
		)
	]);
}

function createAiConfigCard() {
	/** 统一配置模式下不提供编辑入口：单向同步，避免两条通道互相覆盖 */
	if (isUsingDesktopConfig()) {
		return createDesktopConfigTip();
	}
	const aiCfg = CommonProject.scripts.aiSettings.cfg;
	/**
	 * 空值补默认值
	 *
	 * 桌面端统一配置下发的是空串时会覆盖掉默认值，面板上就变成「地址/模型都是空的」，
	 * 用户只填个 Key 点「启用」还会被校验拦住。这里把默认值回写一次（幂等），
	 * 让「看到的」和「实际生效的」一致。
	 */
	if (!String(aiCfg.aiEndpoint || '').trim()) aiCfg.aiEndpoint = DEFAULT_AI_ENDPOINT;
	if (!String(aiCfg.aiModel || '').trim()) aiCfg.aiModel = DEFAULT_AI_MODEL;
	const aiCss = `.ai-cfg-card{background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:12px;padding:16px;margin-top:12px;box-shadow:0 1px 3px rgba(0,0,0,.04);animation:hh-card-in .45s cubic-bezier(0.16,1,0.3,1) both;}
.ai-cfg-title{font-size:15px;font-weight:600;margin-bottom:4px;color:#1d1d1f;}
.ai-cfg-desc{color:#6e6e73;font-size:12px;margin-bottom:6px;line-height:1.5;}
.ai-cfg-label{display:block;color:#1d1d1f;font-size:12px;font-weight:500;margin:12px 0 5px;}
.ai-cfg-input{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid rgba(0,0,0,.1);border-radius:8px;font-size:13px;background:#fff;transition:border-color .25s cubic-bezier(0.4,0,0.2,1),box-shadow .25s cubic-bezier(0.4,0,0.2,1);outline:none;color:#1d1d1f;}
.ai-cfg-input:focus{border-color:#007aff;box-shadow:0 0 0 3px rgba(0,122,255,.16);}
.ai-cfg-input::placeholder{color:#8e8e93;}
.ai-cfg-btn-row{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;}
.ai-cfg-btn{padding:7px 16px;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:background .2s cubic-bezier(0.4,0,0.2,1),transform .2s cubic-bezier(0.16,1,0.3,1),box-shadow .2s ease;color:#fff;will-change:transform;}
.ai-cfg-btn:hover{transform:translateY(-1px);}
.ai-cfg-btn:active{transform:scale(.95);transition:transform .08s ease;}
.ai-cfg-btn:disabled{opacity:.6;cursor:default;transform:none!important;}
.ai-cfg-btn-enable{background:#34c759;}
.ai-cfg-btn-enable:hover{background:#2aa84a;box-shadow:0 4px 14px rgba(52,199,89,.28);}
.ai-cfg-btn-disable{background:#ff3b30;}
.ai-cfg-btn-disable:hover{background:#d8302a;box-shadow:0 4px 14px rgba(255,59,48,.28);}
.ai-cfg-btn-test{background:#007aff;}
.ai-cfg-btn-test:hover{background:#0066d6;box-shadow:0 4px 14px rgba(0,122,255,.28);}
.ai-cfg-status{margin-top:12px;padding:7px 11px;border-radius:8px;font-size:12px;background:rgba(0,0,0,.05);color:#6e6e73;transition:background .3s ease,color .3s ease;}
.ai-cfg-status.on{background:#e8f8ec;color:#1a7a37;font-weight:500;}`;

	const epInput = h('input', {
		className: 'ai-cfg-input',
		value: aiCfg.aiEndpoint || '',
		placeholder: 'https://api.deepseek.com'
	});
	const keyInput = h('input', {
		className: 'ai-cfg-input',
		type: 'password',
		value: aiCfg.aiApiKey || '',
		placeholder: 'sk-...'
	});
	const modelInput = h('input', {
		className: 'ai-cfg-input',
		value: aiCfg.aiModel || '',
		placeholder: 'deepseek-flash'
	});
	epInput.onchange = () => {
		aiCfg.aiEndpoint = epInput.value;
	};
	keyInput.onchange = () => {
		aiCfg.aiApiKey = keyInput.value;
	};
	modelInput.onchange = () => {
		aiCfg.aiModel = modelInput.value;
	};
	/**
	 * 配置可能被外部改写（桌面端共享配置同步、其它标签页），
	 * 输入框不回填的话用户看到的是旧值，一改动就把刚同步下来的配置覆盖掉。
	 * 正在输入的框跳过，避免打断打字。
	 */
	{
		const aiScript = CommonProject.scripts.aiSettings;
		const refreshInputs = () => {
			if (document.activeElement !== epInput) epInput.value = aiCfg.aiEndpoint || '';
			if (document.activeElement !== keyInput) keyInput.value = aiCfg.aiApiKey || '';
			if (document.activeElement !== modelInput) modelInput.value = aiCfg.aiModel || '';
		};
		const ids = state.setting.listenerIds;
		for (const key of ['aiEndpoint', 'aiApiKey', 'aiModel'] as const) {
			aiScript.offConfigChange(ids[key]);
			ids[key] = aiScript.onConfigChange(key, refreshInputs);
		}
		refreshInputs();
	}

	const enableBtn = h('button', { className: 'ai-cfg-btn ai-cfg-btn-enable' }, '启用');
	const disableBtn = h('button', { className: 'ai-cfg-btn ai-cfg-btn-disable' }, '禁用');
	const testBtn = h('button', { className: 'ai-cfg-btn ai-cfg-btn-test' }, '测试连接');
	const statusEl = h('div', { className: 'ai-cfg-status' }, '');

	const updateBtns = () => {
		const aws: any[] = CommonProject.scripts.settings.cfg.answererWrappers || [];
		const aiIdx = aws.findIndex((w) => w.name === 'AI答题');
		const hasAI = aiIdx !== -1;
		enableBtn.style.display = hasAI ? 'none' : 'block';
		disableBtn.style.display = hasAI ? 'block' : 'none';
		statusEl.textContent = hasAI
			? '● AI 答题已启用（模型 ' + (aiCfg.aiModel || '?') + '）'
			: '○ 未启用 —— 填好上面三项后点右侧「启用」才会开始答题';
		statusEl.classList.toggle('on', hasAI);
		if (hasAI && aiCfg.aiEndpoint && aiCfg.aiApiKey) {
			aws[aiIdx].url = normalizeAiEndpoint(aiCfg.aiEndpoint);
			aws[aiIdx].headers = aws[aiIdx].headers || {};
			aws[aiIdx].headers.Authorization = 'Bearer ' + aiCfg.aiApiKey;
		}
	};

	enableBtn.onclick = () => {
		const { aiEndpoint, aiApiKey, aiModel } = aiCfg;
		if (!aiEndpoint || !aiApiKey || !aiModel) {
			$modal.alert({ content: '请填写完整的 API 地址、API Key、模型名称' });
			return;
		}
		const fullEndpoint = normalizeAiEndpoint(aiEndpoint);
		const wrapper: AnswererWrapper = {
			name: 'AI答题',
			url: fullEndpoint,
			homepage: 'AI 大模型答题',
			method: 'post',
			type: 'GM_xmlhttpRequest',
			contentType: 'json',
			headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + aiApiKey },
			data: {
				model: aiModel,
				messages: buildAiMessages((aiCfg.referenceDocs as any) || []),
				temperature: 0,
				...aiThinkingPayload(aiEndpoint)
			},
			handler:
				'return (res)=>{ var c = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content; return [undefined, c ? String(c).trim() : undefined] }',
			inlineImages: true
		};
		const aws: any[] = CommonProject.scripts.settings.cfg.answererWrappers || [];
		CommonProject.scripts.settings.cfg.answererWrappers = [...aws.filter((w) => w.name !== 'AI答题'), wrapper];
		$message.success({ content: 'AI 答题已启用，刷新网页后生效' });
		updateBtns();
	};

	disableBtn.onclick = () => {
		CommonProject.scripts.settings.cfg.answererWrappers = (
			CommonProject.scripts.settings.cfg.answererWrappers || []
		).filter((w: any) => w.name !== 'AI答题');
		$message.success({ content: 'AI 答题已禁用' });
		updateBtns();
	};

	testBtn.onclick = async () => {
		const { aiEndpoint, aiApiKey, aiModel } = aiCfg;
		if (!aiEndpoint || !aiApiKey || !aiModel) {
			$modal.alert({ content: '请先填写完整的 API 地址、API Key、模型名称' });
			return;
		}
		const fullEndpoint = normalizeAiEndpoint(aiEndpoint);
		testBtn.textContent = '测试中...';
		testBtn.setAttribute('disabled', 'true');
		try {
			const ret = await aiTestConnection(fullEndpoint, aiApiKey, aiModel);
			if (ret.ok) {
				$message.success({ content: 'AI 连接成功！模型 ' + aiModel });
			} else if (ret.status === 0) {
				$message.error({
					content: 'AI 连接失败：网络错误 / 扩展无权访问该域名（' + fullEndpoint + '）。' + (ret.error || '')
				});
			} else {
				const bodyStr =
					typeof ret.body === 'string' ? ret.body.slice(0, 200) : JSON.stringify(ret.body || {}).slice(0, 200);
				$message.error({ content: 'AI 连接失败 [HTTP ' + ret.status + ']：' + bodyStr });
			}
		} catch (err) {
			$message.error({ content: 'AI 连接失败：' + ((err as any)?.message || String(err)) });
		} finally {
			testBtn.textContent = '测试连接';
			testBtn.removeAttribute('disabled');
		}
	};

	updateBtns();

	const refArea = createReferenceArea(() => {
		const aws: any[] = CommonProject.scripts.settings.cfg.answererWrappers || [];
		const aiIdx = aws.findIndex((w) => w.name === 'AI答题');
		if (aiIdx !== -1) {
			const next = [...aws];
			next[aiIdx] = {
				...next[aiIdx],
				data: { ...(next[aiIdx].data || {}), messages: buildAiMessages((aiCfg.referenceDocs as any) || []) }
			};
			CommonProject.scripts.settings.cfg.answererWrappers = next;
		}
	});

	return h('div', { className: 'ai-cfg-card' }, [
		h('style', aiCss),
		h('div', { className: 'ai-cfg-title' }, 'AI 答题配置'),
		h('div', { className: 'ai-cfg-desc' }, '兼容 OpenAI 接口格式，地址可只填域名（自动补全 /v1/chat/completions）。'),
		h('label', { className: 'ai-cfg-label' }, 'API 地址 (Endpoint)'),
		epInput,
		h('label', { className: 'ai-cfg-label' }, 'API Key'),
		keyInput,
		h('label', { className: 'ai-cfg-label' }, '模型名称 (Model)'),
		modelInput,
		h('div', { className: 'ai-cfg-btn-row' }, [enableBtn, disableBtn, testBtn]),
		statusEl,
		refArea
	]);
}

/**
 * 问题反馈面板：欢迎语 + 一整行两个入口 + 提示。
 * 宽度填满 .script-panel-body，与其他板块（首页各卡片、notes 提示区）保持一致；
 * 不要单独设固定宽度或 maxWidth，否则面板会被容器撑宽时它仍停在窄宽度上。
 */
const createFeedback = () =>
	h('div', { style: { width: '100%', fontSize: '12px', lineHeight: '1.6' } }, [
		h('div', {}, '遇到问题或有建议？欢迎到 GitHub 或 GitCode 提 Issue。'),
		issueButtons(),
		h('div', { className: 'secondary', style: { marginTop: '6px' } }, '附上平台、现象与「日志」报错能更快定位。')
	]);

const createGuide = () => {
	const showProjectDetails = (project: Project) => {
		$modal.simple({
			title: project.name,
			width: 800,
			content: h('div', [
				h('div', [
					'运行域名：',
					...(project.domains || []).map((d) =>
						h(
							'a',
							{ href: d.startsWith('http') ? d : 'https://' + d, target: '_blank', style: { margin: '0px 4px' } },
							d
						)
					)
				]),
				h('div', '脚本列表：'),
				h(
					'ul',
					Object.keys(project.scripts)
						.sort((a, b) => (project.scripts[b].hideInPanel ? -1 : 1))
						.map((key) => {
							const script = project.scripts[key];
							return h(
								'li',
								[
									h('b', script.name),
									$ui.notes([
										h('span', ['操作面板：', script.hideInPanel ? '隐藏' : '显示']),

										[
											'运行页面：',
											h(
												'ul',
												script.matches
													.map((m) => (Array.isArray(m) ? m : (['无描述', m] as [string, string | RegExp])))
													.map((i) =>
														h('li', [
															i[0],
															'：',
															i[1] instanceof RegExp ? i[1].toString().replace(/\\/g, '').slice(1, -1) : h('span', i[1])
														])
													)
											)
										]
									])
								],
								(li) => {
									li.style.marginBottom = '12px';
								}
							);
						}),
					(ul) => {
						ul.style.padding = '12px 24px';
						ul.style.border = '1px solid #e1e1e1';
						ul.style.borderRadius = '4px';
						ul.style.maxHeight = '400px';
						ul.style.overflow = 'auto';
						ul.style.paddingLeft = '42px';
					}
				)
			])
		});
	};

	const cardStyle: Partial<CSSStyleDeclaration> = {
		border: '1px solid #eee',
		borderRadius: '4px',
		padding: '8px',
		paddingTop: '4px'
	};

	/** 首页底部的官网 / 仓库入口，沿用面板里次级按钮的描边样式 */
	const linkChip = (label: string, url: string) =>
		h(
			'a',
			{
				href: url,
				target: '_blank',
				rel: 'noopener noreferrer',
				className: 'base-style-button-secondary',
				style: {
					margin: '4px',
					padding: '2px 8px',
					fontSize: '12px',
					lineHeight: '18px',
					textDecoration: 'none',
					display: 'inline-block'
				}
			},
			label
		);

	const aboutCard = h('div', { style: { ...cardStyle, marginTop: '8px' } }, [
		h('div', { style: { marginBottom: '4px', fontWeight: 'bold' } }, [
			'官网与源码仓库：',
			h(
				'span',
				{ className: 'secondary', style: { fontWeight: 'normal' } },
				'（桌面端下载、更新日志、问题反馈与平台适配建议）'
			)
		]),
		h('div', [
			linkChip('官方网站', OFFICIAL_SITE),
			linkChip('GitHub 仓库', GITHUB_REPO),
			linkChip('GitCode 镜像', GITCODE_REPO)
		])
	]);

	/**
	 * 首页的问题反馈入口：标题 / 说明 / 按钮各占一行。
	 * 按钮行单独成块且与文字分离，避免 inline-block 跟标题挤在一行后折行。
	 * 不设宽度，block 元素会跟平台卡片、aboutCard 一起自动填满 .user-guide。
	 */
	const feedbackCard = h('div', { style: { ...cardStyle, marginTop: '8px' } }, [
		h('div', { style: { marginBottom: '4px', fontWeight: 'bold' } }, '问题反馈'),
		h(
			'div',
			{ className: 'secondary', style: { fontSize: '12px', lineHeight: '1.6' } },
			'脚本不生效、漏题？欢迎到 GitHub 或 GitCode 提 Issue。'
		),
		issueButtons()
	]);

	const aiCfg = CommonProject.scripts.aiSettings.cfg;
	const aiConfigured = !!(aiCfg.aiEndpoint && aiCfg.aiApiKey && aiCfg.aiModel);
	/**
	 * 已经配了普通题库（非 AI）就不用再催「AI 尚未配置」：
	 * 普通题库本身就能答题，AI 只是可选的增强，继续显示引导卡片纯属噪音。
	 * 注意排除「AI答题」这条自动生成的包装，它存在说明走的就是 AI 配置本身。
	 */
	const bankCfg = CommonProject.scripts.settings.cfg;
	const enabledBanks = (bankCfg.answererWrappers || []).filter(
		(w) => w.name !== 'AI答题' && !(bankCfg.disabledAnswererWrapperNames || []).includes(w.name)
	);
	const aiGuideCard =
		!aiConfigured && enabledBanks.length === 0
			? h(
					'div',
					{
						style: {
							...cardStyle,
							marginBottom: '12px',
							background: 'linear-gradient(135deg, #f5f7fa, #eef4ff)',
							border: '1px solid rgba(0, 122, 255, 0.2)'
						}
					},
					[
						h(
							'div',
							{ style: { marginBottom: '6px', fontWeight: '600', fontSize: '14px', color: '#007aff' } },
							'AI 答题尚未配置'
						),
						h('div', { style: { color: '#6e6e73', fontSize: '12px', lineHeight: '1.6', marginBottom: '10px' } }, [
							'配置 AI API 后，插件将自动调用大模型完成答题。请按以下步骤操作：'
						]),
						h(
							'ol',
							{
								style: {
									color: '#1d1d1f',
									fontSize: '12px',
									lineHeight: '1.8',
									paddingLeft: '20px',
									margin: '0 0 12px'
								}
							},
							[
								h('li', [
									'前往 ',
									h('b', 'DeepSeek'),
									'（platform.deepseek.com）或 ',
									h('b', '硅基流动'),
									'（cloud.siliconflow.cn）等 API 提供商网站注册账号，创建 API Key'
								]),
								h('li', '点击下方按钮进入「AI 答题配置」面板'),
								h('li', '填写 API 地址（如 https://api.deepseek.com）'),
								h('li', '填写 API Key（如 sk-...）'),
								h('li', '填写模型名称（如 deepseek-flash）'),
								h('li', '点击「启用」按钮，刷新网页后生效')
							]
						),
						(() => {
							const btn = h('button', { className: 'base-style-button' }, '前往配置 AI 答题');
							btn.onclick = () => CommonProject.scripts.render.methods.pin(CommonProject.scripts.aiSettings);
							return btn;
						})()
					]
			  )
			: null;

	return h('div', { className: 'user-guide' }, [
		...(aiGuideCard ? [aiGuideCard] : []),
		h('div', { style: cardStyle }, [
			h('div', { style: { marginBottom: '4px', fontWeight: 'bold' } }, [
				'兼容的网课平台：',
				h('span', { className: 'secondary', style: { fontWeight: 'normal' } }, '（未适配的平台将无法运行，请等待适配）')
			]),

			h('div', [
				...[CXProject, ZHSProject, ZJYProject, IcveMoocProject, ICourseProject, YKTProject].map((project) => {
					const btn = h('button', { className: 'base-style-button-secondary', style: { margin: '4px' } }, [
						project.name
					]);
					btn.onclick = () => {
						showProjectDetails(project);
					};
					return btn;
				})
			])
		]),
		aboutCard,
		feedbackCard
	]);
};

function createSearchResultAlertElement(result: SimplifyWorkResult) {
	let info: HTMLElement | null = null;
	let err = result.error || result.searchInfos.find((i) => i.error)?.error;
	if (result.requested === false && result.resolved === false) {
		info = h('div', { className: 'result-info unresolved' }, '等待搜索中... ');
	} else if (err) {
		if (err?.includes('is not valid JSON')) {
			err = '题库返回数据错误';
		} else if (err?.includes('题库连接失败')) {
			err = '题库连接失败';
		}
		info = h('div', { className: 'result-info error' }, '' + err);
	} else if (result.searchInfos.length === 0) {
		info = h('div', { className: 'result-info no-answer' }, '题库没搜索到答案');
	} else {
		info = result.finish
			? null
			: result.resolved === false
			? h('div', { className: 'result-info unresolved' }, '等待顺序答题中... ')
			: h('div', { className: 'result-info error' }, '此题未完成, 可能是没有匹配的选项。');
	}

	return h('div', { className: 'alert-info-wrapper' }, [info ?? h('div')]);
}
