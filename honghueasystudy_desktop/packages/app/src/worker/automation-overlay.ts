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
 *   .glow  —— 流光：旋转的 conic + blur 大图层（视觉最重，只在普通状态运行动画）
 *   .blue  —— OCR / 验证码期间的纯色蓝：静态边框 + 四边渐变，零动画
 *   .pill  —— 底部胶囊：呼吸圆点 + 文案，带一道扫过的反光
 *
 * 性能注意：`.glow` 的两块全屏动画会把登录 / 验证码页压到个位数帧率，
 * 直接拖慢验证码取图与拖动。所以只要出现 OCR / 滑块场景，就把 `.glow`
 * 淡出并暂停（`.calm`），换成静态 `.blue`；结束后再渐变回去。
 * 新增动画前务必按这条标准评估：宁可少一层模糊，也不要和页面抢渲染。
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
			 * 性能取舍（跳转频繁的场景是关键）：
			 * 不再用「超大 conic + blur」——每次页面导航都要重新光栅化一块几千万像素的
			 * 模糊图层，正好和页面自身的首屏渲染抢资源。改成：
			 *   .glow  四条方向性渐变，静态绘制一次；动效只走 opacity（合成层，不重绘）
			 *   .edge  四条 3px 细条，background-position 平移，重绘面积只有 3px 高
			 */
			/*
			 * 光晕：锥形渐变 + 模糊，遮罩按「离边距离」衰减。
			 *
			 * 尺寸刚好盖住旋转后的视口（对角线约 115vmax）——原来是 240vmax，
			 * 面积是这里的 4 倍多，每次页面跳转重建都要重新光栅化一遍。
			 * 模糊半径同时从 46px 降到 30px（模糊成本 ≈ 面积 × 半径）。
			 */
			.glow {
				position: absolute; inset: 0; pointer-events: none; overflow: hidden;
				opacity: .5;
				/* OCR 期间整体淡出，露出下面的纯色蓝；结束后再淡回流光 */
				transition: opacity .45s ease;
				-webkit-mask:
					linear-gradient(to right, rgba(0,0,0,.95), rgba(0,0,0,.52) min(9%, 100px), rgba(0,0,0,.16) min(17%, 190px), transparent min(30%, 330px)),
					linear-gradient(to left, rgba(0,0,0,.95), rgba(0,0,0,.52) min(9%, 100px), rgba(0,0,0,.16) min(17%, 190px), transparent min(30%, 330px)),
					linear-gradient(to bottom, rgba(0,0,0,.95), rgba(0,0,0,.52) min(11%, 90px), rgba(0,0,0,.16) min(21%, 175px), transparent min(34%, 280px)),
					linear-gradient(to top, rgba(0,0,0,.95), rgba(0,0,0,.52) min(11%, 90px), rgba(0,0,0,.16) min(21%, 175px), transparent min(34%, 280px));
				mask:
					linear-gradient(to right, rgba(0,0,0,.95), rgba(0,0,0,.52) min(9%, 100px), rgba(0,0,0,.16) min(17%, 190px), transparent min(30%, 330px)),
					linear-gradient(to left, rgba(0,0,0,.95), rgba(0,0,0,.52) min(9%, 100px), rgba(0,0,0,.16) min(17%, 190px), transparent min(30%, 330px)),
					linear-gradient(to bottom, rgba(0,0,0,.95), rgba(0,0,0,.52) min(11%, 90px), rgba(0,0,0,.16) min(21%, 175px), transparent min(34%, 280px)),
					linear-gradient(to top, rgba(0,0,0,.95), rgba(0,0,0,.52) min(11%, 90px), rgba(0,0,0,.16) min(21%, 175px), transparent min(34%, 280px));
			}
			.glow::before {
				content: ''; position: absolute; left: 50%; top: 50%;
				width: 116vmax; height: 116vmax; margin: -58vmax 0 0 -58vmax;
				background: conic-gradient(from 0turn, #4f8cff, #8b5cf6, #22d3ee, #34d399, #f59e0b, #4f8cff);
				filter: blur(38px) saturate(1.05);
				animation: hh-rotate 14s linear infinite;
				will-change: transform;
			}
			@keyframes hh-rotate { to { transform: rotate(1turn); } }
			/* 最外圈 3px 流光：与光晕同源同速，读起来是一整团光在绕 */
			.glow::after {
				content: ''; position: absolute; inset: 0; padding: 3px;
				background: conic-gradient(from 0turn, #4f8cff, #8b5cf6, #22d3ee, #34d399, #f59e0b, #4f8cff);
				-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
				-webkit-mask-composite: xor;
				mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
				mask-composite: exclude;
				animation: hh-rotate 14s linear infinite;
			}
			/* 平静态：动画直接暂停，连不可见的合成开销也省掉 */
			.glow.calm::before, .glow.calm::after { animation-play-state: paused; }
			/*
			 * 纯色蓝：OCR / 验证码期间替代流光。
			 * 只用静态边框 + 四边方向渐变，没有任何动画与大面积模糊，
			 * 光栅化一次即可，不会再和验证码抢渲染资源。
			 */
			.blue {
				position: absolute; inset: 0; pointer-events: none; opacity: 0;
				transition: opacity .45s ease;
				box-shadow: inset 0 0 0 2px #3b82f6, inset 0 0 30px rgba(59,130,246,.34);
				background:
					linear-gradient(to right, rgba(59,130,246,.26), rgba(59,130,246,0) 64px),
					linear-gradient(to left, rgba(59,130,246,.26), rgba(59,130,246,0) 64px),
					linear-gradient(to bottom, rgba(59,130,246,.20), rgba(59,130,246,0) 56px),
					linear-gradient(to top, rgba(59,130,246,.20), rgba(59,130,246,0) 56px);
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
				.glow::before, .glow::after, .dot, .pill::after { animation: none; }
			}
		\`;
		var glow = document.createElement('div');
		glow.className = 'glow';
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
