/* 鸿鹄易学 · ISOLATED world 桥接 + 注入器
 *
 * 通信/注入机制参考脚本猫（ScriptCat）：
 *   1) 构建时随机 __OCS_BRIDGE_KEY__ 作为初始通道
 *   2) 运行时再协商一个随机 eventFlag，所有消息事件名由它派生
 *   3) 消息走 performance 上的 CustomEvent，不再依赖 window expando
 *   4) 优先由 background 用 chrome.userScripts.register({world:"MAIN"}) 注册
 *      MAIN world 运行时；userScripts 不可用时回退到闭 Shadow DOM <script>
 *
 * 这样页面 DOM 里不会出现 <script> 标签，也没有固定的事件名/token 特征。
 */
(function () {
	'use strict';

	var BRIDGE_KEY = globalThis.__OCS_BRIDGE_KEY__;
	if (!BRIDGE_KEY) return;

	var perf = performance;
	var dispatch = perf.dispatchEvent.bind(perf);
	var listen = perf.addEventListener.bind(perf);
	var unlisten = perf.removeEventListener.bind(perf);
	var CE = CustomEvent;

	function readDetail(event) {
		var data = event.detail;
		try {
			if (data && typeof data === 'object' && data.wrappedJSObject) {
				data = data.wrappedJSObject;
			}
		} catch (e) {}
		return data;
	}

	function fire(type, detail) {
		try {
			if (typeof cloneInto === 'function') detail = cloneInto(detail, perf);
		} catch (e) {}
		return dispatch(
			new CE(type, {
				detail: detail,
				cancelable: true
			})
		);
	}

	// 运行时随机 flag：-<时间 base36>.<随机 base36>
	var eventFlag = '-' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2);
	var REQ_EVENT = eventFlag + '.req';
	var RES_EVENT = eventFlag + '.res';
	var CHG_EVENT = eventFlag + '.chg';
	var mainWorldReady = false;
	var fallbackStarted = false;

	function broadcastFlag() {
		fire(BRIDGE_KEY, { action: 'broadcastEventFlag', eventFlag: eventFlag });
	}

	// ---------- 1. flag 协商 ----------
	listen(
		BRIDGE_KEY,
		function (event) {
			var data = readDetail(event);
			if (!data || typeof data !== 'object') return;
			if (data.action === 'requestEventFlag') {
				event.stopImmediatePropagation();
				broadcastFlag();
			} else if (data.action === 'receivedEventFlag') {
				event.stopImmediatePropagation();
				if (data.eventFlag === eventFlag) mainWorldReady = true;
			}
		},
		true
	);

	// ---------- 2. GM API 请求 -> background ----------
	listen(
		REQ_EVENT,
		function (event) {
			event.stopImmediatePropagation();
			var data = readDetail(event);
			if (!data || typeof data !== 'object' || data.k !== eventFlag) return;

			try {
				chrome.runtime.sendMessage(
					{ __OCS__: data.type, payload: data.payload },
					function (result) {
						var err = chrome.runtime.lastError;
						fire(RES_EVENT, {
							k: eventFlag,
							id: data.id,
							result: err ? { error: String(err) } : result
						});
					}
				);
			} catch (e) {
				fire(RES_EVENT, {
					k: eventFlag,
					id: data.id,
					result: { error: String(e && e.message ? e.message : e) }
				});
			}
		},
		true
	);

	// ---------- 3. chrome.storage 变更 -> MAIN world ----------
	chrome.storage.onChanged.addListener(function (changes, area) {
		if (area !== 'local') return;
		for (var key in changes) {
			if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
			fire(CHG_EVENT, {
				k: eventFlag,
				key: key,
				oldValue: changes[key].oldValue,
				newValue: changes[key].newValue
			});
		}
	});

	// 主动广播一次，避免 MAIN world 先启动时一直等待
	broadcastFlag();

	// 安全兜底：即使 background 没有响应，也不能让页面一直没有脚本运行
	setTimeout(function () {
		if (!mainWorldReady) fallbackInject();
	}, 3000);

	// ---------- 4. 决定注入方式 ----------
	try {
		chrome.runtime.sendMessage({ __OCS__: 'getInjectionMode' }, function (res) {
			var mode = res && res.mode;
			if (mode === 'fallback') {
				fallbackInject();
			} else {
				// userScripts 已注册：等 MAIN world 回执；超时则回退
				setTimeout(function () {
					if (!mainWorldReady) fallbackInject();
				}, 1500);
			}
		});
	} catch (e) {
		fallbackInject();
	}

	// ---------- 5. 回退：优先 chrome.scripting，最后才内联 <script> ----------
	function fallbackInject() {
		if (fallbackStarted || mainWorldReady) return;
		fallbackStarted = true;

		// 首选：让后台用 chrome.scripting.executeScript({ world: "MAIN",
		// files: ["content/main-world.js"] }) 注入。浏览器注入文件不受
		// 页面 CSP 限制，也不需要扩展资源可被 fetch。
		try {
			chrome.runtime.sendMessage({ __OCS__: 'injectMainWorld' }, function (res) {
				if (res && res.ok) return;
				inlineFallback(res && res.error);
			});
		} catch (e) {
			inlineFallback(String(e));
		}
	}

	// 最后兜底：后台回传完整代码，用闭 Shadow DOM <script> 注入。
	// 适用于没有 scripting 权限或 scripting 注入失败的旧环境；会被页面 CSP 拦截。
	function inlineFallback(reason) {
		try {
			chrome.runtime.sendMessage({ __OCS__: 'getInjectionCode' }, function (res) {
				if (res && res.code) {
					injectCode(res.code);
				} else {
					console.error(
						'[鸿鹄易学] MAIN world 注入失败:',
						reason,
						res && (res.error || res)
					);
				}
			});
		} catch (e) {
			console.error('[鸿鹄易学] MAIN world 注入异常:', reason, e);
		}
	}

	function injectCode(code) {
		try {
			var div = document.createElement('div');
			var root = div.attachShadow({ mode: 'closed' });
			var script = document.createElement('script');
			script.textContent = code;
			root.appendChild(script);
			(document.documentElement || document).appendChild(div);
			Promise.resolve().then(function () {
				script.remove();
				div.remove();
			});
		} catch (e) {}
	}
})();
