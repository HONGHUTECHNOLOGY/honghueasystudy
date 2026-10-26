import { $, $elements } from 'easy-us';

const origRemoveChild = Element.prototype.removeChild;
const origInsertBefore = Element.prototype.insertBefore;
const origAppendChild = Node.prototype.appendChild;

const OrigEvent = Event;
const OrigMouseEvent = MouseEvent;
const OrigPointerEvent = PointerEvent;
const OrigKeyboardEvent = KeyboardEvent;
const OrigInputEvent = InputEvent;

export { OrigEvent, OrigMouseEvent, OrigPointerEvent, OrigKeyboardEvent, OrigInputEvent };

export function hidePanel(): () => void {
	const wrapper = $elements.wrapper as HTMLElement | undefined;
	if (!wrapper || !wrapper.parentElement) {
		return () => {};
	}
	const parent = wrapper.parentElement;
	const nextSibling = wrapper.nextSibling;
	origRemoveChild.call(parent, wrapper);
	return () => {
		if (nextSibling && nextSibling.parentElement === parent) {
			origInsertBefore.call(parent, wrapper, nextSibling);
		} else {
			origAppendChild.call(parent, wrapper);
		}
	};
}

export function trustedDispatch(el: EventTarget, event: Event): boolean {
	const restore = hidePanel();
	try {
		return el.dispatchEvent(event);
	} finally {
		restore();
	}
}

export function trustedClick(el: HTMLElement | null | undefined): void {
	if (!el) return;
	const restore = hidePanel();
	try {
		el.click();
	} finally {
		restore();
	}
}

export async function safeClick(el: HTMLElement): Promise<void> {
	if (!el) return;
	el.scrollIntoView({ block: 'center' });
	await $.sleep(300);
	const restore = hidePanel();
	try {
		el.click();
	} finally {
		restore();
	}
}

/**
 * 派发一整套真实鼠标序列：pointerdown → mousedown → pointerup → mouseup → click
 *
 * 部分平台的选项组件只监听 mousedown/mouseup（或在 pointerdown 里做判断），
 * 单纯 el.click() 不会触发它的选中逻辑。真实鼠标点击失效时用它兜底，
 * 因为它是直接派发事件、不依赖坐标，天然不受遮挡/滚动/视口外影响。
 */
export function trustedPointerClick(el: HTMLElement | null | undefined): void {
	if (!el) return;
	const rect = el.getBoundingClientRect();
	const x = rect.left + rect.width / 2;
	const y = rect.top + rect.height / 2;
	const base: MouseEventInit = {
		bubbles: true,
		cancelable: true,
		composed: true,
		view: window,
		clientX: x,
		clientY: y,
		screenX: x,
		screenY: y,
		button: 0,
		detail: 1
	};
	const pointer: PointerEventInit = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };

	const restore = hidePanel();
	try {
		const fire = (event: Event) => {
			try {
				el.dispatchEvent(event);
			} catch {
				// 单个事件派发失败不影响其余事件
			}
		};
		try {
			fire(new OrigPointerEvent('pointerdown', pointer));
		} catch {
			// 环境不支持 PointerEvent 时跳过
		}
		fire(new OrigMouseEvent('mousedown', base));
		try {
			fire(new OrigPointerEvent('pointerup', pointer));
		} catch {
			// 同上
		}
		fire(new OrigMouseEvent('mouseup', base));
		fire(new OrigMouseEvent('click', base));
	} finally {
		restore();
	}
}

/** 常见「已选中」类名 token（不带前缀的选择器语法，避免 contains('.xx') 恒 false） */
const SELECTED_CLASS = /^(?:is-)?(?:active|selected|checked|choose|chosen)$/i;

function hasSelectedClass(el: Element): boolean {
	if (el.getAttribute('aria-checked') === 'true' || el.getAttribute('aria-selected') === 'true') {
		return true;
	}
	const cls = typeof el.className === 'string' ? el.className : '';
	return cls
		.split(/\s+/)
		.filter(Boolean)
		.some((token) => SELECTED_CLASS.test(token));
}

/**
 * 回读某个选项是否真的被选中了
 *
 * 各平台选中态实现完全不同：有的用原生 radio/checkbox，有的只改类名。
 * 这里依次检查原生控件 → aria 属性 → 自身及子孙节点的常见类名。
 */
export function isChoiceSelected(el: HTMLElement | null | undefined): boolean {
	if (!el) return false;

	const input = el.querySelector<HTMLInputElement>('input[type="radio"],input[type="checkbox"]');
	if (input && input.checked) return true;

	if (hasSelectedClass(el)) return true;

	const nodes = el.querySelectorAll('*');
	for (let i = 0; i < nodes.length; i++) {
		if (hasSelectedClass(nodes[i])) return true;
	}
	return false;
}