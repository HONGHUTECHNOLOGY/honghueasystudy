/* 鸿鹄易学 · GM API polyfill
 *
 * 【重要】本文件不是独立脚本。它会被 scripts/bundle-main.js 内联进 content/main.js
 * 的统一 IIFE 中，与 resources.js / lib/index.js / entry.js 共享同一个函数作用域。
 *
 * 因此这里一律用 var：
 *   var 落在合并后的 IIFE 函数作用域里 —— 核心包 lib/index.js 能以自由变量解析到 GM_*，
 *   但页面既无法枚举（不在 window 上），也无法按名字取值（不在全局词法环境里）。
 *
 * 定义 unsafeWindow：
 *   easy-us 的 $store 只有在 globalThis.unsafeWindow 存在时才使用 GMStoreProvider，
 *   否则会用 MemoryStoreProvider —— 页面一跳转（课程页 → 作业/考试页）配置就丢失，
 *   表现为题库/AI API 需要重新配置。这里定义后由 anti-detect 在页面全局清理掉。
 *
 * 通信机制改为脚本猫风格：
 *   - 不再把 token 挂在 window 上（ISOLATED/MAIN 两个世界不共享 window expando）
 *   - 构建时随机 key 作为初始通道，运行时再协商一个随机 eventFlag
 *   - 所有消息走 performance 上的 CustomEvent，不带固定字符串特征
 *   - 请求/响应/变更三个事件名都由 eventFlag 派生
 *
 * 变量名注意：合并后与核心包共享作用域，核心包顶层已有 infos / projects / start / config 等同名声明，
 * 所以这里的中间变量统一用 __ocs 前缀避免互相覆盖。
 */

// 在页面脚本之前抓取原生方法，避免后续被 hook
var __ocsPerf = typeof performance !== 'undefined' ? performance : null;
var __ocsDispatch = __ocsPerf ? __ocsPerf.dispatchEvent.bind(__ocsPerf) : null;
var __ocsListen = __ocsPerf ? __ocsPerf.addEventListener.bind(__ocsPerf) : null;
var __ocsUnlisten = __ocsPerf ? __ocsPerf.removeEventListener.bind(__ocsPerf) : null;
var __ocsCustomEvent = typeof CustomEvent !== 'undefined' ? CustomEvent : null;
var __ocsBridgeKey =
	typeof __HH_BRIDGE_KEY__ !== 'undefined'
		? __HH_BRIDGE_KEY__
		: globalThis.__HH_BRIDGE_KEY__ || '';

// 必须先于核心包（easy-us）初始化，$store 才会选 GMStoreProvider。
// globalThis.window 是真实页面 window；bundle 只把局部 window 参数换成了沙箱。
try {
	if (typeof globalThis.unsafeWindow === 'undefined') {
		globalThis.unsafeWindow = globalThis.window || window;
	}
} catch (e) {}

var GM = (function () {
	'use strict';

	var RES =
		typeof __HH_RESOURCES__ !== 'undefined' && __HH_RESOURCES__ ? __HH_RESOURCES__ : {};
	var VERSION = RES.version || '0.0.0';
	var META = RES.metadata || {};

	var token = '';
	var REQ_EVENT = '';
	var RESP_EVENT = '';
	var CHG_EVENT = '';
	var reqId = 0;
	var listenersRegistered = false;
	var bridgeReady = false;
	var pending = new Map();
	var store = {};
	var valueListeners = new Map();
	var listenerSeq = 0;

	function fire(type, detail) {
		if (!__ocsDispatch || !__ocsCustomEvent || !type) return false;
		try {
			if (typeof cloneInto === 'function') detail = cloneInto(detail, __ocsPerf);
		} catch (e) {}
		return __ocsDispatch(
			new __ocsCustomEvent(type, {
				detail: detail,
				cancelable: true
			})
		);
	}

	function emit(key, oldValue, newValue, remote) {
		valueListeners.forEach(function (listener) {
			if (listener.key !== key) return;
			try {
				listener.cb(key, oldValue, newValue, remote);
			} catch (e) {}
		});
	}

	function registerListeners() {
		if (listenersRegistered) return;
		listenersRegistered = true;

		__ocsListen(
			RESP_EVENT,
			function (event) {
				event.stopImmediatePropagation();
				var data = event.detail;
				if (!data || typeof data !== 'object' || !data.k || data.k !== token) return;

				var resolve = pending.get(data.id);
				if (resolve) {
					pending.delete(data.id);
					resolve(data.result);
				}
			},
			true
		);

		__ocsListen(
			CHG_EVENT,
			function (event) {
				event.stopImmediatePropagation();
				var data = event.detail;
				if (!data || typeof data !== 'object' || !data.k || data.k !== token) return;

				var oldValue = store[data.key];
				if (data.newValue === undefined) delete store[data.key];
				else store[data.key] = data.newValue;
				emit(data.key, oldValue, data.newValue, true);
			},
			true
		);
	}

	function setupBridge(flag) {
		if (bridgeReady) return;
		token = String(flag);
		REQ_EVENT = token + '.req';
		RESP_EVENT = token + '.res';
		CHG_EVENT = token + '.chg';
		bridgeReady = true;
		registerListeners();
	}

	// 与 isolated 协商运行时随机 flag：请求 -> 广播 -> 回执
	(function negotiate() {
		if (!__ocsBridgeKey || !__ocsListen) return;
		var attempts = 0;
		function onKey(event) {
			var data = event.detail;
			if (!data || data.action !== 'broadcastEventFlag' || !data.eventFlag) return;
			event.stopImmediatePropagation();
			__ocsUnlisten(__ocsBridgeKey, onKey, true);
			setupBridge(data.eventFlag);
			fire(__ocsBridgeKey, {
				action: 'receivedEventFlag',
				eventFlag: token,
				k: token
			});
		}
		__ocsListen(__ocsBridgeKey, onKey, true);
		function request() {
			if (bridgeReady) return;
			fire(__ocsBridgeKey, { action: 'requestEventFlag' });
			attempts += 1;
			if (attempts < 50) setTimeout(request, 100);
		}
		request();
	})();

	function post(message) {
		if (!bridgeReady) return false;
		message.k = token;
		return fire(REQ_EVENT, message);
	}

	function send(type, payload, options) {
		var opts = options || {};
		var timeout = opts.timeout || 150;
		var retry = opts.retry == null ? 15 : opts.retry;
		return new Promise(function (resolve) {
			var id = ++reqId;
			var tries = 0;
			function attempt() {
				if (!bridgeReady) {
					if (tries < retry) {
						tries++;
						setTimeout(attempt, timeout);
					} else {
						resolve(undefined);
					}
					return;
				}
				var message = { id: id, type: type };
				if (payload !== undefined) message.payload = payload;
				pending.set(id, resolve);
				post(message);
				setTimeout(function () {
					if (!pending.has(id)) return;
					pending.delete(id);
					if (tries < retry) {
						tries++;
						attempt();
					} else {
						resolve(undefined);
					}
				}, timeout);
			}
			attempt();
		});
	}

	var readyPromise = send('storageInit', undefined, { timeout: 120, retry: 25 }).then(function (
		res
	) {
		if (!res || !res.data) return;
		var data = res.data;
		for (var key in data) {
			if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
			if (key.indexOf('__ocs_tab_') === 0) continue;
			store[key] = data[key];
		}
	});

	var infos = {
		scriptHandler: '鸿鹄易学',
		version: VERSION,
		script: Object.assign(
			{
				version: VERSION,
				name: META.name || '鸿鹄易学',
				description: META.description || '',
				namespace: META.namespace || '',
				author: META.author || '',
				homepage: META.homepage || '',
				icon: META.icon || '',
				'run-at': 'document-start'
			},
			META
		)
	};

	return {
		GM_info: infos,

		GM_setValue: function (key, value) {
			var oldValue = store[key];
			store[key] = value;
			emit(key, oldValue, value, false);
			send('setValue', { key: key, value: value }, { retry: 5 });
		},

		GM_getValue: function (key, defaultValue) {
			return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : defaultValue;
		},

		GM_listValues: function () {
			return Object.keys(store);
		},

		GM_deleteValue: function (key) {
			var oldValue = store[key];
			delete store[key];
			emit(key, oldValue, undefined, false);
			send('deleteValue', { key: key }, { retry: 5 });
		},

		GM_addValueChangeListener: function (key, cb) {
			var id = ++listenerSeq;
			valueListeners.set(id, { key: key, cb: cb });
			return id;
		},

		GM_removeValueChangeListener: function (id) {
			return valueListeners.delete(id);
		},

		GM_xmlhttpRequest: function (details) {
			var onload = details.onload;
			var onerror = details.onerror;
			send(
				'xhr',
				{
					url: details.url,
					method: details.method,
					headers: details.headers,
					data: details.data,
					responseType: details.responseType
				},
				{ retry: 0, timeout: 300000 }
			).then(function (result) {
				if (!result) {
					if (onerror) onerror({ error: 'GM_xmlhttpRequest: no response (bridge unavailable)' });
					return;
				}
				if (result.error) {
					if (onerror) onerror({ error: result.error, status: result.status });
					return;
				}
				if (onload) onload(result);
			});
		},

		GM_notification: function (details, ondone) {
			send('notification', details, { retry: 3 }).then(function () {
				if (ondone) ondone();
			});
		},

		GM_getTab: function (cb) {
			send('getTab', undefined, { retry: 5 }).then(function (res) {
				if (cb) cb((res && res.tab) || {});
			});
		},

		GM_saveTab: function (tab, cb) {
			send('saveTab', { tab: tab }, { retry: 5 }).then(function () {
				if (cb) cb();
			});
		},

		GM_getResourceText: function (name) {
			var resources = RES.resources || {};
			return resources[name];
		},

		__bootReady__: readyPromise
	};
})();

var GM_info = GM.GM_info;
var GM_setValue = GM.GM_setValue;
var GM_getValue = GM.GM_getValue;
var GM_listValues = GM.GM_listValues;
var GM_deleteValue = GM.GM_deleteValue;
var GM_addValueChangeListener = GM.GM_addValueChangeListener;
var GM_removeValueChangeListener = GM.GM_removeValueChangeListener;
var GM_xmlhttpRequest = GM.GM_xmlhttpRequest;
var GM_notification = GM.GM_notification;
var GM_getTab = GM.GM_getTab;
var GM_saveTab = GM.GM_saveTab;
var GM_getResourceText = GM.GM_getResourceText;
var __bootReady__ = GM.__bootReady__;
