/* 鸿鹄易学 · MAIN world 运行时（ScriptCat 风格）
 *
 * 本文件由 background.js 通过 chrome.userScripts.register({ world: "MAIN" })
 * 注册到页面主世界；或在 userScripts 不可用时由 isolated.js 回退注入。
 *
 * 与脚本猫 createProxyContext 的目标一致：
 *   - 在 document_start 抓取原生 window / 函数，避免页面脚本先污染
 *   - 给业务 bundle 一个伪 Window：window / self / globalThis 指回沙箱
 *   - 读取 DOM/原生 API 时转发到真实 window，写入默认留在沙箱
 *   - 只把 alert / onxxx 这类页面级副作用放行到真实 window
 *
 * 注意：这里刻意不把 top / parent 也指向沙箱。鸿鹄易学的核心包用
 * globalThis.top 做跨 frame 的 jobs 共享，必须拿到真实的 top；只有
 * window.top / window.parent 在“自己就是 top/parent”时才返回沙箱。
 */
function __ocsCreateSandbox() {
	var realWindow = window;
	var realDocument = document;
	var realPerformance = performance;
	var realConsole = window.console;
	var realLocation = window.location;
	var realGlobal = globalThis;
	var realTop = top;
	var realParent = parent;
	var sandbox = Object.create(null);
	var boundCache = Object.create(null);
	var nativeCache = Object.create(null);
	var getProto = Object.getPrototypeOf;
	var defineProp = Object.defineProperty;
	var getDesc = Object.getOwnPropertyDescriptor;
	var reflectOwnKeys = Reflect.ownKeys;
	var reflectGet = Reflect.get;
	var isFunction = function (value) {
		return typeof value === 'function';
	};
	var isConstructor = function (value) {
		try {
			return isFunction(value) && !!value.prototype;
		} catch (e) {
			return false;
		}
	};
	var proxy;

	function bindReal(fn) {
		try {
			return fn.bind(realWindow);
		} catch (e) {
			return fn;
		}
	}

	function readReal(prop) {
		var value;
		try {
			value = reflectGet(realWindow, prop, realWindow);
		} catch (e) {
			return undefined;
		}
		if (!isFunction(value)) return value;
		// eval 绑定后会变成间接 eval，必须保持原样
		if (prop === 'eval') return value;
		// 构造器不能 bind，否则会丢 prototype / 静态成员
		if (isConstructor(value)) return value;
		var cached = boundCache[prop];
		if (!cached) cached = boundCache[prop] = bindReal(value);
		return cached;
	}

	// document_start 时先抓一份常用原生实现，之后页面再 hook 也影响不到沙箱
	var nativeNames = [
		'addEventListener',
		'removeEventListener',
		'dispatchEvent',
		'open',
		'focus',
		'scrollTo',
		'atob',
		'postMessage',
		'fetch',
		'alert',
		'setTimeout',
		'clearTimeout',
		'setInterval',
		'clearInterval',
		'XMLHttpRequest',
		'CustomEvent',
		'Event',
		'Object',
		'Array',
		'Promise',
		'Symbol',
		'Reflect',
		'Proxy',
		'Map',
		'Set',
		'WeakMap',
		'Date',
		'RegExp',
		'Error',
		'JSON'
	];
	for (var nativeIndex = 0; nativeIndex < nativeNames.length; nativeIndex++) {
		var nativeName = nativeNames[nativeIndex];
		var nativeValue = readReal(nativeName);
		if (nativeValue !== undefined) nativeCache[nativeName] = nativeValue;
	}

	function special(prop) {
		switch (prop) {
			case 'window':
			case 'self':
			case 'globalThis':
				return proxy;
			case 'top':
				return realTop === realWindow ? proxy : realTop;
			case 'parent':
				return realParent === realWindow ? proxy : realParent;
			case 'frames':
				return proxy;
			case 'document':
				return realDocument;
			case 'location':
				return realLocation;
			case 'performance':
				return realPerformance;
			case 'unsafeWindow':
				return realWindow;
			case 'console':
				return realConsole;
			default:
				return undefined;
		}
	}

	function isSpecial(prop) {
		return (
			prop === 'window' ||
			prop === 'self' ||
			prop === 'globalThis' ||
			prop === 'top' ||
			prop === 'parent' ||
			prop === 'frames' ||
			prop === 'document' ||
			prop === 'location' ||
			prop === 'performance' ||
			prop === 'unsafeWindow' ||
			prop === 'console'
		);
	}

	proxy = new Proxy(sandbox, {
		get: function (target, prop) {
			if (isSpecial(prop)) return special(prop);
			if (prop in target) return target[prop];
			if (prop in nativeCache) return nativeCache[prop];
			return readReal(prop);
		},
		set: function (target, prop, value) {
			if (prop === 'window' || prop === 'self' || prop === 'globalThis' || prop === 'top' || prop === 'parent' || prop === 'frames') {
				return false;
			}
			// alert / onload / onerror / onxxx 是页面级副作用，放行到真实 window
			if (prop === 'alert' || (typeof prop === 'string' && prop.slice(0, 2) === 'on')) {
				try {
					realWindow[prop] = value;
				} catch (e) {}
			}
			target[prop] = value;
			return true;
		},
		has: function (target, prop) {
			return prop in target || prop in realWindow;
		},
		deleteProperty: function (target, prop) {
			delete target[prop];
			return true;
		},
		ownKeys: function (target) {
			var keys = reflectOwnKeys(realWindow);
			var extra = reflectOwnKeys(target);
			for (var i = 0; i < extra.length; i++) {
				var found = false;
				for (var j = 0; j < keys.length; j++) {
					if (keys[j] === extra[i]) {
						found = true;
						break;
					}
				}
				if (!found) keys[keys.length] = extra[i];
			}
			return keys;
		},
		getOwnPropertyDescriptor: function (target, prop) {
			var own = getDesc(target, prop);
			if (own) return own;
			var desc = getDesc(realWindow, prop);
			if (!desc) return undefined;
			// Proxy invariant：target 上不存在的属性必须返回 configurable 描述符
			if (desc.configurable) return desc;
			return {
				configurable: true,
				enumerable: desc.enumerable,
				writable: true,
				value: readReal(prop)
			};
		},
		defineProperty: function (target, prop, desc) {
			if (prop === 'window' || prop === 'self' || prop === 'globalThis' || prop === 'top' || prop === 'parent' || prop === 'frames') {
				return false;
			}
			if (prop === 'alert' || (typeof prop === 'string' && prop.slice(0, 2) === 'on')) {
				try {
					defineProp(realWindow, prop, desc);
				} catch (e) {}
			}
			try {
				defineProp(target, prop, desc);
			} catch (e) {}
			return true;
		},
		getPrototypeOf: function () {
			return getProto(realWindow);
		},
		setPrototypeOf: function () {
			return true;
		},
		isExtensible: function () {
			return true;
		}
	});

	return proxy;
}
