import { $, Project, Script, $ui, $message, h } from 'easy-us';
import { playMedia } from '../utils';
import { playbackRate, volume } from '../utils/configs';
import { CommonProject } from './common';

/**
 * 讯飞智慧课程平台（icourse.fifedu.com）
 *
 * 平台是 Vue3 + ElementPlus 的 SPA，学习页为 /istp-learning-center/pattern/chapter?courseId&classId&termId。
 * 已确认的点：
 * 1. 右侧资源列表 `.activity-list-item`，当前项带 `is-active`，状态文本为 未开始 / 已学 x% / 已完成。
 * 2. 视频用 xgplayer（`.xgplayer`），播放时每约 10 秒 POST /istp-study/activityApi/saveVideoNode
 *    body { activityId, resourceId, videoTotalTime: 视频总秒数, videoStudyTime: 当前播放位置秒数 }。
 *    服务端按 videoStudyTime 记进度，播放位置 >= 总时长即标记「已完成」，所以倍速有效、跳结尾也有效。
 * 3. PDF / PPT / Word 统一由 https://resc.fifedu.com/iplat-resc/pdfv-resource 的 pdf.js 阅读器渲染，
 *    进度同样走 saveVideoNode，videoStudyTime = 当前页码。父页面监听阅读器的翻页事件再转发上报，
 *    因此在父页面把 iframe 的 src 改成 `#page=N`（仅改 hash，不重载）就能驱动翻页。
 * 4. 底部「继续学习下一节」会跨知识点、跨章节连续推进，不需要自己维护目录。
 * 5. 接口走网关 https://gway.fifedu.com，带 MD5 签名（appSecret + @fif110），
 *    自己拼请求会被拦（0009 permission is error），因此这里全部走页面内的 DOM 操作。
 */

/** 单节课最多尝试翻动的页数，防止异常情况死循环 */
const MAX_PDF_PAGES = 300;

const state = {
	running: false,
	media: null as HTMLVideoElement | null,
	/** 当前活动的标识，用于判断「下一节」是否真的切换了 */
	activityKey: '',
	/** 连续无进展次数，超过阈值就停下来 */
	stuck: 0,
	/**
	 * 本次运行已经处理过的资源项
	 *
	 * 作业、讨论这类点不进去的资源永远停在「未开始」，不做标记就会一直被当成
	 * 「本节还有没做完的」，在同一个小节里反复打转。切章后 DOM 重建，WeakSet 自动失效。
	 */
	handled: new WeakSet<HTMLElement>(),
	/**
	 * 已经自动开始过的页面地址
	 *
	 * 路由切换会反复触发 `onhistorychanged`，而脚本自己的「下一节」也会改变地址，
	 * 不记住就会在每一跳都尝试重新启动一次。一个地址只自动起一次，
	 * 用户手动点了「停止」之后也不会被立刻拉起来。
	 */
	autoStartedKey: ''
};

/* ======================== 页面结构 ======================== */

/** 当前选中的资源项 */
function activeItem() {
	return document.querySelector<HTMLElement>('.activity-list-item.is-active');
}

/** 资源列表（当前小节的全部资源） */
function activityItems() {
	return Array.from(document.querySelectorAll<HTMLElement>('.activity-list-item'));
}

/**
 * 某个资源项的状态文本：已完成 / 已学 33% / 未开始
 *
 * 注意：资源项里有两个 `.activityStatus`，第一个是类型角标（视频 / Word / PDF），
 * 第二个才是学习状态，取最后一个。
 */
function statusOf(item: HTMLElement | null) {
	if (!item) return '';
	const list = Array.from(item.querySelectorAll('.activityStatus'));
	return (list[list.length - 1]?.textContent || '').trim();
}

/** 当前资源的状态文本 */
function activeStatus() {
	return statusOf(activeItem());
}

/** 这一项是否已经学完（「已完成」或进度到 100%） */
function itemFinished(item: HTMLElement) {
	const text = statusOf(item);
	return text.includes('已完成') || /已学\s*100\s*%/.test(text);
}

/** 当前资源名 + 类型，用于日志 */
function activeName() {
	const item = activeItem();
	if (!item) return '';
	return (item.innerText || '').replace(/\s+/g, ' ').trim();
}

function isFinished() {
	const item = activeItem();
	return item ? itemFinished(item) : false;
}

/** 资源类型：优先看列表里的类型角标，再看页面上的播放器 / 阅读器 */
function activeKind(): 'video' | 'pdf' | 'ppt' | 'other' {
	const name = activeName();
	if (/视频/.test(name)) return 'video';
	if (/\bPPT\b|PPTX?/i.test(name)) return 'ppt';
	if (/PDF|Word|Excel/i.test(name)) return 'pdf';
	if (document.querySelector('.xgplayer')) return 'video';
	if (pptFrame()) return 'ppt';
	if (pdfFrame()) return 'pdf';
	return 'other';
}

/** 当前活动的稳定标识：URL 里的 activityId 优先，再拼上资源名 */
function currentKey() {
	const activityId = new URLSearchParams(location.search).get('activityId') || '';
	return `${activityId}|${activeName()}`;
}

/** 底部的「继续学习下一节」按钮 */
function nextButton() {
	return (
		Array.from(document.querySelectorAll<HTMLElement>('button, div')).find(
			(el) => (el.innerText || '').trim() === '继续学习下一节' && el.offsetParent !== null
		) || null
	);
}

/** 当前是不是课程学习页（章节页面，右侧有本节资源列表） */
function isStudyPage() {
	return /\/istp-learning-center\/pattern\/chapter/i.test(location.href);
}

/**
 * 等本节资源列表渲染出来
 *
 * 资源列表是异步挂载的，进章节后要缓一拍再判断；但**有的章节本来就没有资源**
 * （整章是空的，或者只有作业/讨论这类不挂播放器的项），那种情况下 DOM 永远不会变，
 * 一直等下去就会卡死在这一章。所以只等一小会儿，等不到就交给调用方去下一节。
 */
async function waitForActivityList(timeout: number) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (activityItems().length) return true;
		await $.sleep(400);
	}
	return activityItems().length > 0;
}

/**
 * 左侧章节树里的「下一个叶子章节」
 *
 * 空章节（页面写着「暂无学习内容」）底部没有「继续学习下一节」按钮，
 * 光靠那个按钮推进就会停在这里。这时改点章节树里的下一节：
 * 当前章节带 `.aside-row.is-active`，往后找第一个 `no-child` 的叶子节点。
 */
function nextChapterRow() {
	const rows = Array.from(document.querySelectorAll<HTMLElement>('.aside-row'));
	const current = rows.findIndex((row) => row.classList.contains('is-active'));
	if (current < 0) return null;

	for (let i = current + 1; i < rows.length; i++) {
		const row = rows[i];
		// 折叠起来的节点（offsetParent 为空）点不到，跳过
		if (row.offsetParent === null) continue;
		const name = row.querySelector<HTMLElement>('.tree-node-name');
		if (!name || !name.classList.contains('no-child')) continue;
		if (!(name.textContent || '').trim()) continue;
		return row;
	}
	return null;
}

/** 点章节树里的下一节，并等地址真的变了 */
async function gotoNextChapter() {
	/** 章节树也是异步渲染的，刚切完章节时可能还没出来 */
	let row = nextChapterRow();
	for (let i = 0; i < 10 && !row; i++) {
		await $.sleep(600);
		row = nextChapterRow();
	}
	if (!row) return false;

	const before = location.search;
	row.click();
	const start = Date.now();
	while (Date.now() - start < 20000) {
		await $.sleep(700);
		if (location.search !== before) {
			await $.sleep(1200);
			return true;
		}
	}
	return false;
}

/** 资源阅读器 iframe（PDF / PPT / Word 共用同一个 pdf.js 阅读器） */
function pdfFrame() {
	return (
		Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe')).find((f) =>
			/pdfv-resource/.test(f.getAttribute('src') || f.src || '')
		) || null
	);
}

/** PPT 走的是永中云预览（ow365.cn），是独立的跨域 iframe */
function pptFrame() {
	return (
		Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe')).find((f) =>
			/ow365\.cn/.test(f.getAttribute('src') || f.src || '')
		) || null
	);
}

/** 与永中预览器里那个隐藏脚本约定的消息 */
const PPT_NEXT = 'hh-fifedu:ppt-next';
/** 预览器回传的当前页码 */
const PPT_PAGE = 'hh-fifedu:ppt-page';

/** 资源是异步挂载的，切节后先等渲染出视频或阅读器，再判断类型 */
async function waitActivityReady(timeout = 15000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (document.querySelector('.xgplayer') || pdfFrame() || pptFrame()) return true;
		await $.sleep(500);
	}
	return false;
}

/* ======================== 视频 ======================== */

/** 等播放器就绪（资源是异步加载的，切节后要等一会） */
async function waitVideo(timeout = 25000) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		const media = document.querySelector<HTMLVideoElement>('video');
		if (media && media.readyState >= 1) return media;
		await $.sleep(500);
	}
	return null;
}

/** 点开 xgplayer 的播放按钮（直接 play() 在未开始状态下会被播放器忽略） */
async function startPlayback(media: HTMLVideoElement) {
	if (!media.paused) return;
	const startBtn = document.querySelector<HTMLElement>('.xgplayer-start');
	const playBtn = document.querySelector<HTMLElement>('.xgplayer-play');
	if (startBtn && startBtn.offsetParent !== null) {
		startBtn.click();
	} else if (playBtn) {
		playBtn.click();
	} else {
		await playMedia(() => media.play());
	}
	await $.sleep(500);
	if (media.paused) await playMedia(() => media.play());
}

/** 播放单个视频，直到结束或平台标记完成 */
async function playOneVideo(rate: number, vol: number, mode: 'play' | 'seek') {
	const media = await waitVideo();
	if (!media) {
		$message.error('未找到视频播放器，请确认当前资源已加载完成');
		return false;
	}
	state.media = media;
	media.muted = vol === 0;
	media.volume = vol;

	if (mode === 'seek') {
		// 跳到结尾：服务端只认 videoStudyTime，播到最后一秒即视为学完
		await startPlayback(media);
		media.playbackRate = rate;
		if (!isFinite(media.duration) || media.duration <= 0) await $.sleep(1500);
		media.currentTime = Math.max(0, media.duration - 0.5);
		await playMedia(() => media.play());
	} else {
		media.playbackRate = rate;
		await startPlayback(media);
	}

	const start = Date.now();
	while (state.running) {
		if (isFinished()) return true;
		if (media.ended) break;
		// 浏览器切到后台时 xgplayer 可能自己暂停，这里续播
		if (media.paused && Date.now() - start > 3000) await startPlayback(media);
		if (mode === 'seek' && media.duration > 0) {
			// 有的浏览器 seek 后会自动回退几秒，这里补一下
			const tail = media.duration - media.currentTime;
			if (!media.paused && tail > 1.5) media.currentTime = Math.max(0, media.duration - 0.5);
		}
		await $.sleep(1000);
	}
	// 播完后等平台把进度上报并刷新状态
	const waitStart = Date.now();
	while (state.running && Date.now() - waitStart < 15000) {
		if (isFinished()) return true;
		await $.sleep(1000);
	}
	return media.ended || isFinished();
}

/* ======================== PDF / PPT / Word ======================== */

/** 把阅读器跳到指定页：只改 hash，不会重新加载文档 */
function jumpPdfPage(page: number) {
	const frame = pdfFrame();
	if (!frame) return false;
	const base = (frame.getAttribute('src') || frame.src || '').split('#')[0];
	if (!base) return false;
	frame.setAttribute('src', `${base}#page=${page}`);
	return true;
}

/** 逐页翻到末尾，直到平台标记完成 */
async function readPdf() {
	const frame = pdfFrame();
	if (!frame) {
		$message.warn('未找到文档阅读器，跳过当前资源');
		return false;
	}

	// 先用一个超大页码探底：pdf.js 会把它压到最后一页，
	// 这样「翻到末页即完成」的文档一次就能收工
	jumpPdfPage(9999);
	await $.sleep(1500);
	if (isFinished()) return true;

	let last = '';
	let same = 0;
	for (let page = 1; page <= MAX_PDF_PAGES && state.running; page++) {
		if (!pdfFrame()) return isFinished();
		jumpPdfPage(page);
		await $.sleep(900);
		if (isFinished()) return true;

		// 状态完全不动就说明翻到位了。有百分比时两页没变化即可收，
		// Word 这类不显示百分比的资源只能靠多翻几页兜底
		const now = activeStatus();
		if (now === last) {
			same++;
			if (same >= (/\d+\s*%/.test(now) ? 2 : 12)) return isFinished();
		} else {
			same = 0;
			last = now;
		}
	}
	return isFinished();
}

/** 让预览器翻一页，并拿回翻页后的页码 */
function askPptNext(frame: HTMLIFrameElement) {
	return new Promise<string>((resolve) => {
		let done = false;
		const finish = (page: string) => {
			if (done) return;
			done = true;
			window.removeEventListener('message', onMessage);
			resolve(page);
		};
		const onMessage = (event: MessageEvent) => {
			const data = event.data as { type?: string; page?: string } | null;
			if (!data || typeof data !== 'object' || data.type !== PPT_PAGE) return;
			finish(String(data.page ?? ''));
		};
		window.addEventListener('message', onMessage);
		frame.contentWindow?.postMessage(PPT_NEXT, '*');
		window.setTimeout(() => finish(''), 3000);
	});
}

/**
 * 逐页翻到末尾，直到平台标记完成
 *
 * 永中预览器把幻灯片渲染在自己的跨域 iframe 里，父页面碰不到它的 DOM，
 * 所以由注入到该 iframe 的 pptHelper 脚本代收消息、调用预览器自己的 nextPage()。
 * 每次翻页都会回传页码：页码不再变化就说明翻到最后一页了。
 */
async function readPpt() {
	if (!pptFrame()) {
		$message.warn('未找到 PPT 预览器，跳过当前资源');
		return false;
	}
	let lastPage = '';
	let same = 0;
	for (let i = 0; i < MAX_PDF_PAGES && state.running; i++) {
		const frame = pptFrame();
		if (!frame) return isFinished();

		const page = await askPptNext(frame);
		await $.sleep(400);
		if (isFinished()) return true;

		// 页码没动：到底了，或者这一页没翻成。预览器偶尔会卡住一两拍，
		// 留 6 次余量，免得中途卡页被误判成结尾
		if (!page || page === lastPage) {
			same++;
			if (same >= 6) return isFinished();
		} else {
			same = 0;
			lastPage = page;
		}
	}
	return isFinished();
}

/* ======================== 推进 ======================== */

/**
 * 本节内下一个还没学完的资源项
 *
 * 平台的「继续学习下一节」是跳到下一个**知识点**（整章切换），不是本节下一个资源，
 * 所以本节里剩下的 Word / PPT 必须靠点资源列表项进入，否则会被整节跳过。
 */
function nextPendingItem() {
	const items = activityItems();
	const cur = activeItem();
	const start = cur ? items.indexOf(cur) + 1 : 0;
	for (let i = start; i < items.length; i++) {
		if (state.handled.has(items[i])) continue;
		if (itemFinished(items[i])) continue;
		return items[i];
	}
	return null;
}

/** 点资源列表里的未完成项，并等待选中项真正变化 */
async function gotoPending() {
	const target = nextPendingItem();
	if (!target) return false;
	const fromIdx = activityItems().indexOf(activeItem());
	state.media = null;
	target.click();

	const start = Date.now();
	while (Date.now() - start < 20000) {
		await $.sleep(700);
		const nowIdx = activityItems().indexOf(activeItem());
		// URL 里的 activityId 不一定跟着变，用「选中项位置」判定更可靠
		if (nowIdx >= 0 && nowIdx !== fromIdx) {
			await $.sleep(1200); // 等新资源挂载
			return true;
		}
	}
	return true; // 点了但没切换，交给上层判重
}

/** 点「继续学习下一节」并等待内容真正切换 */
async function gotoNext() {
	const from = currentKey();
	const btn = nextButton();
	if (!btn) return false;
	state.media = null;
	btn.click();

	const start = Date.now();
	while (Date.now() - start < 20000) {
		await $.sleep(800);
		const now = currentKey();
		if (now && now !== from) {
			await $.sleep(1200); // 等新资源挂载
			return true;
		}
	}
	return false;
}

/* ======================== 面板 ======================== */

export const FIFProject = Project.create({
	name: '讯飞智慧课程平台',
	domains: ['icourse.fifedu.com', 'ow365.cn'],
	scripts: {
		/**
		 * PPT 预览器里的转发脚本
		 *
		 * 永中预览器在独立 iframe 里，父页面拿不到它的 DOM。它自己暴露了
		 * `nextPage()`，比合成 keydown 可靠得多（合成事件命中率只有一成左右，
		 * 翻几页就被丢掉，看起来就像「没翻完就跳了」）。
		 * 翻完把当前页码回传，父页面据此判断有没有真的翻动。
		 */
		pptHelper: new Script({
			name: 'PPT 预览器',
			namespace: 'fifedu.pptHelper',
			hideInPanel: true,
			matches: [['永中预览器', 'ow365.cn']],
			oncomplete() {
				window.addEventListener('message', (event) => {
					if (event.data !== PPT_NEXT) return;
					const source = event.source as Window | null;
					const sn = document.querySelector<HTMLInputElement>('#sn');
					const before = sn ? sn.value : '';

					const next = (window as unknown as { nextPage?: () => void }).nextPage;
					if (typeof next === 'function') {
						next();
					} else {
						// 别的预览器没有 nextPage，退回合成按键
						for (const target of [document, document.body, document.querySelector('#ppt')]) {
							if (!target) continue;
							target.dispatchEvent(
								new KeyboardEvent('keydown', {
									key: 'ArrowRight',
									code: 'ArrowRight',
									keyCode: 39,
									which: 39,
									bubbles: true,
									cancelable: true
								})
							);
						}
					}

					window.setTimeout(() => {
						source?.postMessage({ type: PPT_PAGE, page: sn ? sn.value : '', before }, '*');
					}, 600);
				});
			}
		}),
		study: new Script({
			name: '在线学习',
			namespace: 'fifedu.study',
			matches: [['讯飞智慧课程平台', 'icourse.fifedu.com']],
			notes: ['进入课程学习页（章节页面，右侧能看到本节资源列表）即自动开始。'],
			configs: {
				notes: {
					defaultValue: $ui.notes([
						'自动播放本节视频，播完自动进入下一节，跨知识点、跨章节连续推进。',
						'PDF / PPT / Word 资源会自动翻页，翻到末页即记为完成。',
						'作业、讨论等非视频资源会直接跳过。',
						['「跳到结尾」会一次性把视频进度报满，', '属于伪造学习记录，请自行评估风险。']
					]).outerHTML
				},
				playbackRate: {
					...playbackRate,
					defaultValue: '2'
				},
				volume: volume,
				videoMode: {
					label: '视频处理方式',
					tag: 'select',
					defaultValue: 'play' as 'play' | 'seek',
					options: [
						['play', '正常播放（可倍速）'],
						['seek', '跳到结尾（快速）']
					]
				},
				autoNext: {
					label: '完成后自动下一节',
					attrs: { type: 'checkbox' },
					defaultValue: true
				},
				skipPdf: {
					label: '跳过文档资源',
					attrs: { type: 'checkbox', title: '开启后 PDF / PPT / Word 不翻页，直接进入下一节' },
					defaultValue: false
				}
			},
			oncomplete() {
				this.onConfigChange('playbackRate', (rate) => {
					if (state.media) state.media.playbackRate = parseFloat(rate.toString());
				});
				this.onConfigChange('volume', (v) => {
					if (!state.media) return;
					const vol = parseFloat(v.toString());
					state.media.volume = vol;
					state.media.muted = vol === 0;
				});
				/** 直接落在章节页（刷新/从收藏进入）时自动开跑 */
				void this.methods.autoStart();
			},
			/** 课程页是 SPA：从课程目录点进章节只改 history，不会重新加载页面 */
			onhistorychanged() {
				void this.methods.autoStart();
			},
			methods() {
				return {
					/** 处理一个资源，返回是否「有进展」 */
					handleCurrent: async (rate: number, vol: number) => {
						const mode = this.cfg.videoMode === 'seek' ? 'seek' : 'play';
						const kind = activeKind();

						/**
						 * 不支持的类型（作业、讨论、测验…）先判掉，**不能先去等资源加载**：
						 * 这类资源永远不会挂出播放器或阅读器，等满两轮 30 秒才跳过，
						 * 用户看到的就是「明明加载好了，脚本却卡在这里不动」。
						 */
						if (kind === 'other') {
							$message.info(`跳过不支持的资源：${activeName()}`);
							return true;
						}

						// 视频/文档是异步挂载的，加载慢了别急着判成「不支持的资源」
						if (!(await waitActivityReady())) {
							$message.warn(`资源加载较慢，继续等待：${activeName()}`);
							await $.sleep(3000);
							if (!(await waitActivityReady(15000))) {
								$message.warn(`资源始终没加载出来，跳过：${activeName()}`);
								return false;
							}
						}

						if (kind === 'video') {
							$message.info(`播放视频：${activeName()}`);
							return this.methods.playVideo(rate, vol, mode);
						}
						if (kind === 'pdf') {
							if (this.cfg.skipPdf) {
								$message.info(`跳过文档：${activeName()}`);
								return true;
							}
							$message.info(`阅读文档：${activeName()}`);
							return this.methods.readDoc();
						}
						if (kind === 'ppt') {
							if (this.cfg.skipPdf) {
								$message.info(`跳过 PPT：${activeName()}`);
								return true;
							}
							$message.info(`放映 PPT：${activeName()}`);
							return this.methods.readPpt();
						}
						$message.info(`跳过不支持的资源：${activeName()}`);
						return true;
					},

					playVideo: async (rate: number, vol: number, mode: 'play' | 'seek') => {
						return playOneVideo(rate, vol, mode);
					},

					readDoc: async () => {
						return readPdf();
					},

					readPpt: async () => {
						return readPpt();
					},

					/**
					 * 自动开始学习
					 *
					 * 直接打开/刷新章节页走 `oncomplete`，从课程页点进章节只改 history，
					 * 两种入口都调这里。同一个地址只自动起一次：脚本自己翻下一节、
					 * 用户手动点「停止」都不会被反复拉起。
					 */
					autoStart: async () => {
						if (state.running) return;
						if (!isStudyPage()) return;

						const key = location.href;
						if (state.autoStartedKey === key) return;
						state.autoStartedKey = key;

						/**
						 * 先等页面渲染出资源列表；空章节没有列表，但有「继续学习下一节」，
						 * 那也算可以启动（进去以后由 run 负责直接翻下一节）。
						 */
						for (let i = 0; i < 20; i++) {
							if (!isStudyPage()) return;
							if (activityItems().length || nextButton()) break;
							await $.sleep(500);
						}
						if (state.running || !isStudyPage()) return;

						$message.success('已进入学习页面，开始自动学习…');
						await this.methods.main();
					},

					/** 主循环 */
					run: async () => {
						const rate = parseFloat(this.cfg.playbackRate.toString());
						const vol = parseFloat(this.cfg.volume.toString());
						const autoNext = Boolean(this.cfg.autoNext);

						if (!isStudyPage()) {
							$message.error('请先进入课程学习页（章节页面，右侧能看到本节资源列表）');
							return;
						}

						state.stuck = 0;
						let index = 0;
						/** 有资源却一直选不中时，别无限重试 */
						let noActive = 0;
						while (state.running) {
							index++;

							/**
							 * 本章节没有资源时的处理
							 *
							 * 资源列表是异步渲染的，进章节后要缓一拍；但有的章节本来就没有资源
							 * （整章是空的，或只有作业/讨论），DOM 永远不会再变。
							 * 以前这里直接报「未检测到资源列表」就退出，或者死等资源加载，
							 * 结果就是卡在一个空章节上再也不往下走 —— 现在确认没资源就去下一节。
							 */
							if (!activityItems().length) {
								const ready = await waitForActivityList(6000);
								if (!ready && state.running) {
									$message.info('本章节没有可学习的资源，进入下一节');
									if (!autoNext) break;

									/** 「继续学习下一节」可能比资源列表更晚渲染，给它一点时间 */
									let btn = nextButton();
									for (let i = 0; i < 8 && !btn && state.running; i++) {
										await $.sleep(700);
										btn = nextButton();
									}

									/** 优先点底部按钮（能跨知识点连播），没有就点左侧章节树里的下一节 */
									let moved = btn ? await gotoNext() : false;
									if (!moved) moved = await gotoNextChapter();
									if (!moved) {
										$message.success('后面没有下一节了，学习结束');
										break;
									}
									await $.sleep(1200);
									continue;
								}
							}

							/** 有资源但没有任何一项被选中（有些章节进入后不自动选中） */
							if (!activeItem() && activityItems().length) {
								if (++noActive > 3) {
									$message.error('资源列表里没有可进入的项，已停止，请手动检查页面状态');
									break;
								}
								await gotoPending();
								await $.sleep(1200);
								continue;
							}
							noActive = 0;

							const item = activeItem();
							const key = currentKey();
							const beforeIdx = item ? activityItems().indexOf(item) : -1;
							state.activityKey = key;

							if (isFinished()) {
								$message.info(`已完成，跳过：${activeName()}`);
							} else {
								const ok = await this.methods.handleCurrent(rate, vol);
								if (!ok && state.running) {
									// 处理失败但可能只是没上报成功，继续尝试推进
									$message.warn(`未能完成：${activeName()}，继续下一个资源`);
								}
							}
							// 处理过就记账，避免作业这类点不进去的资源被反复重试
							if (item) state.handled.add(item);

							if (!state.running || !autoNext) break;

							// 先把本节剩下的资源做完，整节都完成了才跨知识点
							let moved = await this.methods.nextInSection();
							if (!moved) moved = await this.methods.next();
							if (!moved) moved = await this.methods.nextChapter();
							if (!moved) {
								$message.success('本节资源已全部处理，且没有下一节了，学习结束');
								break;
							}
							// 防止在原地来回打转：知识点和选中的资源都没变才算卡住
							const afterIdx = activityItems().indexOf(activeItem());
							if (currentKey() === key && afterIdx === beforeIdx) {
								state.stuck++;
								if (state.stuck >= 3) {
									$message.error('连续三次未能推进到下一个资源，已停止，请手动检查页面状态');
									break;
								}
							} else {
								state.stuck = 0;
							}
							if (index > 800) {
								$message.warn('已连续处理 800 个资源，自动停止');
								break;
							}
						}
					},

					/** 本节内推进到下一个未完成的资源 */
					nextInSection: async () => {
						return gotoPending();
					},

					next: async () => {
						return gotoNext();
					},

					/** 点左侧章节树里的下一个叶子章节（空章节没有底部按钮时用） */
					nextChapter: async () => {
						return gotoNextChapter();
					},

					main: async () => {
						if (state.running) {
							state.running = false;
							if (state.media && !state.media.paused) state.media.pause();
							$message.warn('已停止');
							return;
						}
						state.running = true;
						CommonProject.scripts.render.methods.pin(this);
						try {
							await this.methods.run();
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
					void this.methods.main();
				};

				body.replaceChildren(h('div', { className: 'card' }, [btn, tip]));

				const timer = setInterval(() => {
					if (!tip.isConnected) {
						clearInterval(timer);
						return;
					}
					btn.textContent = state.running ? '停止' : '开始学习';
					tip.textContent = state.running ? `正在处理：${activeName() || '加载中…'}` : '未运行';
				}, 1000);
			}
		})
	}
});
