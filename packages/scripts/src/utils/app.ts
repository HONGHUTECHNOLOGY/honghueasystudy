import type { RemotePage } from '@honghu/core';
import { $message, $modal, h, $ } from 'easy-us';
import { safeClick, trustedDispatch, hidePanel, OrigMouseEvent, OrigKeyboardEvent, OrigEvent, OrigInputEvent } from './safe-click';
import { OFFICIAL_SITE } from './links';


export const $playwright = {
	showError: () => {
		const downloadUrl = OFFICIAL_SITE;
		const errorEl = h('div', [
			h('div', '当前页面需要下载鸿鹄易学桌面端，并在桌面端中新建浏览器，在新建的浏览器中才能进行正常刷课。'),
			h('div', { style: { marginTop: '8px' } }, [
				h(
					'a',
					{ href: downloadUrl, target: '_blank', rel: 'noopener noreferrer' },
					'点击前往鸿鹄易学官网下载桌面端'
				)
			])
		]);
		$modal.alert({
			maskCloseable: false,
			title: '错误',
			confirmButtonText: '知道了',
			content: errorEl.cloneNode(true)
		});
		$message.error({ content: errorEl.cloneNode(true), duration: 0 });
	}
};

function resolveEl(selectorOrElement: string | Element): HTMLElement | null {
	if (typeof selectorOrElement === 'string') {
		return document.querySelector<HTMLElement>(selectorOrElement);
	}
	return selectorOrElement as HTMLElement;
}

export function createLocalRemotePage(): RemotePage {
	const noop = async () => {};

	/**
	 * 最近一次被点击 / 聚焦的可编辑元素。
	 *
	 * 平台常把「点击输入框」做成容器级事件：点完焦点落到外层按钮或 body 上，
	 * 此时 document.activeElement 已经不是那个输入框。只认 activeElement 会把
	 * 答案写进 BUTTON —— HTMLInputElement 的原生 setter 用在 button 上会抛
	 * `Illegal invocation`，一个字都写不进去，脚本却判定「答题完成」直接切题。
	 */
	let lastEditable: HTMLElement | null = null;

	const isEditable = (el: Element | null | undefined): el is HTMLElement => {
		if (!el) return false;
		const tag = el.tagName;
		return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable === true;
	};

	const rememberEditable = (el: HTMLElement | null | undefined) => {
		if (isEditable(el)) lastEditable = el;
	};

	/**
	 * 写入输入值。
	 *
	 * 优先走原型 setter：React 会在实例上装 value 拦截器，直接赋值既不更新内部状态，
	 * 也不会让 _valueTracker 察觉变化，onChange 永不触发，重渲染就把值抹掉。
	 * 沙箱环境下元素可能跨 realm，setter 会抛 Illegal invocation，此时降级为直接赋值：
	 * Vue 的 v-model 监听 input 事件读 el.value，足够生效。
	 */
	const setNativeValue = (el: HTMLElement, text: string) => {
		const target = el as HTMLInputElement | HTMLTextAreaElement;
		if (typeof target.value !== 'string') {
			// contenteditable 之类的富文本容器
			target.textContent = text;
			return;
		}
		const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
		const desc = Object.getOwnPropertyDescriptor(proto, 'value');
		if (desc && desc.set) {
			try {
				desc.set.call(target, text);
				return;
			} catch (e) {
				// 非本 realm 的输入元素，退回直接赋值
				console.warn('[鸿鹄] 原生 value setter 失败，降级为直接赋值', (e as Error)?.message, target.tagName);
			}
		}
		target.value = text;
	};

	return {
		async click(selectorOrElement) {
			const el = resolveEl(selectorOrElement);
			if (el) {
				rememberEditable(el);
				await safeClick(el);
			}
		},
		async dblclick(selectorOrElement) {
			const el = resolveEl(selectorOrElement);
			if (el) {
				rememberEditable(el);
				await safeClick(el);
				await $.sleep(50);
				await safeClick(el);
			}
		},
		async hover(selectorOrElement) {
			const el = resolveEl(selectorOrElement);
			if (el) {
				trustedDispatch(el, new OrigMouseEvent('mouseover', { bubbles: true, view: (document.defaultView || window), composed: true }));
				trustedDispatch(el, new OrigMouseEvent('mousemove', { bubbles: true, view: (document.defaultView || window), composed: true }));
				trustedDispatch(el, new OrigMouseEvent('mouseenter', { bubbles: true, view: (document.defaultView || window), composed: true }));
			}
		},
		async focus(selectorOrElement) {
			const el = resolveEl(selectorOrElement);
			rememberEditable(el);
			el?.focus();
		},
		async fill(selectorOrElement, value) {
			const el = resolveEl(selectorOrElement);
			if (el) {
				rememberEditable(el);
				const restore = hidePanel();
				try {
					el.focus();
					setNativeValue(el, value);
					trustedDispatch(el, new OrigEvent('input', { bubbles: true, composed: true }));
					trustedDispatch(el, new OrigEvent('change', { bubbles: true, composed: true }));
				} finally {
					restore();
				}
			}
		},
		async press(selectorOrElement, key) {
			const el = resolveEl(selectorOrElement);
			if (el) {
				trustedDispatch(el, new OrigKeyboardEvent('keydown', { key, bubbles: true, cancelable: true, view: (document.defaultView || window), composed: true }));
				trustedDispatch(el, new OrigKeyboardEvent('keyup', { key, bubbles: true, cancelable: true, view: (document.defaultView || window), composed: true }));
			}
		},
		async tap(selectorOrElement) {
			const el = resolveEl(selectorOrElement);
			if (el) await safeClick(el);
		},
		async check(selectorOrElement) {
			const el = resolveEl(selectorOrElement) as HTMLInputElement | null;
			if (el && !el.checked) await safeClick(el);
		},
		async inputValue(selectorOrElement) {
			const el = resolveEl(selectorOrElement) as HTMLInputElement | null;
			return el?.value || '';
		},
		async waitForSelector(selector) {
			const maxWait = 30000;
			const start = Date.now();
			while (!document.querySelector(selector)) {
				if (Date.now() - start > maxWait) return;
				await $.sleep(200);
			}
		},
		async waitForResponse(url) {
			// url 参数兼容 playwright 风格的 RegExp / 谓词，此实现仅支持字符串
			const res = await fetch(url as string);
			const body = await res.text();
			return {
				body,
				headers: Object.fromEntries(res.headers.entries()),
				status: res.status,
				url: res.url
			};
		},
		async waitForRequest(url) {
			const res = await fetch(url as string);
			return {
				url: res.url,
				method: 'GET',
				headers: Object.fromEntries(res.headers.entries()),
				postData: ''
			};
		},
		async reload() {
			location.reload();
			return '';
		},
		bringToFront: noop as RemotePage['bringToFront'],
		dragAndDrop: noop as RemotePage['dragAndDrop'],
		// 浏览器端无法真正截图/选择，仅为满足接口类型的占位实现
		screenshot: (async () => '') as unknown as RemotePage['screenshot'],
		selectOption: noop as unknown as RemotePage['selectOption'],
		setInputFiles: noop as RemotePage['setInputFiles'],
		['keyboard.type']: async (text) => {
			/**
			 * 目标解析顺序：当前焦点 → 最近一次点击 / 聚焦的可编辑元素。
			 *
			 * 只认 activeElement 会写错地方：平台点完输入框常把焦点交给容器按钮，
			 * 于是答案被写进 BUTTON —— 原生 setter 跨类型调用抛 Illegal invocation，
			 * 值一个都没写进去，脚本却判定「答题完成」。
			 */
			let el = document.activeElement as HTMLElement | null;
			if (!isEditable(el)) {
				el = lastEditable && lastEditable.isConnected ? lastEditable : null;
			}
			if (!el) {
				console.warn('[鸿鹄] keyboard.type 没有可写入的目标元素，已跳过');
				return;
			}
			// 焦点仍在别处时先拉回来，否则页面自己的 keydown 处理会错过
			if (document.activeElement !== el && typeof el.focus === 'function') {
				try {
					el.focus();
				} catch (e) {}
			}

			setNativeValue(el, text);

			/**
			 * 这里刻意不用 trustedDispatch：它会先 hidePanel() 把面板移出 DOM、
			 * 派发完再插回去。对 U 校园这类 Vue 页面，这一移一插会触发重渲染，
			 * 刚写进去的值立刻被数据模型里的旧值覆盖（实测写入后读回仍是原值）。
			 * 事件派发不要求元素可见，直接 dispatch 即可。
			 */
			try {
				el.dispatchEvent(
					new OrigInputEvent('input', {
						data: text,
						bubbles: true,
						cancelable: true,
						view: (document.defaultView || window),
						composed: true
					})
				);
				el.dispatchEvent(new OrigEvent('change', { bubbles: true }));
			} catch (e) {
				console.warn('[鸿鹄] 派发输入事件失败', (e as Error)?.message);
			}
		},
		['keyboard.press']: async (key) => {
			const el = document.activeElement as HTMLElement | null;
			if (el) {
				trustedDispatch(el, new OrigKeyboardEvent('keydown', { key, bubbles: true, cancelable: true, view: (document.defaultView || window), composed: true }));
				trustedDispatch(el, new OrigKeyboardEvent('keyup', { key, bubbles: true, cancelable: true, view: (document.defaultView || window), composed: true }));
			}
		},
		['mouse.wheel']: async (deltaX, deltaY) => {
			window.scrollBy(deltaX, deltaY);
		},
		['mouse.click']: async (x, y) => {
			const el = document.elementFromPoint(x, y) as HTMLElement | null;
			if (el) await safeClick(el);
		},
		['mouse.dblclick']: async (x, y) => {
			const el = document.elementFromPoint(x, y) as HTMLElement | null;
			if (el) {
				await safeClick(el);
				await $.sleep(50);
				await safeClick(el);
			}
		},
		['mouse.down']: noop as RemotePage['mouse.down'],
		['mouse.up']: noop as RemotePage['mouse.up'],
		['mouse.move']: noop as RemotePage['mouse.move']
	} as RemotePage;
}
export function createDynamicRemotePage(
	resolver: () => Promise<RemotePage | undefined>
): RemotePage {
	const methods = [
		'click', 'check', 'dblclick', 'bringToFront', 'dragAndDrop',
		'inputValue', 'fill', 'focus', 'hover', 'screenshot',
		'selectOption', 'setInputFiles', 'tap', 'press', 'reload',
		'waitForRequest', 'waitForResponse', 'waitForSelector',
		'keyboard.type', 'keyboard.press',
		'mouse.wheel', 'mouse.click', 'mouse.dblclick',
		'mouse.down', 'mouse.up', 'mouse.move'
	];
	const proxy = {} as RemotePage;
	for (const method of methods) {
		(proxy as any)[method] = async (...args: any[]) => {
			const rp = await resolver();
			if (rp) {
				return await (rp as any)[method](...args);
			}
		};
	}
	return proxy;
}
