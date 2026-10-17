import { Script, $gm } from 'easy-us';

const SILENT_EVENTS = [
	'visibilitychange',
	'webkitvisibilitychange',
	'mozvisibilitychange',
	'msvisibilitychange',
	'blur',
	'focus',
	'focusin',
	'focusout',
	'pagehide',
	'pageshow'
];

const VISIBILITY_EVENTS = [
	'visibilitychange',
	'webkitvisibilitychange',
	'mozvisibilitychange',
	'msvisibilitychange'
];

const HIDDEN_GLOBALS = [
	'GM_info',
	'GM_setValue',
	'GM_getValue',
	'GM_listValues',
	'GM_deleteValue',
	'GM_addValueChangeListener',
	'GM_removeValueChangeListener',
	'GM_xmlhttpRequest',
	'GM_notification',
	'GM_getTab',
	'GM_saveTab',
	'GM_getResourceText',
	'unsafeWindow',
	'__OCS_RESOURCES__',
	'__OCS_GM_READY__',
	'OCS'
];

const HANDLER_PROPS = [
	'onblur',
	'onfocus',
	'onfocusin',
	'onfocusout',
	'onvisibilitychange',
	'onwebkitvisibilitychange',
	'onmozvisibilitychange',
	'onmsvisibilitychange',
	'onpagehide',
	'onpageshow'
];

const DOC_HANDLER_PROPS = [
	'onvisibilitychange',
	'onwebkitvisibilitychange',
	'onmozvisibilitychange',
	'onmsvisibilitychange'
];

const nativeRegistry = new WeakMap<Function, string>();
let toStringPatched = false;

const antiDetect = {
	installed: false,
	stats: {
		visibility: 0,
		blur: 0,
		focus: 0,
		devtools: 0
	},
	native: {
		hidden: undefined as ((this: Document) => boolean) | undefined,
		visibilityState: undefined as ((this: Document) => string) | undefined
	},
	getRealVisibilityState(): string {
		try {
			const doc = antiDetect.getDocument();
			const getter = antiDetect.native.visibilityState;
			if (getter) {
				return getter.call(doc);
			}
			return doc.visibilityState;
		} catch (e) {
			return 'visible';
		}
	},
	getDocument(): Document {
		const win = ($gm.unsafeWindow as Window) || globalThis;
		return win.document;
	}
};

function findDescriptorOwner(obj: any, key: string): any {
	let cur = obj;
	while (cur) {
		if (Object.prototype.hasOwnProperty.call(cur, key)) {
			return cur;
		}
		cur = Object.getPrototypeOf(cur);
	}
	return undefined;
}

function defineSafe(target: any, key: string, descriptor: any): void {
	if (!target) return;
	try {
		Object.defineProperty(target, key, descriptor);
	} catch (e) {}
}

function proxyWrap<T extends Function>(fn: T): T {
	try {
		return new Proxy(fn, {
			apply(target, thisArg, args) {
				return target.apply(thisArg, args);
			},
			get(target, prop, receiver) {
				if (prop === 'prototype') return undefined;
				return Reflect.get(target, prop, receiver);
			}
		}) as T;
	} catch (e) {
		return fn;
	}
}

function markNative(value: Function, nativeCode: string): Function {
	try {
		nativeRegistry.set(value, nativeCode);
	} catch (e) {}
	return proxyWrap(value);
}

function camouflage(value: Function, name: string, length?: number): Function {
	try {
		Object.defineProperty(value, 'name', { value: name, configurable: true });
	} catch (e) {}
	if (length !== undefined) {
		try {
			Object.defineProperty(value, 'length', { value: length, configurable: true });
		} catch (e) {}
	}
	return value;
}

function markNativeFunction(value: Function, name: string, length?: number): Function {
	return markNative(camouflage(value, name, length), 'function ' + name + '() { [native code] }');
}

function markNativeAccessor(value: Function, name: string): Function {
	return markNative(camouflage(value, name), name + '() { [native code] }');
}

function patchNativeToString(win: any): void {
	if (toStringPatched) return;
	const FunctionProto = win.Function && win.Function.prototype;
	if (!FunctionProto || typeof FunctionProto.toString !== 'function') return;
	const originalToString = FunctionProto.toString;
	toStringPatched = true;
	const fakeToString = function toString(this: any) {
		if (this !== null && (typeof this === 'function' || typeof this === 'object') && nativeRegistry.has(this)) {
			return nativeRegistry.get(this) as string;
		}
		return originalToString.call(this);
	};
	markNativeFunction(fakeToString, 'toString', 0);
	defineSafe(FunctionProto, 'toString', {
		value: fakeToString,
		writable: true,
		enumerable: false,
		configurable: true
	});
}

function purgeGlobals(win: any): void {
	for (let i = 0; i < HIDDEN_GLOBALS.length; i++) {
		const key = HIDDEN_GLOBALS[i];
		try {
			if (!(key in win)) continue;
			if (delete win[key]) continue;
			const desc = Object.getOwnPropertyDescriptor(win, key);
			if (desc && !desc.get && !desc.set) {
				Object.defineProperty(win, key, {
					value: desc.value,
					writable: desc.writable !== false,
					enumerable: false,
					configurable: true
				});
			}
		} catch (e) {}
	}
}

function patchVisibility(win: any, doc: any): void {
	const fallback = win.Document && win.Document.prototype;
	const hiddenNames = ['hidden', 'webkitHidden', 'mozHidden', 'msHidden'];
	const stateNames = ['visibilityState', 'webkitVisibilityState', 'mozVisibilityState', 'msVisibilityState'];
	for (let i = 0; i < hiddenNames.length; i++) {
		const name = hiddenNames[i];
		const owner = findDescriptorOwner(doc, name);
		if (!owner) continue;
		if (name === 'hidden') {
			const desc = Object.getOwnPropertyDescriptor(owner, name);
			if (desc && typeof desc.get === 'function') antiDetect.native.hidden = desc.get;
		}
		defineSafe(owner, name, {
			get: markNativeAccessor(function () {
				return false;
			}, 'get ' + name),
			enumerable: true,
			configurable: true
		});
	}
	for (let i = 0; i < stateNames.length; i++) {
		const name = stateNames[i];
		const owner = findDescriptorOwner(doc, name);
		if (!owner) continue;
		if (name === 'visibilityState') {
			const desc = Object.getOwnPropertyDescriptor(owner, name);
			if (desc && typeof desc.get === 'function') antiDetect.native.visibilityState = desc.get;
		}
		defineSafe(owner, name, {
			get: markNativeAccessor(function () {
				return 'visible';
			}, 'get ' + name),
			enumerable: true,
			configurable: true
		});
	}
	const hasFocusOwner = findDescriptorOwner(doc, 'hasFocus');
	defineSafe(hasFocusOwner || fallback, 'hasFocus', {
		value: markNativeFunction(
			function hasFocus() {
				return true;
			},
			'hasFocus',
			0
		),
		writable: true,
		enumerable: true,
		configurable: true
	});
}

function patchEventTarget(win: any, doc: any): void {

	const noopGetter = (prop: string) =>
		markNativeAccessor(function () {
			return null;
		}, 'get ' + prop);
	const noopSetter = (prop: string) =>
		markNativeAccessor(function (value: any) {
			return value;
		}, 'set ' + prop);
	for (let i = 0; i < HANDLER_PROPS.length; i++) {
		const prop = HANDLER_PROPS[i];
		defineSafe(findDescriptorOwner(win, prop) || win, prop, {
			get: noopGetter(prop),
			set: noopSetter(prop),
			enumerable: true,
			configurable: true
		});
	}
	for (let i = 0; i < DOC_HANDLER_PROPS.length; i++) {
		const prop = DOC_HANDLER_PROPS[i];
		defineSafe(findDescriptorOwner(doc, prop) || doc, prop, {
			get: noopGetter(prop),
			set: noopSetter(prop),
			enumerable: true,
			configurable: true
		});
	}
}

function patchDevtools(win: any): void {
	defineSafe(findDescriptorOwner(win, 'outerWidth') || win, 'outerWidth', {
		get: markNativeAccessor(function () {
			return win.innerWidth;
		}, 'get outerWidth'),
		enumerable: true,
		configurable: true
	});
	defineSafe(findDescriptorOwner(win, 'outerHeight') || win, 'outerHeight', {
		get: markNativeAccessor(function () {
			return win.innerHeight;
		}, 'get outerHeight'),
		enumerable: true,
		configurable: true
	});
}

function patchAlertLazily(win: any): void {
	setTimeout(() => {
		try {
			if (typeof win.alert === 'function') markNativeFunction(win.alert, 'alert', 1);
			if (win !== window && typeof window.alert === 'function') markNativeFunction(window.alert, 'alert', 1);
		} catch (e) {}
	}, 0);
}

function installAntiDetection(): void {
	if (antiDetect.installed) return;
	const win = ($gm.unsafeWindow as any) || (typeof window !== 'undefined' ? window : undefined);
	if (!win || !win.document) return;
	antiDetect.installed = true;
	purgeGlobals(win);
	patchVisibility(win, win.document);
	patchEventTarget(win, win.document);
	patchDevtools(win);
	patchAlertLazily(win);
	const doc = win.document;
	for (let i = 0; i < SILENT_EVENTS.length; i++) {
		const type = SILENT_EVENTS[i];
		try { doc.addEventListener(type, function (e: any) { e.stopImmediatePropagation(); }, true); } catch (e) {}
		try { win.addEventListener(type, function (e: any) { e.stopImmediatePropagation(); }, true); } catch (e) {}
	}
}

export const AntiDetectScript = new Script({
	name: '反检测',
	namespace: 'background.anti-detect',
	hideInPanel: true,
	matches: [['所有页面', /.*/]],
	priority: 100,
	onstart() {
		installAntiDetection();
	}
});