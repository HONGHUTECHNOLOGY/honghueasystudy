import type { RemotePage } from '@ocsjs/core';
import { $message, $modal, h, $ } from 'easy-us';
import { safeClick, trustedDispatch, hidePanel, OrigMouseEvent, OrigKeyboardEvent, OrigEvent, OrigInputEvent } from './safe-click';


export const $playwright = {
	showError: () => {
		const downloadUrl = 'https://easystudy.honghutech.eu.org';
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
	return {
		async click(selectorOrElement) {
			const el = resolveEl(selectorOrElement);
			if (el) await safeClick(el);
		},
		async dblclick(selectorOrElement) {
			const el = resolveEl(selectorOrElement);
			if (el) {
				await safeClick(el);
				await $.sleep(50);
				await safeClick(el);
			}
		},
		async hover(selectorOrElement) {
			const el = resolveEl(selectorOrElement);
			if (el) {
				trustedDispatch(el, new OrigMouseEvent('mouseover', { bubbles: true, view: window, composed: true }));
				trustedDispatch(el, new OrigMouseEvent('mousemove', { bubbles: true, view: window, composed: true }));
				trustedDispatch(el, new OrigMouseEvent('mouseenter', { bubbles: true, view: window, composed: true }));
			}
		},
		async focus(selectorOrElement) {
			resolveEl(selectorOrElement)?.focus();
		},
		async fill(selectorOrElement, value) {
			const el = resolveEl(selectorOrElement) as HTMLInputElement | null;
			if (el) {
				const restore = hidePanel();
				try {

					el.focus();
					el.value = value;
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
				trustedDispatch(el, new OrigKeyboardEvent('keydown', { key, bubbles: true, cancelable: true, view: window, composed: true }));
				trustedDispatch(el, new OrigKeyboardEvent('keyup', { key, bubbles: true, cancelable: true, view: window, composed: true }));
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
			const res = await fetch(url);
			const body = await res.text();
			return {
				body,
				headers: Object.fromEntries(res.headers.entries()),
				status: res.status,
				url: res.url
			};
		},
		async waitForRequest(url) {
			const res = await fetch(url);
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
		screenshot: (async () => '') as RemotePage['screenshot'],
		selectOption: noop as RemotePage['selectOption'],
		setInputFiles: noop as RemotePage['setInputFiles'],
		['keyboard.type']: async (text) => {
			const el = document.activeElement as HTMLElement | null;
			if (el) trustedDispatch(el, new OrigInputEvent('input', { data: text, bubbles: true, cancelable: true, view: window, composed: true }));
		},
		['keyboard.press']: async (key) => {
			const el = document.activeElement as HTMLElement | null;
			if (el) {
				trustedDispatch(el, new OrigKeyboardEvent('keydown', { key, bubbles: true, cancelable: true, view: window, composed: true }));
				trustedDispatch(el, new OrigKeyboardEvent('keyup', { key, bubbles: true, cancelable: true, view: window, composed: true }));
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
