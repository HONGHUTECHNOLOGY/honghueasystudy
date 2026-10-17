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