import { $, Project, Script, $ui, $message, h } from 'easy-us';
import { playMedia } from '../utils';
import { playbackRate, volume } from '../utils/configs';
import { CommonProject } from './common';
import { setExtensionAutomation } from '../utils/automation-state';

/** 由 gm-polyfill 提供，最终由 background 执行 `chrome.tabs.remove` */
declare const GM_closeTab: ((url: string, cb?: (res: unknown) => void) => void) | undefined;

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

/** 每翻一页最多等平台回写进度的时间 */
const PDF_PAGE_TIMEOUT = 4000;

/** 临时排查用：控制台看脚本分支（排查完会撤掉） */
function dlog(...args: any[]) {
	console.log('[hh-fif]', ...args);
}

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
	autoStartedKey: '',
	/** 永中预览器（ PPT / 部分文档）报上来的总页数，用来把进度顶满 */
	pptTotal: 0,
	/** pdf.js 阅读器（ Word / PDF）报上来的总页数 */
	pdfTotal: 0,
	/**
	 * 每个资源的失败次数
	 *
	 * 大文件（几百页的 PPT、几十兆的 PDF）预览器要几十秒才能交互，第一次处理
	 * 往往拿不到页码，直接记账跳过就永远停在「未开始」。这里按元素记次数，
	 * 失败后不记账、原地重试，超过上限才放弃并留档。切章后 DOM 重建，WeakMap 自动重置。
	 */
	retry: new WeakMap<HTMLElement, number>(),
	/** 本次运行最终没做成的资源，收尾时统一打出来 */
	failures: [] as Array<{ name: string; kind: string; reason: string }>,
	/**
	 * 已探明的总页数缓存（key = 类型 + 资源标识）
	 *
	 * 同一个文档被跳过又回来、或者切走再切回时，没必要重新跳页探测 ——
	 * 每次探测都要翻两页、等两轮回写，纯浪费。
	 */
	totals: new Map<string, number>()
};

/**
 * 从消息体里挑出「总页数」
 *
 * 两个预览器的字段名不一样，平台也升级过几次命名。按可信度**依次命中**，
 * 不要「取所有数字里最大的」：消息里常混着 `pages`（已渲染页数）、`currentPage`
 * 这类干扰项，取最大会把 14 页的文档认成 19 页，平台按 19/14 就算出 136%。
 * 只认白名单 key，避免误取 `videoTotalTime` 之类的数字。
 */
function pickPageTotal(data: any, depth = 0): number {
	if (!data || typeof data !== 'object' || depth > 2) return 0;

	const keys = ['totalPage', 'totalPages', 'numPages', 'pageCount', 'pageTotal', 'total', 'pages', 'pageNum'];
	for (const key of keys) {
		const value = (data as any)[key];
		if (value === undefined || value === null || typeof value === 'object') continue;
		const num = parseInt(String(value), 10);
		if (num > 0 && num <= 5000) return num;
	}

	for (const key of Object.keys(data)) {
		const value = (data as any)[key];
		if (!value || typeof value !== 'object') continue;
		const nested = pickPageTotal(value, depth + 1);
		if (nested > 0) return nested;
	}
	return 0;
}

/**
 * 记下永中预览器的总页数
 *
 * 预览器翻一页就往父页面发一条 `{info:'ow365', page:{total, idx}}`，
 * 平台按 idx/total 算进度。这里只是顺带记一下 total，好在收尾时凑出「最后一页」。
 */
window.addEventListener(
	'message',
	(event: MessageEvent) => {
		if (!/ow365\.cn/.test(event.origin || '')) return;
		const data = event.data as { page?: { total?: string } } | null;
		const total = parseInt(String(data?.page?.total ?? ''), 10);
		if (total > 0) state.pptTotal = total;
	},
	true
);

/**
 * 记下 pdf.js 阅读器（Word / PDF）的总页数
 *
 * 阅读器每翻一页往父页面发一条 `{eventName:'currentPage', ...}`，里面带总页数。
 * 平台按「当前页 / 总页数」算百分比，所以收尾时上报的页码必须是**真实末页**，
 * 早先写死 999 会被平台算成 33300%，把课程进度统计搞脏。
 */
/** 阅读器消息只打印前几条，用来确认字段名，别把控制台刷了 */
let pdfMsgDumped = 0;

window.addEventListener(
	'message',
	(event: MessageEvent) => {
		if (!/resc\.fifedu\.com/.test(event.origin || '')) return;
		if (pdfMsgDumped < 3) {
			pdfMsgDumped++;
			try {
				dlog('pdf msg:', JSON.stringify(event.data).slice(0, 220));
			} catch {
				/* 循环引用之类，忽略 */
			}
		}
		const total = pickPageTotal(event.data);
		if (total > 0) state.pdfTotal = total;
	},
	true
);

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

/**
 * 这一项是否已经学完
 *
 * **只认「已完成」**：平台把进度和完成状态分开存，`已学 100%` 只是进度值，
 * 服务端的 `learnStatus` 没到位，课程统计里不算完成。
 * 之前把 100% 也算完成，结果卡在 100% 的 PPT 被直接跳过，永远等不到那一下补页。
 */
function itemFinished(item: HTMLElement) {
	const text = statusOf(item);
	return text.includes('已完成');
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

/** 单个资源最多重试几轮（大文件加载慢，一次没做完不代表资源有问题） */
const MAX_RESOURCE_RETRY = 3;

/**
 * 给「没学完」的资源做一次现场体检
 *
 * 面板上只显示「未能完成」的话，根本分不清是预览器还没加载完、总页数没探到，
 * 还是平台没回写进度。把能查到的都列出来：一条摘要进面板，完整明细进控制台。
 */
function diagnose(kind: string) {
	const parts: string[] = [`类型=${kind}`, `平台状态=${activeStatus() || '空'}`];

	if (kind === 'ppt') {
		parts.push(`预览器=${pptFrame() ? '有' : '无'}`);
		parts.push(`总页数=${state.pptTotal || '未上报'}`);
	} else if (kind === 'pdf') {
		const frame = pdfFrame();
		parts.push(`阅读器=${frame ? '有' : '无'}`);
		parts.push(`总页数=${state.pdfTotal || '未上报'}`);
		const hash = frame ? (frame.getAttribute('src') || '').split('#')[1] || '' : '';
		parts.push(`页码参数=${hash || '无'}`);
	} else if (kind === 'video') {
		const media = document.querySelector<HTMLVideoElement>('video');
		parts.push(`播放器=${media ? '有' : '无'}`);
		if (media) {
			const duration = isFinite(media.duration) ? Math.round(media.duration) : '?';
			parts.push(`进度=${Math.round(media.currentTime)}/${duration}s`);
			parts.push(`倍速=${media.playbackRate}`, `暂停=${media.paused ? '是' : '否'}`);
		}
	}

	// 把预览器域名也带上：平台换厂商时，日志里能直接看出该适配谁
	const hosts = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'))
		.filter((f) => !isCompanionFrame(f))
		.map((f) => {
			const src = f.getAttribute('src') || f.src || '';
			const matched = /^https?:\/\/([^/?#]+)/.exec(src);
			return matched ? matched[1] : src.slice(0, 24);
		});
	if (hosts.length) parts.push(`iframe=${hosts.join(',')}`);

	parts.push(`资源列表=${activityItems().length}项`);
	return parts.join(' ');
}

/** 数字人伴学 iframe 不是学习资源，判断预览器时要排掉 */
function isCompanionFrame(frame: HTMLIFrameElement) {
	const src = frame.getAttribute('src') || frame.src || '';
	return /istp-learning-companions/.test(src);
}

/** 页面上有没有挂资源预览器（不限于已知的两种域名） */
function hasPreviewFrame() {
	return Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe')).some((f) => !isCompanionFrame(f));
}

/**
 * iframe 得真的有尺寸，才算当前资源挂上来的
 *
 * 切换资源时旧预览器会残留在 DOM 里一拍，光看「有没有 iframe」会把上一节的
 * Word 当成当前资源的类型（从 Word 切到视频时最明显）。
 */
function visibleFrame(frame: HTMLIFrameElement | null) {
	return Boolean(frame && frame.offsetWidth > 80 && frame.offsetHeight > 80);
}

/** 播放器同理：有尺寸或有数据才算真的在放视频 */
function visiblePlayer() {
	const player = document.querySelector<HTMLElement>('.xgplayer');
	if (player && player.offsetHeight > 100) return true;
	const media = document.querySelector<HTMLVideoElement>('video');
	return Boolean(media && (media.offsetHeight > 80 || media.readyState > 0));
}

/**
 * 资源类型角标
 *
 * 列表项里有两个 `.activityStatus`：第一个是类型（视频 / Word / PPT / PDF），
 * 第二个是学习状态（已学 60% / 已完成）。判断类型只能看第一个。
 */
function typeBadge() {
	const item = activeItem();
	if (!item) return '';
	const list = Array.from(item.querySelectorAll('.activityStatus'));
	return (list[0]?.textContent || '').trim();
}

/**
 * 资源类型：**可见的播放器/预览器 → 类型角标 → 文件名后缀**
 *
 * 踩过的坑：
 * 1. `23视频的构成.docx` 里带「视频」两个字，早先按名字正则先判视频，
 *    于是脚本去等 `<video>` 播放器，等不到就判失败——明明挂的是 pdf.js 阅读器。
 * 2. 只看「有没有 iframe」会被残留元素骗：从 Word 切到视频时旧阅读器还在 DOM 里。
 *    所以这里要求 iframe / 播放器**有实际尺寸**。
 * 3. 网页链接（`<div class="link">` 只展示一个外链，无 iframe 无按钮）单独归类，
 *    平台对它没有「学完」的判定，点开也不发任何接口，只能识别出来干净跳过。
 */
function activeKind(): 'video' | 'pdf' | 'ppt' | 'link' | 'other' {
	if (visiblePlayer()) return 'video';
	if (visibleFrame(pptFrame())) return 'ppt';
	if (visibleFrame(pdfFrame())) return 'pdf';

	// 预览器还没挂上来时，看类型角标
	const badge = typeBadge();
	if (/视频/.test(badge)) return 'video';
	if (/PPT/i.test(badge)) return 'ppt';
	if (/PDF|Word|Excel|文档/i.test(badge)) return 'pdf';
	if (/网页|链接/.test(badge)) return 'link';
	if (/作业|讨论|测验|问卷|考试|音频/.test(badge)) return 'other';

	// 最后才看名字：先认后缀，再认关键词，避免「视频的构成.docx」被当成视频
	const name = activeName();
	if (/\.(docx?|pdf|xlsx?|txt)\b/i.test(name)) return 'pdf';
	if (/\.(pptx?)\b/i.test(name)) return 'ppt';
	if (/\.(mp4|flv|m3u8)\b/i.test(name)) return 'video';
	// 「视频的构成 网页链接」这种没有后缀的，别因为带「视频」就去等播放器
	if (/网页链接|超链接|^链接/.test(name)) return 'link';
	if (/\bPPT\b|PPTX?/i.test(name)) return 'ppt';
	if (/视频/.test(name)) return 'video';
	if (/PDF|Word|Excel/i.test(name)) return 'pdf';
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
	const frames = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'));
	return (
		frames.find((f) => /pdfv-resource/.test(f.getAttribute('src') || '')) ||
		frames.find((f) => /pdfv-resource/.test(f.src || '')) ||
		/** 路径改版时兜底：只要挂在资源服务器上的预览器就算 */
		frames.find((f) => /resc\.fifedu\.com/.test(f.src || '')) ||
		null
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
		// 已知预览器优先；`hasPreviewFrame` 兜住平台将来换域名/换厂商的情况
		if (visiblePlayer() || visibleFrame(pdfFrame()) || visibleFrame(pptFrame()) || hasPreviewFrame()) return true;
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
	if (!frame) {
		dlog('jump: 没有阅读器 iframe');
		return false;
	}
	const base = (frame.getAttribute('src') || frame.src || '').split('#')[0];
	if (!base) {
		dlog('jump: src 为空');
		return false;
	}
	frame.setAttribute('src', `${base}#page=${page}`);
	dlog('jump →', page, (frame.getAttribute('src') || '').split('#')[1]);
	return true;
}

/** 等平台把进度报上来：状态文本变了就返回 true */
async function waitStatusChange(from: string, timeout: number) {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (!state.running) return false;
		if (activeStatus() !== from) return true;
		await $.sleep(400);
	}
	return false;
}

/**
 * 让平台把当前文档当成「翻到最后一页」
 *
 * 平台不直接读阅读器 DOM，只认阅读器 postMessage 上来的 `{eventName:'currentPage'}`，
 * 再按 currentPage/totalPage 算进度、签名后上报。所以不必真的逐页翻——
 * 用阅读器自己的 iframe.contentWindow 作为 source 补一条「最后一页」即可，
 * 平台会当成正常浏览走完自己的上报链路（签名、节流都不用我们操心）。
 *
 * `totalPage` 必须是真实总页数：上报 999 时平台会算成 999/3 = 33300%，
 * 虽然状态也变成「已完成」，但课程总进度统计会被这个脏值污染。
 */
function markPdfDone(totalPage: number) {
	if (!(totalPage > 0)) return false;
	const win = pdfFrame()?.contentWindow;
	if (!win) return false;
	try {
		window.dispatchEvent(
			new MessageEvent('message', {
				data: { eventName: 'currentPage', currentPage: totalPage, totalPage },
				origin: 'https://resc.fifedu.com',
				source: win
			})
		);
		return true;
	} catch {
		return false;
	}
}

/** 永中预览器同理：`page.idx = page.total` 就是最后一页（总页数没探到时不做假） */
function markPptDone() {
	const frame = pptFrame();
	const win = frame?.contentWindow;
	if (!win) return false;
	const total = state.pptTotal;
	if (!(total > 0)) return false;
	try {
		window.dispatchEvent(
			new MessageEvent('message', {
				data: {
					info: 'ow365',
					anim: { total: '0', idx: '0' },
					page: { total: String(total), idx: String(total) },
					url: frame?.src || ''
				},
				origin: 'https://ow365.cn',
				source: win
			})
		);
		return true;
	} catch {
		return false;
	}
}

/**
 * PPT 版的补页校准：逻辑同 `calibratePdfDone`
 *
 * 永中预览器的 `pageCount` 一般是准的，但从消息里取的 total 仍可能取错，
 * 所以同样用平台回显反推一轮兜底。
 */
async function calibratePptDone(guess = state.pptTotal) {
	let page = guess;
	for (let round = 0; round < 3 && state.running; round++) {
		if (!(page > 0)) break;
		state.pptTotal = page;
		const before = activeStatus();
		if (!markPptDone()) return false;

		if (!(await waitStatusChange(before, 2500))) {
			dlog('calibratePpt: 报', page, '页没反应，停在', activeStatus());
			break;
		}
		if (isFinished()) {
			dlog('calibratePpt: 报', page, '页 →', activeStatus());
			return true;
		}

		const pct = percentOf(activeStatus());
		if (!pct || pct === 100) break;

		const real = Math.round((page * 100) / pct);
		dlog('calibratePpt: 报', page, '页 → 平台', pct + '%', '，真实约', real);

		// 同 PDF：临界区四舍五入会差一页，前后各试一个
		if (pct >= 95 && pct <= 105) {
			for (const candidate of [real, real - 1, real + 1]) {
				if (candidate <= 0 || candidate === page) continue;
				state.pptTotal = candidate;
				const from = activeStatus();
				markPptDone();
				if (!(await waitStatusChange(from, 2500))) continue;
				if (isFinished()) {
					dlog('calibratePpt: 临界修正 报', candidate, '页 →', activeStatus());
					return true;
				}
			}
			break;
		}

		if (real === page || real <= 0 || real > 5000) break;
		page = real;
	}
	return isFinished();
}

/** 从「已学 22%」里取 22 */
function percentOf(text: string) {
	const matched = /(\d+)\s*%/.exec(text || '');
	return matched ? parseInt(matched[1], 10) : 0;
}

/**
 * 用平台回显的百分比把「补页」校准到 100%
 *
 * 平台按「当前页 / 它自己的总页数」算百分比，而这个总页数我们只能猜：
 * 猜大了（上报 19 页、实际 14 页）显示 136%，猜小了（上报 5 页、实际 15 页）停在 33%，
 * 两种都不算「已完成」，资源就卡在半路。
 *
 * 把回显当反馈反推真实值再报一次：5 页报出 33% → 真实约 15 页 → 报 15 → 100%。
 * 最多收敛 3 轮，任一轮到 100% 就收工。
 */
async function calibratePdfDone(guess: number) {
	let page = guess;
	for (let round = 0; round < 3 && state.running; round++) {
		const before = activeStatus();
		if (!markPdfDone(page)) return false;

		// 平台没反应就别硬试了：要么阅读器还没就绪，要么它根本不认这条消息
		if (!(await waitStatusChange(before, 2500))) {
			dlog('calibrate: 报', page, '页没反应，停在', activeStatus());
			break;
		}
		if (isFinished()) {
			dlog('calibrate: 报', page, '页 →', activeStatus());
			return true;
		}

		const pct = percentOf(activeStatus());
		if (!pct || pct === 100) break;

		const real = Math.round((page * 100) / pct);
		dlog('calibrate: 报', page, '页 → 平台', pct + '%', '，真实约', real);

		/**
		 * 百分比落在 95~105 时已经接近末页，但四舍五入会让反推整整差一页：
		 * 151 页的文档报 200 得 132%，反推 152（101%）、再推 150（99%），
		 * 就是绕不到 151。这里把前后各一页都试掉，命中就走。
		 */
		if (pct >= 95 && pct <= 105) {
			let fixed = false;
			for (const candidate of [real, real - 1, real + 1]) {
				if (candidate <= 0 || candidate === page) continue;
				const from = activeStatus();
				markPdfDone(candidate);
				if (!(await waitStatusChange(from, 2500))) continue;
				if (isFinished()) {
					dlog('calibrate: 临界修正 报', candidate, '页 →', activeStatus());
					fixed = true;
					break;
				}
			}
			if (fixed) return true;
			break;
		}

		if (real === page || real <= 0 || real > 5000) break;
		page = real;
	}
	return isFinished();
}

/**
 * 进文档先等阅读器把总页数报上来
 *
 * 实测 pdf.js 加载完成后会主动发一条
 * `{eventName:'ready', totalPage:5, currentPage:1, loading:false}`，
 * **只有这条带 totalPage**，之后的 `{eventName:'currentPage', currentPage:N}` 不带。
 * 所以进文档先等这条，拿到就能一次补页到 100%，省掉跳页探测和百分比反推。
 *
 * 大文件下载慢，ready 可能要几秒，这里给 3 秒；等不到再走 `probePdfTotal`。
 */
async function waitPdfTotal(timeout = 3000) {
	const start = Date.now();
	while (Date.now() - start < timeout && state.running) {
		if (state.pdfTotal > 0) {
			dlog('waitPdfTotal: 阅读器主动上报总页数', state.pdfTotal);
			return state.pdfTotal;
		}
		await $.sleep(200);
	}
	return 0;
}

/**
 * 探出真实总页数
 *
 * 首选「直接读」：pdf.js 每次翻页都会往父页面发 `currentPage`，消息里带总页数，
 * 我们的全局监听器已经存进 `state.pdfTotal`。跳一页就能拿到，**一次就准**。
 *
 * 拿不到（消息里没有 total 字段）才退回反推：平台按「当前页 / 总页数」算百分比，
 * 2/9 显示 22%，`round(2 * 100 / 22) = 9`。反推差一页没关系，`calibratePdfDone`
 * 会用平台回显修回来，所以只跳一页、不再做第二轮交叉验证。
 *
 * 同时返回「探到第几页」，调用方从下一页接着翻，不要倒回第 1 页
 * （倒回去会让平台看到进度从 3/N 掉回 1/N，判定反复震荡，永远不给完成）。
 */
async function probePdfTotal(): Promise<{ total: number; page: number }> {
	if (!pdfFrame()) return { total: 0, page: 0 };

	/**
	 * 大文件先把文件下完、渲染首页才认跳页。「跳了没反应」不能直接当成「只有一页」，
	 * 重试几次；始终没反应说明这个阅读器不认 hash，交给后面的逐页翻兜底。
	 */
	let responsive = false;
	for (let attempt = 0; attempt < 5 && state.running; attempt++) {
		if (!pdfFrame()) return { total: 0, page: 0 };
		const from = activeStatus();
		jumpPdfPage(2);
		if (await waitStatusChange(from, PDF_PAGE_TIMEOUT)) {
			responsive = true;
			// 阅读器刚发了消息：直接用它报的总页数，不用再从百分比瞎推
			if (state.pdfTotal > 0) {
				dlog('probePdfTotal: 直接从阅读器消息读到总页数', state.pdfTotal);
				return { total: state.pdfTotal, page: 2 };
			}
			break;
		}
		if (attempt === 0) $message.info('文档还在加载（大文件通常要几十秒），继续等待…');
		await $.sleep(2000);
	}
	if (!responsive) {
		dlog('probePdfTotal: 跳页始终无反应', diagnose('pdf'));
		return { total: 0, page: 0 };
	}
	if (isFinished()) return { total: 0, page: 2 };

	let probePage = 2;
	let pct2 = percentOf(activeStatus());

	/**
	 * 页数多的文档，2/N 会四舍五入成 0%，反推不出东西。
	 * 往后多跳一点（10 页）再读一次，让百分比进入能分辨的范围。
	 */
	if (!pct2) {
		const from = activeStatus();
		jumpPdfPage(10);
		if (await waitStatusChange(from, PDF_PAGE_TIMEOUT)) {
			probePage = 10;
			if (isFinished()) return { total: 0, page: probePage };
			pct2 = percentOf(activeStatus());
		}
	}
	if (!pct2) return { total: 0, page: probePage };

	// `round(页 × 100 / pct)` 一步算出总页数。
	// 四舍五入可能差一页，但差一页由 calibratePdfDone 用回显修回来，
	// 没必要再跳一页多等一轮（每次等回写就要 4 秒）。
	const guess = Math.round((probePage * 100) / pct2);
	dlog('probePdfTotal:', probePage + '/' + guess, '=', pct2 + '% → 总页数约', guess);
	return { total: guess >= 2 && guess <= 5000 ? guess : 0, page: probePage };
}

/**
 * 逐页翻到末尾，直到平台标记完成
 *
 * 关键点：平台不是每翻一页立刻回写进度，而是几百毫秒到一两秒后才更新状态文本。
 * 之前固定等 900ms 就取样，第 2 页时状态还停在旧值，被当成「翻不动」提前收工，
 * 文档只走到 1/N 就被标记跳过。现在每页都等状态真的变化，连续两页等满超时才算到底。
 *
 * 另外 `#page=9999` 这种超大页码是无效的（pdf.js 忽略越界值，原地不动），
 * 所以不再用「一次跳末页」的探底法，老老实实从第 1 页往后推。
 */
async function readPdf(allowSwitch = true): Promise<boolean> {
	const frame = pdfFrame();
	if (!frame) {
		// 名字是 Word，页面挂的却是永中预览器：直接转过去，别报「找不到阅读器」
		if (allowSwitch && pptFrame()) {
			dlog('readPdf: 没有 pdf 阅读器，改走 PPT 分支');
			return readPpt(false);
		}
		$message.warn('未找到文档阅读器，跳过当前资源');
		dlog('readPdf: 没有 iframe', diagnose('pdf'));
		return false;
	}
	if (isFinished()) return true;

	// 先走「补最后一页」：真的逐页翻要把每一页都渲染+上报一遍，慢，而且中途被别的
	// 逻辑打断就会停在 6/9 这种半截状态。补一条「末页」消息平台立刻就按 100% 上报。
	// 页码优先直接读（缓存 → 阅读器消息 → 跳一页后的消息），实在读不到才用百分比反推。
	const cacheKey = `pdf:${currentKey()}`;
	const cached = state.totals.get(cacheKey) || 0;
	let total = cached || state.pdfTotal || (await waitPdfTotal(2000));
	let probedPage = 0;
	if (!total) {
		const probed = await probePdfTotal();
		total = probed.total;
		probedPage = probed.page;
	}
	if (total > 0) state.totals.set(cacheKey, total);
	if (isFinished()) return true;
	if (total > 0 && (await calibratePdfDone(total))) return true;

	dlog('readPdf: start', (frame.getAttribute('src') || '').slice(-40));

	let stagnant = 0;
	for (let page = probedPage + 1; page <= MAX_PDF_PAGES && state.running; page++) {
		if (!pdfFrame()) {
			dlog('readPdf: iframe 消失，停止');
			return isFinished();
		}

		const from = activeStatus();
		jumpPdfPage(page);
		const changed = await waitStatusChange(from, PDF_PAGE_TIMEOUT);
		dlog('readPdf: page', page, changed ? '变化 →' : '无变化 →', activeStatus());

		if (isFinished()) return true;
		if (changed) {
			stagnant = 0;
			continue;
		}

		// 翻页没带来任何进度变化：要么已经到末页，要么这个阅读器不认 hash。
		// 大文件渲染慢，前两三次没反应很常见，给到 4 次（并逐次拉长等待）再判到底
		stagnant++;
		if (stagnant >= 4) {
			dlog('readPdf: 连续', stagnant, '次无变化', diagnose('pdf'));
			break;
		}
		if (stagnant >= 2) await $.sleep(1500);
	}

	// 兜底再补一次：翻页这条路走完还没完成的话，拿最新探到的总页数再校准一轮
	if (!isFinished()) {
		const finalTotal = state.pdfTotal || total;
		if (finalTotal > 0) await calibratePdfDone(finalTotal);
	}
	return isFinished();
}

/** 让预览器翻一页，并拿回翻页后的页码（超时返回空串） */
function askPptNext(frame: HTMLIFrameElement, timeout = 1500) {
	return new Promise<string>((resolve) => {
		let done = false;
		const finish = (page: string) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			window.removeEventListener('message', onMessage);
			resolve(page);
		};
		const onMessage = (event: MessageEvent) => {
			const data = event.data as { type?: string; page?: string; total?: number } | null;
			if (!data || typeof data !== 'object' || data.type !== PPT_PAGE) return;
			// 预览器一并回传总页数，优先用它（比平台消息到得早，收尾时能立刻补末页）
			const total = parseInt(String(data.total ?? ''), 10);
			if (total > 0) state.pptTotal = total;
			finish(String(data.page ?? ''));
		};
		window.addEventListener('message', onMessage);
		frame.contentWindow?.postMessage(PPT_NEXT, '*');
		const timer = window.setTimeout(() => finish(''), timeout);
	});
}

/**
 * 等永中预览器可用，并尽量拿到总页数
 *
 * 正常路径是 pptHelper 在 iframe 里应答翻页请求——预览器加载成功时扩展能注入进去
 * （实测该框架的执行上下文里有扩展的 ctx，`pageCount` / `nextPage` 都能问到）。
 * 不应答的典型情况是预览器还没加载完，或者干脆是网络错误页（文档都没拉下来，
 * `waitPptReady` 问谁都白问）。
 *
 * 所以这里补一条不依赖 iframe 内脚本的退路：预览器默认停在第 1 页，
 * 平台显示 4% 就是 1/25，用 `round(100 / pct)` 反推总页数。
 * 反推不准没关系，`calibratePptDone` 会用后续回显把它收敛到 100%。
 */
async function waitPptReady(timeout = 12000) {
	const start = Date.now();
	let probed = 0;
	while (Date.now() - start < timeout && state.running) {
		const frame = pptFrame();
		if (!frame) {
			await $.sleep(600);
			continue;
		}
		if (state.pptTotal > 0) return true;

		probed++;
		const page = await askPptNext(frame, 1200);
		if (page) {
			dlog('waitPptReady: 就绪 当前页', page, '总页数', state.pptTotal || '未上报');
			return true;
		}
		if (probed === 1) $message.info('PPT 预览器响应慢，改用平台进度反推页数…');
		await $.sleep(600);
	}

	// 预览器不应答：用平台已经算出来的百分比反推
	const pct = percentOf(activeStatus());
	if (pct > 0 && pct < 100) {
		const guess = Math.max(2, Math.round(100 / pct));
		state.pptTotal = guess;
		dlog('waitPptReady: 预览器无应答，按', pct + '% 反推总页数', guess);
		return true;
	}

	dlog('waitPptReady: 等满', Math.round((Date.now() - start) / 1000), '秒', diagnose('ppt'));
	return Boolean(pptFrame());
}

/**
 * 逐页翻到末尾，直到平台标记完成
 *
 * 永中预览器把幻灯片渲染在自己的跨域 iframe 里，父页面碰不到它的 DOM，
 * 所以由注入到该 iframe 的 pptHelper 脚本代收消息、调用预览器自己的 nextPage()。
 * 每次翻页都会回传页码：页码不再变化就说明翻到最后一页了。
 */
async function readPpt(allowSwitch = true): Promise<boolean> {
	if (!pptFrame()) {
		// 反过来：名字是 PPT，实际挂的是 pdf.js（少见但存在）
		if (allowSwitch && pdfFrame()) {
			dlog('readPpt: 没有永中预览器，改走 PDF 分支');
			return readPdf(false);
		}
		$message.warn('未找到 PPT 预览器，跳过当前资源');
		dlog('readPpt: 没有 iframe', diagnose('ppt'));
		return false;
	}

	// 上一轮已经校准出准确页数的，直接复用（同一资源被跳过后重来时省掉一轮）
	const cacheKey = `ppt:${currentKey()}`;
	const cached = state.totals.get(cacheKey) || 0;
	if (cached > 0) {
		state.pptTotal = cached;
		dlog('readPpt: 复用上次校准的总页数', cached);
	}

	// 大 PPT 的预览器要几十秒才可交互，没就绪前发消息是石沉大海。
	// 旧逻辑在这一步直接开始数「翻不动」次数，数满就判成结束 —— 大文件就是这么被跳过的。
	if (!(await waitPptReady())) {
		dlog('readPpt: 预览器未就绪', diagnose('ppt'));
		return isFinished();
	}

	/**
	 * 已经是 100% 却还差最后一下的场景
	 *
	 * 平台把「进度 100%」和「learnStatus 已完成」分开记，有时 100% 了仍不标完成，
	 * 需要再补一次末页。但预览器没应答时（最常见：iframe 是网络错误页、文档根本没
	 * 加载出来，pptHelper 无处安身）拿不到总页数——这时候**绝对不能瞎报**：报 1 页
	 * 会把 100% 打回 4%。
	 *
	 * 所以直接认了：留一条明确记录跳过，别让它拖掉三轮重试（每轮 13 秒等预览器）。
	 * 预览器正常加载时扩展能注入进去（实测 CDP 上下文里有扩展的 ctx），
	 * `waitPptReady` 会问到页数，走不到这个分支。
	 */
	if (state.pptTotal <= 0 && percentOf(activeStatus()) >= 100) {
		$message.warn(`PPT 已是 100% 但平台未标完成，且读不到总页数，跳过：${activeName()}`);
		dlog('readPpt: 100% 无总页数', diagnose('ppt'));
		return true;
	}

	// 同文档：直接补一条「最后一页」。永中预览器自己演到 47 张要几十秒，
	// 而且演到 87%（41/47）时脚本以为翻不动就跳过了，永远差那几点。
	// 页数靠平台回显校准，报大报小都能收敛到 100%。
	if (await calibratePptDone()) {
		if (state.pptTotal > 0) state.totals.set(cacheKey, state.pptTotal);
		return true;
	}
	dlog('readPpt: 补页后 →', activeStatus(), '总页数', state.pptTotal || '未上报');

	let lastPage = '';
	let same = 0;
	for (let i = 0; i < MAX_PDF_PAGES && state.running; i++) {
		const frame = pptFrame();
		if (!frame) return isFinished();

		const page = await askPptNext(frame);
		await $.sleep(400);
		if (isFinished()) return true;

		// 页码没动：到底了，或者这一页没翻成。预览器渲染大图会卡一两拍，
		// 预览器中途挂掉（网络错误页）时页码永远不动，6 次（约 12 秒）没动静就收手
		if (!page || page === lastPage) {
			same++;
			if (same >= 6) {
				dlog('readPpt: 连续', same, '次页码不动', diagnose('ppt'));
				break;
			}
			if (same >= 3) await $.sleep(1200);
		} else {
			same = 0;
			lastPage = page;
		}
	}

	// 翻完还没完成：拿最新的 total 再校准一轮
	if (!isFinished()) {
		await calibratePptDone();
		if (isFinished() && state.pptTotal > 0) state.totals.set(cacheKey, state.pptTotal);
		dlog('readPpt: 收尾 →', activeStatus(), diagnose('ppt'));
	}
	return isFinished();
}

/**
 * 请后台关掉按 URL 前缀匹配的标签
 *
 * 讯飞「网页链接」资源点一下才算学完，但平台点完会自己开一个外部页面，
 * 而且**不是通过 `window.open`**（实测把这个 API 替换掉照样弹），所以只能事后关。
 * `GM_closeTab` 是 gm-polyfill 新加的桥接 API，拿不到就静默跳过——关不掉标签不影响完成判定。
 */
function closeTabByUrl(url: string) {
	const api = typeof GM_closeTab === 'function' ? GM_closeTab : null;
	if (!api) {
		dlog('closeTabByUrl: 桥接不可用，跳过');
		return;
	}
	try {
		api(url, (res) => dlog('closeTabByUrl:', JSON.stringify(res)));
	} catch (err) {
		dlog('closeTabByUrl: 调用失败', String(err));
	}
}

/**
 * 网页链接：点开就算完成
 *
 * 这类资源页面只有一个 `<div class="link">外链</div>`，没有 iframe、没有打开按钮。
 * **必须点这个元素，不能直接 window.open**：
 * 平台在它的点击处理器里发 `courseStudyClickResource` 埋点，完成判定挂在这次上报上；
 * 实测直接 `window.open` 只会开个窗口，一个请求都不发，状态永远「已学 0%」。
 *
 * 平台自己会开新标签，这里临时接管 `window.open` 拿到句柄，回写完就关掉。
 */
async function readLink(): Promise<boolean> {
	const queryLink = () =>
		document.querySelector<HTMLElement>('.content .link') || document.querySelector<HTMLElement>('.link');

	// 资源刚切过来时链接区块还没渲染，等它出现（最多 3 秒）再判定，别浪费一轮重试
	let el = queryLink();
	for (let i = 0; i < 6 && !el && state.running; i++) {
		await $.sleep(500);
		el = queryLink();
	}
	const url =
		(el?.textContent || '').trim() || (document.body.innerText.match(/https?:\/\/[^\s]+/) || [''])[0];
	if (!el && !/^https?:\/\//i.test(url)) {
		$message.warn(`没找到网页链接，跳过：${activeName()}`);
		dlog('readLink: 找不到链接元素');
		return false;
	}

	const before = activeStatus();

	/**
	 * 平台在点击处理器里自己 `window.open` 一个外部页面。我们只要那次点击埋点，
	 * 弹出来的标签纯属干扰 —— 而且 MAIN world 里的 `window.open` 返回 null（伪 Window），
	 * 拿不到句柄根本关不掉，每遇到一个链接就多留一个标签。
	 *
	 * 所以直接把它换成一个「假窗口」：不真开标签，但 `close/focus/location` 这些
	 * 平台可能会用到的成员都在，避免它拿到 null 之后抛错、把埋点也中断掉。
	 */
	const fakeWindow = {
		closed: false,
		close() {},
		focus() {},
		blur() {},
		postMessage() {},
		location: { href: url, replace() {}, assign() {}, reload() {} },
		document: { write() {}, close() {}, open() {} },
		opener: null
	};

	const originalOpen = window.open;
	/** `window.open` 到底替换成功没有：伪 Window 上可能只读，赋值会静默失败 */
	let replaced = false;
	try {
		window.open = function (openUrl?: string | URL) {
			fakeWindow.location.href = String(openUrl || url);
			return fakeWindow as unknown as Window;
		} as typeof window.open;
		replaced = window.open !== originalOpen;
		if (!replaced) {
			// 赋值被吞掉（属性只读或有 setter 保护），试试 defineProperty 硬写
			try {
				Object.defineProperty(window, 'open', {
					configurable: true,
					writable: true,
					value: function (openUrl?: string | URL) {
						fakeWindow.location.href = String(openUrl || url);
						return fakeWindow as unknown as Window;
					}
				});
				replaced = window.open !== originalOpen;
			} catch {
				/* 还是不行，只能靠事后关标签 */
			}
		}
		if (el) {
			const rect = el.getBoundingClientRect();
			/**
			 * 不要传 `view: window`！
			 * MAIN world 里的 window 是伪 Window 对象（沙箱为了隔离重写过），
			 * `new MouseEvent(..., {view: window})` 会直接抛
			 * `Failed to convert value to 'Window'`，事件构造不出来，点击等于没发。
			 */
			const opts = {
				bubbles: true,
				cancelable: true,
				clientX: rect.left + 10,
				clientY: rect.top + 8
			};
			el.dispatchEvent(new MouseEvent('mousedown', opts));
			el.dispatchEvent(new MouseEvent('mouseup', opts));
			el.dispatchEvent(new MouseEvent('click', opts));
		} else {
			dlog('readLink: 没有可点的元素，只上报了地址', url.slice(0, 60));
		}
	} catch (err) {
		dlog('readLink: 点击失败', String(err));
	} finally {
		window.open = originalOpen;
	}

	dlog('readLink: 点击', url.slice(0, 70), 'open替换成功=', replaced ? '是' : '否');

	/**
	 * 平台开新标签不是走 `window.open`（实测替换成功了照样弹），拦不住，
	 * 只能请后台按 URL 前缀把它关掉。等 1.2 秒让标签先真正创建出来。
	 */
	await $.sleep(1200);
	try {
		closeTabByUrl(url);
	} catch (err) {
		dlog('readLink: 关标签失败', String(err));
	}

	const changed = await waitStatusChange(before, 6000);
	const done = isFinished();

	if (done) {
		dlog('readLink: 已完成', activeName());
	} else {
		$message.info(`已点击网页链接${changed ? '' : '（平台暂未回写完成状态）'}：${url.slice(0, 56)}`);
		dlog('readLink: 未回写', diagnose('link'));
	}
	return true;
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
	const current = activeItem();
	const fromIdx = current ? activityItems().indexOf(current) : -1;
	state.media = null;
	target.click();

	const start = Date.now();
	while (Date.now() - start < 20000) {
		await $.sleep(700);
		const nowItem = activeItem();
		const nowIdx = nowItem ? activityItems().indexOf(nowItem) : -1;
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
		 *
		 * 页码有两代来源：新版是 `getAnimtPage().page.{idx,total}`，老版是 `#sn` 输入框。
		 * 只认 `#sn` 的话，新版预览器永远回空，父页面数满几次就当成「翻到末尾」——
		 * 这就是大 PPT 「没放完就跳过」的真正原因。
		 */
		pptHelper: new Script({
			name: 'PPT 预览器',
			namespace: 'fifedu.pptHelper',
			hideInPanel: true,
			matches: [['永中预览器', 'ow365.cn']],
			oncomplete() {
				/** 读当前页 / 总页数，读不到返回空串和 0 */
				const readPage = () => {
					const api = (window as unknown as { getAnimtPage?: () => any }).getAnimtPage;
					if (typeof api === 'function') {
						try {
							const info = api();
							const idx = parseInt(String(info?.page?.idx ?? ''), 10);
							const total = parseInt(String(info?.page?.total ?? ''), 10);
							if (idx > 0) return { page: String(idx), total: total > 0 ? total : 0 };
						} catch {
							/* 预览器还没就绪，落到下面的兜底 */
						}
					}
					const sn = document.querySelector<HTMLInputElement>('#sn');
					const value = parseInt(String(sn?.value ?? ''), 10);
					const count = (window as unknown as { pageCount?: number }).pageCount;
					return {
						page: value > 0 ? String(value) : '',
						total: typeof count === 'number' && count > 0 ? count : 0
					};
				};

				window.addEventListener('message', (event) => {
					if (event.data !== PPT_NEXT) return;
					const source = event.source as Window | null;
					const before = readPage().page;

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

					// 大图渲染慢，页码不是立刻变；轮询到变化或超时再回传
					let waited = 0;
					const timer = window.setInterval(() => {
						waited += 250;
						const now = readPage();
						if ((now.page && now.page !== before) || waited >= 3000) {
							window.clearInterval(timer);
							source?.postMessage({ type: PPT_PAGE, page: now.page, total: now.total, before }, '*');
						}
					}, 250);
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
						dlog('handle:', kind, '|', activeName(), '| skipPdf=', this.cfg.skipPdf);

						/**
						 * 不支持的类型（作业、讨论、测验…）先判掉，**不能先去等资源加载**：
						 * 这类资源永远不会挂出播放器或阅读器，等满两轮 30 秒才跳过，
						 * 用户看到的就是「明明加载好了，脚本却卡在这里不动」。
						 */
						/**
						 * 网页链接：页面只有一个 `<div class="link">` 展示外链，
						 * 没有 iframe、没有打开按钮。平台不校验内容，真实行为是
						 * 「打开链接即上报完成」——实测 window.open 之后 6 秒内
						 * 状态从「已学 0%」变「已完成」。
						 */
						if (kind === 'link') {
							$message.info(`打开网页链接：${activeName()}`);
							return readLink();
						}

						if (kind === 'other') {
							/**
							 * 有预览器 iframe 却认不出类型，多半是平台换了预览器域名。
							 * 先等几秒再判一次（返回 false 让主循环重来一轮），
							 * 仍不认识就带着 iframe 地址留档跳过，别静默丢掉。
							 */
							if (hasPreviewFrame()) {
								const unknown = Array.from(document.querySelectorAll<HTMLIFrameElement>('iframe'))
									.filter((f) => !isCompanionFrame(f))
									.map((f) => (f.getAttribute('src') || f.src || '').slice(0, 80));
								dlog('handle: 未识别的预览器', unknown);
								$message.warn(`未识别的预览器，等待加载后重试：${activeName()}`);
								await $.sleep(4000);
								if (activeKind() !== 'other') return false;
								$message.warn(`不支持的预览器（${unknown[0] || '未知地址'}）：${activeName()}`);
								return true;
							}
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
							/**
							 * 换资源了就把上一份的页数清掉。
							 * `state.pdfTotal` / `pptTotal` 是全局的，阅读器只在 `ready` 时上报一次，
							 * 不清就会拿上一个文档的总页数去补这一个（5 页的 Word 之后遇到 20 页的，
							 * 会先报 5 页得 25%，白多一轮校准）。
							 */
							if (state.activityKey !== key) {
								state.pdfTotal = 0;
								state.pptTotal = 0;
							}
							state.activityKey = key;

							if (isFinished()) {
								$message.info(`已完成，跳过：${activeName()}`);
							} else {
								const ok = await this.methods.handleCurrent(rate, vol);
								if (ok) {
									// 前几轮重试失败过、这次做成了：把失败清单里的旧记录摘掉，
									// 否则收尾汇总会报一个其实已经完成的资源
									const stale = state.failures.findIndex((f) => f.name === activeName());
									if (stale >= 0) state.failures.splice(stale, 1);
								}
								if (!ok && state.running && item) {
									/**
									 * 没做完不记账、原地重试。
									 *
									 * 大文件（几百页 PPT、几十兆 PDF）的预览器要几十秒才可交互，
									 * 第一次处理拿不到页码是常态。以前失败也照样记进 handled，
									 * 本次运行内就再也不会回头——用户看到的就是「没放完就跳过了」。
									 */
									const tries = (state.retry.get(item) || 0) + 1;
									state.retry.set(item, tries);
									const reason = diagnose(activeKind());
									dlog(`[未完成] ${activeName()} 第 ${tries}/${MAX_RESOURCE_RETRY} 次 | ${reason}`);

									if (tries < MAX_RESOURCE_RETRY && autoNext) {
										$message.warn(`未能完成（第 ${tries} 次，将重试）：${activeName()}｜${reason}`);
										await $.sleep(3000);
										continue;
									}

									state.failures.push({ name: activeName(), kind: activeKind(), reason });
									$message.error(
										`重试 ${tries} 次仍未完成，先跳过：${activeName()}｜${reason}`
									);
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
							const afterItem = activeItem();
							const afterIdx = afterItem ? activityItems().indexOf(afterItem) : -1;
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

						// 收尾留档：这一轮哪些资源重试到上限还是没完成，各自什么原因
						if (state.failures.length) {
							const lines = state.failures.map((f) => `· ${f.name}｜${f.reason}`);
							dlog('[未完成汇总]\n' + lines.join('\n'));
							$message.warn(`本轮有 ${state.failures.length} 个资源未完成：\n${lines.join('\n')}`);
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
							setExtensionAutomation(false, '讯飞在线学习');
							if (state.media && !state.media.paused) state.media.pause();
							$message.warn('已停止');
							return;
						}
						state.running = true;
						setExtensionAutomation(true, '讯飞在线学习');
						CommonProject.scripts.render.methods.pin(this);
						try {
							await this.methods.run();
						} catch (err) {
							$message.error('运行出错：' + String(err));
						} finally {
							state.running = false;
							setExtensionAutomation(false, '讯飞在线学习');
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
