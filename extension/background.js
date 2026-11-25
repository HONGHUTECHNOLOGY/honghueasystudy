const TAB_STORE_PREFIX = '__ocs_tab_';
/**
 * tabId -> tab uid 的内存缓存
 *
 * 跨帧通信（cors）靠 `chrome.storage` 里的 `tab.<uid>.cors.events.*` 做 key，
 * 两端的 uid 必须一致。uid 只允许由后台生成一次（见 getTab 处理），
 * 这里用同步 Map 兜住并发，避免多个 frame 各写一个 uuid 互相覆盖。
 */
const TAB_UID_CACHE = new Map();

/* ============================================================
 * 把运行时注册到 MAIN world
 * ============================================================
 * 页面 DOM 里不再出现 <script>；MAIN world 代码由浏览器直接执行。
 *
 * 主路径是 chrome.scripting.registerContentScripts({ world: 'MAIN' })：
 * 它只需要 scripting 权限 + host_permissions，**不需要**「允许用户脚本」开关。
 *
 * 曾经用 chrome.userScripts 做主路径，踩了一个致命的坑：Chrome 138+ 起
 * 「允许用户脚本」默认关闭，关闭时 chrome.userScripts 整个对象都不存在。
 * 而桌面端每次新建浏览器都是全新 profile，开关必然处于关闭状态，
 * 结果所有平台的页面脚本静默失效（表现：面板不出现、不自动答题），
 * 用户还得手动去 edge://extensions 点一次开关再重启浏览器。
 *
 * 现在优先 scripting 通道；只有在不支持 world:'MAIN' 的旧内核上
 * 才退回 userScripts，最后才回退到 isolated 侧的 <script> 注入。
 */
const MAIN_SCRIPT_ID = 'honghu-main';
/** chrome.scripting 的 id 只允许 [A-Za-z0-9_]，不能用连字符 */
const MAIN_CS_ID = 'hh_main_world';
let injectionMode = 'unknown'; // scripting | userScripts | fallback | unknown
let registrationPromise = null;
let cachedMainWorldCode = null;

function collectMatchPatterns() {
	const manifest = chrome.runtime.getManifest();
	const matches = [];
	(manifest.content_scripts || []).forEach(function (cs) {
		(cs.matches || []).forEach(function (m) {
			if (matches.indexOf(m) < 0) matches.push(m);
		});
	});
	return matches;
}

/**
 * 用 chrome.scripting 注册 MAIN world content script。
 *
 * 注册的是**文件路径**而不是内联代码，所以磁盘上的 main-world.js 更新后
 * 下次页面加载自动生效，不需要重新注册。
 */
async function registerViaScripting(force) {
	const scripting = chrome.scripting;
	if (!scripting || !scripting.registerContentScripts) {
		throw new Error('scripting.registerContentScripts 不可用');
	}
	const matches = collectMatchPatterns();
	if (!matches.length) throw new Error('没有可注入的匹配规则');

	let existing = [];
	try {
		existing = await scripting.getRegisteredContentScripts({ ids: [MAIN_CS_ID] });
	} catch (e) {
		existing = [];
	}

	if (existing && existing.length) {
		if (!force) return;
		try {
			await scripting.unregisterContentScripts({ ids: [MAIN_CS_ID] });
		} catch (e) {
			/* 忽略：后面直接覆盖注册 */
		}
	}

	await scripting.registerContentScripts([
		{
			id: MAIN_CS_ID,
			js: ['content/main-world.js'],
			matches: matches,
			runAt: 'document_start',
			allFrames: true,
			world: 'MAIN',
			persistAcrossSessions: true
		}
	]);
}

/** 切到 scripting 通道后，清掉历史遗留的 userScripts 注册，避免同一份代码跑两遍 */
async function clearUserScriptsRegistration() {
	let userScripts;
	try {
		userScripts = chrome.userScripts;
	} catch (e) {
		return;
	}
	if (!userScripts || !userScripts.unregister) return;
	try {
		await userScripts.unregister({ ids: [MAIN_SCRIPT_ID] });
	} catch (e) {
		/* 本来就没注册 */
	}
}

function ensureMainWorldScript(force) {
	if (registrationPromise) return registrationPromise;
	registrationPromise = doEnsureMainWorldScript(force).finally(function () {
		registrationPromise = null;
	});
	return registrationPromise;
}

async function getMainWorldCode() {
	if (cachedMainWorldCode) return cachedMainWorldCode;
	// 构建时生成的完整 MAIN world 文件（含 bridge key、伪 Window 运行时、业务 bundle）
	cachedMainWorldCode = await fetch(
		chrome.runtime.getURL('content/main-world.js')
	).then(function (r) {
		return r.text();
	});
	return cachedMainWorldCode;
}

async function doEnsureMainWorldScript(force) {
	// ① 首选：chrome.scripting 注册 MAIN world（不需要「允许用户脚本」开关）
	try {
		await registerViaScripting(force);
		injectionMode = 'scripting';
		clearUserScriptsRegistration();
		console.log('[鸿鹄易学] MAIN world 注入已通过 chrome.scripting 注册');
		return;
	} catch (e) {
		console.warn(
			'[鸿鹄易学] chrome.scripting 注册 MAIN world 失败，尝试 userScripts:',
			e && e.message ? e.message : e
		);
	}

	// ② 退回 chrome.userScripts（仅旧内核 path，且需要用户开启开关）
	// Chrome 137- 在未开启开发者模式时，读取 chrome.userScripts 本身就会抛错
	let userScripts;
	try {
		userScripts = chrome.userScripts;
	} catch (e) {
		injectionMode = 'fallback';
		return;
	}
	if (!userScripts || !userScripts.register) {
		injectionMode = 'fallback';
		return;
	}

	try {
		if (!force) {
			try {
				const existing = await userScripts.getScripts({ ids: [MAIN_SCRIPT_ID] });
				if (existing && existing.length) {
					injectionMode = 'userScripts';
					return;
				}
			} catch (e) {
				/* getScripts 不可用时继续尝试注册 */
			}
		}

		const manifest = chrome.runtime.getManifest();
		const matches = [];
		(manifest.content_scripts || []).forEach(function (cs) {
			(cs.matches || []).forEach(function (m) {
				if (matches.indexOf(m) < 0) matches.push(m);
			});
		});
		if (!matches.length) {
			injectionMode = 'fallback';
			return;
		}

		const code = await getMainWorldCode();

		try {
			await userScripts.configureWorld({
				csp: "script-src 'self' 'unsafe-inline' 'unsafe-eval' *",
				messaging: true
			});
		} catch (e) {
			/* MAIN world 不一定支持 csp 配置，忽略 */
		}

		try {
			await userScripts.unregister({ ids: [MAIN_SCRIPT_ID] });
		} catch (e) {
			/* 之前未注册 */
		}

		await userScripts.register([
			{
				id: MAIN_SCRIPT_ID,
				js: [{ code }],
				matches: matches,
				runAt: 'document_start',
				allFrames: true,
				world: 'MAIN'
			}
		]);
		injectionMode = 'userScripts';
		console.log('[鸿鹄易学] userScripts MAIN 注入已注册');
	} catch (e) {
		injectionMode = 'fallback';
		console.warn(
			'[鸿鹄易学] userScripts 不可用，回退到 script 注入:',
			e && e.message ? e.message : e
		);
	}
}

chrome.runtime.onInstalled.addListener(function () {
	// 扩展更新后旧注册可能还在；先等当前注册流程结束，再强制用新 bundle 覆盖
	ensureMainWorldScript(false)
		.catch(function () {})
		.then(function () {
			return ensureMainWorldScript(true);
		})
		.catch(function () {});
});
chrome.runtime.onStartup.addListener(function () {
	ensureMainWorldScript(false);
});
ensureMainWorldScript(false);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (!msg || msg.__HH__ == null) return false;
	const type = msg.__HH__;
	const payload = msg.payload;

	if (type === 'getInjectionMode') {
		ensureMainWorldScript(false).then(
			function () {
				sendResponse({ mode: injectionMode });
			},
			function () {
				injectionMode = 'fallback';
				sendResponse({ mode: 'fallback' });
			}
		);
		return true;
	}

	if (type === 'injectMainWorld') {
		const tabId = sender.tab && sender.tab.id;
		if (tabId == null) {
			sendResponse({ ok: false, error: 'no tab' });
			return false;
		}
		let scripting;
		try {
			scripting = chrome.scripting;
		} catch (e) {
			scripting = null;
		}
		if (!scripting || !scripting.executeScript) {
			sendResponse({ ok: false, error: 'scripting unavailable' });
			return false;
		}
		const frameId = sender.frameId == null ? 0 : sender.frameId;
		try {
			scripting
				.executeScript({
					target: { tabId: tabId, frameIds: [frameId] },
					world: 'MAIN',
					files: ['content/main-world.js']
				})
				.then(
					function () {
						sendResponse({ ok: true });
					},
					function (e) {
						sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
					}
				);
		} catch (e) {
			sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
			return false;
		}
		return true;
	}

	if (type === 'getInjectionCode') {
		// 内容脚本不能直接 fetch 扩展资源；由后台读取并回传完整注入代码
		getMainWorldCode().then(
			function (code) {
				sendResponse({ code: code });
			},
			function (e) {
				sendResponse({ error: e && e.message ? e.message : String(e) });
			}
		);
		return true;
	}

	if (type === 'xhr') {
		handleXhr(payload, sendResponse);
		return true;
	}
	if (type === 'notification') {
		handleNotification(payload, sendResponse);
		return true;
	}
	if (type === 'setValue') {
		/**
		 * 必须带 reject 分支
		 *
		 * 只写 `.then(() => sendResponse(...))` 时，只要 set 被拒绝
		 * （值不可结构化克隆、配额、storage 未就绪），Promise 就悬着，
		 * sendResponse 永远不调用 —— 内容脚本那边不会收到回执也不会报错，
		 * 最终只能等 GM_xmlhttpRequest 的 300 秒超时。
		 */
		chrome.storage.local.set({ [payload.key]: payload.value }).then(
			() => sendResponse({ ok: true }),
			(err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
		);
		return true;
	}
	if (type === 'deleteValue') {
		chrome.storage.local.remove(payload.key).then(
			() => sendResponse({ ok: true }),
			(err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
		);
		return true;
	}
	if (type === 'storageInit') {
		chrome.storage.local.get(null).then(
			(all) => sendResponse({ data: all }),
			(err) => sendResponse({ data: {}, error: String(err && err.message ? err.message : err) })
		);
		return true;
	}
	if (type === 'getTab') {
		const tabId = sender.tab && sender.tab.id;
		if (tabId == null) {
			sendResponse({ tab: {} });
			return false;
		}
		const storeKey = TAB_STORE_PREFIX + tabId;
		// session 存储在部分上下文未开访问级别时会直接拒绝，同样必须兜住
		chrome.storage.session.get([storeKey]).then(
			(res) => {
				const tab = res[storeKey] || {};
				/**
				 * tab uid 必须由后台统一生成
				 *
				 * 每个 frame 的 `start()` 都是「`getTab` 读到空就 `setTab` 一个新 uuid」，
				 * 多个 frame 并发时后写的会覆盖前写的：先写的那一方 `cors.on` 已经用旧 uid
				 * 注册了监听，而 iframe 的 `cors.emit` 用的是新 uid —— chrome.storage 里的
				 * key 两端对不上，跨帧消息静默丢失（实测 115 次发送只有 1 次到达，
				 * 表现就是「面板一直在，但通知几乎不显示」）。
				 *
				 * 后台是单线程的，这里用内存缓存 + 落盘把它钉成一份：
				 * 先查 `TAB_UID_CACHE`（同步、无竞态），没有再看 storage，都没有才生成。
				 */
				let uid = TAB_UID_CACHE.get(tabId) || tab._uid_;
				if (!uid) {
					uid = typeof crypto !== 'undefined' && crypto.randomUUID
						? crypto.randomUUID().replace(/-/g, '')
						: String(Date.now()) + Math.random().toString(36).slice(2, 10);
				}
				TAB_UID_CACHE.set(tabId, uid);
				if (tab._uid_ !== uid) {
					tab._uid_ = uid;
					chrome.storage.session.set({ [storeKey]: tab });
				}
				sendResponse({ tab });
			},
			(err) => sendResponse({ tab: {}, error: String(err && err.message ? err.message : err) })
		);
		return true;
	}
	if (type === 'saveTab') {
		const tabId = sender.tab && sender.tab.id;
		if (tabId == null) {
			sendResponse({ ok: true });
			return false;
		}
		const storeKey = TAB_STORE_PREFIX + tabId;
		const incoming = payload.tab || {};
		chrome.storage.session.get([storeKey]).then((res) => {
			/**
			 * 合并写入，且 uid 以已存在的为准
			 *
			 * `saveTab` 传的是整个 tab 对象。两个 frame 并发保存时直接覆盖会丢字段；
			 * 更糟的是如果某个 frame 手里的 tab 还没有 uid，覆盖就把后台生成的 uid 抹掉了，
			 * 跨帧 key 又对不上。这里只合并、不允许改 uid。
			 */
			const existing = res[storeKey] || {};
			const merged = Object.assign({}, existing, incoming);
			if (existing._uid_) {
				merged._uid_ = existing._uid_;
			}
			chrome.storage.session.set({ [storeKey]: merged }).then(
				() => sendResponse({ ok: true }),
				(err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) })
			);
		}, (err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
		return true;
	}
	/**
	 * 关掉脚本自己弹出的标签
	 *
	 * 讯飞的「网页链接」资源必须点一下才算学完，但平台点完会用**自己的方式**开新标签
	 * （不是走 `window.open`，实测替换掉 `window.open` 也拦不住，估计是 `<a target=_blank>`
	 * 或模块加载时缓存的引用）。所以只能事后关：按 URL 前缀找最近打开的那个标签。
	 */
	if (type === 'closeTab') {
		const target = String((payload && payload.url) || '').trim();
		if (!target) {
			sendResponse({ ok: false, error: 'no url' });
			return false;
		}
		const prefix = target.split('?')[0];
		const tabId = sender.tab && sender.tab.id;
		chrome.tabs.query({}, (tabs) => {
			const hits = (tabs || []).filter(
				(t) => t.id !== tabId && typeof t.url === 'string' && t.url.indexOf(prefix) === 0
			);
			hits.forEach((t) => {
				chrome.tabs.remove(t.id, () => void chrome.runtime.lastError);
			});
			sendResponse({ ok: true, closed: hits.length });
		});
		return true;
	}
	sendResponse({ error: 'unknown type: ' + type });
	return false;
});

async function handleXhr(details, sendResponse) {
	/**
	 * 请求必须有超时
	 *
	 * `fetch` 默认不超时。端口没起、或对端接了连接不回包时，这个 Promise 会一直悬着，
	 * 内容脚本那边的 `GM_xmlhttpRequest` 就永远等不到回执 ——
	 * 实测「配置同步」就是这么卡死的：探测 `localhost:15319` 之后没有任何后续日志。
	 */
	const limit = Number(details.timeout) > 0 ? Number(details.timeout) : 30000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), limit);
	try {
		const init = {
			method: (details.method || 'GET').toUpperCase(),
			headers: Object.assign({}, details.headers || {}),
			signal: controller.signal
		};
		if (init.method !== 'GET' && init.method !== 'HEAD' && details.data != null) {
			init.body = details.data;
		}
		const res = await fetch(details.url, init);
		const responseText = await res.text();
		let response = responseText;
		if (details.responseType === 'json') {
			try {
				response = JSON.parse(responseText);
			} catch (e) {
				response = undefined;
			}
		}
		const responseHeaders = {};
		res.headers.forEach((v, k) => {
			responseHeaders[k] = v;
		});
		sendResponse({
			status: res.status,
			statusText: res.statusText,
			responseText: responseText,
			response: response,
			responseHeaders: responseHeaders,
			finalUrl: res.url
		});
	} catch (err) {
		const msg = err && err.name === 'AbortError' ? `请求超时（${limit}ms）` : String(err && err.message ? err.message : err);
		sendResponse({ error: msg });
	} finally {
		clearTimeout(timer);
	}
}

const DEFAULT_ICON =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function handleNotification(details, sendResponse) {
	const text = typeof details === 'string' ? { text: details } : details;
	const title = (text && text.title) || '鸿鹄易学';
	const message = (text && text.text) || '';
	const notifId = 'ocs_' + Date.now() + '_' + Math.random().toString(16).slice(2);
	const opts = { type: 'basic', iconUrl: DEFAULT_ICON, title: title, message: message };
	chrome.notifications.create(notifId, opts, () => {
		const err = chrome.runtime.lastError;
		sendResponse({ ok: !err, id: notifId, error: err && String(err) });
	});
}