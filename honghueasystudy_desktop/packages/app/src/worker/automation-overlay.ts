import type { BrowserContext, Page } from 'playwright-core';

/**
 * 自动化「流光边框 + 正在自动操作中」覆盖层
 *
 * 为什么注入页面而不是改窗口：桌面端控制的浏览器是外部 Edge / Chrome 进程，
 * 改不了它的系统窗口装饰；能做视觉反馈的只有页面本身。
 *
 * 防检测：宿主元素是一个**没有任何属性**的 div，内部走 closed shadow root，
 * 样式与文案都在影子树里 —— 页面脚本既 querySelector 不到内容，也读不到样式表。
 * 句柄挂在 `Symbol.for(...)` 上，`Object.getOwnPropertyNames(window)` 扫不到。
 */

/** 触发「自动操作」提示的动作：只有真正操作页面的动作才算，只读/长等待不算 */
const OPERATING_ACTIONS = new Set([
	'click',
	'dblclick',
	'check',
	'fill',
	'focus',
	'hover',
	'press',
	'tap',
	'selectOption',
	'setInputFiles',
	'dragAndDrop',
	'keyboard.type',
	'keyboard.press',
	'mouse.click',
	'mouse.dblclick',
	'mouse.down',
	'mouse.up',
	'mouse.move',
	'mouse.wheel',
	'reload',
	'bringToFront'
]);

export function isOperatingAction(property: string): boolean {
	return OPERATING_ACTIONS.has(property);
}

/**
 * 页面里创建覆盖层（字符串形式，避免主进程 tsconfig 没有 DOM 类型）
 *
 * 元素结构（全部在 closed shadow root 内）：
 *   .glow  —— 流光容器，只有两层：
 *             .halo  四条边缘带线性渐变，静态，画一次
 *             .ring  四条 3px 细条，条内渐变带做 transform 平移
 *   .blue  —— OCR / 验证码期间的纯色蓝：静态边框 + 四边渐变，零动画
 *   .pill  —— 底部胶囊：呼吸圆点 + 文案，带一道扫过的反光
 *
 * 性能底线（这两条是「刷课页面加载卡」的直接教训）：
 *   1. 不要出现「比视口还大」的图层，也不要给整屏容器加 mask / opacity /
 *      filter —— 任何一个都会让浏览器开一张全屏离屏 surface，再叠上动画就是
 *      每帧两百万像素起步的合成，正好和视频解码抢 GPU。
 *   2. 动画只允许 transform / opacity，且必须能被 .live 门控暂停。
 * 另外 OCR / 滑块场景额外降级成静态纯蓝（.calm），结束后再渐变回流光。
 */
export function buildOverlayScript(message: string, calm = false): string {
	return `(() => {
	try {
		var KEY = Symbol.for('hh.glow.ctl');
		var MSG = ${JSON.stringify(message)};
		/* 平静态：OCR / 验证码期间显示纯色蓝色，停掉大图层动画，避免和验证码抢渲染 */
		var CALM = ${JSON.stringify(!!calm)};
		var prev = window[KEY];
		if (prev && prev.host && prev.host.isConnected) {
			/* 正在淡出的旧覆盖层：取消移除并淡回来，避免出现「两个胶囊叠加」 */
			if (prev.timer) { clearTimeout(prev.timer); prev.timer = 0; }
			prev.text.textContent = ${JSON.stringify(message)};
			prev.host.style.display = 'block';
			prev.host.style.opacity = '1';
			/* 直接原地切换状态：走 CSS 过渡，视觉上是自然渐变 */
			if (prev.applyCalm) prev.applyCalm(CALM);
			return 'updated';
		}
		var host = document.createElement('div');
		host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block';
		/* 淡入淡出：整块覆盖层只做 opacity，走合成层，不触发页面重绘 */
		host.style.opacity = '0';
		host.style.transition = 'opacity .24s ease';
		var root = host.attachShadow({ mode: 'closed' });
		var style = document.createElement('style');
		style.textContent = \`
			:host { all: initial; }
			/*
			 * 性能说明（改这里之前先读）
			 *
			 * 覆盖层跑在别人的网课页面上，章节一跳就重建一次 ——
			 * 它花的每一毫秒都直接从播放器 / 题目组件的首屏预算里扣。
			 *
			 * 历史方案是「一块 0.75×视口对角线的 conic 方盘 + 全屏 mask + 旋转动画」：
			 * 1080p 下那是 1652×1652 ≈ 270 万像素的图层，而且
			 *   · .glow 上的 opacity < 1 让浏览器为整屏开一张离屏 surface；
			 *   · 四边 mask 再开一层整屏合成；
			 *   · 子层每帧旋转 → 上面两层整屏 surface 每帧都得重算。
			 * 单帧两百万像素起步的全屏合成正好和视频解码抢 GPU，
			 * 表现就是「页面加载卡、视频 / 题目组件半天不出来」。
			 *
			 * 现在的结构（每条都是为了让合成面积尽量小）：
			 *   .halo  四条边缘带线性渐变，静态，挂载时画一次
			 *   .ring  四条 3px 细条，条内 200% 长的渐变带纯 transform 平移
			 * 每帧 GPU 填充从 ~200 万像素降到 ~5 万像素，没有 mask、没有大图层。
			 * 新增动画前按这个标准评估：宁可少一层光，也不要和页面抢渲染。
			 */
			.glow {
				/* 不再需要 overflow:hidden：越界的只有四条细条，它们自己就裁好了。
				   少一个裁剪容器 = 少一张整屏图层 */
				position: absolute; inset: 0; pointer-events: none;
				/* OCR 期间整体淡出，露出下面的纯色蓝；结束后再淡回流光 */
				transition: opacity .45s ease;
				/*
				 * 注意：这里**不要**再写 opacity。
				 * 容器上挂一个小于 1 的 opacity 会让浏览器为整屏开一张离屏 surface，
				 * 里面还套着动画子层时，这张 surface 每帧都要重算。
				 * 需要的半透明已经写进下面各个渐变的颜色里了。
				 */
			}
			/*
			 * 光晕：四条边缘带各一段线性渐变，只覆盖真正看得见的边带。
			 * 旧实现是一整块 conic 方盘被 mask 裁成边缘 —— 中间 70% 面积纯属白画，
			 * 而且方盘边长按视口对角线算，1080p 下就是 270 万像素的图层。
			 */
			.halo {
				position: absolute; inset: 0; pointer-events: none;
				/*
				 * 每边都用多段衰减（而不是「有色 → 透明」两段）。
				 * 单段线性衰减在屏幕上会读出一条生硬的等值线，旧版 mask 之所以柔和
				 * 就是因为它是 0.95/0.52/0.16/0 的四段曲线；这里用三段曲线复刻。
				 */
				background-image:
					linear-gradient(to bottom,
						rgba(79,140,255,.40), rgba(79,140,255,.20) 26%,
						rgba(79,140,255,.06) 58%, rgba(79,140,255,0)),
					linear-gradient(to top,
						rgba(52,211,153,.34), rgba(52,211,153,.17) 26%,
						rgba(52,211,153,.05) 58%, rgba(52,211,153,0)),
					linear-gradient(to right,
						rgba(139,92,246,.34), rgba(139,92,246,.17) 26%,
						rgba(139,92,246,.05) 58%, rgba(139,92,246,0)),
					linear-gradient(to left,
						rgba(245,158,11,.26), rgba(245,158,11,.13) 26%,
						rgba(245,158,11,.04) 58%, rgba(245,158,11,0));
				background-repeat: no-repeat;
				background-size:
					100% min(30vh, 320px),
					100% min(30vh, 320px),
					min(17vw, 220px) 100%,
					min(17vw, 220px) 100%;
				background-position: left top, left bottom, left top, right top;
			}
			/*
			 * 流光：四条 3px 细条，条内放一根 200% 长的渐变带做位移。
			 *
			 * 为什么不再「旋转一整块大 conic」：那是每帧两百万像素的全屏合成，
			 * 边框却只有 3px 宽 —— 99% 的合成工作都花在看不见的地方。
			 * 现在位移只用 transform（走合成，不重绘），条自身 overflow:hidden
			 * 裁掉溢出，每帧需要填充的面积只有几万像素。
			 * 渐变图案左右两半完全重复，所以平移 -50% 能无缝循环。
			 */
			.ring { position: absolute; inset: 0; pointer-events: none; }
			.ring i { position: absolute; display: block; overflow: hidden; }
			.ring .rt, .ring .rb { left: 0; right: 0; height: 3px; }
			.ring .rt { top: 0; }
			.ring .rb { bottom: 0; }
			.ring .rl, .ring .rr { top: 0; bottom: 0; width: 3px; }
			.ring .rl { left: 0; }
			.ring .rr { right: 0; }
			.ring i::before { content: ''; position: absolute; will-change: transform; }
			.ring .rt::before, .ring .rb::before {
				top: 0; bottom: 0; left: 0; width: 200%;
				background: linear-gradient(90deg,
					rgba(79,140,255,0) 0%, #4f8cff 5%, #8b5cf6 11%, #22d3ee 17%,
					#34d399 23%, #f59e0b 29%, rgba(245,158,11,0) 35%,
					rgba(79,140,255,0) 50%, #4f8cff 55%, #8b5cf6 61%, #22d3ee 67%,
					#34d399 73%, #f59e0b 79%, rgba(245,158,11,0) 85%,
					rgba(79,140,255,0) 100%);
				animation: hh-x 7.2s linear infinite;
			}
			.ring .rl::before, .ring .rr::before {
				left: 0; right: 0; top: 0; height: 200%;
				background: linear-gradient(180deg,
					rgba(79,140,255,0) 0%, #4f8cff 5%, #8b5cf6 11%, #22d3ee 17%,
					#34d399 23%, #f59e0b 29%, rgba(245,158,11,0) 35%,
					rgba(79,140,255,0) 50%, #4f8cff 55%, #8b5cf6 61%, #22d3ee 67%,
					#34d399 73%, #f59e0b 79%, rgba(245,158,11,0) 85%,
					rgba(79,140,255,0) 100%);
				animation: hh-y 7.2s linear infinite;
			}
			/* 顺时针读感：上边左→右、右边上→下，反向播放即可 */
			.ring .rt::before, .ring .rr::before { animation-direction: reverse; }
			@keyframes hh-x { to { transform: translate3d(-50%, 0, 0); } }
			@keyframes hh-y { to { transform: translate3d(0, -50%, 0); } }
			/*
			 * live 门控：默认 paused，注入后由 JS 在页面空闲时点亮。
			 * paused 时浏览器不会为动画占用合成带宽，页面首屏那几百毫秒
			 * 正是最吃 GPU 的时候，少抢一点就是少卡一下。
			 * calm（OCR / 验证码）写在后面对同特异性生效，优先级更高。
			 *
			 * ⚠️ 选择器必须和上面的 animation 简写同特异性：简写会把
			 * play-state 重置成 running，靠「同特异性 + 更靠后」才压得住。
			 */
			.ring .rt::before, .ring .rb::before, .ring .rl::before, .ring .rr::before {
				animation-play-state: paused;
			}
			.glow.live .ring i::before { animation-play-state: running; }
			.glow.calm .ring i::before { animation-play-state: paused; }
			/*
			 * 纯色蓝：OCR / 验证码期间替代流光。
			 * 只用静态边框 + 四边方向渐变，没有任何动画与大面积模糊，
			 * 光栅化一次即可，不会再和验证码抢渲染资源。
			 */
			.blue {
				position: absolute; inset: 0; pointer-events: none; opacity: 0;
				transition: opacity .45s ease;
				box-shadow: inset 0 0 0 2px #3b82f6;
				/* 边缘带按 background-size 限制，别让四层渐变铺满整屏（那等于白画中间） */
				background-image:
					linear-gradient(to right, rgba(59,130,246,.26), rgba(59,130,246,0)),
					linear-gradient(to left, rgba(59,130,246,.26), rgba(59,130,246,0)),
					linear-gradient(to bottom, rgba(59,130,246,.20), rgba(59,130,246,0)),
					linear-gradient(to top, rgba(59,130,246,.20), rgba(59,130,246,0));
				background-repeat: no-repeat;
				background-size: 64px 100%, 64px 100%, 100% 56px, 100% 56px;
				background-position: left top, right top, left top, left bottom;
			}
			.pill {
				position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
				display: flex; align-items: center; gap: 8px;
				padding: 9px 16px 9px 13px; border-radius: 999px;
				background: rgba(17, 24, 39, .92); color: #fff;
				font: 500 13px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
				letter-spacing: .2px; white-space: nowrap; pointer-events: none;
				box-shadow: 0 10px 30px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.08) inset;
				overflow: hidden;
				animation: hh-in .32s cubic-bezier(.16,1,.3,1) both;
			}
			.pill::after {
				content: ''; position: absolute; top: 0; bottom: 0; width: 40%;
				background: linear-gradient(100deg, transparent, rgba(255,255,255,.28), transparent);
				transform: translateX(-160%); animation: hh-sheen 2.4s ease-in-out infinite;
			}
			.dot {
				width: 7px; height: 7px; border-radius: 50%; background: #34d399;
				box-shadow: 0 0 9px #34d399; animation: hh-pulse 1.4s ease-in-out infinite; flex: none;
			}
			@keyframes hh-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.8); } }
			@keyframes hh-sheen { 0% { transform: translateX(-160%); } 55%,100% { transform: translateX(320%); } }
			@keyframes hh-in { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
			@media (prefers-reduced-motion: reduce) {
				/* 选择器要和 .ring .rt::before 同特异性，否则压不住上面的 animation 简写 */
				.ring .rt::before, .ring .rb::before, .ring .rl::before, .ring .rr::before,
				.dot, .pill::after { animation: none; }
			}
		\`;
		var glow = document.createElement('div');
		glow.className = 'glow';
		/* 光晕：四条边缘带，静态绘制一次 */
		var halo = document.createElement('div');
		halo.className = 'halo';
		glow.appendChild(halo);
		/* 3px 流光：四条细条，每条内部是一根做 transform 平移的渐变带 */
		var ring = document.createElement('div');
		ring.className = 'ring';
		var sides = ['rt', 'rb', 'rl', 'rr'];
		for (var s = 0; s < sides.length; s++) {
			var bar = document.createElement('i');
			bar.className = sides[s];
			ring.appendChild(bar);
		}
		glow.appendChild(ring);
		var blue = document.createElement('div');
		blue.className = 'blue';
		var pill = document.createElement('div');
		pill.className = 'pill';
		var dot = document.createElement('i');
		dot.className = 'dot';
		var text = document.createElement('span');
		text.textContent = MSG;
		pill.appendChild(dot);
		pill.appendChild(text);
		var frag = document.createDocumentFragment();
		frag.appendChild(style);
		frag.appendChild(glow);
		frag.appendChild(blue);
		frag.appendChild(pill);
		root.appendChild(frag);
		var ctl = { host: host, text: text, timer: 0, glow: glow, blue: blue };
		/**
		 * 切换「流光 / 纯色蓝」。
		 *
		 * 只用内联样式改 opacity：两边都带 .45s 过渡，所以是自然渐变，
		 * 既不是硬切，也不会重建 DOM。颜色与布局全在影子树里，页面脚本看不到。
		 */
		ctl.applyCalm = function (on) {
			try {
				glow.classList.toggle('calm', !!on);
				glow.style.opacity = on ? '0' : '';
				blue.style.opacity = on ? '1' : '0';
			} catch (e) {}
		};
		ctl.applyCalm(CALM);
		/**
		 * 延后到空闲帧再插入 DOM。
		 *
		 * 跳转场景里 'load' 之后的这段时间正是页面自己最忙的时候，
		 * 我们这点装饰性 UI 没必要抢在前面；requestIdleCallback 不在就退化成 setTimeout。
		 */
		var run = function () {
			try {
				/**
				 * 挂载前就被撤销了（点亮后 1.5 秒内熄灭）：此时 KEY 已被删掉，
				 * 如果还继续 append，就会留下一个再也没有句柄去关闭的覆盖层。
				 */
				if (window[KEY] !== ctl) return;
				if (!host.isConnected) document.documentElement.appendChild(host);
				/* 先强制算一次样式，否则「挂载 + 改 opacity」在同一帧里会被合并，过渡不触发 */
				void host.offsetWidth;
				host.style.opacity = '1';
				/**
				 * 流光动画延迟启动：挂在 DOM 上不等于要马上转。
				 *
				 * 页面刚 load 完的几百毫秒里，滚动/图片解码/字体替换都还在跑，
				 * 这时候再开两块全屏图层的旋转，用户的感受就是「这一下卡了」。
				 * 等一个空闲帧再点亮 live；timeout 兜底，页面一直忙也不会永远不转。
				 */
				var live = function () {
					try {
						if (window[KEY] !== ctl || !host.isConnected) return;
						glow.classList.add('live');
					} catch (e) {}
				};
				if (typeof requestIdleCallback === 'function') requestIdleCallback(live, { timeout: 1200 });
				else setTimeout(live, 700);
			} catch (e) {}
		};
		if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1500 });
		else setTimeout(run, 200);
		Object.defineProperty(window, KEY, { value: ctl, configurable: true, enumerable: false });
		return 'mounted';
	} catch (e) {
		return 'error:' + (e && e.message);
	}
})();`;
}

function unmountScript(): string {
	return `(() => {
	try {
		var KEY = Symbol.for('hh.glow.ctl');
		var ctl = window[KEY];
		if (!ctl || !ctl.host) return 'removed';
		if (!ctl.host.isConnected) {
			try { delete window[KEY]; } catch (e) {}
			return 'removed';
		}
		/* 淡出：先降到 0，动画结束再摘掉节点；期间如果又重新点亮，上面会取消这个计时 */
		if (ctl.timer) clearTimeout(ctl.timer);
		ctl.host.style.opacity = '0';
		ctl.timer = setTimeout(function () {
			try {
				ctl.host.remove();
				if (window[KEY] === ctl) delete window[KEY];
			} catch (e) {}
		}, 260);
		return 'removed';
	} catch (e) {
		return 'error:' + (e && e.message);
	}
})();`;
}

export interface AutomationOverlay {
	/**
	 * 开始显示。
	 * @param message 文案，空则沿用上一次
	 * @param sticky 常显直到 `hide()`（自动登录这类长流程用），默认按 idleMs 自动隐藏
	 */
	show: (message?: string, sticky?: boolean) => void;
	/** 远程动作触发：显示并重置自动隐藏计时 */
	pulse: () => void;
	/** 立即隐藏桌面端自己的任务；扩展任务仍按各自来源继续显示 */
	hide: () => void;
	/**
	 * 设置一个独立任务来源的常显状态。
	 * 扩展每次心跳都会续租；页面异常关闭后来源会在 60 秒后自动回收。
	 * `steady` 为真时该来源显示期间切「纯色蓝」并暂停流光（OCR / 验证码专用）。
	 */
	setSourceActive: (source: string, message: string, active: boolean, options?: { steady?: boolean }) => void;
	/** 停止监听（浏览器关闭时调用） */
	dispose: () => void;
	readonly active: boolean;
}

/** 每个浏览器实例一份（browser 关闭后自动回收） */
const overlays = new WeakMap<BrowserContext, AutomationOverlay>();

export function getAutomationOverlay(browser?: BrowserContext | null): AutomationOverlay | undefined {
	return browser ? overlays.get(browser) : undefined;
}

export interface AutomationOverlayOptions {
	/** 最后一次「自动操作」后多久自动隐藏（毫秒） */
	idleMs?: number;
	/** 是否启用（渲染端「自动化流光提示」开关）；关闭时所有调用都是空操作 */
	enabled?: boolean;
}

/**
 * 给一个浏览器实例挂上覆盖层控制器
 */
export function attachAutomationOverlay(browser: BrowserContext, options: AutomationOverlayOptions = {}): AutomationOverlay {
	const existing = overlays.get(browser);
	if (existing) return existing;

	const idleMs = options.idleMs ?? 4000;
	/** 开关关闭时连监听都不挂：既省开销，也保证页面上不会出现任何注入痕迹 */
	const enabled = options.enabled !== false;
	if (!enabled) {
		const noop: AutomationOverlay = {
			show: () => {},
			pulse: () => {},
			hide: () => {},
			setSourceActive: () => {},
			dispose: () => {},
			active: false
		};
		overlays.set(browser, noop);
		return noop;
	}

	let active = false;
	let message = '正在自动操作中';
	let timer: NodeJS.Timeout | undefined;
	let disposed = false;
	/** 常显任务按来源保存；worker 与多个扩展页面/任务可以并行存在。 */
	const stickySources = new Map<string, string>();
	const sourceExpiryTimers = new Map<string, NodeJS.Timeout>();
	/**
	 * 需要在显示期间切成「纯色蓝」的来源（OCR / 验证码）。
	 *
	 * 登录/验证码阶段是页面最吃渲染的时刻，流光那两块大面积动画会把页面拖到几帧，
	 * 连带 OCR 的取图与滑块都变慢。这里只把覆盖层降级成静态纯色蓝，
	 * 其它来源（自动程序、扩展任务）仍然保持流光。
	 */
	const steadySources = new Set<string>();
	let calm = false;
	/** 非 sticky 的动作脉冲状态，和常显任务分开，脉冲结束不能误关掉长任务。 */
	let transient = false;
	let transientMessage = '';

	/**
	 * 已经挂上的页面集合。
	 *
	 * 原来每次 pulse（每个 mouse.move 都会触发）都重新发一遍 3KB 的注入脚本，
	 * 滚动/连点时会变成每秒几十次 evaluate —— 纯浪费。现在只在「首次挂载」和
	 * 「页面导航后 DOM 被清空」时注入，重复 pulse 只是重置隐藏计时。
	 */
	const mounted = new WeakSet<Page>();

	/**
	 * 注入冷却：同一页面在冷却窗口内不重复尝试。
	 *
	 * 历史实现用「navigating 布尔锁 + 等 load 解锁」防止跳转期间把 evaluate 打成风暴，
	 * 但 SPA（讯飞课程页这类）站内 pushState 跳转会触发 `framenavigated` 而**永远不触发
	 * `load`**（整个文档没重新加载），锁一旦打上就再也解不开 —— 页面永久无法注入，
	 * 表现为「刷课在动、光效不亮」。
	 *
	 * 现在只保留短冷却：失败由 evaluate 的 catch 回退 mounted，下次触发再试。
	 * 冷却窗口足够短，秒级任务也能立刻看到光效；又足以吸收 pulse 连续点击的重复注入。
	 */
	const nextAttemptAt = new WeakMap<Page, number>();
	const APPLY_COOLDOWN_MS = 200;

	const apply = (page: Page) => {
		if (!isUsablePage(page)) return;
		if (mounted.has(page)) return;
		const now = Date.now();
		if (now < (nextAttemptAt.get(page) || 0)) return;
		nextAttemptAt.set(page, now + APPLY_COOLDOWN_MS);
		mounted.add(page);
		page
			.evaluate(buildOverlayScript(message, calm))
			.then((result) => {
				/**
				 * 注入脚本自己 catch 掉的失败会以 `error:...` **正常返回**，
				 * 不会触发下面的 catch。以前这种情况仍被标记为「已挂载」，
				 * 于是这个页面直到下一次整页跳转都不会再尝试注入 —— 表现为「脚本在跑、光效不亮」。
				 */
				if (typeof result === 'string' && result.indexOf('error') === 0) {
					mounted.delete(page);
				}
			})
			.catch(() => {
				/** 注入失败（页面正在导航等）不能算已挂载，下次还要再试 */
				mounted.delete(page);
			});
	};

	const clear = (page: Page) => {
		mounted.delete(page);
		/** 熄灭后立刻又点亮（例如快速切换任务）时不该被注入冷却挡掉 */
		nextAttemptAt.delete(page);
		if (!isUsablePage(page)) return;
		page.evaluate(unmountScript()).catch(() => {});
	};

	const clearSourceExpiry = (source: string) => {
		const expiry = sourceExpiryTimers.get(source);
		if (expiry) clearTimeout(expiry);
		sourceExpiryTimers.delete(source);
	};

	/** 根据「常显任务 + 短时动作脉冲」重算一次实际可见状态。 */
	const sync = () => {
		if (disposed) return;
		const wasActive = active;
		const previousMessage = message;
		const previousCalm = calm;
		const sourceMessages = Array.from(stickySources.values());
		active = stickySources.size > 0 || transient;
		message = sourceMessages[sourceMessages.length - 1] || (transient && transientMessage) || message;
		/** 只要有来源要求「纯色蓝」，整块覆盖层就进入平静态（多个来源同时存在时也保持一致） */
		calm = steadySources.size > 0;

		if (!active) {
			if (wasActive) browser.pages().forEach(clear);
			return;
		}
		if (previousMessage !== message || previousCalm !== calm) {
			/** 文案或形态变化才重建；心跳和重复 pulse 只会命中 mounted，直接跳过注入。 */
			browser.pages().forEach((page) => {
				mounted.delete(page);
				/**
				 * 这是真实的状态变化（例如「自动程序」→「OCR 识别中」或流光→纯色蓝），
				 * 不能被 200ms 的注入冷却挡掉，否则提示要等下一次心跳才更新。
				 */
				nextAttemptAt.delete(page);
				apply(page);
			});
		} else {
			browser.pages().forEach(apply);
		}
	};

	const hide = () => {
		stickySources.delete('worker');
		transient = false;
		if (timer) {
			clearTimeout(timer);
			timer = undefined;
		}
		sync();
	};

	const scheduleIdle = () => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = undefined;
			transient = false;
			sync();
		}, idleMs);
	};

	const show = (msg?: string, sticky?: boolean) => {
		if (disposed) return;
		if (sticky) {
			stickySources.set('worker', msg || message);
			transient = false;
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
			sync();
			return;
		}

		/** 已有长任务时，动作脉冲不改变它的文案，也不另开隐藏计时。 */
		if (stickySources.size > 0) {
			sync();
			return;
		}
		transient = true;
		if (msg) transientMessage = msg;
		sync();
		scheduleIdle();
	};

	const setSourceActive = (
		source: string,
		msg: string,
		sourceActive: boolean,
		options?: { steady?: boolean }
	) => {
		if (disposed || !source) return;
		clearSourceExpiry(source);
		if (sourceActive) {
			stickySources.set(source, msg || '正在自动操作中 · 扩展脚本');
			if (options && options.steady) steadySources.add(source);
			else steadySources.delete(source);
			/** 心跳正常时每 20 秒续租；页面崩溃/直接关标签后最迟 60 秒回收。 */
			sourceExpiryTimers.set(
				source,
				setTimeout(() => {
					sourceExpiryTimers.delete(source);
					stickySources.delete(source);
					steadySources.delete(source);
					sync();
				}, 60_000)
			);
		} else {
			/** 收到结束就立刻熄灭，不再强撑（此前有 2.5 秒最小展示时长，任务一结束还要亮着） */
			const hadSource = stickySources.delete(source);
			const hadSteady = steadySources.delete(source);
			/** 来源已经回收、也没要求过平静态：没必要再跑一遍同步 */
			if (!hadSource && !hadSteady) return;
		}
		sync();
	};

	const onPage: (page: Page) => void = (page) => {
		/**
		 * 整页跳转后 DOM 被清空，旧的注入痕迹不再存在，必须允许重新挂载。
		 *
		 * 只监听文档级事件：站内 pushState 跳转不会触发它们（也不需要重挂，
		 * 覆盖层还在 DOM 里），因此不会出现「标记卡死」的问题。
		 */
		page.on('load', () => {
			mounted.delete(page);
			if (active && !disposed) apply(page);
		});
		/** 部分页面首屏资源迟迟不完成，DOMContentLoaded 更可靠 */
		page.on('domcontentloaded', () => {
			mounted.delete(page);
			if (active && !disposed) apply(page);
		});
		if (active) apply(page);
	};

	browser.on('page', onPage);
	browser.pages().forEach(onPage);

	const overlay: AutomationOverlay = {
		show,
		pulse: () => show(),
		hide,
		setSourceActive,
		dispose: () => {
			disposed = true;
			stickySources.clear();
			steadySources.clear();
			calm = false;
			transient = false;
			for (const source of Array.from(sourceExpiryTimers.keys())) clearSourceExpiry(source);
			if (timer) clearTimeout(timer);
			timer = undefined;
			active = false;
			browser.pages().forEach(clear);
			browser.off('page', onPage);
			overlays.delete(browser);
		},
		get active() {
			return active;
		}
	};
	overlays.set(browser, overlay);
	return overlay;
}

/**
 * 只往真正的网页里注入：错误页 / about:blank / 已关闭的页面
 * 既没有可画的区域，evaluate 也常常直接抛。
 */
function isUsablePage(page: Page): boolean {
	try {
		if (page.isClosed()) return false;
		const url = page.url();
		return url.startsWith('http://') || url.startsWith('https://');
	} catch {
		return false;
	}
}
