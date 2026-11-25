/** global Ext videojs getTeacherAjax jobs */

import { trustedDispatch, OrigEvent, trustedPointerClick, isChoiceSelected } from '../utils/safe-click';
import {
	HonghuWorker,
	defaultAnswerWrapperHandler,
	$,
	StringUtils,
	createDefaultQuestionResolver,
	AnswerWrapperHandlerConfig,
	DefaultWork,
	splitAnswer,
	domSearch,
	domSearchAll,
	SearchInformation
} from '@honghu/core';
import { $modal, h, $store, MessageElement, Project, Script, $el, $gm, $$el, $ui, cors, $message } from 'easy-us';

// 超星繁体字库随脚本打包，不再从 CDN 拉取
import cxFontTableRaw from '../resources/font/table.json?raw';

import { CommonProject } from './common';
import { workNotes, volume, playbackRate, dropdownStyle } from '../utils/configs';
import {
	answerWrapperEmptyWarning,
	commonWork,
	optimizationElementWithImage,
	removeRedundantWords,
	simplifyWorkResult
} from '../utils/work';
import md5 from 'md5';
// @ts-ignore
import Typr from 'typr.js';
import { $console, BackgroundProject } from './background';
import { CommonWorkOptions, playMedia } from '../utils';
import { answerVideoQuiz, VideoQuizStrategy } from '../utils/video-quiz';
import { waitForElement, waitForMedia } from '../utils/study';
import { setExtensionAutomation } from '../utils/automation-state';

// @ts-ignore
let top: Window = globalThis.top;

try {
	/**
	 *
	 *  将繁体字映射载入内存。
	 *  为什么不存 localStorage 和 GM_setValue
	 *  localStorage: 存在被检测风险，谁都能访问
	 *  GM_setValue: 文件太大影响I/O速度
	 */
	// @ts-ignore
	top.typrMapping = top.typrMapping || undefined;

	// @ts-ignore 任务点
	top.jobs = top.jobs || [];

	// @ts-ignore 当前视频
	top.currentMedia = top.currentMedia || undefined;

	// 加 try 是因为跨域面板无法操作
} catch {}

const state = {
	study: {
		videojs: Object.create({}),
		hacked: false,
		answererWrapperUnsetMessage: undefined as MessageElement | undefined,
		playbackRateWarningListenerId: 0
	}
};

type Attachment = {
	/** 只有当 module 为 音视频（并且已经播放完成）时才会有这个属性 */
	isPassed: boolean | undefined;
	/** 是否为任务点（音视频播放完成后此属性不存在） */
	job: boolean | undefined;
	/** 这里注意，如果当前章节测试不是任务点，则没有 jobid 或者未空字符串 */
	jobid?: string;
	property: {
		mid: string;
		/** 任务点id，固定存在 */
		_jobid: string;
		module: 'insertbook' | 'insertdoc' | 'insertflash' | 'work' | 'insertaudio' | 'insertvideo';
		name?: string;
		author?: string;
		bookname?: string;
		publisher?: string;
		title?: string;
	};
};

type Job = {
	mid: string;
	attachment: Attachment;
	func: { (): Promise<void> } | undefined;
};
export const CXProject = Project.create({
	name: '超星学习通',
	domains: [
		'chaoxing.com',
		'edu.cn',
		'org.cn',
		// 学银在线
		'xueyinonline.com',
		/** 其他域名 */
		'hnsyu.net',
		'qutjxjy.cn',
		'ynny.cn',
		'hnvist.cn',
		'fjlecb.cn',
		'gdhkmooc.com',
		'cugbonline.cn',
		'zjelib.cn',
		'cqrspx.cn',
		'neauce.com',
		'zhihui-yun.com',
		'cqie.cn',
		'ccqmxx.com',
		'jxgmxy.com',
		'jnzyjsxy.cn',
		// 超星学习通PPT，2025下半年更新的PTT图书新域名
		'sslibrary.com',
		// 26年新增官方域名
		'xuexi365.com'
	],
	scripts: {
		/**
		 * 创建超星独立脚本防止污染其他脚本环境
		 */
		env: new Script({
			name: '环境准备脚本',
			matches: [['所有页面', /.*/]],
			hideInPanel: true,
			onstart() {
				/**
				 * 于 4.9.20 后更新，出现顶层套壳页面跨域 :
				 * top : zjelib.cn <body>
				 * iframe : mooc1.xxx.zjelib.cn/.../mycourse/studentstudy/...  <iframe src=....>
				 * 导致top指向zjelib跨域无法访问，所以这里尝试寻找真正的top窗口对象，只有域名中包含 /mycourse/studentstudy 才是可操作的 top
				 */
				try {
					let _self = self;
					let _try_count = 10;
					while (_self.parent !== undefined && _try_count > 0) {
						if (_self.location.href.includes('/mycourse/studentstudy')) {
							top = _self;
							console.log('[honghu] top change to ' + top.location.href);
							break;
						} else {
							_try_count--;
							// @ts-ignore
							_self = _self.parent;
						}
					}
				} catch (e) {
					console.warn('[honghu] fail of find top');
					console.warn(e);
					// @ts-ignore
					top = globalThis.top;
				}
			}
		}),
		guide: new Script({
			name: '使用提示',
			matches: [
				['首页', 'https://www.chaoxing.com'],
				['旧版个人首页', 'chaoxing.com/space/index'],
				['新版个人首页', 'chaoxing.com/base'],
				['学习页面', 'chaoxing.com/mycourse'],
				['新版学习页面', 'chaoxing.com/mooc2-ans/mycourse']
			],
			namespace: 'cx.guide',
			configs: {
				notes: {
					defaultValue: `请手动进入视频、作业、考试页面，脚本会自动运行。`
				}
			},
			oncomplete() {
				if (['mycourse/studentstudy'].some((path) => location.href.includes(path))) {
					$message.success('已进入学习页面，请等待自动运行...');
					return;
				}
				$message.info('请手动进入视频、作业、考试页面，脚本会自动运行。');
			}
		}),
		study: new Script({
			name: '课程学习',
			namespace: 'cx.new.study',
			matches: [
				['任务点页面', '/knowledge/cards'],
				['阅读任务点', '/readsvr/book/mooc']
				// 旧版浏览器好像不能识别二级 iframe ， 所以不能使用 'work/doHomeWorkNew' 以及其他二级 iframe 来触发路由
			],
			configs: {
				notes: {
					defaultValue: $ui.notes([
						['任务点不是顺序执行，如果某一个任务没有动', '请查看是否有其他任务正在学习，耐心等待即可。'],
						'闯关模式请注意题库如果没完成，需要自己完成才能解锁章节。',
						'请勿凌晨刷课，部分学校课程可能会清空进度。',
						['目前超星倍速风控严重，如果高倍速', '完成后被清空还原，请调到1-2倍速学习！']
					]).outerHTML
				},
				playbackRate: playbackRate,
				volume: volume,
				videoQuizStrategy: {
					label: '视频内题目',
					tag: 'select',
					options: [
						['ai', 'AI题库答题', '连接题库（含AI答题）自动选择答案，题库未匹配时随机作答'],
						['random', '随机答题'],
						['ignore', '忽略']
					],
					attrs: {
						title:
							'视频有时在学习过程中会弹出题目，这个好像并不计算在分数内，所以可以忽略，视频可以正常观看。选择 AI题库答题 需要先在 通用-全局设置 中配置题库或 AI 答题。'
					},
					defaultValue: 'random' as VideoQuizStrategy
				},
				mode: {
					label: '跳转模式',
					tag: 'select',
					options: [
						['next', '完成后跳转下一节', '完成小节后，自动点击下一节按钮'],
						['job', '完成后跳转未完成任务点', '如果未找到任务点，则会直接结束脚本运行，目前处于试验阶段。'],
						['manually', '完成后暂停，等待手动跳转', '适用于自己手动运行']
					],
					defaultValue: 'next' as 'next' | 'job' | 'manually'
				},
				autoJumpToUnFinishJob: {
					label: '自动切换未完成章节',
					attrs: { type: 'checkbox', title: '在自动学习前寻找未完成章节并跳转（积分课、智慧课程：推荐关闭）' },
					defaultValue: true
				},
				restudy: {
					label: '复习模式',
					attrs: { title: '已经完成的视频继续学习', type: 'checkbox' },
					defaultValue: false
				},
				forceLearn: {
					label: '强制学习',
					attrs: {
						title: '视频一般分为：非任务点、任务点、和已完成任务点，当遇到“非任务点”时需要开启此选项才会进行学习',
						type: 'checkbox'
					},
					defaultValue: false
				},
				backToFirstWhenFinish: {
					label: '完成全部后重新学习',
					attrs: {
						type: 'checkbox',
						title: '当章节已经学习完成至最后一章时，跳转到第一个章节重新开始学习。'
					},
					defaultValue: false
				},
				showTextareaWhenEdit: {
					label: '编辑时显示自定义编辑框',
					attrs: {
						type: 'checkbox',
						title:
							'超星默认禁止在编辑框中复制粘贴，开启此选项可以在文本框编辑时生成一个自定义编辑框进行编辑，脚本会将内容同步到编辑框中。'
					},
					defaultValue: true
				},
				notifyWhenHasFaceRecognition: {
					label: '出现人脸识别时通知我',
					attrs: {
						type: 'checkbox'
					},
					defaultValue: true
				},
				enables: {
					...dropdownStyle,
					label: '高级设置',
					attrs: { type: 'checkbox' },
					defaultValue: false
				},
				/**
				 *
				 * 开启的任务点
				 *
				 * media : 音视频
				 * ppt : 文档和书籍翻阅
				 * test : 章节测试
				 * read : 阅读
				 * live : 直播课
				 *
				 */
				enableMedia: {
					elementClassName: 'config-details',
					showIf: 'cx.new.study.enables',
					label: '视频/音频自动播放',
					attrs: { type: 'checkbox', title: '开启：音频和视频的自动播放' },
					defaultValue: true
				},
				enablePPT: {
					elementClassName: 'config-details',
					showIf: 'cx.new.study.enables',
					label: 'PPT/书籍自动完成',
					attrs: { type: 'checkbox', title: '开启：PPT/书籍自动翻阅' },
					defaultValue: true
				},
				enableChapterTest: {
					elementClassName: 'config-details',
					showIf: 'cx.new.study.enables',
					label: '章节测试自动答题',
					attrs: { type: 'checkbox', title: '开启：章节测试自动答题' },
					defaultValue: true
				},
				/**
				 * 不及格重做的总开关（章节测验）
				 *
				 * 关掉后提交不及格就停在结果页，不再刷新重做 —— 有些人只想跑一遍，
				 * 或者 AI 反复给同一组错答案时不想被反复刷新打断。
				 */
				enableChapterRedo: {
					elementClassName: 'config-details',
					showIf: 'cx.new.study.enables',
					label: '不及格时 AI 整卷重做',
					attrs: {
						type: 'checkbox',
						title: '开启：章节测验未达到及格线时，把整卷和历次答案发给 AI 重做并重新提交（需先启用「AI答题」）'
					},
					defaultValue: true
				},
				enableHyperlink: {
					elementClassName: 'config-details',
					showIf: 'cx.new.study.enables',
					label: '链接任务自动完成',
					attrs: { type: 'checkbox', title: '开启：链接任务自动完成' },
					defaultValue: true
				}
			},
			onrender({ panel }) {
				if (!CommonProject.scripts.settings.cfg.answererWrappers?.length) {
					answerWrapperEmptyWarning(10);
				}

				// 高倍速警告
				this.offConfigChange(state.study.playbackRateWarningListenerId);
				state.study.playbackRateWarningListenerId =
					this.onConfigChange('playbackRate', (playbackRate) => {
						if (playbackRate > 2) {
							$modal.alert({
								title: '高倍速警告',
								content: $ui.notes([
									'高倍速可能导致学习记录清空/回退',
									'超星后台可以看到学习时长，请谨慎设置',
									'如已清空/回退，请降低倍速至1-2倍'
								]),
								maskCloseable: false,
								confirmButtonText: '我已知晓风险'
							});
						}
					}) || 0;
			},
			// 这里不使用 oncompelete ，如果某个资源一直在加载中，就会导致 oncomplete 一直无法触发，导致脚本无法运行，所以改为 onactive 只要匹配上就会触发
			async onactive() {
				/** iframe 跨域问题， 必须在 iframe 中执行 ， 所以脱离学习脚本运行。 */
				if (/\/readsvr\/book\/mooc/.test(location.href)) {
					// 26年上半学期新阅读任务点，计时翻页，达到一定时间才能翻下一页，这里等待时间然后执行翻页完成任务。
					if (document.querySelector('#reader')) {
						// @ts-ignore
						require(['reader'], (_reader) => {
							waitForElement('.readerPager').then(() => {
								setTimeout(async () => {
									const jumper = document.querySelector<HTMLSelectElement>('#pagejump');
									if (_reader?.goPage && jumper) {
										// 等待时间
										const timing = parseInt(new URL(location.href).searchParams.get('timing')?.toString() || '60') + 3;
										console.log(timing);
										await $.sleep(timing * 1000);
										/**
											 *  1:书名页
												2:版权页
												3:前言页
												4:目录页
												5:正文275页
												7:封底页
											*/
									jumper.value = '5';
									trustedDispatch(jumper, new OrigEvent('change', { composed: true }));
									console.log('已跳转正文页');
									await $.sleep(timing * 1000);
									jumper.value = '7';
									trustedDispatch(jumper, new OrigEvent('change', { composed: true }));
										console.log('已跳转封底页');
										await $.sleep(timing * 1000);
										Array.from(document.querySelectorAll<HTMLElement>('.readerPager'))
											.filter((el) => el.style.zIndex === '101')[0]
											.click();
										console.log('阅读完成');
									}
								}, 3000);
							});
						});
					}
					// 普通阅读任务点，id 是 #ReadWeb
					else {
						$console.log('正在完成书籍/PPT...');
						setTimeout(() => {
							// @ts-ignore
							// eslint-disable-next-line no-undef
							readweb.goto(epage);
						}, 5000);
					}
					return;
				}

				// 主要处理
				if (/\/knowledge\/cards/.test(location.href)) {
					const updateMediaState = () => {
						// @ts-ignore
						if (top.currentMedia) {
							// @ts-ignore 倍速设置
							top.currentMedia.playbackRate = parseFloat(this.cfg.playbackRate.toString());
							// @ts-ignore 音量设置
							top.currentMedia.volume = this.cfg.volume;
						}
					};

					this.onConfigChange('playbackRate', updateMediaState);
					this.onConfigChange('volume', updateMediaState);

					setExtensionAutomation(true, '超星课程学习');
					try {
						await study({
							...this.cfg,
							playbackRate: parseFloat(this.cfg.playbackRate.toString()),
							workOptions: CommonProject.scripts.settings.methods.getWorkOptions()
						});
					} finally {
						setExtensionAutomation(false, '超星课程学习');
					}
				}
			}
		}),
		work: new Script({
			name: '作业考试脚本',
			matches: [
				['作业页面', '/mooc2/work/dowork'],
				['考试整卷预览页面', '/mooc2/exam/preview']
			],
			namespace: 'cx.new.work',
			configs: {
				notes: workNotes,
				/**
				 * 不及格重做（作业）
				 *
				 * 作业答完会先自动提交、读分数；低于及格线且配置了「AI答题」时，
				 * 把整卷（题干 + 选项 + 上次答案）发给 AI 重做，再提交，最多 5 轮。
				 * 没有配置 AI 答题时保持原来的行为：只作答，不自动提交。
				 */
				aiRedoOnFail: {
					label: '不及格时 AI 整卷重做',
					attrs: {
						type: 'checkbox',
						title: '作业提交后若低于及格线，把整卷和上次答案一起发给 AI 重做并重新提交，最多 5 轮（需先在通用设置里启用 AI 答题）'
					},
					defaultValue: true
				},
				passScore: {
					label: '及格线（分）',
					attrs: { type: 'number', min: '0', max: '100', step: '1' },
					defaultValue: 60
				},
				aiRedoRounds: {
					label: '最多重做轮数',
					attrs: { type: 'number', min: '0', max: '5', step: '1' },
					defaultValue: 5
				}
			},
			async oncomplete() {
				const isExam = /\/exam\/preview/.test(location.href);
				commonWork(this, {
					workerProvider: (opts) => workOrExam(isExam ? 'exam' : 'work', { ...opts, preview_mode: true }),
					enable_control_panel: true
				});
			}
		}),
		autoRead: new Script({
			name: '自动阅读',
			matches: [
				['阅读页面', '/ztnodedetailcontroller/visitnodedetail'],
				['课程目录', /chaoxing.com\/course\/\d+\.html/],
				['课程目录', /chaoxing.com\/mooc-ans\/course\/\d+\.html/],
				['积分课阅读课程目录', '/mooc-ans/zt/portal']
			],
			namespace: 'cx.new.auto-read',
			configs: {
				notes: {
					defaultValue: $ui.notes(['点击任意章节开始自动阅读', '阅读任务次日才会统计阅读时长']).outerHTML
				},
				restartAfterFinish: {
					label: '无限阅读',
					attrs: { type: 'checkbox', title: '阅读完成最后一章后从头第一章继续阅读' },
					defaultValue: false
				}
			},
			oncomplete() {
				// 置顶
				CommonProject.scripts.render.methods.pin(this);
				$message.info('请手动点击任意章节开始自动阅读');

				// 自动进入章节功能，如果不是阅读页面则自动进入
				if (location.href.includes('/ztnodedetailcontroller/visitnodedetail') === false) {
					startAtFirst();
					return;
				}

				let top = 0;
				const interval = setInterval(() => {
					top += (document.documentElement.scrollHeight - window.innerHeight) / 60;
					window.scrollTo({
						behavior: 'smooth',
						top: top
					});
				}, 1000);

				setTimeout(() => {
					clearInterval(interval);
					// 下一页
					const next = $el('.nodeItem.r i');
					if (next) {
						next.click();
					} else {
						if (this.cfg.restartAfterFinish) {
							setTimeout(() => startAtFirst(), 3000);
							$message.info({ content: '即将重新从头开始阅读', duration: 10 });
							$console.log('即将重新从头开始阅读');
						} else {
							$message.success({ content: '阅读任务已完成', duration: 0 });
							$console.log('未检测到下一页');
						}
					}
				}, (60 + 3) * 1000);

				// 点击第一个章节
				function startAtFirst() {
					const texts = $$el('.course_section .chapterText');
					if (texts.length) {
						texts[0].click();
					}
				}
			}
		}),
		/**
		 * 有时候进入课程会默认在，任务页面，会出现任务为空，部分用户会以为没有章节任务，所以添加此脚本
		 */
		pageRedirect: new Script({
			name: '章节页面自动切换脚本',
			matches: [['课程任务页面', 'pageHeader=0']],
			hideInPanel: true,
			async oncomplete() {
				if (top === window) {
					const a = document.querySelector<HTMLElement>('a[title="章节"]');
					if (a) {
						await $.sleep(1000);
						// 跳转到最新版本的超星
						a.click();
						$message.info({
							content: '已经为您自动切换到章节列表页面，手动进入任意章节即可开始自动学习！'
						});
					}
				}
			}
		}),
		versionRedirect: new Script({
			name: '版本切换脚本',
			matches: [
				['', 'mooc2=0'],
				['', 'mycourse/studentcourse'],
				['', 'work/getAllWork'],
				['', 'work/doHomeWorkNew'],
				['', 'exam/test\\?']
			],
			hideInPanel: true,
			async oncomplete() {
				if (top === window) {
					$message.warn({
						content:
							'鸿鹄易学不支持旧版超星, 即将切换到超星新版, 如有其他第三方插件请关闭, 可能有兼容问题导致频繁切换。',
						duration: 0
					});
					// 跳转到最新版本的超星
					await $.sleep(2000);

					// 检测是否有人脸识别
					await waitForFaceRecognition();

					const experience = document.querySelector('.experience') as HTMLElement;
					if (experience) {
						experience.click();
					} else {
						const newUrl = new URL(window.location.href);
						if (window.location.href.includes('mooc-ans/mycourse/studentstudy')) {
							newUrl.pathname = '/mycourse/studentstudy';
						}
						const params = newUrl.searchParams;
						let changed = false;
						if (params.get('mooc2') !== '1') {
							params.set('mooc2', '1');
							changed = true;
						}

						// 兼容考试切换
						if (params.get('newMooc') !== 'true') {
							params.set('newMooc', 'true');
							changed = true;
						}
						if (changed) window.location.replace(newUrl);
					}
				}
			}
		}),
		examRedirect: new Script({
			name: '考试整卷预览脚本',
			matches: [
				['新版考试页面', 'exam-ans/exam/test/reVersionTestStartNew'],
				// 2023/9月 新增
				['新版考试页面2', 'mooc-ans/exam/test/reVersionTestStartNew']
			],
			hideInPanel: true,
			oncomplete() {
				if ($gm.unsafeWindow.document.querySelector('.mark_info')?.textContent?.includes('不允许整卷预览')) {
					$message.warn({
						content: $ui.notes([
							'由于当前考试禁止整卷预览，各题为独立新页面，只能一个个答题',
							'在考完前禁止手动切换题目，否则会导致重复答题！',
							'完成后或者开考前请手动删除搜索结果！',
							'想加快速度请更改通用-全局设置-高级设置-搜题间隔，设置为 1-3 秒即可。'
						]),
						duration: 0
					});
					const isExam = /\/exam\/test/.test(location.href);
					const workOptions = CommonProject.scripts.settings.methods.getWorkOptions();
					commonWork(CXProject.scripts.work, {
						// 因为超星是每个题目一个页面，这里加快开始速度，避免等待，默认5秒，这里加快为默认3秒间隔
						start_delay_seconds: workOptions.period,
						enable_control_panel: true,
						workerProvider: (opts) => workOrExam(isExam ? 'exam' : 'work', { ...opts, preview_mode: false, thread: 1 })
					});
					return;
				}
				$message.info({ content: '即将跳转到整卷预览页面进行考试。' });
				setTimeout(() => $gm.unsafeWindow.topreview(), 3000);
			}
		}),
		rateHack: new Script({
			name: '屏蔽倍速限制',
			hideInPanel: true,
			matches: [['', '/ananas/modules/video/']],
			onstart() {
				rateHack();
			}
		}),
		copyHack: new Script({
			name: '屏蔽复制粘贴限制',
			hideInPanel: true,
			matches: [['所有页面', /.*/]],
			methods() {
				return {
					/** 解除输入框无法复制粘贴 */
					hackEditorPaste() {
						try {
							const instants = $gm.unsafeWindow?.UE?.instants || [];
							for (const key in instants) {
								const ue = instants[key];

								/**
								 * 新建一个文本框给用户编辑，然后同步到超星编辑器，防止http下浏览器无法读取剪贴板
								 */

								// eslint-disable-next-line no-proto
								if (ue?.textarea) {
									ue.body.addEventListener('click', async () => {
										// http 下无法读取剪贴板，通过弹窗让用户输入然后同步到编辑器
										if (CXProject.scripts.study.cfg.showTextareaWhenEdit) {
											const defaultText = h('span', { innerHTML: ue.textarea.value }).textContent;
											$modal.prompt({
												content:
													'请在此文本框进行编辑，防止超星无法复制粘贴。(如需关闭请前往设置: 课程学习-编辑时显示自定义编辑框)',
												width: 800,
												inputDefaultValue: defaultText || '',
												modalInputType: 'textarea',
												onConfirm: (val = '') => {
													ue.setContent(
														val
															.split('\n')
															.map((line) => `<p>${line}</p>`)
															.join('')
													);
												}
											});
										}
									});

									if ($gm.unsafeWindow.editorPaste) {
										ue.removeListener('beforepaste', $gm.unsafeWindow.editorPaste);
									}
									if ($gm.unsafeWindow.myEditor_paste) {
										ue.removeListener('beforepaste', $gm.unsafeWindow.myEditor_paste);
									}
								}
							}
						} catch {}
					}
				};
			},
			oncomplete() {
				const hackInterval = setInterval(() => {
					if (typeof $gm.unsafeWindow.UE !== 'undefined') {
						clearInterval(hackInterval);
						this.methods.hackEditorPaste();
						console.log('已解除输入框无法复制粘贴限制');
					}
				}, 500);
			}
		}),
		studyDispatcher: new Script({
			name: '课程学习调度器',
			matches: [['课程学习页面', '/mycourse/studentstudy']],
			namespace: 'cx.new.study-dispatcher',
			hideInPanel: true,
			async oncomplete() {
				CommonProject.scripts.render.methods.pin(CXProject.scripts.study);

				let chapters = await CXAnalyses.waitForChapterInfos();
				traceRedo(`调度器启动：目录 ${chapters.length} 条`);
				/**
				 * 目录判定快照（排查用）
				 *
				 * 完成态判定出问题时会表现为「某些小节永远不被进入」，而现场只有用户那台机器有数据。
				 * 把每条小节的 `计数 / 完成图标 / 状态文字` 一起记下来：`count>0` 是未完成，
				 * `done` 是平台打的完成图标。两者冲突（count>0 且 done）正是「视频完成、测验未做」
				 * 的小节，也是之前被误判成已完成、永远跳不到测验的那一类。
				 */
				const unfinishedNow = chapters.filter((chapter) => CXAnalyses.isChapterUnfinished(chapter));
				traceRedo(
					`判定未完成 ${unfinishedNow.length}/${chapters.length}：` +
						unfinishedNow
							.slice(0, 12)
							.map(
								(chapter) =>
									`${chapter.title || chapter.chapterId}(count=${chapter.unFinishCount}${
										chapter.done ? ',icon' : ''
									})`
							)
							.join(' / ')
				);

				const params = new URLSearchParams(window.location.search);
				const mooc = params.get('mooc2');
				/** 切换新版 */
				if (mooc === null) {
					params.set('mooc2', '1');
					/**
					 * 必须带上 pathname
					 *
					 * `params.toString()` 只是 query string，直接丢给 `location.replace` 会被当成
					 * **相对地址**，导航到 `/mycourse/chapterId=...&mooc2=1` 这种不存在的路径，
					 * 平台再一重定向 —— 用户看到的就是「明明点了这一节，却被送到别的课去了」。
					 * 另外不要再 `decodeURIComponent`：`enc`、`openc` 这类参数本身是编码过的，
					 * 解一次再拼回去会破坏服务端签名。
					 */
					window.location.replace(window.location.pathname + '?' + params.toString());
					return;
				}

				/**
				 * 重做接力：刷新前记下的测验小节，刷新后先回到它
				 *
				 * 否则下面的 `autoJumpToUnFinishJob` 会按「目录里第一个未完成」跳走，
				 * 刚刷新就被带走，测验永远轮不到 —— 这也是「刷新后跑到上一节」的原因之一。
				 */
				const redoPlanOnLoad = readRedoPlan();
				const redoChapter =
					redoPlanOnLoad && redoPlanOnLoad.chapterId
						? chapters.find((chapter) => chapter.chapterId === redoPlanOnLoad.chapterId)
						: undefined;
				if (redoChapter) {
					traceRedo(
						`刷新后接力：目标小节 ${redoChapter.chapterId}，当前${
							CXAnalyses.isChapterActive(redoChapter) ? '已在' : '不在'
						}该节`
					);
					if (!CXAnalyses.isChapterActive(redoChapter)) {
						$console.info(`重做接力：回到测验所在小节 ${redoChapter.title || redoChapter.chapterId}`);
						CXAnalyses.clickChapter(redoChapter);
						/** 点目录项会整页重载，后面的代码不会执行；新页面会重新走一遍接力 */
						await $.sleep(1500);
						return;
					}

					/**
					 * 主动切到「学习测验」标签
					 *
					 * 只 `return` 是不行的：调度器只负责回到小节，没人会替我们打开测验，
					 * 结果就是「刷新后停在视频页」或者被当成已完成直接跳过。
					 */
					const quizTab = Array.from(
						document.querySelectorAll<HTMLElement>('#prev_tab .prev_ul li')
					).find((li) => /测验/.test(li.getAttribute('title') || ''));
					if (quizTab && !quizTab.classList.contains('active')) {
						$console.info('重做接力：打开「学习测验」标签');
						traceRedo('打开学习测验标签');
						quizTab.click();
						await $.sleep(2000);
					} else {
						traceRedo(quizTab ? '测验标签已激活' : '本节没有找到测验标签');
					}
					return;
				}

				/**
				 * 当前小节还有任务点没做完 → 留在原地，别跳走
				 *
				 * 两条判据任一成立就留守：
				 *  1. 目录里这一条还有剩余任务点 —— **计数优先，不信完成图标**
				 *     （平台会给「视频做完、测验没做」的小节打上 `icon_Completed`）；
				 *  2. 任务点栏显示当前还没走到最后一个任务点。
				 *
				 * 以前只判 2：页面刚加载、任务点栏还没渲染时 `isInFinalTab()` 会返回 true，
				 * 于是刚进来就被下面的 `autoJumpToUnFinishJob` 拽到别的章节去了。
				 */
				const waitTaskTabs = async (timeout = 6000) => {
					const deadline = Date.now() + timeout;
					while (Date.now() < deadline) {
						try {
							if ((top?.document.querySelectorAll('#prev_tab .prev_ul li') || []).length > 0) return true;
						} catch {}
						await $.sleep(300);
					}
					return false;
				};
				await waitTaskTabs();
				/**
				 * 认「当前小节」：优先用平台自己的隐藏域 `#curChapterId`
				 *
				 * `isChapterActive` 只看 `posCatalog_active`，两代目录里 active 类可能挂在
				 * 别的祖先上（`li.active`、`chapter_item.active`），一旦认不出来，
				 * 下面的 autoJump 就把人正在看的、明明还没学完的小节抢走 ——
				 * 用户看到的就是「我选的是没完成的课，却给我跳到别的课」。
				 * `#curChapterId` 是平台自己写的当前小节 id，比任何 CSS 类都准。
				 *
				 * 页面刚打开时这个隐藏域可能**还没写入**（平台是异步初始化目录的），
				 * 这时直接去判「当前在哪一节」必然认不出来，所以要等一会儿。
				 */
				const waitCurChapter = async (timeout = 5000) => {
					const deadline = Date.now() + timeout;
					while (Date.now() < deadline) {
						const id = $el<HTMLInputElement>('#curChapterId', top?.document)?.value || '';
						if (id) return id;
						await $.sleep(300);
					}
					return '';
				};
				const curChapterId = await waitCurChapter();
				const activeChapter =
					(curChapterId ? chapters.find((chapter) => chapter.chapterId === curChapterId) : undefined) ||
					chapters.find((chapter) => CXAnalyses.isChapterActive(chapter));

				/**
				 * 认不出当前小节 → 什么都不做
				 *
				 * 这是「页面刚打开、脚本刚开始跑就自动定位到别的节」的最后一道闸：
				 * 没有当前节就没有「留守」的依据，继续往下走只会按目录盲挑一个目标跳过去。
				 * 宁可停在原地（用户自己点一下就正常了），也不能把人正在看的小节扔掉。
				 */
				if (!activeChapter) {
					const msg = `认不出当前小节（cur=${curChapterId || '空'}），不做自动切换`;
					$console.warn('[自动刷课] ' + msg);
					traceRedo(msg);
					return;
				}
				if (CXAnalyses.isChapterUnfinished(activeChapter) || !CXAnalyses.isInFinalTab()) {
					const msg = `当前小节还没学完，留在：${activeChapter.title || activeChapter.chapterId}`;
					$console.info('[自动刷课] ' + msg);
					traceRedo(msg);
					return;
				}

				/**
				 * URL 里已经点名了某一节 → 不自动切换
				 *
				 * 用户从目录点的每一节、以及平台「下一节」跳转，URL 都带 `chapterId=…`。
				 * 这种「有人明确指定了位置」的情况下再按目录挑一个「未完成」的跳过去，
				 * 等于把人正在学的节扔掉 —— 这就是「跳到别的课」的直接原因。
				 * 推进交给平台「下一节」，autoJump 只在真正没指定小节时（从课程页进来）生效。
				 */
				const urlChapterId = (() => {
					try {
						return new URL(location.href).searchParams.get('chapterId') || '';
					} catch {
						return '';
					}
				})();
				if (urlChapterId && chapters.some((chapter) => chapter.chapterId === urlChapterId)) {
					traceRedo(`已指定小节 ${urlChapterId}，不做自动切换`);
					return;
				}

				// 寻找需要运行的任务
				if (CXProject.scripts.study.cfg.autoJumpToUnFinishJob) {
					// 只留真的还有活干的（读完计数读状态，读不到的既不算完成也不算未完成）
					chapters = chapters.filter((chapter) => CXAnalyses.isChapterUnfinished(chapter));

					if (chapters.length === 0) {
						$message.warn({ content: '页面任务点数量为空! 请刷新重试!' });
					} else {
						/**
						 * 只保留最细层级（`1.7.3`）
						 *
						 * 平台把「章 1.7」「节 1.7.1」「小节 1.7.3」混在同一个列表里，
						 * 挑到章节点点下去会被带到该章第一节 —— 用户看到的就是
						 * 「明明选的是 1.7.3，却跳到了别的节」。按编号段数取最深那层最稳。
						 */
						const maxDepth = Math.max(...chapters.map((chapter) => chapter.depth || 0));
						if (maxDepth > 1) {
							chapters = chapters.filter((chapter) => (chapter.depth || 0) === maxDepth);
						}
						/**
						 * 优先「当前小节之后」的未完成章节
						 *
						 * 直接取 `chapters[0]` 是目录里第一个未完成的，人学到 1.7 时
						 * 前面 1.2 没做完就会被拉回去（用户报的「一进去就往前跳」）。
						 * 后面没有未完成的（已经在尾部，前面有漏）再回头补。
						 */
						const current = chapters.find((chapter) => chapter.chapterId === curChapterId);
						const after = current
							? chapters.filter(
									(chapter) =>
										chapter.rank > current.rank ||
										(chapter.rank === current.rank && chapter.order > current.order)
							  )
							: [];
						const target = after[0] || chapters[0];
						//  进入需要进行的章节，并且当前章节未被选中
						if (!CXAnalyses.isChapterActive(target)) {
							/**
							 * 直接点目录项，不再调页面全局 `getTeacherAjax`：
							 * 新版目录的 onclick 是 `toOld(...)`，根本没有这个函数。
							 */
							const msg = `自动切换到未完成小节：${target.title || target.chapterId}`;
							$console.info('[自动刷课] ' + msg);
							traceRedo(msg);
							CXAnalyses.clickChapter(target);
						}
						await $.sleep(1000);
					}
				}

				// 自动滚动
				await $.sleep(1000);
				CXAnalyses.scrollToActiveChapter();
			}
		}),
		cxSecretFontRecognize: new Script({
			name: '繁体字识别',
			hideInPanel: true,
			matches: [
				['题目页面', 'work/doHomeWorkNew'],
				['考试整卷预览', '/mooc2/exam/preview'],
				['作业', '/mooc2/work/dowork']
			],
			async oncomplete() {
				await mappingRecognize();
			}
		}),
		// 积分课提示
		jfkGuide: new Script({
			name: '积分课使用提示',
			matches: [['积分课页面', '/plaza']],
			namespace: 'cx.jfk.guide',
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'积分课请进入课程后，开启复习模式，并且关闭自动下一章',
						'课程完成后请手动切换，如果由脚本进行自动跳转会出现乱跳转的可能。'
					]).outerHTML
				}
			},
			oncomplete(...args) {
				CommonProject.scripts.render.methods.pin(this);
			}
		})
	}
});

/**
 * 作业「不及格 → AI 整卷重做」的跨刷新现场
 *
 * 存 sessionStorage（同标签页刷新后仍在，关标签页即失效），
 * 避免把上一份作业的答案带到下一份作业。
 */
const WORK_REDO_KEY = 'cx.work.aiRedo';

interface WorkRedoPlan {
	/** 已经用掉的轮数（0 = 还没重做过） */
	round: number;
	/** 题目题干 → 该轮要用的答案 */
	answers: Record<string, string>;
	/** 每轮读到的分数，便于日志与排查 */
	scores: number[];
	/** 测验所属小节 id：刷新后用它回到这一节，不要跳到别处 */
	chapterId?: string;
	/** 写入时间：太久远的计划视为残留，避免一直把页面拽回旧测验 */
	ts?: number;
	/**
	 * 历次作答记录（不含当前这轮）
	 *
	 * 只发上一轮的话，AI 看不到自己前几轮给过什么，很容易反复给同一组错误答案，
	 * 重做三轮等于做了一遍。把历史一起发给它，并明确「这些都不对」。
	 */
	history?: { round: number; answers: Record<string, string> }[];
	/**
	 * 待重做标记：刷新前只存了整卷快照，答案还没算
	 *
	 * 这样提交一判不及格就能立刻刷新，不必把页面干等在结果页上看 AI 算 10 秒；
	 * 新页面在测验页里重算，用户感知是「提交完马上回到测验」。
	 */
	pending?: boolean;
	/** 刷新前抓的整卷快照，pending 时由新页面拿去问 AI */
	paper?: PaperQuestion[];
	/**
	 * 只重做这些题干（平台批改能指出错题时才有）
	 *
	 * 非空表示「部分重做」：名单外的题上次是对的，作答时**一个字都不要动**，
	 * 免得把蒙对的答案改坏。为空则整卷重做。
	 */
	onlyTitles?: string[];
}

/** 把当前这轮的答案归档进 history（写给下一轮用） */
function archiveRedoHistory(plan: WorkRedoPlan | undefined): { round: number; answers: Record<string, string> }[] {
	const history = [...(plan?.history || [])];
	if (plan && plan.answers && Object.keys(plan.answers).length) {
		history.push({ round: plan.round || 0, answers: plan.answers });
	}
	/** 只留最近 4 轮，避免计划无限膨胀 */
	return history.slice(-4);
}

/** 重做计划的有效期（分钟）：超过就当成残留，别再把学习页拽回旧测验 */
const REDO_PLAN_TTL_MS = 20 * 60 * 1000;

/** 诊断轨迹的存储键（只写不读，供排查时用探针取） */
const WORK_REDO_TRACE_KEY = 'cx.work.aiRedo.trace';

/** 卷子上的一道题（发给 AI 的整卷快照） */
interface PaperQuestion {
	index: number;
	title: string;
	type?: string;
	options: string[];
	/** 上一轮实际提交的答案 */
	oldAnswer: string;
	/** 平台批改标记：这题上次是错的（`marking_cuo`）；没读到标记时保持 undefined */
	wrong?: boolean;
}

/**
 * 让 AI 按「整卷 + 旧答案」重新作答
 *
 * 只在已启用「AI答题」时生效：复用它的地址、鉴权与模型，
 * 但提示词换成整卷模式 —— 单题提问拿不到「哪题错了」的上下文。
 */
async function requestPaperRedoByAI(
	paper: PaperQuestion[],
	score: number | undefined,
	passScore: number,
	round: number,
	history?: { round: number; answers: Record<string, string> }[]
): Promise<Record<string, string> | null> {
	const wrappers = (CommonProject.scripts.settings.cfg.answererWrappers || []) as any[];
	const aiWrapper = wrappers.find((item) => item && item.name === 'AI答题');
	if (!aiWrapper) {
		traceRedo('AI 重做失败：没有找到「AI答题」配置');
		return null;
	}

	const typeLabel: Record<string, string> = {
		single: '单选题',
		multiple: '多选题',
		judgement: '判断题',
		completion: '填空题',
		unknown: '未标注题型'
	};
	/** 某道题在历次重做里都提交过什么（按轮次列出来，AI 才知道哪些组合已经试错） */
	const pastAnswers = (title: string): string[] => {
		const items: string[] = [];
		for (const record of history || []) {
			const answer = lookupOverrideAnswer(record.answers, title);
			if (answer) items.push(`第${Number(record.round || 1)}轮=${answer}`);
		}
		return items;
	};

	/**
	 * 整卷都发，批改结果只作为「重点提示」
	 *
	 * 试过只发错题，结果踩了个大坑：平台批改标记**不一定全**（实测 5 题只标了 1 题错，
	 * 但按 20 分/题算错 1 题该有 80 分、不该不及格），只改这 1 题等于原地踏步。
	 * 所以答案始终整卷发给 AI 复核，批改结果只用来告诉它「哪题确定错」。
	 */
	const markedCount = paper.filter((q) => q.wrong !== undefined).length;
	const wrongCount = paper.filter((q) => q.wrong === true).length;
	/** 批改标记可靠时只发错题：prompt 更短、AI 更聚焦，也不会动到上次对的题 */
	const focus = paper.filter((q) => q.wrong === true);
	const useFocus = focus.length > 0 && focus.length < paper.length;
	const targets = useFocus ? focus : paper;

	const lines = targets
		.map((q) => {
			const head = `${q.index}. [${typeLabel[q.type || 'unknown'] || q.type || '未标注题型'}] ${q.title}`;
			/**
			 * 选项文本自带「A 」「B.」这类前缀（超星 li 的文本就是这样），
			 * 直接再拼一层编号会变成 `A. A 学习…`，AI 容易看串。这里先剥掉已有的。
			 */
			const stripPrefix = (text: string) => {
				const stripped = String(text || '')
					.replace(/^[A-H][\s.．、,，:：)）]+/, '')
					.trim();
				return stripped || String(text || '').trim();
			};
			const options = q.options.length
				? '\n选项：' +
				  q.options.map((o, i) => `${String.fromCharCode(65 + i)}. ${stripPrefix(o)}`).join(' | ')
				: '';
			const past = pastAnswers(q.title);
			const pastLine = past.length ? `\n历次作答（均已判错）：${past.join('；')}` : '';
			const markTag = !useFocus && q.wrong === true ? '【平台批改：错误，必须换答案】' : '';
			return (
				head +
				(markTag ? ' ' + markTag : '') +
				options +
				`\n上次作答：${q.oldAnswer || '（空）'}` +
				pastLine
			);
		})
		.join('\n\n');

	const prompt =
		`下面是一次在线作业的完整题目、选项、上次提交的答案，以及前几轮重做时用过的答案（都已判错）。\n` +
		(useFocus
			? `本次**只需要重做其中 ${targets.length} 道错题**（平台已批改，其余题上次是对的，不要出现在答案里）。\n`
			: '') +
		(typeof score === 'number' && score > 0
			? `上次得分 ${score} 分，及格线 ${passScore} 分，说明里面有错误答案。\n`
			: `上次没有通过（平台提示未达到及格线 ${passScore} 分），说明里面有错误答案。\n`) +
		`请重新作答：逐题检查上次的答案，错的改掉，对的保留。\n\n` +
		`输出要求（必须严格遵守）：\n` +
		`1. 只输出一个 JSON 数组，不要输出解释、前后缀，也不要包代码块标记。\n` +
		`2. 数组长度必须等于题目数量 ${targets.length}，顺序与题目一一对应。\n` +
		`3. 每个元素格式：{"i": 题号数字, "answer": "新答案"}。\n` +
		`4. answer 规则：**所有选择题（含判断题）统一输出选项字母**。` +
		`单选输出 1 个字母（如 A）；多选输出字母并用 # 分隔（如 A#C）；` +
		`判断题输出所选选项的字母（如 B）；填空题输出要填的内容，多个空用 # 分隔。\n` +
		`5. 判断题也是选择题：禁止输出「对」「错」「正确」「错误」，只输出字母。\n` +
		`6. 「历次作答」里已经试过且没通过的组合，不要原样重复，换更可能正确的答案。\n\n` +
		`题目如下：\n${lines}`;

	/** 提示词里的 `${...}` 会被题库占位符替换器当成变量，先拆开 */
	const safePrompt = prompt.replace(/\$\{/g, '$ {');

	const wrapper: any = {
		name: 'AI整卷重做',
		url: aiWrapper.url,
		method: 'post',
		type: 'GM_xmlhttpRequest',
		contentType: 'json',
		headers: { ...(aiWrapper.headers || {}) },
		data: {
			model: aiWrapper.data?.model,
			temperature: 0,
			/** 整卷的 JSON 比单题长得多，给足输出预算，免得被截断成不合法 JSON */
			max_tokens: 16384,
			messages: [
				{
					role: 'system',
					content:
						'你是答题助手。用户会给你一整份作业的题目、选项和他上次提交的答案，并告诉你这份卷子没及格。\n' +
						'你的任务是把错的答案改对、保留对的答案，并按要求的 JSON 格式整卷输出。'
				},
				{ role: 'user', content: safePrompt }
			]
		},
		handler:
			'return (res)=>{ var c = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content; return [undefined, c ? String(c).trim() : undefined] }'
	};

	$console.info(`第 ${round} 轮重做：把整卷 ${targets.length} 题（含上次答案）发给 AI`);

	/**
	 * 整卷请求临时放宽超时
	 *
	 * `defaultAnswerWrapperHandler` 内部是 `Promise.race([request, sleep(60s)])`，
	 * 60 秒一到就返回 undefined、判「题库请求超时」—— 实测整卷 5 题配推理模型经常跑过 60 秒，
	 * 表现就是「AI 一直失败、轮次反复从头来」。这里临时放宽到 180 秒，请求结束再还原。
	 */
	const previousTimeout = AnswerWrapperHandlerConfig.timeout_seconds;
	AnswerWrapperHandlerConfig.timeout_seconds = 180;
	let infos: Awaited<ReturnType<typeof defaultAnswerWrapperHandler>>;
	try {
		infos = await defaultAnswerWrapperHandler([wrapper], {});
	} finally {
		AnswerWrapperHandlerConfig.timeout_seconds = previousTimeout;
	}
	const content = infos?.[0]?.results?.[0]?.answer || '';
	if (!content) {
		const reason = infos?.[0]?.error || '未知原因（返回为空）';
		$console.warn('AI 整卷重做没有返回内容：' + reason);
		traceRedo(`AI 重做失败：${String(reason).slice(0, 90)}`);
		return null;
	}

	let text = String(content).trim();
	text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '');
	const start = text.indexOf('[');
	const end = text.lastIndexOf(']');
	if (start === -1 || end <= start) {
		$console.warn('AI 整卷重做返回的不是 JSON 数组，已忽略：' + text.slice(0, 120));
		traceRedo(`AI 重做失败：返回非 JSON（${text.slice(0, 60)}）`);
		return null;
	}

	let list: any;
	try {
		list = JSON.parse(text.slice(start, end + 1));
	} catch (e: any) {
		const reason = (e && e.message) || String(e);
		$console.warn('AI 整卷重做返回的 JSON 解析失败：' + reason);
		traceRedo(`AI 重做失败：JSON 解析失败（${String(reason).slice(0, 60)}）`);
		return null;
	}
	if (!Array.isArray(list)) return null;

	const answers: Record<string, string> = {};
	for (const item of list) {
		if (!item || typeof item !== 'object') continue;
		const index = Number(item.i ?? item.index ?? item.q);
		const answer = String(item.answer ?? item.a ?? '').trim();
		if (!Number.isFinite(index) || !answer) continue;
		const question = paper[index - 1];
		if (!question || !question.title) continue;
		answers[question.title] = answer;
	}
	if (Object.keys(answers).length === 0) {
		$console.warn('AI 整卷重做解析出来的答案是空的');
		return null;
	}
	$console.info(
		`第 ${round} 轮重做：拿到 ${Object.keys(answers).length}/${targets.length} 道题的新答案${
			useFocus ? `（只重做 ${targets.length} 道错题）` : ''
		}`
	);
	/** 把整卷答案写进轨迹，方便直接对比「这一轮到底改了什么」 */
	traceRedo(
		`第 ${round} 轮答案：` +
			targets
				.map((q) => `${q.index}=${answers[q.title] || '—'}${q.wrong ? '✗' : ''}`)
				.join(' ')
	);
	return answers;
}

/**
 * 清掉一道题上已经选中的选项
 *
 * 重做卷会把上一轮的答案**预选**在卷子上，而答题器只会「补点」不会取消 ——
 * 结果新答案和旧答案混在一起（多选最明显）。平台自己的取消方式就是
 * **再点一次那个高亮的选项**（`li[onclick^="addChoice"]` 是 toggle），
 * 所以这里对着 `[class*="check_answer"]` 的元素点回去，最多试 3 轮。
 */
async function clearQuestionSelections(root: HTMLElement | null | undefined): Promise<number> {
	if (!root) return 0;
	let clicked = 0;
	for (let pass = 0; pass < 3; pass++) {
		const selected = Array.from(root.querySelectorAll<HTMLElement>('[class*="check_answer"]'));
		if (!selected.length) return clicked;
		for (const el of selected) {
			try {
				const target = el.closest<HTMLElement>('li') || el;
				target.click();
				clicked++;
				await $.sleep(120);
			} catch {}
		}
		await $.sleep(150);
	}
	return clicked;
}

/**
 * 按题干取 AI 重做答案
 *
 * 精确 key 命中直接用；不命中时退到「归一化后互相包含」——题干跨页面可能差一个括号、
 * 空格或混淆字体，精确比较会整题落空，一落空就回退题库旧答案（等于白重做）。
 * 短 key（<8 字）不参与模糊匹配，避免「1」「对」这类内容误命中。
 */
function lookupOverrideAnswer(answers: Record<string, string>, title: string): string {
	if (!title) return '';
	if (answers[title]) return answers[title];

	const normalize = (text: string) =>
		String(text || '')
			.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
			.toLowerCase();
	const target = normalize(title);
	if (target.length < 8) return '';

	for (const key of Object.keys(answers)) {
		const normalizedKey = normalize(key);
		if (normalizedKey.length < 8) continue;
		if (normalizedKey === target || normalizedKey.includes(target) || target.includes(normalizedKey)) {
			return answers[key];
		}
	}
	return '';
}

/**
 * 从已批改的卷面上读出「哪几题错了」
 *
 * 超星批改后每题会带 `<span class="marking_dui">`（对）或 `<span class="marking_cuo">`（错），
 * 和 `paper` 按 `.TiMu` 顺序一一对应。读到就只重做错题：prompt 更短、AI 更聚焦，
 * 也不会把上次蒙对的题改坏。
 *
 * 注意 `.answerCon` 是「**我的答案**」的值（`.answerFont` 才是"我的答案："标签），
 * 不是标准答案 —— 别拿它当正确答案用。
 */
function markWrongQuestions(
	paper: PaperQuestion[],
	doc: Document | null | undefined
): { wrong: number; marked: number } {
	const none = { wrong: 0, marked: 0 };
	if (!doc || !paper.length) return none;

	/**
	 * 题目单元必须和答题器保持一致：共用案例题按子问题拆
	 *
	 * 共用案例题是「一个 `.TiMu` 里塞多个 `readCompreHensionItem`」，
	 * 而 `paper` 是按子问题存的（4 条）。这里如果只按 `.TiMu` 数（1 个）去对，
	 * 题数永远不等，函数直接返回 `{wrong:0, marked:0}` —— 上层看到「没有批改标记」
	 * 就把**整卷**重做，用户看到的就是「明明只错一题，却重做整卷」。
	 */
	const roots: HTMLElement[] = [];
	for (const root of Array.from(doc.querySelectorAll<HTMLElement>('.TiMu'))) {
		const items = Array.from(root.querySelectorAll<HTMLElement>('.readCompreHensionItem'));
		if (items.length > 0) roots.push(...items);
		else roots.push(root);
	}
	if (roots.length !== paper.length) {
		traceRedo(`批改标记：题数对不上（卷面 ${roots.length} / 快照 ${paper.length}），只能整卷重做`);
		return none;
	}

	let wrong = 0;
	let marked = 0;
	paper.forEach((question, index) => {
		const node = roots[index];
		/**
		 * 半对（`marking_bandui`）也必须算错
		 *
		 * 多选题少选时平台给的是「半对」而不是红叉：界面上只有一个红叉，
		 * 用户以为「就一题错了」，但这门课要求全对才及格，半对的题一样要重做。
		 * 只认 `marking_cuo` 的话，半对的题会被当成「没标记」保留原答案，
		 * 重做一轮下来分数还是不够。
		 */
		const isHalfWrong = !!node.querySelector('.marking_bandui');
		const isWrong = isHalfWrong || !!node.querySelector('.marking_cuo');
		const isRight = !isWrong && !!node.querySelector('.marking_dui');
		if (isWrong) {
			question.wrong = true;
			wrong++;
			marked++;
		} else if (isRight) {
			question.wrong = false;
			marked++;
		} else {
			/** 没标记的题（另一种练习形态）：保持 undefined，不能当成「对」 */
			question.wrong = undefined;
		}
	});
	return { wrong, marked };
}

/** 这个选项当前是不是选中态（页面自己的 check_answer / check_answer_dx） */
function isOptionPicked(option: HTMLElement | null | undefined): boolean {
	if (!option) return false;
	if (option.matches?.('[class*="check_answer"]')) return true;
	if (option.querySelector?.('[class*="check_answer"]')) return true;
	const li = option.closest?.('li');
	return !!li?.querySelector('[class*="check_answer"]');
}

/**
 * 点选并确认真的选中了（幂等）
 *
 * 为什么光 `option.click()` 不够：测验 iframe 刚加载时 DOM 已经在了，但平台的
 * `addChoice/addMultipleChoice` 还没绑上（或还没执行完），点击就是空点 ——
 * 解析层却认为「这题答完了」，最终整卷一个字没选就提交。这就是那个**概率性白卷**的来源。
 * 这里点完立刻验证选中态，没选中就再点，已经选中就不重复点（避免 toggle 把它取消）。
 */
async function ensureOptionPicked(option: HTMLElement | null | undefined, retries = 4): Promise<boolean> {
	if (!option) return false;
	for (let i = 0; i < retries; i++) {
		if (isOptionPicked(option)) return true;
		try {
			option.click();
		} catch {}
		await $.sleep(160);
	}
	return isOptionPicked(option);
}

/**
 * 等测验页面真正可交互
 *
 * 判据不是「有没有 .TiMu」，而是「选项有没有绑定 onclick」——
 * 题目先渲染、事件后绑定，中间那段窗口正是点空的高发期。
 */
async function waitQuizInteractive(win: Window | null | undefined, timeout = 15000): Promise<boolean> {
	if (!win) return false;
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		try {
			const doc = win.document;
			const questions = doc.querySelectorAll('.TiMu').length;
			const clickable = doc.querySelectorAll('li[onclick], a[onclick], .after[onclick]').length;
			if (questions > 0 && clickable > 0) return true;
		} catch {}
		await $.sleep(400);
	}
	return false;
}

/**
 * 数一数卷面上有多少选择题一个字都没选
 *
 * 为什么需要这道检查：`resolver` 只要「解析到答案」就返回 `finish: true`，
 * 哪怕 `options` 是空的（选项选择器没匹配到、DOM 结构变了），handler 收到
 * `undefined` 直接 return，一个字都没点 —— 完成率却仍然算 100%，于是**交白卷**。
 * 提交前用它兜一道，白卷一律不提交。
 */
function countUnansweredQuestions(doc: Document | null | undefined): { total: number; unanswered: number } {
	if (!doc) return { total: 0, unanswered: 0 };
	const questions = Array.from(doc.querySelectorAll('.TiMu'));
	let unanswered = 0;
	for (const question of questions) {
		/** 填空 / 连线这类非选择题另有输入控件，不参与统计 */
		if (question.querySelector('textarea, select, .filling_answer')) continue;
		if (question.querySelectorAll('[class*="check_answer"]').length === 0) unanswered++;
	}
	return { total: questions.length, unanswered };
}

/** 题干是否命中名单（归一化后互相包含，容忍标点/空格差异） */
function titleInList(list: string[], title: string): boolean {
	if (!title) return false;
	const normalize = (text: string) =>
		String(text || '')
			.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
			.toLowerCase();
	const target = normalize(title);
	if (target.length < 6) return list.indexOf(title) !== -1;
	return list.some((item) => {
		const key = normalize(item);
		return key.length >= 6 && (key === target || key.includes(target) || target.includes(key));
	});
}

/**
 * 把 AI 给的答案映射到卷面上的选项元素
 *
 * 为什么重做轮不用现成的 resolver：
 *   `resolveJudgement` 只认「对/错/是/否/√/×」这些词，AI 一旦按选择题习惯给字母（A / B），
 *   它直接返回 `finish: false` —— 那题一个字都不会点，白丢分（实测连续两轮都是这个原因，
 *   两道判断题全空，整卷必挂）。所以这里自己映射，不猜：
 *     · 去掉分隔符是纯字母 → 按序号取（A → 第 1 项）
 *     · 否则按文字归一化后包含匹配（「对」能命中「A 对」，「宿舍」能命中「A 宿舍」）
 */
function pickRedoOptions(options: HTMLElement[], answer: string): HTMLElement[] {
	const raw = String(answer || '').trim();
	if (!raw || !options || !options.length) return [];

	const letters = raw.replace(/[#，,、;；\s]+/g, '').toUpperCase();
	if (/^[A-H]{1,8}$/.test(letters)) {
		const byLetter = letters
			.split('')
			.map((ch) => options[ch.charCodeAt(0) - 65])
			.filter(Boolean);
		if (byLetter.length) return byLetter;
	}

	const normalize = (text: string) =>
		String(text || '')
			.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '')
			.toLowerCase();

	const targets = raw
		.split(/[#，,、;；\n]+/)
		.map((item) => normalize(item))
		.filter(Boolean);
	if (!targets.length) return [];

	/**
	 * 取选项的可读文字
	 *
	 * 超星判断题的选项是 `<a class="fl after">`，**自身 innerText 是空的**，
	 * 文字（对/错）在父级 `li` 上。只看 `option.innerText` 会全部匹配失败 → 一个字不点。
	 */
	const textOf = (option: HTMLElement) => {
		const own = String(option.innerText || option.textContent || '').trim();
		if (own) return own;
		const li = option.closest('li');
		return String(li?.innerText || li?.textContent || '').trim();
	};

	const picked: HTMLElement[] = [];
	for (const target of targets) {
		const exact = options.find((option) => normalize(textOf(option)) === target);
		const fuzzy =
			exact ||
			options.find((option) => {
				const text = normalize(textOf(option));
				return !!text && (text.includes(target) || target.includes(text));
			});
		if (fuzzy && picked.indexOf(fuzzy) === -1) picked.push(fuzzy);
	}
	return picked;
}

/** 读重做计划（sessionStorage：同标签页刷新后仍在，关标签页即失效） */
/**
 * 重做计划的三处存储
 *
 * 主存 `localStorage`：整页刷新、甚至客户端重启（浏览器恢复会话）都不丢 ——
 * sessionStorage 一旦碰上重启就没了，表现就是「刷新后直接拿旧答案提交」。
 * 同时写一份 sessionStorage 作为兼容，读的时候两边都看。
 * 靠 `ts`（20 分钟）收敛，过期即失效，不会长期把页面拽回旧测验。
 */
function readRedoPlan(): WorkRedoPlan | undefined {
	/** 两处都看，取 ts 较新的那份：旧记录不能压过刚写入的新计划 */
	let best: WorkRedoPlan | undefined;
	for (const store of [localStorage, sessionStorage]) {
		try {
			const raw = store.getItem(WORK_REDO_KEY);
			if (!raw) continue;
			const plan = JSON.parse(raw) as WorkRedoPlan;
			if (!plan || typeof plan !== 'object' || !plan.answers) continue;
			if (plan.ts && Date.now() - Number(plan.ts) > REDO_PLAN_TTL_MS) {
				try {
					store.removeItem(WORK_REDO_KEY);
				} catch {}
				continue;
			}
			if (!best || Number(plan.ts || 0) > Number(best.ts || 0)) best = plan;
		} catch {}
	}
	return best;
}

function writeRedoPlan(plan: WorkRedoPlan) {
	const payload = JSON.stringify({ ...plan, ts: Date.now() });
	for (const store of [localStorage, sessionStorage]) {
		try {
			store.setItem(WORK_REDO_KEY, payload);
		} catch {}
	}
	traceRedo(`写入计划 round=${plan.round} 题数=${Object.keys(plan.answers).length} 小节=${plan.chapterId || '-'}`);
}

function clearRedoPlan() {
	for (const store of [localStorage, sessionStorage]) {
		try {
			store.removeItem(WORK_REDO_KEY);
		} catch {}
	}
}

/**
 * 重做流程的诊断轨迹
 *
 * 只要 `localStorage['cx.work.aiRedo.trace']` 还在，事后就能读出「计划有没有读到、
 * 每题有没有命中答案、点了几项、为什么放弃」。以前全靠 `$console`，页面一刷新就没了。
 */
function traceRedo(message: string) {
	try {
		const key = WORK_REDO_TRACE_KEY;
		const list = JSON.parse(localStorage.getItem(key) || '[]') as string[];
		list.push(`${new Date().toLocaleTimeString()} ${message}`);
		localStorage.setItem(key, JSON.stringify(list.slice(-80)));
	} catch {}
}

/**
 * 把「这一轮实际作答的整卷」抓成快照
 *
 * 题目、选项、以及上一轮真的用了哪个答案 —— 后者来自 `ctx.searchInfos`，
 * 是真正写进卷子的答案，比去 DOM 里反查选中态可靠。
 * 标题处理函数由调用方传入：作业/考试和章节测验的题干清洗规则不一样，
 * 必须和 `answerer` 里用的是同一个，否则 AI 给的答案回填时对不上题干。
 */
function buildPaperSnapshotFromResults(
	results: any[],
	titleTransform: (titles: (HTMLElement | undefined)[]) => string
): PaperQuestion[] {
	return results
		.map((item, i) => {
			const ctx = item && item.ctx;
			const title = ctx ? titleTransform(ctx.elements.title || []) : '';
			const options = (ctx?.elements?.options || []).map((option: HTMLElement) =>
				optimizationElementWithImage(option, true).innerText.trim()
			);
			/**
			 * 「上次作答」优先从**卷面选中态**读
			 *
			 * 不能用 `searchInfos[0]`：那可能是题库缓存 / 上一轮 AI 的答案，
			 * 和真正提交进卷子的答案不一定一致。传给 AI 的旧答案错了，它就会照着错的信息改。
			 */
			const picked = ((ctx?.elements?.options || []) as HTMLElement[])
				.map((option, index) => {
					const hit =
						option.matches?.('[class*="check_answer"]') || option.querySelector?.('[class*="check_answer"]');
					return hit ? String.fromCharCode(65 + index) : '';
				})
				.filter(Boolean);
			const oldAnswer = picked.length
				? picked.join('#')
				: String(
						(ctx?.searchInfos || []).map((info: any) => info?.results?.[0]?.answer).find((answer: any) => answer) || ''
				  ).trim();
			return { index: i + 1, title, type: ctx?.type as string | undefined, options, oldAnswer };
		})
		.filter((question) => !!question.title)
		.map((question, i) => ({ ...question, index: i + 1 }));
}

/**
 * 读平台自己弹的「不及格」提示
 *
 * 超星这套弹层是通用的 `popup(content, ok, cancel, okcallback)`：
 * 内容写在 `#popcontent`，外层是 `#workpop.maskDiv`。
 * 实测文案：`未达到及格线，请重做`（脚本里还有 `很遗憾，未达到及格线，请重做` 的变体）。
 * 这是唯一可靠的判定：弹窗里没有分数，只有这句话。
 */
function readPopupText(): { text: string; visible: boolean } {
	try {
		const doc = top?.document;
		if (!doc) return { text: '', visible: false };
		const box = doc.querySelector<HTMLElement>('#workpop');
		const content = doc.querySelector<HTMLElement>('#popcontent');
		const text = (content?.textContent || '').replace(/\s+/g, ' ').trim();
		const visible = box ? getComputedStyle(box).display !== 'none' : false;
		return { text, visible };
	} catch {
		return { text: '', visible: false };
	}
}

/**
 * 等平台把判定弹窗弹出来
 *
 * 同一个 `#workpop` 会被复用：先弹「确认提交？」，提交后才换成
 * 「未达到及格线，请重做」或「提交成功」。所以只能轮询等，读一次就是空的。
 * 等到明确的不及格/成功文案就返回；超时返回空（按未知处理，不重做）。
 */
async function waitFailPopupText(timeout = 6000): Promise<string> {
	const fail = /(未达到及格线|不及格|未及格|成绩不合格|请重做)/;
	const pass = /(提交成功|已完成|保存成功|作业已提交)/;
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		const { text, visible } = readPopupText();
		if (visible && text) {
			if (fail.test(text)) return text;
			if (pass.test(text)) return '';
		}
		await $.sleep(400);
	}
	return '';
}

function workOrExam(
	type: 'work' | 'exam' = 'work',
	{
		answererWrappers,
		period,
		thread,
		redundanceWordsText,
		answerSeparators,
		preview_mode
	}: CommonWorkOptions & {
		// 整卷预览模式
		preview_mode: boolean;
	}
) {
	$message.info(`开始${type === 'work' ? '作业' : '考试'}`);

	if (preview_mode) {
		CommonProject.scripts.workResults.methods.init({
			questionPositionSyncHandlerType: 'cx'
		});
	}

	/**
	 * 「不及格 → AI 整卷重做」的现场状态
	 *
	 * 重做必须回到一张干净的卷子（已选项只能加不能减），所以每一轮都是
	 * 「提交 → 读分 → AI 重算 → reload 重进卷子 → 用新答案再答一遍」。
	 * 跨 reload 的上下文只能落在 sessionStorage：同一标签页刷新后还在，
	 * 关掉标签页就自动消失，不会把上一份作业的旧答案带到下一份作业里。
	 */
	const redoCfg = (CXProject.scripts.work?.cfg || {}) as any;
	const redoEnabled = type === 'work' && redoCfg.aiRedoOnFail !== false;
	const passScore = Number(redoCfg.passScore ?? 60);
	const maxRedoRounds = Math.max(0, Math.min(5, Number(redoCfg.aiRedoRounds ?? 5)));

	const redoPlan = readRedoPlan();
	/** 本轮要用的「整卷答案」：只有重做轮才非空，普通答题一律走题库 / AI 单题 */
	const aiOverride: Record<string, string> = (redoPlan && redoPlan.answers) || {};
	const hasOverride = Object.keys(aiOverride).length > 0;
	if (hasOverride) {
		$message.info({
			content: `正在用 AI 的第 ${(redoPlan?.round || 1) + 1} 轮答案重新作答（上次 ${(redoPlan?.scores || []).join(' / ') || '?'} 分）`,
			duration: 0
		});
	}

	// 处理作业和考试题目的方法
	const workOrExamQuestionTitleTransform = (titles: (HTMLElement | undefined)[]) => {
		// 是否为多个小题的题目
		const is_multiple_question = titles.length > 1;
		const optimizationTitle = titles
			.map((el, i) => {
				if (el) {
					const titleCloneEl = el.cloneNode(true) as HTMLElement;
					const childNodes = titleCloneEl.childNodes;
					// 一般多小题题目只有第一个 title 存在题型文本
					if (i === 0) {
						// 删除序号
						childNodes[0]?.remove();
						// 删除题型
						childNodes[0]?.remove();
					}
					// 显示图片链接在题目中
					return optimizationElementWithImage(titleCloneEl, true).innerText;
				}
				return '';
			})
			.join('\n');

		return removeRedundantWords(
			StringUtils.of(optimizationTitle)
				.nowrap(is_multiple_question ? '\n' : ' ')
				.nospace()
				.toString()
				.trim(),
			redundanceWordsText.split('\n')
		);
	};

	// 这里跟章节测试的连线题不一样，章节测试是新版连线题
	/** 新建答题器 */
	const worker = new HonghuWorker({
		root: '.questionLi',
		elements: {
			title: (root) =>
				$$el(
					// 非预览模式的样式跟正常的不一样
					!preview_mode
						? ['.splitS-left .mark_name', '.line_wid_half.fl,.line_wid_half.fr'].join(',')
						: [
								':scope > h3',
								':scope > div:not(.stem_answer,.mark_answer)',
								':scope > p',
								'.line_wid_half.fl,.line_wid_half.fr'
						  ].join(','),
					root
				).filter((e) => !!e.textContent?.trim()),
			options: '.answerBg .answer_p, .textDIV, .eidtDiv',
			type: type === 'exam' ? 'input[name^="type"]' : 'input[id^="answertype"]',
			lineAnswerInput: '.line_answer input[name^=answer]',
			lineSelectBox: '.line_answer_ct .selectBox ',
			/** 阅读理解 */
			reading: '.reading_answer',
			/** 完形填空 */
			filling: '.filling_answer'
		},
		thread: thread ?? 1,
		answerSeparators: answerSeparators.split(',').map((s) => s.trim()),
		/** 默认搜题方法构造器 */
		answerer: (elements, ctx) => {
			if (elements.title) {
				// 处理作业和考试题目
				const title = workOrExamQuestionTitleTransform(elements.title);
				if (title) {
					const typeInput = elements.type[0] as HTMLInputElement;
					const type = (typeInput ? getQuestionType(parseInt(typeInput.value)) : undefined) || 'unknown';
					/**
					 * 重做轮：直接用 AI 给的新答案，不再走题库 / 单题 AI。
					 * 用题干做 key —— 引擎按顺序回调不保证，题干是这里唯一稳定的锚点。
					 */
					const searchFresh = async () => {
						await $.sleep((period ?? 3) * 1000);
						return defaultAnswerWrapperHandler(answererWrappers, {
							type,
							title,
							options:
								type === 'completion'
									? ''
									: ctx.elements.options.map((o) => optimizationElementWithImage(o, true).innerText).join('\n')
						});
					};

					if (hasOverride) {
						const redoAnswer = lookupOverrideAnswer(aiOverride, title);
						if (redoAnswer) {
							return [
								{
									name: 'AI整卷重做',
									homepage: '#',
									results: [{ question: title, answer: redoAnswer }]
								}
							];
						}
						/** 重做轮没匹配上：走真实搜索，不查题库缓存（缓存里是上一轮的答案） */
						return searchFresh();
					}

					return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, searchFresh);
				} else {
					throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
				}
			} else {
				throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
			}
		},

		work: async (ctx) => {
			const { elements, searchInfos } = ctx;

			// 在非预览模式下会出现多个干扰项 type，这里提取正确的

			const type = getQuestionType(
				parseInt(elements.type.find((t) => t.getAttribute('name')?.match(/type\d+/))?.getAttribute('value') || '-1')
			);

			/**
			 * 重做轮：清掉预选的旧答案，然后按 AI 答案直接点选
			 *
			 * 和章节测验同一套处理：判断题的 resolver 只认「对/错」这类词，
			 * AI 给字母时它会 `finish: false`，那题就空着判错 —— 这里自己映射更稳。
			 */
			if (hasOverride) {
				const redoTitle = workOrExamQuestionTitleTransform(elements.title || []);
				const redoAnswer = lookupOverrideAnswer(aiOverride, redoTitle);

				if (redoAnswer && type && type !== 'completion') {
					/** 先匹配、再清空：匹配不上就一个字都不动，免得把题弄空 */
					const picked = pickRedoOptions(elements.options as HTMLElement[], redoAnswer);
					if (picked.length) {
						const root =
							(ctx as any).root ||
							(elements.options[0]?.closest<HTMLElement>('.questionLi') as HTMLElement | undefined) ||
							null;
						const cleared = await clearQuestionSelections(root);
						if (cleared) $console.info(`重做：已取消 ${cleared} 个旧选项`);

						for (const option of picked) {
							await ensureOptionPicked(option);
						}
						$console.info(`重做：AI 答案「${redoAnswer}」→ 点选 ${picked.length} 项`);
						traceRedo(`题「${redoTitle.slice(0, 18)}」答案=${redoAnswer} 取消${cleared}项 点选${picked.length}项`);
						return { finish: true, options: picked.map((option) => option.innerText) };
					}
					$console.warn(`重做：AI 答案「${redoAnswer}」对不上任何选项，保留原答案并回退题库`);
					traceRedo(`题「${redoTitle.slice(0, 18)}」答案=${redoAnswer} 对不上选项，保留原答案`);
				} else if (!redoAnswer) {
					$console.warn('重做：本题题干没匹配上 AI 答案，保留原答案并回退题库');
					traceRedo(`题「${redoTitle.slice(0, 18)}」没匹配上计划 key，保留原答案`);
				}
			}

			/**
			 * 第一次做：直接按答案点选（和章节测验同一套理由）
			 *
			 * `resolveJudgement` 只认「对/错」这类词，AI 给字母就 `finish: false`、一个字不点。
			 */
			if (!hasOverride && type && (type === 'single' || type === 'multiple' || type === 'judgement')) {
				const candidates = (searchInfos || [])
					.flatMap((info) => (info?.results || []).map((item: any) => String(item?.answer || '').trim()))
					.filter(Boolean);
				for (const candidate of candidates) {
					const picked = pickRedoOptions(elements.options as HTMLElement[], candidate);
					if (!picked.length) continue;

					const root =
						(ctx as any).root ||
						(elements.options[0]?.closest<HTMLElement>('.questionLi') as HTMLElement | undefined) ||
						null;
					const cleared = await clearQuestionSelections(root);
					if (cleared) $console.info(`作答：已取消 ${cleared} 个旧选项`);
					for (const option of picked) {
						await ensureOptionPicked(option);
					}
					$console.info(`作答：答案「${candidate}」→ 点选 ${picked.length} 项`);
					return { finish: true, options: picked.map((option) => option.innerText) };
				}
			}

			if (type && (type === 'completion' || type === 'multiple' || type === 'judgement' || type === 'single')) {
				const resolver = createDefaultQuestionResolver(ctx)[type];
				return await resolver(
					searchInfos,
					elements.options.map((option) => optimizationElementWithImage(option)),
					async (type, answer, option) => {
						// 如果存在已经选择的选项
						if (type === 'judgement' || type === 'single' || type === 'multiple') {
							/** 用幂等点选：已选就不点，没点上会重试（防事件未绑定的空点） */
							await ensureOptionPicked(option);
						} else if (type === 'completion' && answer.trim()) {
							const text = option?.querySelector('textarea');
							const textareaFrame = option?.querySelector('iframe');
							if (text) {
								text.value = answer;
							}
							if (textareaFrame?.contentDocument) {
								textareaFrame.contentDocument.body.innerHTML = answer;
							}
							if (option?.parentElement?.parentElement) {
								/** 如果存在保存按钮则点击 */
								$el('[onclick*=saveQuestion]', option?.parentElement?.parentElement)?.click();
								await $.sleep(500);
							}
						}
					}
				);
			}
			// 连线题自定义处理
			else if (type && type === 'line') {
				for (const answers of searchInfos.map((info) => info.results.map((res) => res.answer))) {
					let ans = answers;
					if (ans.length === 1) {
						ans = splitAnswer(ans[0]);
					}
					if (
						ans.filter(Boolean).length !== 0 &&
						elements.lineAnswerInput &&
						ans.filter(Boolean).length === elements.lineSelectBox.length
					) {
						//  选择答案
						for (let index = 0; index < elements.lineSelectBox.length; index++) {
							const box = elements.lineSelectBox[index];
							if (ans[index]) {
								$el(`li[data=${ans[index]}] a`, box)?.click();
								await $.sleep(200);
							}
						}

						return { finish: true };
					}
				}

				return { finish: false };
			}
			// 完形填空
			else if (type && type === 'fill') {
				return readerAndFillHandle(searchInfos, elements.filling);
			}
			// 阅读理解
			else if (type && type === 'reader') {
				return readerAndFillHandle(searchInfos, elements.reading);
			}

			return { finish: false };
		},

		/** 完成答题后 */
		async onResultsUpdate(current, _, res) {
			// 非预览模式，直接追加，想要清楚只能手动清空
			if (!preview_mode) {
				if (current.result?.finish) {
					await CommonProject.scripts.workResults.methods.appendResults(
						simplifyWorkResult(res, workOrExamQuestionTitleTransform)
					);
					CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
						simplifyWorkResult([current], workOrExamQuestionTitleTransform)
					);
				}
				return;
			}

			CommonProject.scripts.workResults.methods.setResults(simplifyWorkResult(res, workOrExamQuestionTitleTransform));
			CommonProject.scripts.workResults.methods.updateWorkStateByResults(res);
			if (current.result?.finish) {
				CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
					simplifyWorkResult([current], workOrExamQuestionTitleTransform)
				);
			}
		}
	});

	/**
	 * 把「这一轮实际提交的整卷」抓成快照
	 *
	 * 题目、选项、以及上一轮真的用了哪个答案 —— 后者来自 `ctx.searchInfos`，
	 * 是真正写进卷子的答案，比去 DOM 里反查选中态可靠。
	 */
	const buildPaperSnapshot = (results: any[]): PaperQuestion[] =>
		buildPaperSnapshotFromResults(results, workOrExamQuestionTitleTransform);

	/** 提交整卷：先调页面自带的提交函数，没有按钮就点一下，再确认一次 */
	const submitWorkPaper = async () => {
		const callPageFn = (name: string) => {
			for (const scope of [window as any, top as any]) {
				try {
					if (typeof scope[name] === 'function') {
						scope[name]();
						return true;
					}
				} catch {}
			}
			return false;
		};
		if (!callPageFn('btnBlueSubmit')) {
			document.querySelector<HTMLElement>('#tiJiao, .btnSubmit, [onclick*="btnBlueSubmit"]')?.click();
		}
		await $.sleep(3000);
		callPageFn('submitCheckTimes');
		/**
		 * 这里**不要**急着关弹窗：`未达到及格线，请重做` 就写在 `#workpop #popcontent` 里，
		 * 关掉等于把唯一的判定信号抹掉（之前就是这么写的，所以永远读不到不及格）。
		 */
		await $.sleep(3000);
	};

	/**
	 * 收集页面上「可能是弹窗 / 结果区」的文本（当前帧与 top 都看）
	 *
	 * 不用「整页 innerText」：作业页的说明书里就有「及格线 60 分」这类字，
	 * 一旦拿去匹配，任何一次提交都会被判成「不及格」。
	 */
	const collectDialogTexts = (): string[] => {
		const selector = [
			'#workpop',
			'.popDiv',
			'.maskDiv',
			'.layui-layer',
			'.layer',
			'.modal',
			'.dialog',
			'.result',
			'.mark_table',
			'.mark_score',
			'.score',
			'.scoreNum',
			'.tipDiv'
		].join(',');
		const texts: string[] = [];
		for (const scope of [document, top?.document]) {
			try {
				for (const el of Array.from(scope?.querySelectorAll(selector) || []) as HTMLElement[]) {
					const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
					/** 太长的容器多半是整页套壳，不是弹窗 */
					if (text && text.length <= 600) texts.push(text);
				}
			} catch {}
		}
		return texts;
	};

	/**
	 * 读这次提交的分数
	 *
	 * 只认「得分 / 成绩」这类明确写法且带冒号的形式，其它情况一律返回 undefined。
	 * 宁可读不到（交给弹窗判定），也不能把「及格线 60 分」当成本次得分 ——
	 * 那个错会直接把不及格判成及格，重做就永远不触发。
	 */
	const readWorkScore = (): number | undefined => {
		const scoreText = /(?:本次得分|本次成绩|作业得分|作业成绩|试卷得分|总得分|得分|成绩)\s*[:：]\s*(\d+(?:\.\d+)?)/;
		for (const text of collectDialogTexts()) {
			const matched = scoreText.exec(text);
			if (matched) return Number(matched[1]);
		}
		for (const scope of [document, top?.document]) {
			try {
				const text = (scope?.body?.innerText || '').replace(/\s+/g, ' ');
				const matched = /本次[^。；]{0,12}?(?:得分|成绩)\s*[:：]\s*(\d+(?:\.\d+)?)/.exec(text);
				if (matched) return Number(matched[1]);
			} catch {}
		}
		return undefined;
	};

	/**
	 * 提交期间的弹窗「录像机」
	 *
	 * 超星的提示层有时只挂两三秒，等提交函数里那几个 sleep 走完再去找，
	 * 弹窗早就没了。所以从点提交那一刻起每 300ms 采一次文本，去重留存，
	 * 判定时先看这段历史，再看当前 DOM。
	 */
	const createDialogRecorder = () => {
		const seen: string[] = [];
		let stop = false;
		const task = (async () => {
			while (!stop) {
				try {
					for (const text of collectDialogTexts()) {
						if (!seen.includes(text) && seen.length < 24) seen.push(text);
					}
				} catch {}
				await $.sleep(300);
			}
		})();
		return {
			stop: () => {
				stop = true;
				void task;
			},
			get texts() {
				return seen;
			}
		};
	};

	/**
	 * 提交后的及格判定 —— **以平台弹窗为准**
	 *
	 * 不及格时超星会弹「未达到及格线，需要重做」这类提示，这比读分数可靠得多：
	 * 弹窗里出现的「60 分」往往是及格线而不是得分，按分数读会把不及格读成及格。
	 * 所以顺序是：先找不及格弹窗 → 再读明确写法的得分 → 最后才看「提交成功」。
	 * 什么都没读到算「未知」，按及格处理（不做重做），避免误交多份卷子。
	 */
	const readSubmitVerdict = async (
		recorder?: { texts: string[] }
	): Promise<{ failed: boolean; score?: number; reason: string }> => {
		const FAIL =
			/(未达到及格线|未达到及格|没有达到及格线|没有达到及格|未及格|不及格|成绩不合格|低于及格|未通过|分数过低|成绩偏低)/;
		const FAIL_REDO = /(重做|再做一次|重新作答|重新答题)/;
		const SCORE_WORD = /(及格|分数|成绩|得分)/;
		/**
		 * 不及格的两种写法都要认：
		 * 一种是直接说「未达到及格线 / 不及格」，另一种是「未达到 60 分，是否重做？」
		 * —— 后者没有「及格」二字，只出现分数和「重做」，必须组合判断，
		 * 免得把普通弹窗里孤零零一个「重做」按钮当成本次不及格。
		 */
		const isFailText = (text: string) =>
			FAIL.test(text) ||
			/未达到\s*\d{1,3}(?:\.\d+)?\s*分/.test(text) ||
			(FAIL_REDO.test(text) && SCORE_WORD.test(text));
		const PASS = /(提交成功|已提交|作业已完成|完成作业|已保存)/;
		/** 客观题判分是异步的，弹窗可能晚一两秒，轮询 8 秒 */
		for (let i = 0; i < 16; i++) {
			const texts = collectDialogTexts();
			/** 当前 DOM + 录像机拍到的历史一起看：弹窗已经消失也能认出来 */
			for (const text of [...(recorder?.texts || []), ...texts]) {
				if (isFailText(text)) {
					/** 把原文打进日志：弹窗一闪而过也能事后核对写法 */
					$console.info('判定不及格，弹窗原文：' + text.slice(0, 160));
					return { failed: true, reason: text.slice(0, 120) };
				}
			}
			const score = readWorkScore();
			if (score !== undefined) {
				return { failed: score < passScore, score, reason: `得分 ${score}` };
			}
			if (i >= 3 && texts.some((text) => PASS.test(text))) {
				return { failed: false, reason: texts.find((text) => PASS.test(text))!.slice(0, 120) };
			}
			await $.sleep(500);
		}
		const captured = (recorder?.texts || []).slice(0, 4).join(' || ');
		$console.warn('提交后没有读到及格判定，抓到的弹窗文本：' + (captured || '（没抓到弹窗）'));
		return { failed: false, reason: 'unknown' };
	};

	/**
	 * 点弹窗里的「重做 / 再做一次 / 重新答题」
	 *
	 * 命中就说明平台自己会带我们回卷子，比 reload 更贴合平台流程；
	 * 点完等卷子出现，等不到再由调用方回退成 reload。
	 */
	const clickRedoButton = async (): Promise<boolean> => {
		const REDO = /^(重做|再做一次|重新答题|重新作答|重新做)$/;
		for (const scope of [document, top?.document]) {
			try {
				const candidates = Array.from(
					scope?.querySelectorAll('a, button, input[type="button"], .popDiv span, .layui-layer-btn a') || []
				) as HTMLElement[];
				for (const el of candidates) {
					const label = ((el.innerText || (el as HTMLInputElement).value || el.textContent || '') as string)
						.replace(/\s+/g, '')
						.trim();
					if (!label || label.length > 8 || !REDO.test(label)) continue;
					el.click();
					await $.sleep(1500);
					return true;
				}
			} catch {}
		}
		return false;
	};

	/**
	 * 提交作业；不及格且配置了 AI 答题时整卷重做
	 *
	 * 流程：提交 → 读分 → 不及格就把「整卷 + 上次答案」发给 AI → reload 重进卷子
	 * → 用 AI 的新答案再答一遍 → 再提交……最多 `aiRedoRounds` 轮。
	 * 为什么每轮都要 reload：卷子上的选项只能加不能减，同一页上换答案是改不干净的。
	 */
	const submitAndRedoIfFailed = async (results: any[]) => {
		const aiConfigured = ((CommonProject.scripts.settings.cfg.answererWrappers || []) as any[]).some(
			(wrapper) => wrapper && wrapper.name === 'AI答题'
		);
		/** 考试不自动交卷；没开「不及格重做」或没配 AI 时保持原来的「自己检查后提交」 */
		if (type !== 'work' || !redoEnabled || !aiConfigured) {
			if (hasOverride) clearRedoPlan();
			return;
		}

		const round = redoPlan?.round || 0;
		const paper = buildPaperSnapshot(results);
		if (paper.length === 0) {
			$console.warn('整卷重做：没有从页面上取到题目，跳过');
			clearRedoPlan();
			return;
		}

		$message.info({ content: '正在提交作业…', duration: 3 });
		const recorder = createDialogRecorder();
		await submitWorkPaper();
		const verdict = await readSubmitVerdict(recorder);
		recorder.stop();
		$console.info(
			`作业提交结果：${verdict.failed ? '未达到及格线' : '已及格 / 未读到判定'} · ${verdict.reason || '无弹窗文本'}`
		);

		if (!verdict.failed) {
			clearRedoPlan();
			try {
				(top as any).$?.('#workpop')?.hide?.();
			} catch {}
			$message.success({
				content: verdict.score !== undefined ? `作业得分 ${verdict.score}，已及格。` : '作业已提交。',
				duration: 0
			});
			return;
		}

		if (round >= maxRedoRounds) {
			clearRedoPlan();
			$modal.alert({
				content: `作业未达到及格线（${verdict.reason || '平台提示需重做'}），已经重做 ${round} 轮，不再重试。`
			});
			return;
		}

		/**
		 * AI 进度提示：拿句柄，算完立刻关掉
		 *
		 * `duration: 0` 在 easy-us 里等于「永不自动关闭」，算完不手动 remove 就会一直挂在页面上，
		 * 内容还停在「正在重算」。这里同时给 120 秒兜底，万一异常没走到 remove 也会自己消失。
		 */
		const aiTip = $message.info({ content: `AI 正在重算整卷（${paper.length} 题），通常 5~20 秒…`, duration: 120 });
		const aiStartedAt = Date.now();
		const answers = await requestPaperRedoByAI(paper, verdict.score ?? 0, passScore, round + 1, redoPlan?.history);
		const aiCost = Date.now() - aiStartedAt;
		$console.info(`第 ${round + 1} 轮重做：AI 用时 ${aiCost}ms`);
		aiTip?.remove();
		if (!answers) {
			clearRedoPlan();
			$modal.alert({ content: `作业未达到及格线，但 AI 没有给出可用的新答案，已停止重做。` });
			return;
		}

		writeRedoPlan({
			round: round + 1,
			answers,
			scores: [...(redoPlan?.scores || []), verdict.score ?? 0],
			history: archiveRedoHistory(redoPlan)
		});
		$message.info({ content: `第 ${round + 1} 轮重做：正在重新打开卷子`, duration: 5 });
		await $.sleep(1200);

		/**
		 * 优先点平台弹窗里的「重做」：超星有些作业只认这个入口，
		 * 直接刷新反而停在「已提交」的结果页。
		 */
		const clicked = await clickRedoButton();
		if (clicked) {
			$message.info({ content: '已点击平台的重做按钮，等待卷子重新打开…', duration: 0 });
			await $.sleep(4000);
		}
		/** 没点按钮 / 点了没反应 / 点的不是重开卷子：自己刷新，plan 在 sessionStorage 里接力 */
		location.reload();
	};

	if (preview_mode) {
		worker
			.doWork()
			.then(async (results) => {
				$message.info({ content: '作业/考试完成，请自行检查后保存或提交。', duration: 0 });
				try {
					await submitAndRedoIfFailed(results || []);
				} catch (error: any) {
					$console.error('提交 / 重做流程出错：' + ((error && error.message) || error));
				}
				worker.emit('done');
			})
			.catch((err) => {
				console.error(err);
				$message.error('答题程序发生错误 : ' + err.message);
			});
	} else {
		const getNextBtn = () => document.querySelector('[onclick="getTheNextQuestion(1)"]') as HTMLElement;
		let next = getNextBtn();

		(async () => {
			while (next && worker.isClose === false) {
				await worker.doWork({ enable_debug: BackgroundProject.scripts.dev.cfg.enable_answerer_debug });
				$message.info({ content: '已完成，即将下一题', duration: 0 });
				await $.sleep(3000);
				next = getNextBtn();
				next?.click();
				await $.sleep(1000);
			}

			$message.success({ content: '作业/考试完成，请自行检查后保存或提交。', duration: 0 });
			worker.emit('done');
			// 搜索完成后才会同步答案与题目的显示，防止题目错乱
			CommonProject.scripts.workResults.cfg.questionPositionSyncHandlerType = 'cx';
		})();
	}

	return worker;
}

/**
 * 繁体字识别-字典匹配
 * @see 参考 https://bbs.tampermonkey.net.cn/thread-2303-1-1.html
 */
async function mappingRecognize(doc: Document = document) {
	let typrMapping = Object.create({});
	try {
		// @ts-ignore
		top.typrMapping = top.typrMapping || (await loadTyprMapping());
		// @ts-ignore
		typrMapping = top.typrMapping;
	} catch {
		// 超星考试可能嵌套其他平台中，所以会存在跨域，这里需要处理一下跨域情况，如果是跨域直接在当前页面加载字库
		typrMapping = await loadTyprMapping();
	}

	/** 判断是否有繁体字 */
	const fontFaceEl = Array.from(doc.head.querySelectorAll('style')).find((style) =>
		style.textContent?.includes('font-cxsecret')
	);

	const base64ToUint8Array = (base64: string) => {
		const data = window.atob(base64);
		const buffer = new Uint8Array(data.length);
		for (let i = 0; i < data.length; ++i) {
			buffer[i] = data.charCodeAt(i);
		}
		return buffer;
	};

	const fontMap = typrMapping;
	if (fontFaceEl && Object.keys(fontMap).length > 0) {
		// 解析font-cxsecret字体
		const font = fontFaceEl.textContent?.match(/base64,([\w\W]+?)'/)?.[1];

		if (font) {
			$console.log('正在识别繁体字');

			const code = Typr.parse(base64ToUint8Array(font));

			// 匹配解密字体
			const match: any = {};
			for (let i = 19968; i < 40870; i++) {
				// 中文[19968, 40869]
				const Glyph = Typr.U.codeToGlyph(code, i);
				if (!Glyph) continue;
				const path = Typr.U.glyphToPath(code, Glyph);
				const hex = md5(JSON.stringify(path)).slice(24); // 8位即可区分
				match[i.toString()] = fontMap[hex];
			}
			const fonts = CXAnalyses.getSecretFont(doc);
			// 替换加密字体
			fonts.forEach((el, index) => {
				let html = el.innerHTML;
				for (const key in match) {
					const word = String.fromCharCode(parseInt(key));
					const value = String.fromCharCode(match[key]);

					// 如果相同，则不需要替换
					if (word === value) {
						continue;
					}

					while (html.indexOf(word) !== -1) {
						html = html.replace(word, value);
					}
				}

				el.innerHTML = html;
				el.classList.remove('font-cxsecret'); // 移除字体加密
			});

			$console.log('识别繁体字完成。');
		} else {
			$console.log('未检测到繁体字。');
		}
	}
}

async function loadTyprMapping() {
	$console.log('正在加载繁体字库。');
	return JSON.parse(cxFontTableRaw) as Record<string, number>;
}

/**
 * cx分析工具
 */
/** 目录里的一条章节（新版 .chapter_item 与老版 getTeacherAjax 都归一到这里） */
interface ChapterInfo {
	/** 点击入口：目录里带 onclick 的那个节点（老版是 `span.posCatalog_name`） */
	element: HTMLElement;
	/** 条目容器：`div#cur<chapterId>.posCatalog_select`，id 与「当前选中」类都在它身上 */
	container: HTMLElement;
	chapterId: string;
	title: string;
	/** 目录里的原始位置，用于同组内保持平台给的先后（闯关模式下不能重排） */
	order: number;
	/**
	 * 编号层级（按 `1.7.3` 的段数算）
	 *
	 * 平台把「章 1.7」「节 1.7.1」「小节 1.7.3」全塞在同一个列表里，
	 * 挑目标时必须只取最细那层 —— 挑到 `1.7` 这种章节点，点下去会被带到该章第一节，
	 * 表现就是「明明选的是 1.7.3，却跳到了别的节」。
	 */
	depth: number;
	/** 所属「章」的标题，例如 `1 必修部分`；读不到为空 */
	group: string;
	/** 组优先级：必修 0 / 选修 1 / 其它 2 */
	rank: number;
	/** 剩余任务点；NaN 表示这一条读不到 —— 只是「不知道」，既不代表完成也不代表未完成 */
	unFinishCount: number;
	/** 整页是否用「完成图标」体系（新版 `icon_Completed`）：是的话，没图标就等于没做完 */
	pageUsesIcons?: boolean;
	/**
	 * `unFinishCount` 的语义是否真的是「剩余任务点数」
	 *
	 * 两代目录的隐藏域名字不同（`knowledgeJobCount` / `jobUnfinishCount`），语义只能反推：
	 * 只要页面上存在「带完成图标 且 计数为 0」的小节，就说明它是剩余数；
	 * 反过来满页都是「带图标 且 计数 > 0」，更像总数，那就不能拿它否掉图标。
	 */
	countIsRemaining?: boolean;
	/** 平台自己标的「已完成」（`icon_yiwanc` / `icon_Completed`） */
	done: boolean;
	/** 完成状态原文（已完成 / 待完成 / 未开始 …），计数读不到时作为第二判据 */
	stateText: string;
	clickable: boolean;
}

const CXAnalyses = {
	/** 是否处于闯关模式或者解锁模式 */
	isInSpecialMode() {
		return Array.from(top?.document.querySelectorAll('.catalog_points_sa,.catalog_points_er') || []).length !== 0;
	},
	/** 是否为闯关模式，并且当前章节卡在最后一个待完成的任务点 */
	async isStuckInBreakingMode() {
		if (this.isInSpecialMode()) {
			const chapter = top?.document.querySelector<HTMLElement>('.posCatalog_active');
			if (chapter) {
				const id = chapter.getAttribute('id');
				if (id) {
					// 超星好像会重绘组件，导致无法绑定属性到元素中，所以这里使用页面全局变量存储
					const counter = (await $store.getTab('chapter_counter')) || Object.create({});
					let count = Reflect.get(counter, id);
					count = count ? count + 1 : 1;
					Reflect.set(counter, id, count);

					let res = false;
					if (count >= 3) {
						Reflect.set(counter, id, 1);
						res = true;
					}
					await $store.setTab('chapter_counter', counter);
					return res;
				}
			}
		}
		return false;
	},
	/**
	 * 是否处于最后一小节
	 * 当小节为0，返回 true
	 */
	isInFinalTab() {
		// 上方小节任务栏
		const tabs = Array.from<HTMLElement>(top?.document.querySelectorAll('.prev_ul li') || []);
		if (tabs.length === 0) {
			return true;
		}
		return tabs[tabs.length - 1].classList.contains('active');
	},
	/**
	 * 点平台自己的「下一节」按钮
	 *
	 * 这个按钮背后就是 `PCount.next`，语义是**任务点级**推进：
	 * 本节还有任务点就切下一个任务点（视频→测验→…），全部做完才进下一小节。
	 * 章节顺序、任务点索引、courseId/clazzId 这些参数都是平台渲染时算好写在 onclick 里的，
	 * 比自己拼参数调 `PCount.next` 安全 —— 手拼参数正是之前「往回跳两节」的原因。
	 *
	 * 也不用「点任务点标签」：标签只是把界面切过去，测验内容并不会被学习脚本当成任务点
	 * （实测切过去后一条答题记录都没有，10 秒后就被当成没活跳走）。
	 *
	 * @returns 是否点到了按钮
	 */
	clickPlatformNext(): boolean {
		const btn = this.findPlatformNext();
		if (!btn) return false;
		btn.click();
		return true;
	},
	/** 找到页面上的「下一节」按钮（找不到返回 null，调用方可以先发提示再点） */
	findPlatformNext(): HTMLElement | null {
		const doc = top?.document;
		if (!doc) return null;
		const norm = (value: string | null | undefined) => String(value || '').replace(/\s+/g, '');

		/**
		 * ① 文本/标题就是「下一节」的最内层元素
		 *
		 * 先按文字找，再退回 onclick —— 只按 `PCount.next` 找的话，
		 * 有些页面的「上一节」也是调 `PCount.next`（靠最后一个参数区分方向），
		 * 一旦点错就变成往回跳，用户看到的就是「明明选的是这节，却跳到别处」。
		 */
		const isNextText = (el: HTMLElement) => {
			const text = norm(el.textContent);
			const title = norm(el.getAttribute('title'));
			return text === '下一节' || title === '下一节' || (text.length <= 10 && text.startsWith('下一节'));
		};
		const hits = Array.from(doc.querySelectorAll<HTMLElement>('a, div, span, button')).filter(isNextText);
		const byText =
			hits.find((el) => !Array.from(el.children).some((child) => isNextText(child as HTMLElement))) || hits[0];
		if (byText) return byText;

		/** ② 退回 onclick：`PCount.next(...)`，并排除方向参数像「上一节」的 */
		const byOnclick = Array.from(doc.querySelectorAll<HTMLElement>('[onclick*="PCount.next"]')).filter((el) => {
			if (/上一节/.test(norm(el.textContent))) return false;
			const args = /PCount\.next\(([^)]*)\)/.exec(norm(el.getAttribute('onclick')));
			if (!args) return true;
			const parts = args[1].split(',').map((item) => item.replace(/["'\s]/g, ''));
			/** 第 5 个参数是方向（空串 = 下一节，其余多为上一节/重学） */
			const dir = parts[4] || '';
			return dir === '';
		});
		return byOnclick[0] || null;
	},
	/** 是否处于最后一个章节 */
	isInFinalChapter() {
		return Array.from(top?.document.querySelectorAll('.posCatalog_select') || [])
			.pop()
			?.classList.contains('posCatalog_active');
	},
	/** 是否完成全部章节 */
	isFinishedAllChapters() {
		const infos = this.getChapterInfos();
		if (!infos.length) return false;
		return !infos.some((chapter) => this.isChapterUnfinished(chapter));
	},
	/**
	 * 获取所有章节信息
	 *
	 * 两代目录都要认：
	 * - 新版（mooc2）：`<div class="chapter_item" id="cur<chapterId>" onclick="toOld(...)">`，
	 *   任务点数写在 `input.knowledgeJobCount`；
	 * - 老版：`onclick="getTeacherAjax('courseId','clazzId','<chapterId>')"`，
	 *   任务点数写在 `input.jobUnfinishCount`。
	 *
	 * 以前只认老版（`getTeacherAjax` + `.jobUnfinishCount`），新版目录读出来是空数组 ——
	 * 「完成后跳转未完成任务点」在现网课上等于失效，只能退回平台自带的「下一节」，
	 * 而那个只按 DOM 顺序走，不认必修/选修。
	 */
	getChapterInfos(): ChapterInfo[] {
		const doc = top?.document;
		if (!doc) return [];

		/**
		 * 分组（必修部分 / 选修部分 / 模拟考试 …）
		 *
		 * 页面结构：`li > div.posCatalog_select.firstLayer` 与子项所在的 `ul` 是**兄弟**关系，
		 * 也就是说分组节点并不是条目的祖先 —— `closest('.firstLayer')` 永远返回 null。
		 * 所以只能按**文档顺序**判断归属：条目上方最近的那个分组节点就是它的组。
		 */
		const groups = Array.from(doc.querySelectorAll<HTMLElement>('.posCatalog_select.firstLayer')).map((el) => ({
			el,
			title: (el.querySelector('.posCatalog_title')?.getAttribute('title') || el.textContent || '')
				.replace(/\s+/g, ' ')
				.trim()
		}));
		const groupOf = (el: HTMLElement) => {
			let title = '';
			for (const group of groups) {
				if (group.el === el) continue;
				/** 分组在条目前面（文档顺序）才算这一组的 */
				if (group.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) title = group.title;
			}
			return title;
		};

		/**
		 * 条目的点击入口是内部的 `span.posCatalog_name[onclick]`，
		 * 而「id / 当前选中态」在外层 `div#cur<chapterId>.posCatalog_select` 上。
		 * 两个都要拿：容器用来认状态，点击入口用来跳转。
		 */
		const clickEls = Array.from(
			doc.querySelectorAll<HTMLElement>(
				'[onclick^="getTeacherAjax"], [onclick^="toOld"], .chapter_item[id^="cur"] [onclick]'
			)
		);
		const seen = new Set<HTMLElement>();
		const infos: ChapterInfo[] = [];
		/**
		 * 完成图标可能挂在条目**自身**（新版 `class="chapter_item posCatalog_select icon_Completed"`），
		 * 也可能挂在内部子元素上。`querySelector` 不匹配自身，只查内部会漏 —— 新版目录
		 * 就会变成「一条已完成的都认不出来」，于是每次刷课都从第一节开始。
		 */
		const hasDoneIcon = (el: HTMLElement | null | undefined) =>
			!!el &&
			(/icon_Completed|icon_yiwanc/.test(String(el.className || '')) ||
				!!el.querySelector('[class*="icon_Completed"], [class*="icon_yiwanc"]'));
		/** 新版目录用 `icon_Completed` 标完成：整页只要出现一个，就说明判据是图标而不是任务点数 */
		const pageUsesIcons = clickEls.some(
			(el) => hasDoneIcon(el.closest('.posCatalog_select') as HTMLElement) || hasDoneIcon(el)
		);

		for (const clickEl of clickEls) {
			const container = (clickEl.closest('.posCatalog_select') as HTMLElement) || clickEl;
			if (seen.has(container)) continue;
			seen.add(container);

			const onclick = clickEl.getAttribute('onclick') || container.getAttribute('onclick') || '';
			const fromCur = /^cur(\d+)$/.exec(container.id || '');
			let chapterId = fromCur ? fromCur[1] : '';
			if (!chapterId) {
				const args = /(?:getTeacherAjax|toOld)\s*\(([^)]*)\)/.exec(onclick);
				if (args) {
					const parts = args[1].split(',').map((s) => s.replace(/["'\s]/g, ''));
					/* getTeacherAjax(courseId, clazzId, chapterId) / toOld(courseId, chapterId, clazzId, …) */
					chapterId = /toOld/.test(onclick) ? parts[1] || '' : parts[2] || parts[1] || '';
				}
			}
			if (!chapterId) continue;

			/**
			 * 任务点数：新版在条目内部（`input.knowledgeJobCount`），
			 * 老版是条目的兄弟节点（`input.jobUnfinishCount`），所以先自己找、再退到父节点找。
			 */
			const countEl =
				container.querySelector<HTMLInputElement>('input.knowledgeJobCount, input.jobUnfinishCount') ||
				clickEl.querySelector<HTMLInputElement>('input.knowledgeJobCount, input.jobUnfinishCount') ||
				container.parentElement?.querySelector<HTMLInputElement>(
					'input.knowledgeJobCount, input.jobUnfinishCount'
				);
			const raw = countEl ? String(countEl.value ?? '') : '';
			const unFinishCount = raw === '' ? NaN : Number(raw);

			/** 所属组：先按 firstLayer 分组节点，再退回新版目录的 `.chapter_unit` 章名 */
			let group = groupOf(container);
			if (!group) {
				const unit = container.closest('.chapter_unit');
				const headEl = unit ? (unit.querySelector(':scope > .chapter_item') as HTMLElement | null) : null;
				group = (headEl?.textContent || '').replace(/\s+/g, ' ').trim();
			}

			const nameEl =
				container.querySelector('.posCatalog_name') ||
				container.querySelector('.catalog_name') ||
				clickEl ||
				container;
			const noEl = container.querySelector('.catalog_sbar, .posCatalog_sbar');
			const no = (noEl?.textContent || '').trim();
			const fullName = (nameEl.textContent || '').replace(/\s+/g, ' ').trim();
			const title = no && fullName.startsWith(no) ? fullName.slice(no.length).trim() : fullName;

			/**
			 * 平台自己的完成标记
			 *
			 * 两代目录两套类名：老版 `.catalog_state.icon_yiwanc`，
			 * 新版直接把 `icon_Completed` 放在条目容器里（`class="icon_Completed prevTips"`）。
			 * 只认老版的话，新版目录里**所有章节都会被当成没做完**，于是永远从第一节挑。
			 */
			const stateEl = container.querySelector('.catalog_state');
			const stateCls = stateEl ? String(stateEl.className || '') : '';
			const stateText = (stateEl?.textContent || '').replace(/\s+/g, ' ').trim();
			const completedIcon = container.querySelector('[class*="icon_Completed"], [class*="icon_yiwanc"]');
			const done =
				!!completedIcon ||
				hasDoneIcon(container) ||
				/icon_yiwanc|icon_Completed/.test(stateCls) ||
				/已完成/.test(stateText);

			infos.push({
				element: clickEl,
				container,
				chapterId,
				title,
				order: infos.length,
				depth: no ? no.split('.').filter(Boolean).length : 0,
				group,
				rank: group.indexOf('必修') >= 0 ? 0 : group.indexOf('选修') >= 0 ? 1 : 2,
				unFinishCount,
				done,
				stateText,
				clickable: !!onclick || !!container.querySelector('[onclick]'),
				pageUsesIcons
			});
		}

		/**
		 * 反推 `unFinishCount` 的语义（剩余数 / 总数）
		 *
		 * - 存在「带完成图标 且 计数为 0」的小节 → 这是剩余数（已完成 = 剩 0 个），可信；
		 * - 只有「带图标 且 计数 > 0」→ 更像总数，不能拿它否掉完成图标，
		 *   否则整门课都会被判成没做完，每次刷课从第一节重来。
		 */
		const doneWithZero = infos.some((info) => info.done && info.unFinishCount === 0);
		const doneWithPositive = infos.some((info) => info.done && info.unFinishCount > 0);
		const countIsRemaining = doneWithZero || !doneWithPositive;
		for (const info of infos) info.countIsRemaining = countIsRemaining;

		return infos;
	},
	/**
	 * 这一条到底还有没有活干
	 *
	 * 判据按可信度排：
	 *   1. 剩余任务点数（且已确认是「剩余数」语义）→ 以它为准，能压过完成图标；
	 *   2. 平台标了「已完成」→ 没活干；
	 *   3. 读不到计数 → 新版目录看有没有完成图标（没图标=没做完），
	 *      老版目录没有图标也没有计数 → 视为已完成。
	 *
	 * ⚠️「读不到」不能直接当成「未完成」：实测老目录里**没有计数 input 就等于做完了**，
	 * 当成未完成会让人反复跳回已经学完的章节。
	 */
	isChapterUnfinished(info: ChapterInfo): boolean {
		const hasCount = !isNaN(info.unFinishCount);
		/**
		 * ⚠️ 计数排在完成图标**前面**，但要先确认这个计数是「剩余数」而不是「总数」
		 *
		 * 平台对「任务点做完了、测验还没做」的小节经常已经打了 `icon_Completed`，
		 * 但它的剩余任务点数仍然是 1。以前这里第一行 `if (info.done) return false`
		 * 一票否决，这种节就被当成已完成：自动刷课直接跳过、永远不会进那一节，
		 * 测验也就永远不做 —— 这正是「视频完成的、测验未完成的那节永远跳不到测试页」的根因。
		 *
		 * 但反过来，如果 `knowledgeJobCount` 存的是**任务点总数**，照它判会让整门课
		 * 永远「未完成」（每次从第一节开始）。所以先看 `countIsRemaining`
		 * （页级反推，见 `getChapterInfos` 末尾）：只有确认是剩余数时才敢压过图标。
		 */
		if (hasCount && info.countIsRemaining) return info.unFinishCount > 0;
		/**
		 * 状态文字明说「待完成 / 未完成 / 未开始」→ 一定有活
		 *
		 * 平台打完成图标有时是滞后的（任务点做完了就点亮，测验还没做），
		 * 而状态文字是按真实进度写的，两者冲突时信文字。
		 */
		if (/(待完成|未完成|未开始|进行中)/.test(info.stateText)) return true;
		if (info.done) return false;
		/** 计数是「总数」时不能拿来判完成 */
		if (hasCount) return false;
		/**
		 * 读不到任务点数时看目录体系：
		 * - 新版目录用 `icon_Completed` 标完成 → 没图标就是**没做完**；
		 * - 老版目录没有图标、也没有计数 → 视为已完成（实测老目录「没有计数 input = 做完了」）。
		 */
		if (info.pageUsesIcons) return true;
		return false;
	},
	/**
	 * 这个条目是不是「当前正在学的」
	 *
	 * 老目录的条目没有 `id="cur<chapterId>"`，所以不能用
	 * `.posCatalog_active[id="cur…"]` 判断（那个选择器永远不命中，
	 * 会让「进入未完成章节」每次都当成没进去，反复重进同一章）。
	 */
	isChapterActive(info: ChapterInfo): boolean {
		const el = info.container;
		return el.classList.contains('posCatalog_active') || !!el.parentElement?.classList.contains('posCatalog_active');
	},
	/** 目录里有没有「必修/选修」分组：有的话，模拟考试之类不参与刷课 */
	hasNamedGroups(infos: ChapterInfo[]): boolean {
		return infos.some((info) => info.rank === 0 || info.rank === 1);
	},
	/** 点目录里的条目：onclick 可能挂在整行，也可能挂在名字上 */
	clickChapter(info: ChapterInfo) {
		const target = info.element.hasAttribute('onclick')
			? info.element
			: info.element.querySelector<HTMLElement>('[onclick]') || info.element;
		target.click();
	},
	scrollToActiveChapter() {
		const activeChapter = top?.document.querySelector<HTMLElement>('.posCatalog_active');
		if (activeChapter) {
			activeChapter.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	},
	/**
	 * 等待并获取章节信息，直到获取到章节信息为止
	 * - 可设置超时时间（单位秒），默认10秒
	 * - 超时后返回空数组
	 */
	waitForChapterInfos(timeout = 10) {
		return new Promise<any[]>((resolve) => {
			let lastCount = -1;
			let stable = 0;
			const interval = setInterval(() => {
				const res = this.getChapterInfos();
				if (res.length > 0) {
					/**
					 * 目录是**分批塞进 DOM** 的
					 *
					 * 第一次读到非空时，往往只有前几条、或者只有章级条目（1.1、1.2…），
					 * 拿这份不完整的列表去挑「未完成章节」，就会挑到错的位置 ——
					 * 用户看到的就是「页面刚打开、脚本刚开始跑，就自动定位到别的节」。
					 * 连续两次读到的条数一致才认为渲染完成。
					 */
					if (res.length === lastCount) stable += 1;
					else {
						lastCount = res.length;
						stable = 0;
					}
					if (stable >= 1) {
						clearInterval(interval);
						clearTimeout(to);
						resolve(res);
					}
				}
			}, 800);

			const to = setTimeout(() => {
				clearInterval(interval);
				resolve(this.getChapterInfos());
			}, timeout * 1000);
		});
	},
	/** 检测页面是否使用字体加密 */
	getSecretFont(doc: Document = document) {
		return Array.from(doc.querySelectorAll('.font-cxsecret')).map((font) => {
			// 这里吧选项按钮和文字分离，如果不分离的话 .font-cxsecret 元素下面还包含选项按钮时，替换时会吧按钮也删除掉导致选项按钮不可用
			const after = font.querySelector('.after');
			return after === null ? font : after;
		}) as HTMLElement[];
	},
	/**
	 * 检测当前章节是否完成
	 */
	isCurrentChapterFinished() {
		const job = top?.document.querySelector('.posCatalog_active');
		if (job) {
			if (job.querySelector('.icon_Completed') !== null) {
				return true;
			}
		}
		return false;
	}
};

/**
 * 屏蔽倍速限制
 */
function rateHack() {
	state.study.hacked = false;
	let dragCount = 0;
	try {
		hack();
		window.document.addEventListener('readystatechange', hack);
		window.addEventListener('load', hack);
	} catch (e) {
		console.error(e);
	}

	function hack() {
		const videojs = $gm.unsafeWindow.videojs;
		const Ext = $gm.unsafeWindow.Ext;

		if (typeof videojs !== 'undefined' && typeof Ext !== 'undefined') {
			if (state.study.hacked) {
				return;
			}
			state.study.hacked = true;

			const _origin = videojs.getPlugin('seekBarControl');
			const plugin = videojs.extend(videojs.getPlugin('plugin'), {
				constructor: function (videoExt: any, data: any) {
					const _sendLog = data.sendLog;
					data.sendLog = (...args: any[]) => {
						if (args[1] === 'drag') {
							dragCount++;
							// 开始播放的时候偶尔会卡顿，导致一直触发 drag 事件（超星的BUG）
							// 这里如果卡顿太多，尝试暂停视频，然后等待视频自动开始。
							if (dragCount > 100) {
								dragCount = 0;
								$el('video')?.pause();
							}
						} else {
							_sendLog.apply(data, args);
						}
					};

					_origin.apply(_origin.prototype, [videoExt, data]);
				}
			});

			videojs.registerPlugin('seekBarControl', plugin);

			// 重写超星视频插件
			Ext.define('ans.VideoJs', {
				override: 'ans.VideoJs',
				constructor: function (data: any) {
					this.addEvents(['seekstart']);
					this.mixins.observable.constructor.call(this, data);
					const vjs = videojs(data.videojs, this.params2VideoOpt(data.params), function () {});
					Ext.fly(data.videojs).on('contextmenu', function (f: any) {
						f.preventDefault();
					});
					Ext.fly(data.videojs).on('keydown', function (f: any) {
						if (f.keyCode === 32 || f.keyCode === 37 || f.keyCode === 39 || f.keyCode === 107) {
							f.preventDefault();
						}
					});

					// 保存清晰度设置
					if (vjs.videoJsResolutionSwitcher) {
						vjs.on('resolutionchange', function () {
							const cr = vjs.currentResolution();
							const re = cr.sources ? cr.sources[0].res : false;
							Ext.setCookie('resolution', re);
						});
					}

					// 保存公网设置
					if (vjs.videoJsPlayLine) {
						vjs.on('playlinechange', function () {
							const cp = vjs.currentPlayline();
							Ext.setCookie('net', cp.net);
						});
					}

					// 下面连着一个倍速限制方法，这里直接不写，实现可以倍速
				}
			});
		}
	}
}

/**
 * cx 任务学习
 */
export async function study(
	opts: typeof CXProject.scripts.study.cfg & {
		workOptions: CommonWorkOptions;
	}
) {
	await $.sleep(3000);

	const searchedJobs: Job[] = [];

	let searching = true;

	let attachmentCount: number = $gm.unsafeWindow.attachments?.length || 0;

	const wait_timeout = 3 + attachmentCount * 2;

	/** 考虑到网速级慢的同学，所以10秒后如果还没有任务点才停止 */
	setTimeout(() => {
		searching = false;
	}, Math.min(wait_timeout, 10) * 1000);

	/**
	 * 递归运行任务点，一旦有新的任务点被检测到直接开始
	 * 如果10秒内既没有任务点，也暂停了搜索，则当前则没有任务点
	 */
	const runJobs = async () => {
		const job = searchJob(opts, searchedJobs);
		// 如果存在任务点
		if (job && job.func) {
			try {
				await job.func();
			} catch (e) {
				$console.error('未知错误', e);
			}

			await $.sleep(1000);
			await runJobs();
		}
		// 每次 search 一次，就减少一次文件数量
		// 如果不加这个判断，三个任务中，中间的任务不是任务点，则会导致下面的任务全部不执行。
		else if (attachmentCount > 0) {
			attachmentCount--;
			await $.sleep(1000);
			await runJobs();
		}
		// 或者正在搜索
		else if (searching) {
			await $.sleep(1000);
			await runJobs();
		}
	};

	await runJobs();

	/**
	 * 跳转前的二次确认：本节明明还有活、却一个任务点都没搜到 → 再等一轮
	 *
	 * `runJobs` 的搜索窗口只有 `3 + attachmentCount * 2` 秒（上限 10 秒）。
	 * 网络慢、iframe 还没渲染完、平台把任务点内容延迟加载时，这 10 秒里什么都搜不到，
	 * 脚本就会认为「本节任务点已完成」直接点「下一节」走人 —— 用户看到的正是
	 * 「一开网页、脚本刚开始跑，就自动定位到别的节」。
	 *
	 * 判据来自平台自己的任务点数据（`top.attachments`）：
	 * 有 `job=true`（未完成任务点）却一个都没识别出来，八成是还没加载好，再给 15 秒。
	 * 任务点都已完成（没有 job=true）时不等待，不影响正常跳转速度。
	 */
	const attachmentsOnLoad = (($gm.unsafeWindow as any).attachments || []) as any[];
	const pendingJobs = attachmentsOnLoad.filter((item) => item && item.job).length;
	if (pendingJobs > 0 && searchedJobs.length === 0) {
		const msg = `本节还有 ${pendingJobs} 个未完成任务点，但一个都没加载出来，再等最多 15 秒`;
		$console.warn('[自动刷课] ' + msg);
		traceRedo(msg);
		const deadline = Date.now() + 15000;
		while (Date.now() < deadline && searchedJobs.length === 0) {
			searching = true;
			setTimeout(() => {
				searching = false;
			}, 3000);
			await runJobs();
			await $.sleep(500);
		}

		/**
		 * 等完还是没有 → 把现场记下来
		 *
		 * 「测验 tab 明明已经激活、attachments 里也有 job=true，但一个任务点都搜不到」
		 * 这种情况光看代码猜不出来，把 iframe 数量、卷面题数、以及有没有 jobid 写进日志，
		 * 下次直接能定位是「内容没加载」还是「searchJob 的 jobid 判定把它挡了」。
		 */
		if (searchedJobs.length === 0 && pendingJobs > 0) {
			try {
				const frames = searchIFrame($gm.unsafeWindow.document);
				let tiMu = 0;
				const frameInfo: string[] = [];
				for (const frame of frames) {
					const doc = frame.contentWindow?.document;
					if (!doc) continue;
					const n = doc.querySelectorAll('.TiMu').length;
					tiMu += n;
					const data = frame.getAttribute('data') || '';
					const jobid = /"jobid"\s*:\s*"?(\d+)/.exec(data)?.[1] || /_jobid"?\s*:\s*"?(\d+)/.exec(data)?.[1] || '';
					frameInfo.push(`${n}题/jobid=${jobid || '无'}`);
				}
				const msg = `本节仍有 ${pendingJobs} 个未完成任务点没识别到：iframe ${frames.length} 个，卷面 .TiMu ${tiMu} 个，明细 ${frameInfo.slice(0, 4).join(' ; ') || '(无)'}`;
				$console.warn('[自动刷课] ' + msg);
				traceRedo(msg);
			} catch (error) {
				$console.warn('[自动刷课] 任务点诊断失败：' + ((error as any)?.message || String(error)));
			}
		}
	}

	// @ts-ignore
	top._preChapterId = '';

	// 下一章
	const next = async () => {
		/**
		 * ① 交给平台自己的「下一节」驱动（唯一主路径）
		 *
		 * 平台按钮背后是 `PCount.next`，任务点级推进：本节还有任务点就切下一个任务点，
		 * 全部做完才进下一小节。参数由页面渲染时算好，比自己拼更不会出错。
		 *
		 * 这里**不自作聪明**地按目录找「下一个未完成小节」：
		 * 目录里的完成图标 / 剩余任务点数都不可靠（「视频完成、测验未做」的节会被标成完成），
		 * 按目录跳就会跳过一个真正有测验的小节，用户看到的就是「跳到了另一个」。
		 */
		if (CXAnalyses.isInFinalTab()) {
			if (await CXAnalyses.isStuckInBreakingMode()) {
				return $modal.alert({
					content:
						'检测到当前课程为闯关模式（有小旗帜图标）, 但是已经重复进入多次，应该是章节测试没有完成，或者其他情况导致，请手动完成章节测试，然后手动点击下一章。'
				});
			}
		}

		/**
		 * 最后一章 + 最后一个任务点：平台按钮点了也是弹「已经是最后一节」，
		 * 这里先给出脚本自己的收尾提示，避免停在原地反复点。
		 */
		if (CXAnalyses.isInFinalChapter() && CXAnalyses.isInFinalTab()) {
			let content = '';

			if (opts.backToFirstWhenFinish) {
				content = '已经抵达最后一个章节，10秒后返回第一个章节重新开始。';
				setTimeout(() => {
					top?.document.querySelector<HTMLElement>('.posCatalog_name')?.click();
				}, 10 * 1000);

				$message.info({ content, duration: 30 });
			} else {
				if (CXAnalyses.isFinishedAllChapters()) {
					content = '全部任务点已完成！';
				} else {
					content = '已经抵达最后一个章节！但仍然有任务点未完成，请手动切换至未完成的章节。';
				}

				$modal.alert({ content: content });
			}

			CommonProject.scripts.settings.methods.notificationBySetting(content, {
				duration: 0,
				extraTitle: '超星学习通学习脚本'
			});
			return;
		}

		/**
		 * 平台「下一节」：先提示、留出显示时间、再点
		 *
		 * 平台按钮点下去页面立刻跳转，而 `$message` 在 iframe 里要到顶层才能显示
		 * （跨域时还得走 chrome.storage 往返）。先点后发，消息会被跳转直接带走
		 * —— 用户看到的就是「有时候通知不显示」。
		 */
		if (CXAnalyses.findPlatformNext()) {
			const msg = '本节任务点已完成，点击平台「下一节」';
			$console.info('[自动刷课] ' + msg);
			traceRedo(msg);
			$message.info({ content: msg, duration: 4 });
			await $.sleep(900);
			if (CXAnalyses.clickPlatformNext()) return;
		}

		/** ② 兜底：页面结构变了、找不到「下一节」按钮时才按目录找 */
		$console.warn('没有找到平台「下一节」按钮，回退目录跳转（可能跳转位置不准）');
		if (CXProject.scripts.study.cfg.mode === 'job') {
			// 检测当前章节是否完成，如果已经完成则下一章
			// 如果没有需要完成的章节，则暂停运行

			if (CXAnalyses.isInFinalTab()) {
				// 找到未完成
				const elements = CXAnalyses.getChapterInfos()
					.filter((el) => el.unFinishCount > 0 || el.element.parentElement?.classList.contains('posCatalog_active'))
					.map((el) => el.element.parentElement as HTMLElement);
				if (elements.length === 0) {
					const content = '全部任务点已完成！';
					$modal.alert({ content: content });
					CommonProject.scripts.settings.methods.notificationBySetting(content, {
						duration: 0,
						extraTitle: '超星学习通学习脚本'
					});
					return;
				}

				let nextChapter = elements[0];
				// 如果当前章节未完成，则跳转到下一个未完成章节
				const currentIndex = elements.findIndex((el) => el.classList.contains('posCatalog_active'));
				if (currentIndex !== -1 && currentIndex + 1 < elements.length) {
					nextChapter = elements[currentIndex + 1];
					CXAnalyses.scrollToActiveChapter();
					setTimeout(() => {
						nextChapter.querySelector<HTMLElement>('.posCatalog_name')?.click();
					}, 1000);
				}
			}
		} else if (CXProject.scripts.study.cfg.mode === 'next') {
			const curCourseId = $el<HTMLInputElement>('#curCourseId', top?.document);
			const curChapterId = $el<HTMLInputElement>('#curChapterId', top?.document);
			const curClazzId = $el<HTMLInputElement>('#curClazzId', top?.document);
			const count = $$el('#prev_tab .prev_ul li', top?.document);

			// 自动下一个小节
			if (curChapterId && curCourseId && curClazzId) {
				// @ts-ignore
				top._preChapterId = curChapterId.value;
				CXAnalyses.scrollToActiveChapter();
				// 等待跳转动画完成
				await $.sleep(200);

				/**
				 * 兜底：退回平台 `PCount.next`（和 git 原版一致的参数）
				 *
				 * 只在页面上找不到「下一节」按钮时才会走到这里（结构改版）。
				 * 参数用原版那套：第一个是本节任务点数量，后面是 course/clazz/chapter id。
				 */
				$console.warn('回退平台 PCount.next 跳转（按钮没找到，位置可能不准）');
				// @ts-ignore
				top?.PCount.next(count.length.toString(), curChapterId.value, curCourseId.value, curClazzId.value, '');
			} else {
				$console.warn('参数错误，无法跳转下一章，请尝试手动切换。');
			}
		} else {
			$console.warn('未知的跳转模式，请联系作者反馈');
		}
	};

	if (CXProject.scripts.study.cfg.mode !== 'manually') {
		const msg = '页面任务点已完成，即将跳转。';
		$message.success({ content: msg });
		$console.info(msg);
		await $.sleep(5000);
		next();
	} else {
		const msg = '页面任务点已完成，自动跳转已关闭，请手动跳转。';
		$message.warn({ content: msg, duration: 0 });
		$console.warn(msg);
	}
}

function searchIFrame(root: Document) {
	let list = Array.from(root.querySelectorAll('iframe'));
	const result: HTMLIFrameElement[] = [];
	while (list.length) {
		const frame = list.shift();

		try {
			if (frame && frame?.contentWindow?.document) {
				result.push(frame);
				const frames = frame?.contentWindow?.document.querySelectorAll('iframe');
				list = list.concat(Array.from(frames || []));
			}
		} catch (e) {
			// @ts-ignore
			console.log(e.message);
		}
	}
	return result;
}

/**
 * 搜索任务点
 */
function searchJob(
	opts: typeof CXProject.scripts.study.cfg & {
		workOptions: CommonWorkOptions;
	},
	searchedJobs: Job[]
): Job | undefined {
	const knowCardWin = $gm.unsafeWindow;

	const searchJobElement = (root: HTMLIFrameElement) => {
		return domSearch(
			{
				videojs: '#video,#audio',
				chapterTest: '.TiMu',
				read: '#img.imglook',
				pptWithAudio: '.swiper-container',
				hyperlink: '#hyperlink',
				timereader: 'iframe[name="bookifame"][src*="timing"]'
			},
			root.contentWindow!.document
		);
	};

	const search = (root: HTMLIFrameElement): Job | undefined => {
		const win = root.contentWindow;

		const { videojs, read, chapterTest, hyperlink, pptWithAudio, timereader } = searchJobElement(root);

		if (win && (videojs || read || chapterTest || hyperlink || pptWithAudio || timereader)) {
			// 获取任务点数据字符串
			const frame_data_str =
				win.frameElement?.getAttribute('data') ||
				// 带音频的PPT，套了两层iframe
				(win.frameElement as HTMLIFrameElement)?.contentWindow?.parent.frameElement?.getAttribute('data') ||
				'{}';
			const frame_data = JSON.parse(frame_data_str);
			const target_jobid = frame_data.jobid || frame_data._jobid;
			if (!target_jobid) {
				return;
			}

			// 获取任务点数据
			const attachment: Attachment | undefined = (knowCardWin.attachments as any[]).find((attachment) => {
				const attachment_jobid = attachment.jobid || attachment.property._jobid;
				if (!attachment_jobid) {
					return false;
				}
				return String(attachment_jobid) === String(target_jobid);
			});

			// 任务点去重
			if (attachment && searchedJobs.find((job) => job.mid === attachment.property.mid) === undefined) {
				const { name, title, bookname, author } = attachment.property;
				const jobName = name || title || (bookname ? bookname + author : undefined) || '未知任务';

				const work_type = attachment.job ? 'job' : attachment.isPassed ? 'finished' : 'not-job';

				let func: { (): Promise<any> } | undefined;

				if (videojs) {
					if (!CXProject.scripts.study.cfg.enableMedia) {
						const msg = `音视频自动学习功能已被关闭（在上方菜单栏，超星学习通-课程学习中开启）。${jobName} 即将跳过`;
						$message.warn({ content: msg, duration: 10 });
						$console.warn(msg);
					} else {
						if (
							// 未完成
							work_type === 'job' ||
							// 重复学习
							(work_type === 'finished' && opts.restudy) ||
							// 强制学习
							(work_type === 'not-job' && opts.forceLearn)
						) {
							func = () => {
								const msg =
									`即将${
										work_type === 'finished' && opts.restudy
											? '重新'
											: work_type === 'not-job' && opts.forceLearn
											? '强制'
											: ''
									}播放 : ` + jobName;
								$message.info({ content: msg });
								$console.log(msg);
								return JobRunner.media(opts, win.document);
							};
						}
					}
				} else if (chapterTest) {
					if (!CXProject.scripts.study.cfg.enableChapterTest) {
						const msg = `章节测试自动答题功能已被关闭（在上方菜单栏，超星学习通-课程学习中开启）。${jobName} 即将跳过`;
						$message.warn({ content: msg, duration: 10 });
						$console.warn(msg);
					} else {
						const status = win.document.querySelector<HTMLElement>('.testTit_status');

						// 已完成
						if (status?.classList.contains('testTit_status_complete')) {
							const msg = `章节测试已完成 : ` + jobName;
							$message.success({ content: msg });
							$console.log(msg);
						} else {
							if (
								// 未完成
								work_type === 'job' ||
								// / 强制学习
								(work_type === 'not-job' && CommonProject.scripts.settings.cfg['work-when-no-job'])
							) {
								if (opts.workOptions.answererWrappers === undefined || opts.workOptions.answererWrappers.length === 0) {
									answerWrapperEmptyWarning(0);
								} else {
									func = () => {
										const msg = `开始答题 : ` + jobName;
										$message.info({ content: msg });
										$console.log(msg);
										return JobRunner.chapter(root, opts.workOptions);
									};
								}
							}
							if (work_type === 'not-job' && CommonProject.scripts.settings.cfg['work-when-no-job'] === false) {
								const msg = `当前作业 ${jobName} 不是任务点，但待完成，如需开启自动答题请前往：通用-全局设置，开启强制答题。`;
								$message.warn({ content: msg });
								$console.warn(msg);
							}
						}
					}
				} else if (read || pptWithAudio || timereader) {
					if (!CXProject.scripts.study.cfg.enablePPT) {
						const msg = `PPT/书籍阅读功能已被关闭（在上方菜单栏，超星学习通-课程学习中开启）。${jobName} 即将跳过`;
						$message.warn({ content: msg, duration: 10 });
						$console.warn(msg);
					} else {
						if (attachment.job) {
							func = () => {
								const msg = `正在学习 : ` + jobName;
								$message.info({ content: msg });
								$console.log(msg);
								if (read) {
									return JobRunner.read(win);
								} else if (timereader) {
									return JobRunner.timereader(timereader as HTMLIFrameElement);
								} else {
									return JobRunner.readPPTWithAudio(win);
								}
							};
						}
					}
				} else if (hyperlink) {
					if (!CXProject.scripts.study.cfg.enableHyperlink) {
						const msg = `链接任务点已被关闭（在上方菜单栏，超星学习通-课程学习中开启）。${jobName} 即将跳过`;
						$message.warn({ content: msg, duration: 10 });
						$console.warn(msg);
					} else {
						if (attachment.job) {
							func = () => {
								const msg = `正在完成链接阅读任务 : ` + jobName;
								$message.info({ content: msg });
								$console.log(msg);
								return JobRunner.hyperlink(hyperlink);
							};
						}
					}
				}

				const job = {
					mid: attachment.property.mid,
					attachment: attachment,
					func: func
				};

				searchedJobs.push(job);

				return job;
			}
		}
	};

	let job;

	for (const iframe of searchIFrame(knowCardWin.document)) {
		job = search(iframe);
		if (job) {
			return job;
		}
	}

	return job;
}

/**
 * 永久固定显示视频进度
 */
export function fixedVideoProgress() {
	if (state.study.videojs) {
		const { bar } = domSearch({ bar: '.vjs-control-bar' }, state.study.videojs as any);
		if (bar) {
			bar.style.opacity = '1';
		}
	}
}

/**
 * 任务点运行器
 */
const JobRunner = {
	/**
	 * 播放视频和音频
	 */
	async media(
		setting: {
			playbackRate: number;
			volume: number;
			videoQuizStrategy: VideoQuizStrategy;
			workOptions?: CommonWorkOptions;
		},
		doc: Document
	) {
		const { playbackRate = 1, volume = 0 } = setting;

		const media = await waitForMedia({ root: doc });

		// @ts-ignore
		const { videojs } = domSearch({ videojs: '#video,#audio' }, doc);

		if (!videojs || !media) {
			$console.error('视频检测不到，请尝试刷新或者手动切换下一章。');
			return;
		}

		state.study.videojs = videojs;
		// @ts-ignore
		top.currentMedia = media;

		// 固定视频进度
		fixedVideoProgress();

		// 视频内题目作答（随机 / AI题库）
		if (setting.videoQuizStrategy === 'random' || setting.videoQuizStrategy === 'ai') {
			const strategy = setting.videoQuizStrategy;

			/**
			 * 点击一个选项并回读选中态
			 *
			 * 超星视频弹题的选项是
			 * `<li class="ans-videoquiz-opt"><label><span class="tkRadio"><input type="radio"><i></i></span>A、可以</label></li>`，
			 * 真正的 `input[type=radio]` 被 `opacity:0` 藏在圆圈下面（尺寸 18px，`display:block`）。
			 *
			 * `label.click()` 只有**真实用户点击**时才会触发浏览器「label → 控件的隐式激活」；
			 * 脚本用 `el.click()` / `dispatchEvent` 派发的合成事件不走这条路径 ——
			 * 实测点完 `input.checked` 仍是 `false`，页面看起来「题目没选上」，
			 * 而下面的提交逻辑照样点了「提交」，等于交白卷。
			 * `input.click()` 是原生方法，直接切换 checked 并派发 change，稳定生效。
			 */
			const clickOption = async (el: HTMLElement | undefined) => {
				if (!el) return false;
				if (isChoiceSelected(el)) return true;

				const input = el.querySelector<HTMLInputElement>('input[type="radio"], input[type="checkbox"]');
				if (input) {
					input.click();
					await $.sleep(150);
					if (isChoiceSelected(el)) return true;
					/** 框架拦了 change 时兜底：直接置位再通知一次 */
					input.checked = true;
					input.dispatchEvent(new Event('change', { bubbles: true }));
					await $.sleep(150);
					if (isChoiceSelected(el)) return true;
				}

				el.click();
				await $.sleep(150);
				if (isChoiceSelected(el)) return true;
				trustedPointerClick(el);
				await $.sleep(150);
				return isChoiceSelected(el);
			};

			/** 使用 AI 题库作答；返回是否真的选中，以及题库是否给出了答案 */
			const answerByAI = async (
				list: HTMLElement[],
				root?: HTMLElement
			): Promise<{ ok: boolean; hasAnswer: boolean }> => {
				/**
				 * 题干必须从**当前这一题**的容器里提取
				 *
				 * 一次弹题可能是「共 2 题」，容器里有两组选项。整块 `.ans-videoquiz`
				 * 当 root 会把两题的选项混在一起，题干也只取到第一题的 ——
				 * 答案自然对不上。这里用调用方传进来的单题容器。
				 */
				const container =
					root ||
					doc.querySelector<HTMLElement>('#video .ans-videoquiz') ||
					doc.querySelector<HTMLElement>('.ans-videoquiz') ||
					list[0].parentElement;

				if (!container) return { ok: false, hasAnswer: false };

				$console.info('正在使用 AI 题库作答视频内题目...');
				try {
					const ret = await answerVideoQuiz({
						root: container,
						optionElements: list,
						click: clickOption,
						answererWrappers: setting.workOptions?.answererWrappers
					});

					if (ret.ok) {
						$console.log(`AI 题库作答成功：${ret.title} => ${ret.answers.join(' / ')}`);
						return { ok: true, hasAnswer: true };
					}

					// 答案已经选出来了、只是点击没落地：这时候再随机点一个只会把答案覆盖掉
					if (ret.answers.length > 0) {
						$console.warn(
							`AI 题库已选出答案但点击未生效（${ret.error || '未回显选中态'}）：` +
								`${ret.title} => ${ret.answers.join(' / ')}`
						);
						return { ok: false, hasAnswer: true };
					}

					$console.warn(`AI 题库未匹配到答案（${ret.error || '未知原因'}），将随机作答：${ret.title}`);
				} catch (error: any) {
					$console.error('AI 题库作答失败：' + ((error && error.message) || String(error)));
				}
				return { ok: false, hasAnswer: false };
			};

			// 同一道题只作答一次：提交之后 #videoquiz-submit 往往不会立刻消失，
			// 3 秒后重入会把这题再答一遍（日志反复「作答成功」，随机策略下还会覆盖已选答案）。
			// 用选项文字拼指纹，指纹没变就只等容器消失，不再重复作答和提交。
			let lastAnsweredKey = '';
			/** 同一题的「点了但没选中」重试计数 */
			let pickRetry = 0;

			const loop = async () => {
				// 原本靠尾部递归实现「每 3 秒检测一次」，会无限堆积调用栈，改成普通循环
				while (true) {
					const submitBtn = () => doc.querySelector<HTMLElement>('#videoquiz-submit');
					if (submitBtn()) {
						/**
						 * 只取「当前这一题」的选项
						 *
						 * 视频弹题可能是**一次两题**（容器里写着「共 2 题，已答对 1 题」）。
						 * 直接在整块 `.ans-videoquiz` 里取 `.ans-videoquiz-opt`，会把两题的选项
						 * 混成一组（4 个），而题干只取到第一题的 —— 答案错位、点选也不会对上。
						 * 这里定位到当前可见的那个 `.tkItem`，只在这一题里取选项和题干。
						 */
						const itemEls = Array.from(doc.querySelectorAll<HTMLElement>('.ans-videoquiz .tkItem'));
						const activeItem = itemEls.find((el) => el.offsetHeight > 0) || itemEls[0];
						const scope: ParentNode = activeItem || doc;
						const list = Array.from(scope.querySelectorAll<HTMLElement>('.ans-videoquiz-opt label'));

						// 选项还没渲染出来时不要提交空答案，等下一轮
						if (list.length === 0) {
							await $.sleep(3000);
							continue;
						}

						/**
						 * 去重指纹：题干 + 选项 + 平台的「已答对数」
						 *
						 * 旧指纹只有选项文字。两题的选项**完全一样**时（超星这种情况很常见，
						 * 比如都是「A、可以 / B、不可以」），第二题会被当成本节已作答的同一题
						 * 直接 `continue` 跳过 —— 弹题就一直停在那里没人选。
						 */
						const stem = (activeItem?.querySelector('.tkItem_title')?.textContent || '')
							.replace(/\s+/g, ' ')
							.trim();
						const boxId =
							(doc.querySelector<HTMLElement>('.ans-videoquiz')?.id || '').trim();
						const rightNum = (doc.querySelector('#rightNum')?.textContent || '').trim();
						const key =
							`${boxId}|${stem}|${rightNum}|` + list.map((el) => (el.textContent || '').trim()).join('|');
						if (key && key === lastAnsweredKey) {
							// 这道题已经答过并提交过，等平台的题目容器自己消失
							await $.sleep(3000);
							continue;
						}

						let answered = false;
						let hasAnswer = false;
						if (strategy === 'ai') {
							const ret = await answerByAI(list, activeItem);
							answered = ret.ok;
							hasAnswer = ret.hasAnswer;
						}

						// 已经选出答案只是没点中时不要随机覆盖，直接提交
						if (!answered && !hasAnswer) {
							const answer = list[Math.floor(Math.random() * list.length)];
							await clickOption(answer);
						}

						/**
						 * 提交前回读：必须真的有一项被选中
						 *
						 * 旧逻辑不管有没有点中都会点「提交」—— 页面上就是「题目没选上」却已经交卷，
						 * 这题判错，还会被 `lastAnsweredKey` 标记成「已作答」，再也不会重试。
						 * 一个都没选中就先不提交，3 秒后重来（最多 5 次，避免真点不动时卡死）。
						 */
						const anyPicked = list.some((el) => isChoiceSelected(el));
						if (!anyPicked) {
							pickRetry += 1;
							const warn = `视频弹题：选项没有回显选中态，暂不提交（第 ${pickRetry} 次）`;
							$console.warn(warn);
							traceRedo(warn);
							if (pickRetry < 5) {
								await $.sleep(3000);
								continue;
							}
							$console.error('视频弹题：连续 5 次都没能选中选项，跳过这题');
						}

						if (key) lastAnsweredKey = key;
						pickRetry = 0;
						submitBtn()?.click();
						await $.sleep(3000);
						// 隐藏视频内题目元素
						const container = doc.querySelector<HTMLElement>('#video .ans-videoquiz');
						const components = Array.from(doc.querySelectorAll<HTMLElement>('.x-component-default'));
						if (container) {
							container.remove();
						}
						if (components.length) {
							for (const com of components) {
								com.style.display = 'none';
							}
						}
					}
					await $.sleep(3000);
				}
			};
			void loop();
		}

		/**
		 * 视频播放
		 */
		return new Promise<void>((resolve, reject) => {
			// 检测视频
			const reloadInterval = setInterval(() => {
				const errorDiv = doc.querySelector<HTMLElement>('.vjs-modal-dialog-content');
				if (
					['视频文件损坏', '网络错误导致视频下载中途失败', '视频因格式不支持', '网络的问题无法加载'].some((s) =>
						errorDiv?.innerText.includes(s)
					)
				) {
					$console.error('检测到视频加载失败，即将跳过视频。');
					$message.error('检测到视频加载失败，即将跳过视频。');
					setTimeout(resolve, 3000);
				}
			}, 3000);

			const playFunction = async () => {
				// 这里先判断，再检测，否则后续添加多个 await 会导致视频启动等待时间过长，导致用户误认为脚本失效
				if (hasFaceRecognition()) await waitForFaceRecognition();
				if (hasNewFaceRecognition()) await waitForNewFaceRecognition();
				if (media.ended === false) {
					await $.sleep(1000);
					media.play();
					media.playbackRate = playbackRate;
				}
			};

			media.addEventListener('pause', playFunction);

			media.addEventListener('ended', () => {
				media.removeEventListener('pause', playFunction);
				$console.log('视频播放完毕');
				clearInterval(reloadInterval);
				resolve();
			});

			$console.log('视频开始播放');
			media.volume = volume;

			// 重置视频进度
			media.currentTime = 0;

			// 使用 setTimeout 解决 The play() request was interrupted by a call to pause() 问题
			setTimeout(() => {
				playMedia(() => media.play())
					.then(() => {
						media.playbackRate = playbackRate;
					})
					.catch(reject);
			}, 200);
		});
	},
	/**
	 * 阅读，PPT
	 */
	async read(win: Window & { finishJob?: Function }) {
		const finishJob = win.finishJob;
		if (finishJob) finishJob();
		await $.sleep(3000);
	},
	/**
	 * 时间阅读
	 */
	async timereader(iframe: HTMLIFrameElement) {
		const src = iframe.getAttribute('src')?.toString() || '';
		const timing = src ? parseInt(new URL(src).searchParams.get('timing')?.toString() || '60') : 60;
		$message.info({
			content: `正在学习长时阅读任务，请稍等，不要切换..（预计${(timing + 3) * 3}秒）`,
			duration: (timing + 3) * 3
		});
		// 这里依靠 onactive 第一个跨域处理程序，等待处理后继续即可
		// 一共有三步，第一步等待timing，然后切换正文页，然后是封底页，最后点击一次PPT文档切换界面，即可完成任务
		await $.sleep((timing + 3) * 3 * 1000);
		$message.success('长时阅读任务完成！');
		await $.sleep(5000);
	},
	/**
	 * 章节测验
	 */
	async chapter(frame: HTMLIFrameElement, options: CommonWorkOptions): Promise<void> {
		const { answererWrappers, period, upload, thread, stopSecondWhenFinish, redundanceWordsText, answerSeparators } =
			options;
		if (answererWrappers === undefined || answererWrappers.length === 0) {
			answerWrapperEmptyWarning(0);
			return;
		}

		$console.info('开始章节测试');
		const visual_state = CommonProject.scripts.render.cfg.visual;

		/**
		 * 不及格重做：上一轮 AI 给的整卷答案从 sessionStorage 里接力过来
		 *
		 * 章节测验提交后如果是 `未达到及格线，请重做`，就把整卷发给 AI 重算，
		 * 存好答案再刷新页面重进测验 —— 卷子上的选项只能加不能减，
		 * 只有重进一张干净卷子才能换答案。
		 */
		let chapterRedoPlan = readRedoPlan();

		/**
		 * 重做计划只在**它所属的那一节**有效
		 *
		 * 计划里存的是「上一轮这张卷子的题干 → 答案」。如果把它带到别的小节去用：
		 * 题干一条都对不上 → 一道题都点不中 → 被白卷拦截 → 直接跳到下一节，
		 * 这一节的测验/练习就被整体跳过（实测 1.7.7 的计划污染了 1.7.8：
		 * 5 道题一道没选，随后 `本节任务点已完成，点击平台「下一节」` 走人）。
		 */
		const currentChapterIdForRedo = $el<HTMLInputElement>('#curChapterId', top?.document)?.value || '';
		if (
			chapterRedoPlan &&
			chapterRedoPlan.chapterId &&
			currentChapterIdForRedo &&
			chapterRedoPlan.chapterId !== currentChapterIdForRedo
		) {
			const msg = `丢弃其它小节的重做计划（计划=${chapterRedoPlan.chapterId} 当前=${currentChapterIdForRedo}）`;
			$console.warn('[自动刷课] ' + msg);
			traceRedo(msg);
			clearRedoPlan();
			chapterRedoPlan = undefined;
		}

		const chapterRedoCfg = (CXProject.scripts.work?.cfg || {}) as any;
		/** 面板上的「不及格时 AI 整卷重做」开关（学习脚本自己那一份，默认开） */
		const chapterRedoEnabled = (CXProject.scripts.study.cfg as any).enableChapterRedo !== false;
		const chapterPassScore = Number(chapterRedoCfg.passScore ?? 60);
		const chapterMaxRounds = Math.max(0, Math.min(5, Number(chapterRedoCfg.aiRedoRounds ?? 5)));

		let chapterOverride: Record<string, string> = (chapterRedoPlan && chapterRedoPlan.answers) || {};

		/**
		 * 「待重做」计划：上一轮提交判完不及格就立刻刷新了，AI 还没算
		 *
		 * 在这里补算而不是在结果页等，是为了让提交后马上跳回测验页；
		 * 代价是 AI 计算期间用户会看到旧卷面，所以先给一条进度提示。
		 */
		if (chapterRedoPlan && chapterRedoPlan.pending && (chapterRedoPlan.paper || []).length) {
			if (!chapterRedoEnabled) {
				clearRedoPlan();
				chapterOverride = {};
				chapterRedoPlan = undefined;
				traceRedo('重做开关已关闭，丢弃待重做快照');
			} else {
				const paper = chapterRedoPlan.paper as PaperQuestion[];
				const roundNo = chapterRedoPlan.round || 1;

				/**
				 * 再读一次批改标记
				 *
				 * 提交那一刻的结果页可能还没渲染出 `marking_dui/marking_cuo`，
				 * 而刷新后的重做卷上一定有 —— 所以以这一次为准，只重做错题。
				 */
				const marks = markWrongQuestions(paper, frame.contentWindow?.document || null);
				if (marks.marked === 0) {
					/** 另一种练习形态：不给正误 → 整卷重做（必须把旧答案全换掉） */
					chapterRedoPlan.onlyTitles = undefined;
					traceRedo('重做卷没有批改标记，整卷重做');
				} else {
					const refreshTitles =
						marks.wrong > 0 && marks.wrong < paper.length
							? paper.filter((q) => q.wrong).map((q) => q.title)
							: undefined;
					chapterRedoPlan.onlyTitles = refreshTitles;
					traceRedo(
						refreshTitles
							? `重做卷批改：${marks.wrong}/${paper.length} 题错，只重做这 ${refreshTitles.length} 题`
							: `重做卷批改：${marks.wrong}/${paper.length} 题错（全错或无错），整卷重做`
					);
				}

				const focusCount = paper.filter((q) => q.wrong).length;
				const todoCount = focusCount > 0 && focusCount < paper.length ? focusCount : paper.length;
				traceRedo(`在测验页重算第 ${roundNo} 轮（${todoCount} 题 / 共 ${paper.length} 题）`);
				/** 拿句柄是为了算完立刻关掉（`duration: 0` 会一直挂着不消失） */
				const aiTip = $message.info({
					content: `AI 正在重算${todoCount < paper.length ? ` ${todoCount} 道错题` : `整卷 ${paper.length} 题`}，通常 10~60 秒…`,
					duration: 120
				});
				const aiStartedAt = Date.now();
				const answers = await requestPaperRedoByAI(
					paper,
					undefined,
					chapterPassScore,
					roundNo,
					chapterRedoPlan.history
				);
				const aiCost = Date.now() - aiStartedAt;
				$console.info(`第 ${roundNo} 轮重做：AI 用时 ${aiCost}ms`);
				traceRedo(`AI 用时 ${aiCost}ms`);
				aiTip?.remove();

				if (answers) {
					const prevAnswers = chapterRedoPlan.history?.[chapterRedoPlan.history.length - 1]?.answers || {};
					const identical =
						Object.keys(answers).length === Object.keys(prevAnswers).length &&
						Object.keys(answers).every((key) => answers[key] === prevAnswers[key]);
					if (identical) {
						$console.warn('AI 这一轮的答案与上一轮完全相同（已把历次作答一并给它，仍未改动）');
						traceRedo('AI 答案与上一轮完全相同');
					}
					writeRedoPlan({
						...chapterRedoPlan,
						answers,
						pending: false,
						paper: undefined
					});
					chapterOverride = answers;
					traceRedo(`AI 返回 ${Object.keys(answers).length} 题答案，开始作答`);
				} else {
					/**
					 * 失败时**只清 pending，绝不清轮次**
					 *
					 * 清掉整个计划会让 round 归零，下一轮又从「第 1 轮」开始，
					 * 于是永远撞不到上限 → 无限刷新（实测 AI 跑 82 秒失败一次，十几分钟刷了四遍）。
					 * 保留 round，让它照常往上走，到 5 轮自然会停。
					 */
					writeRedoPlan({
						...chapterRedoPlan,
						answers: {},
						pending: false,
						paper: undefined
					});
					chapterOverride = {};
					traceRedo(`AI 没有给出可用答案，保留第 ${chapterRedoPlan.round} 轮计数，本轮改用题库`);
					$modal.alert({ content: 'AI 没能给出可用的新答案，本轮改用题库答案作答（轮次保留，不会无限重试）。' });
				}
			}
			/** 重新读一次，后续用最新的 round / answers */
			chapterRedoPlan = readRedoPlan();
		}

		const hasChapterOverride = Object.keys(chapterOverride).length > 0;
		if (hasChapterOverride) {
			const msg = `章节测验：使用 AI 第 ${chapterRedoPlan?.round || 1} 轮答案重新作答（${Object.keys(chapterOverride).length} 题）`;
			$console.info(msg);
			traceRedo(msg);
		} else {
			traceRedo('章节测验：没有读到重做答案，按普通流程（卷面已有答案会直接提交）');
		}

		const frameWindow = frame.contentWindow;

		/**
		 * 先等测验页面可交互
		 *
		 * 题目 DOM 先渲染、平台的事件（`addChoice/addMultipleChoice`）后绑定，
		 * 中间那段窗口里点击是空点 —— 这是「概率性一题不选就提交」的根源。
		 */
		if (!(await waitQuizInteractive(frameWindow))) {
			$console.warn('测验页面没有进入可交互状态（题目或事件未就绪），答题可能不完整');
			traceRedo('测验页面未就绪：等待超时');
		}

		const { TiMu } = domSearchAll({ TiMu: '.TiMu' }, frameWindow!.document);

		/**
		 * 题目单元拆分：共用案例题必须按「子问题」分别作答
		 *
		 * 超星的共用案例题是**一个 `.TiMu` 里塞多个 `readCompreHensionItem`**：
		 *
		 * ```html
		 * <div class="TiMu">
		 *   <div class="Zy_TItle">1 【共用案例题】看以下…视频，回答问题。</div>
		 *   <div class="readCompreHensio…">
		 *     <div class="readCompreHensionItem">(1) [多选题] …<ul><li onclick="addMultipleChoice">A …</li></ul></div>
		 *     <div class="readCompreHensionItem">(2) [多选题] …<ul>…</ul></div>
		 *     …
		 *   </div>
		 * </div>
		 * ```
		 *
		 * 把 `.TiMu` 当一题的话：题干只拿到那句共用材料，选项却是**所有子题选项的合集**，
		 * 最后只点中其中一个选项，其余子题一个都没答 —— 提交后就是「测验未完成」。
		 * 这里把每个 `readCompreHensionItem` 当成独立题目交给答题器。
		 */
		const questionRoots: HTMLElement[] = [];
		for (const root of TiMu as HTMLElement[]) {
			const items = Array.from(root.querySelectorAll<HTMLElement>('.readCompreHensionItem'));
			if (items.length > 0) questionRoots.push(...items);
			else questionRoots.push(root);
		}
		if (questionRoots.length !== (TiMu as HTMLElement[]).length) {
			const msg = `检测到共用案例题：${TiMu.length} 个大题拆成 ${questionRoots.length} 道子题分别作答`;
			$console.info(msg);
			traceRedo(msg);
		}

		/**
		 * 题型判定
		 *
		 * 普通题看隐藏域 `input[id^="answertype"]`；共用案例题的每个子题**没有**这个隐藏域
		 * （整块只有一个 `answertype=15`，会被 `getQuestionType` 判成 `reader`），
		 * 题型只写在 `(1) [多选题]` 这种标签里，只能从题干文本兜底推断。
		 */
		const resolveQuestionType = (elements: any) => {
			const typeInput = elements.type?.[0] as HTMLInputElement | undefined;
			const byInput = typeInput ? getQuestionType(parseInt(typeInput.value)) : undefined;
			if (byInput && byInput !== 'reader') return byInput;

			const label = ((elements.title || []) as (HTMLElement | undefined)[])
				.map((el) => (el ? el.textContent || '' : ''))
				.join(' ');
			if (/多选/.test(label)) return 'multiple' as const;
			if (/单选/.test(label)) return 'single' as const;
			if (/判断/.test(label)) return 'judgement' as const;
			if (/填空/.test(label)) return 'completion' as const;
			return byInput || ('unknown' as const);
		};

		// 最大化面板
		CORSUtils.panelNormal();
		CommonProject.scripts.workResults.methods.init();
		// 固定显示答题结果面板
		CORSUtils.pinWorkPanel();

		const chapterTestTaskQuestionTitleTransform = (titles: (HTMLElement | undefined)[]) => {
			const removed = removeRedundantWords(
				titles.map((t) => (t ? optimizationElementWithImage(t, true).innerText : '')).join(','),
				redundanceWordsText.split('\n')
			);

			return (
				removed
					.trim()
					/** 超星旧版作业题目冗余数据 */
					.replace(/^\d+[。、.]/, '')
					/** 共用案例题的「(1)」子题编号：不影响匹配，但会污染题干 */
					.replace(/^\(\d+\)\s*/, '')
					.replace(/（\d+\.\d+分）/, '')
					.replace(/\(..题, \d+?分\)/, '')
					.replace(/\(..题, \d+\.\d+分\)/, '')
					.replace(/[[(【（](..题|名词解释|完形填空|阅读理解)[\])】）]/, '')
					.trim()
			);
		};

		/** 新建答题器 */
		const worker = new HonghuWorker({
			root: questionRoots,
			elements: {
				title: [
					(root) => $el('.Zy_TItle .clearfix', root),
					/** 共用案例题的子问题：题干在 `i.index` 右侧的 `.clearfix` 里 */
					(root) => $el('.clear .clearfix', root),
					// /** 连线题第一组 */
					(root) => $el('.firstUlList', root),
					// /** 连线题第二组 */
					(root) => $el('.secondUlList', root)
				],
				/**
				 * 兼容各种选项
				 *
				 * ul li .after 单选多选
				 * ul li label:not(.after) 判断题
				 * ul li textarea 填空题
				 */
				options: 'ul li .after,ul li textarea,ul textarea,ul li label:not(.before)',
				type: 'input[id^="answertype"]',
				lineSelectBox: '.thirdUlList .dept_select'
			},
			thread: thread ?? 1,
			answerSeparators: answerSeparators.split(',').map((s) => s.trim()),
			/** 默认搜题方法构造器 */
			answerer: (elements, ctx) => {
				const title = chapterTestTaskQuestionTitleTransform(elements.title);
				if (title) {
					const type = resolveQuestionType(elements);

					/** 重做轮：直接用 AI 给的新答案，用题干做锚点（引擎回调顺序不保证） */
					const searchFresh = async () => {
						await $.sleep((period ?? 3) * 1000);
						return defaultAnswerWrapperHandler(answererWrappers, {
							type,
							title,
							options:
								type === 'completion'
									? ''
									: ctx.elements.options.map((o) => optimizationElementWithImage(o, true).innerText).join('\n')
						});
					};

					if (hasChapterOverride) {
						const redoAnswer = lookupOverrideAnswer(chapterOverride, title);
						if (redoAnswer) {
							return [
								{
									name: 'AI整卷重做',
									homepage: '#',
									results: [{ question: title, answer: redoAnswer }]
								}
							];
						}
						/**
						 * 重做轮但没匹配上：**绝不能查题库缓存**
						 *
						 * 缓存里存的是上一轮实际提交的答案，命中就等于把这个答案原样再交一次
						 * —— 面板上会显示「题库缓存」，用户看到的就是「答案一个字没变」。
						 * 这里直接走真实搜索。
						 */
						return searchFresh();
					}

					return CommonProject.scripts.apps.methods.searchAnswerInCaches(title, searchFresh);
				} else {
					throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
				}
			},

			work: async (ctx) => {
				const { elements, searchInfos } = ctx;
				const type = resolveQuestionType(elements);

				/**
				 * 重做轮：清掉预选的旧答案，然后**按 AI 答案直接点选**
				 *
				 * 为什么不交给下面的 resolver：
				 *   `resolveJudgement` 的词表只有「对/错/是/否/√/×」，AI 一旦按选择题习惯
				 *   给字母（A / B），它就返回 `finish: false` —— 那题一个字都不会点，直接判错。
				 *   实测连续两轮都栽在这里（两道判断题全空）。
				 * 所以重做轮自己映射：字母按序号取、文字按归一化包含匹配，任何格式都能落地。
				 */
				if (hasChapterOverride) {
					const redoTitle = chapterTestTaskQuestionTitleTransform(elements.title);

					/**
					 * 只重做错题：名单外的题上次是对的，保持原答案
					 *
					 * 批改标记是准的（这门课要求全对才及格，只标 1 题错就真的只错 1 题），
					 * 所以对题连清空都不要做 —— 清空后万一匹配不上，会把本来对的题弄空。
					 * 注意：跳过时 answerer 必须绕开题库缓存，否则那题会拿缓存里的旧答案再交一次。
					 */
					const partialTitles = chapterRedoPlan?.onlyTitles || [];
					if (partialTitles.length && redoTitle && !titleInList(partialTitles, redoTitle)) {
						return { finish: true };
					}

					const redoAnswer = lookupOverrideAnswer(chapterOverride, redoTitle);

					if (redoAnswer && type && type !== 'completion') {
						/**
						 * **先算目标选项，能匹配上才清空**
						 *
						 * 顺序反了会出事：原来是「先清空 → 再匹配」，一旦匹配失败，
						 * 这道题就空着交上去了 —— 表现就是「AI 答题一题不选就提交」，比保留旧答案还差。
						 * 现在匹配不上就一个都不清，旧答案原样留着，再交给题库兜底。
						 */
						const picked = pickRedoOptions(elements.options as HTMLElement[], redoAnswer);
						if (picked.length) {
							const root =
								(ctx as any).root ||
								(elements.options[0]?.closest<HTMLElement>('.TiMu') as HTMLElement | undefined) ||
								null;
							const cleared = await clearQuestionSelections(root);
							if (cleared) $console.info(`重做：已取消 ${cleared} 个旧选项`);

							for (const option of picked) {
								await ensureOptionPicked(option);
							}
							$console.info(`重做：AI 答案「${redoAnswer}」→ 点选 ${picked.length} 项`);
							traceRedo(
								`题「${redoTitle.slice(0, 18)}」答案=${redoAnswer} 取消${cleared}项 点选${picked.length}项`
							);
							return { finish: true, options: picked.map((option) => option.innerText) };
						}
						/** 一个都匹配不上：不动卷面，回退题库（题库逻辑「已选就跳过」，不会破坏原答案） */
						$console.warn(`重做：AI 答案「${redoAnswer}」对不上任何选项，保留原答案并回退题库`);
						traceRedo(`题「${redoTitle.slice(0, 18)}」答案=${redoAnswer} 对不上选项，保留原答案`);
					} else if (!redoAnswer) {
						$console.warn('重做：本题题干没匹配上 AI 答案，保留原答案并回退题库');
						traceRedo(`题「${redoTitle.slice(0, 18)}」没匹配上计划 key，保留原答案`);
					}
				}

				/**
				 * 第一次做也直接按答案点选，不走 resolver 的字面匹配
				 *
				 * `resolveJudgement` 只认「对/错/是/否/√/×」，AI 一给字母（A/B）就 `finish: false`，
				 * 那题一个字都不点 —— 判断题尤其容易中招，表现就是「一题没选就提交」。
				 * 这里把题库/AI 给的每个候选答案都拿 `pickRedoOptions` 试一遍，第一个匹配上的直接用。
				 */
				if (!hasChapterOverride && type && type !== 'completion' && type !== 'line') {
					const candidates = (searchInfos || [])
						.flatMap((info) => (info?.results || []).map((item: any) => String(item?.answer || '').trim()))
						.filter(Boolean);
					for (const candidate of candidates) {
						const picked = pickRedoOptions(elements.options as HTMLElement[], candidate);
						if (!picked.length) continue;

						const root =
							(ctx as any).root ||
							(elements.options[0]?.closest<HTMLElement>('.TiMu') as HTMLElement | undefined) ||
							null;
						const cleared = await clearQuestionSelections(root);
						if (cleared) $console.info(`作答：已取消 ${cleared} 个旧选项`);
						for (const option of picked) {
							await ensureOptionPicked(option);
						}
						$console.info(`作答：答案「${candidate}」→ 点选 ${picked.length} 项`);
						traceRedo(
							`作答「${chapterTestTaskQuestionTitleTransform(elements.title).slice(0, 16)}」答案=${candidate} 点选${picked.length}项`
						);
						return { finish: true, options: picked.map((option) => option.innerText) };
					}
				}

				if (type && (type === 'completion' || type === 'multiple' || type === 'judgement' || type === 'single')) {
					const resolver = createDefaultQuestionResolver(ctx)[type];

					const handler: DefaultWork<any>['handler'] = async (type, answer, option, ctx) => {
						if (type === 'judgement' || type === 'single' || type === 'multiple') {
							/**
							 * 「是否已选」以页面自己的 `check_answer` 为准：
							 * 上一轮清空后 `aria-checked` / `label input` 可能还是旧值，
							 * 只看它们会把该点的选项当成已选直接跳过。
							 */
							const checked =
								!!option?.parentElement?.querySelector('[class*="check_answer"]') ||
								option?.parentElement?.querySelector('label input')?.getAttribute('checked') === 'checked' ||
								// 适配2023/9月最新版本
								option?.parentElement?.getAttribute('aria-checked') === 'true';
							if (checked) {
								// 跳过
							} else {
								/** 幂等点选：没点上会重试，防测验事件还没绑定的空点 */
								await ensureOptionPicked(option);
							}
						} else if (type === 'completion' && answer.trim()) {
							const text = option?.parentElement?.querySelector('textarea');
							const textareaFrame = option?.parentElement?.querySelector('iframe');
							if (text) {
								text.value = answer;
							}
							if (textareaFrame?.contentDocument) {
								textareaFrame.contentDocument.body.innerHTML = answer;
							}
							if (option?.parentElement?.parentElement) {
								/** 如果存在保存按钮则点击 */
								$el('[onclick*=saveQuestion]', option.parentElement.parentElement)?.click();
							}
						}
					};

					return await resolver(
						searchInfos,
						elements.options.map((option) => optimizationElementWithImage(option)),
						handler
					);
				}
				// 连线题自定义处理
				else if (type && type === 'line') {
					const select = (el: HTMLElement, opt_val: string) => {
						const selected = el.querySelector(`option[selected]`);
						const opt = el.querySelector(`option[value="${opt_val}"]`);
						selected?.removeAttribute('selected');
						if (opt) {
							opt.setAttribute('selected', '');
						}
					};

					for (const answers of searchInfos.map((info) => info.results.map((res) => res.answer))) {
						for (const ans of answers) {
							const splited_ans = splitAnswer(ans);
							if (splited_ans.length !== 0 && elements.lineSelectBox.length === splited_ans.length) {
								//  选择答案
								for (let index = 0; index < elements.lineSelectBox.length; index++) {
									const box = elements.lineSelectBox[index];
									if (splited_ans[index]) {
										select(box, splited_ans[index]);
										const text = box.parentElement?.querySelector('.chosen-single span');
										if (text) text.textContent = splited_ans[index];
										await $.sleep(200);
									}
								}
								return { finish: true };
							}
						}
					}

					return { finish: false };
				}

				return { finish: false };
			},

			/** 完成答题后 */
			async onResultsUpdate(curr, _, res) {
				CommonProject.scripts.workResults.methods.setResults(
					simplifyWorkResult(res, chapterTestTaskQuestionTitleTransform)
				);

				if (curr.result?.finish) {
					CommonProject.scripts.apps.methods.addQuestionCacheFromWorkResult(
						simplifyWorkResult([curr], chapterTestTaskQuestionTitleTransform)
					);
				}
				CommonProject.scripts.workResults.methods.updateWorkStateByResults(res);

				// 没有完成时随机作答
				if (curr.result?.finish === false && curr.resolved === true) {
					const options = curr.ctx?.elements?.options || [];

					const typeInput = curr.ctx?.elements?.type[0] as HTMLInputElement | undefined;
					const type = typeInput ? getQuestionType(parseInt(typeInput.value)) : undefined;

					const commonSetting = CommonProject.scripts.settings.cfg;

					if (
						commonSetting['randomWork-choice'] &&
						(type === 'judgement' || type === 'single' || type === 'multiple')
					) {
						$console.log('正在随机作答');

						const option = options[Math.floor(Math.random() * options.length)];
						// @ts-ignore 随机选择选项
						option?.parentElement?.querySelector('a,label')?.click();
					} else if (commonSetting['randomWork-complete'] && type === 'completion') {
						$console.log('正在随机作答');

						// 随机填写答案
						for (const option of options) {
							const textarea = option?.parentElement?.querySelector('textarea');
							const completeTexts = commonSetting['randomWork-completeTexts-textarea'].split('\n').filter(Boolean);
							const text = completeTexts[Math.floor(Math.random() * completeTexts.length)];
							const textareaFrame = option?.parentElement?.querySelector('iframe');

							if (text) {
								if (textarea) {
									textarea.value = text;
								}
								if (textareaFrame?.contentDocument) {
									textareaFrame.contentDocument.body.innerHTML = text;
								}
							} else {
								$console.error('请设置随机填空的文案');
							}

							await $.sleep(500);
						}
					}
				}
			},
			async onElementSearched(elements) {
				const typeInput = elements.type[0] as HTMLInputElement;
				const type = typeInput ? getQuestionType(parseInt(typeInput.value)) : undefined;

				/** 判断题转换成文字，以便于答题程序判断 */
				if (type === 'judgement') {
					elements.options.forEach((option) => {
						const opt = option?.textContent?.trim() || '';
						if (opt.includes('对') || opt.includes('错')) {
							// 2023/8/5日后超星已修复判断题，将图片修改成文字，如果已经有对错的文本，则不需要再转换
						}
						// 如果是英语的对错题目，他是一个英文单词 True,False
						else if (opt === 'True') {
							option.textContent = '√';
						} else if (opt === 'False') {
							option.textContent = 'x';
						}
						// 支持香港地区的繁体字
						else if (opt === '對') {
							option.textContent = '√';
						} else if (opt === '錯') {
							option.textContent = 'x';
						} else {
							const ri = option.querySelector('.ri');
							const span = document.createElement('span');
							span.innerText = ri ? '√' : '×';
							option.appendChild(span);
						}
					});
				}
			}
		});

		const results = await worker.doWork();

		const msg = `答题完成，将等待 ${stopSecondWhenFinish} 秒后进行保存或提交。`;
		$console.info(msg);
		$message.info({ content: msg, duration: stopSecondWhenFinish });
		await $.sleep(stopSecondWhenFinish * 1000);

		/**
		 * 等测验 iframe 变成一张新卷子
		 *
		 * 只看 `.TiMu` 存在是不够的：刷新前后旧 DOM 还在，会立刻误判成「已就绪」。
		 * 所以拿刷新前的 document 做锚，等 `win.document` 变成另一个对象再判断。
		 */
		const waitFreshQuiz = async (
			win: Window,
			oldDoc: Document | null,
			oldUrl: string,
			timeout = 20000
		): Promise<boolean> => {
			const deadline = Date.now() + timeout;
			while (Date.now() < deadline) {
				await $.sleep(600);
				try {
					const doc = win.document;
					if (doc.readyState !== 'complete') continue;
					/** 文档和地址都没变 = 还停在结果页，不是新卷子 */
					const sameDoc = oldDoc ? doc === oldDoc : false;
					const sameUrl = win.location.href === oldUrl;
					if (sameDoc && sameUrl) continue;
					if (doc.querySelectorAll('.TiMu').length === 0) continue;
					/** 光有 .TiMu 不够：只读的结果页也有题目，必须能作答 */
					const answerable =
						doc.querySelectorAll('li[onclick^="addChoice"]').length > 0 ||
						doc.querySelectorAll('.answerBg .answer_p').length > 0;
					if (answerable) return true;
				} catch {}
			}
			return false;
		};
		/**
		 * 不及格 → AI 整卷重做（章节测验）
		 *
		 * 只刷新**测验自己的 iframe**，绝不动整个课程页：
		 * 测验是课程页里的一个任务点标签，刷课程页会把标签状态丢掉，回到默认的「上一节」。
		 * 返回 true 表示新卷子已经就绪，调用方可以递归重答一轮。
		 */
		const prepareChapterRedo = async (failText: string): Promise<boolean> => {
			const round = chapterRedoPlan?.round || 0;
			$console.info(`章节测验判定：${failText}（已完成 ${round} 轮重做）`);
			traceRedo(`判定不及格（已完成 ${round} 轮）：${failText}`);

			if (!chapterRedoEnabled) {
				clearRedoPlan();
				traceRedo('重做开关已关闭，停在结果页不重做');
				return false;
			}

			const aiConfigured = ((CommonProject.scripts.settings.cfg.answererWrappers || []) as any[]).some(
				(wrapper) => wrapper && wrapper.name === 'AI答题'
			);
			if (!aiConfigured) {
				$console.warn('没有启用 AI 答题，跳过硬做');
				traceRedo('没有配置 AI 答题，放弃重做');
				return false;
			}
			if (round >= chapterMaxRounds) {
				clearRedoPlan();
				traceRedo(`已重做 ${round} 轮，达到上限 ${chapterMaxRounds}，放弃`);
				$modal.alert({ content: `章节测验${failText}，已经重做 ${round} 轮，不再重试。` });
				return false;
			}

			const paper = buildPaperSnapshotFromResults(results, chapterTestTaskQuestionTitleTransform);
			if (!paper.length) {
				$console.warn('章节测验重做：没有取到题目，跳过');
				traceRedo('没有取到整卷快照，放弃重做');
				return false;
			}
			/**
			 * 平台批改能指出哪题错：只重做这些，对题一个字都不动
			 *
			 * `.answerCon` 是「我的答案」的值，不是标准答案；判断对错只看
			 * `marking_dui` / `marking_cuo`。
			 */
			const marks = markWrongQuestions(paper, frameWindow?.document || null);
			const onlyTitles =
				marks.wrong > 0 && marks.wrong < paper.length
					? paper.filter((q) => q.wrong).map((q) => q.title)
					: undefined;
			traceRedo(
				onlyTitles
					? `平台批改：${marks.wrong}/${paper.length} 题错，只重做这 ${onlyTitles.length} 题`
					: marks.marked > 0
					? `平台批改：${marks.wrong}/${paper.length} 题错，整卷重做`
					: '没有读到批改标记（另一种练习），整卷重做'
			);
			traceRedo(`整卷快照 ${paper.length} 题`);

			/**
			 * 记下测验所属小节：刷新后学习脚本要靠它回到这一节
			 *
			 * 不记的话，刷新后 `autoJumpToUnFinishJob` 会按「目录里第一个未完成」跳走，
			 * 人就离开测验了 —— 这就是之前「刷新后跑到上一节」的另一半原因。
			 */
			const quizChapterId = (() => {
				try {
					return $el<HTMLInputElement>('#curChapterId', top?.document)?.value || '';
				} catch {
					return '';
				}
			})();

			/**
			 * 存快照就刷新，**AI 留到新页面再算**
			 *
			 * 以前是「算完 AI（5~20 秒）→ 再等 1.2 秒 → 刷新」，页面一直停在
			 * 「已提交」的结果页上，看起来像死机。现在提交判完不及格就立刻往回跳，
			 * 新页面在测验页里显示进度并重算，感知上是「一提交就回到测验」。
			 */
			writeRedoPlan({
				round: round + 1,
				answers: {},
				pending: true,
				paper,
				onlyTitles,
				scores: [...(chapterRedoPlan?.scores || []), 0],
				chapterId: quizChapterId,
				history: archiveRedoHistory(chapterRedoPlan)
			});
			traceRedo(`写入待重做快照（第 ${round + 1} 轮），立即刷新，AI 在测验页重算`);
			$message.info({ content: `第 ${round + 1} 轮重做：返回测验页，AI 将在那里重算`, duration: 5 });
			try {
				(top as any).$?.('#workpop')?.hide?.();
			} catch {}
			/** 只留一点点时间让提示条渲染，不再等 AI */
			await $.sleep(400);

			$console.info(`第 ${round + 1} 轮重做：刷新课程页，回到小节 ${quizChapterId || '(未知)'}`);
			try {
				top?.location.reload();
			} catch (e: any) {
				$console.warn('刷新失败：' + ((e && e.message) || e));
				clearRedoPlan();
				return false;
			}
			return true;
		};

		/** 非空表示这次提交没及格，需要在 uploadHandler 之后重做一轮 */
		let pendingRedo = '';

		// 处理提交
		await worker.uploadHandler({
			type: upload,
			results,
			async callback(finishedRate, uploadable) {
				const msg = `完成率 ${finishedRate.toFixed(2)}% :  ${uploadable ? '3秒后将自动提交' : '3秒后将自动保存'} `;
				$console.info(msg);
				$message.success({ content: msg, duration: 3 });

				/**
				 * 白卷拦截
				 *
				 * 完成率是「解析到答案的比例」，不是「卷面真的选了的比例」——
				 * 选项选择器没匹配到时解析依然算成功，于是会出现「一题没选就提交」。
				 * 只有**一道选择题都没选**才拦（部分未答仍按 upload 阈值走）。
				 */
				const blank = countUnansweredQuestions(frameWindow?.document);
				if (uploadable && blank.total > 0 && blank.unanswered === blank.total) {
					/**
					 * 白卷 + 有重做计划 → 大概率是「计划里的答案跟这张卷子对不上」，
					 * 直接清掉，下一次进来按普通流程作答。不清的话每次都会拿同一批
					 * 答案再空点一遍，然后被拦、被跳走，这一节永远做不完。
					 */
					if (chapterRedoPlan) {
						clearRedoPlan();
						traceRedo('白卷拦截：已清空重做计划，下次按普通流程作答');
					}
					$modal.alert({
						content: `检测到 ${blank.total} 道题一道都没选中（可能是选项结构变化或答案未生效），已取消自动提交，避免交白卷。`
					});
					traceRedo(`白卷拦截：${blank.unanswered}/${blank.total} 题未选，取消提交`);
					return;
				}

				await $.sleep(3000);

				if (uploadable) {
					// @ts-ignore 提交
					frameWindow.btnBlueSubmit();

					await $.sleep(3000);
					/** 确定按钮 */
					// @ts-ignore 确定
					frameWindow.submitCheckTimes();
					/** 只要一点点延迟让弹窗有机会出现，剩下的交给下面的轮询，不要在这里干等 */
					await $.sleep(600);

					/**
					 * 先读弹窗再关：`未达到及格线，请重做` 就写在 `#popcontent` 里。
					 * 以前这里直接 hide，等于把唯一的判定信号抹掉了。
					 */
					const failText = await waitFailPopupText();
					if (failText) {
						/** 交给 uploadHandler 之后处理：那里才好递归重答一轮 */
						pendingRedo = failText;
						return;
					}

					// @ts-ignore 2024/4 更新后上方函数无法关闭弹窗，需要手动关闭确定弹窗
					top.$('#workpop').hide();
				} else {
					// @ts-ignore 禁止弹窗
					frameWindow.alert = () => {};
					// @ts-ignore 暂时保存
					frameWindow.noSubmit();
				}
			}
		});

		// 还原尺寸状态
		if (visual_state === 'minimize' && CommonProject.scripts.render.cfg.visual !== 'minimize') {
			CORSUtils.panelMinimize();
		}

		/**
		 * 不及格：准备好新一轮答案、把测验 iframe 刷成新卷子，然后递归重答
		 *
		 * 只刷新测验 iframe，页面停在测验上；收尾（关面板 / emit done）交给新一轮，
		 * 所以这里直接 return，不再往下走。
		 */
		if (pendingRedo) {
			const scheduled = await prepareChapterRedo(pendingRedo);
			/** 已经安排重做：页面马上刷新，收尾交给新页面 */
			if (scheduled) return;
		}

		worker.emit('done');
	},
	/**
	 * 带音频的PPT
	 */
	async readPPTWithAudio(win: Window & { swiperNext?: Function }) {
		// 关闭音视频声音
		win.document.querySelectorAll('audio').forEach((audio) => {
			audio.addEventListener('play', () => {
				audio.muted = true;
			});
		});

		// 阅读PPT
		const len = win.document.querySelectorAll('.swiper-container .swiper-slide').length;
		for (let index = 0; index < len; index++) {
			win.swiperNext?.();
			await $.sleep(1000);
		}
		await $.sleep(3000);
	},
	/**
	 * 链接任务点
	 */
	async hyperlink(a: HTMLElement) {
		// 修改点击事件，防止出现弹窗
		const _click = a.onclick;
		a.onclick = () => false;
		// 点击完成
		a.click();
		// 还原点击事件
		a.onclick = _click;
		await $.sleep(3000);
	}
};

/**
 * cx 题目类型 ：
 * 0 单选题
 * 1 多选题
 * 2 简答题
 * 3 判断题
 * 4 填空题
 * 5 名词解释
 * 6 论述题
 * 7 计算题
 * 8 其他题(大概率是填空题)
 * 9 分录题
 * 10 资料题
 * 11 连线题
 * 14 完形填空
 * 15 阅读理解
 */
function getQuestionType(
	val: number
): 'single' | 'multiple' | 'judgement' | 'completion' | 'line' | 'fill' | 'reader' | undefined {
	return val === 0
		? 'single'
		: val === 1
		? 'multiple'
		: val === 3
		? 'judgement'
		: [2, 4, 5, 6, 7, 8, 9, 10].some((t) => t === val)
		? 'completion'
		: val === 11
		? 'line'
		: val === 14
		? 'fill'
		: val === 15
		? 'reader'
		: undefined;
}

/** 阅读理解和完形填空的共同处理器 */
async function readerAndFillHandle(searchInfos: SearchInformation[], list: HTMLElement[]) {
	for (const answers of searchInfos.map((info) => info.results.map((res) => res.answer))) {
		let ans = answers;

		if (ans.length === 1) {
			ans = splitAnswer(ans[0]);
		}

		if (ans.filter(Boolean).length !== 0 && list.length !== 0) {
			for (let index = 0; index < ans.length; index++) {
				const item = list[index];
				if (item) {
					/** 获取每个小题中的准确答案选项 并点击 */
					$el(`span.saveSingleSelect[data="${ans[index]}"]`, item)?.click();
					await $.sleep(200);
				}
			}

			return { finish: true };
		}
	}

	return { finish: false };
}

function hasFaceRecognition() {
	// 人脸元素有时候 src 属性为空字符串，所以这里需要判断 src 是否为空字符串，如是则人脸识别会出现。
	const faces = $$el<HTMLImageElement>('#fcqrimg', top?.document);
	let active = false;
	for (const face of faces) {
		const src = face.getAttribute('src');
		if (src) {
			active = true;
			break;
		}
	}
	return active;
}

function hasNewFaceRecognition() {
	const faces = $$el<HTMLImageElement>('.chapterVideoFaceMaskDiv', top?.document);
	let active = false;
	for (const face of faces) {
		if (face.style.display !== 'none') {
			active = true;
			break;
		}
	}
	return active;
}

/**
 * 等待新版人脸识别，视频开头会出现的人脸识别
 */
function waitForNewFaceRecognition() {
	let notified = false;

	return new Promise<void>((resolve) => {
		const interval = setInterval(() => {
			// 人脸元素有时候 src 属性为空字符串，所以这里需要判断 src 是否为空字符串，如是则人脸识别会出现。
			const active = hasNewFaceRecognition();
			if (active) {
				if (!notified) {
					notified = true;
					const msg = '检测到人脸识别，请手动进行识别后脚本才会继续运行。';
					if (CXProject.scripts.study.cfg.notifyWhenHasFaceRecognition) {
						CommonProject.scripts.settings.methods.notificationBySetting(msg, { duration: 0 });
					}
					$message.warn({ content: msg, duration: 0 });
					$console.warn(msg);
				}
			} else {
				clearInterval(interval);
				resolve();
			}
		}, 3000);
	});
}
/**
 * 等待人脸识别
 */
function waitForFaceRecognition() {
	let notified = false;

	return new Promise<void>((resolve) => {
		const interval = setInterval(() => {
			// 人脸元素有时候 src 属性为空字符串，所以这里需要判断 src 是否为空字符串，如是则人脸识别会出现。
			const active = hasFaceRecognition();
			if (active) {
				if (!notified) {
					notified = true;
					const msg = '检测到人脸识别，请手动进行识别后脚本才会继续运行。';
					if (CXProject.scripts.study.cfg.notifyWhenHasFaceRecognition) {
						CommonProject.scripts.settings.methods.notificationBySetting(msg, { duration: 0 });
					}
					$message.warn({ content: msg, duration: 0 });
					$console.warn(msg);
				}
			} else {
				clearInterval(interval);
				resolve();
			}
		}, 3000);
	});
}

/**
 * 答题程序位于其他 iframe 中，而 methods.pin 等 是依赖于 setTab 方法的，所以需要重新定义一个顶层函数来调用 pin 方法
 * 跨域调用
 */

const CORSUtils = {
	pinWorkPanel: cors.defineTopFunction(() => {
		CommonProject.scripts.render.methods.pin(CommonProject.scripts.workResults);
	}),
	panelNormal: cors.defineTopFunction(() => {
		CommonProject.scripts.render.methods.normal();
	}),
	panelMinimize: cors.defineTopFunction(() => {
		CommonProject.scripts.render.methods.minimize();
	})
};
