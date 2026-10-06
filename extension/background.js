const TAB_STORE_PREFIX = '__ocs_tab_';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (!msg || msg.__OCS__ == null) return false;
	const type = msg.__OCS__;
	const payload = msg.payload;

	if (type === 'xhr') {
		handleXhr(payload, sendResponse);
		return true;
	}
	if (type === 'notification') {
		handleNotification(payload, sendResponse);
		return true;
	}
	if (type === 'setValue') {
		chrome.storage.local.set({ [payload.key]: payload.value }).then(() => sendResponse({ ok: true }));
		return true;
	}
	if (type === 'deleteValue') {
		chrome.storage.local.remove(payload.key).then(() => sendResponse({ ok: true }));
		return true;
	}
	if (type === 'storageInit') {
		chrome.storage.local.get(null).then((all) => sendResponse({ data: all }));
		return true;
	}
	if (type === 'getTab') {
		const tabId = sender.tab && sender.tab.id;
		if (tabId == null) {
			sendResponse({ tab: {} });
			return false;
		}
		chrome.storage.session.get([TAB_STORE_PREFIX + tabId]).then((res) => {
			sendResponse({ tab: res[TAB_STORE_PREFIX + tabId] || {} });
		});
		return true;
	}
	if (type === 'saveTab') {
		const tabId = sender.tab && sender.tab.id;
		if (tabId == null) {
			sendResponse({ ok: true });
			return false;
		}
		chrome.storage.session.set({ [TAB_STORE_PREFIX + tabId]: payload.tab }).then(() =>
			sendResponse({ ok: true })
		);
		return true;
	}
	sendResponse({ error: 'unknown type: ' + type });
	return false;
});

async function handleXhr(details, sendResponse) {
	try {
		const init = {
			method: (details.method || 'GET').toUpperCase(),
			headers: Object.assign({}, details.headers || {})
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
		sendResponse({ error: String(err && err.message ? err.message : err) });
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