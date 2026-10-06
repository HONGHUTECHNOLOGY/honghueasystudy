(function () {
	const BRIDGE = '__OCS_BRIDGE__';
	const STORE_KEY = '__ocs_gm_store__';
	const CHANGE_EVT = '__ocs_gm_change__';

	const RES = globalThis.__OCS_RESOURCES__ || {};
	const VERSION = RES.version || '0.0.0';
	const META = RES.metadata || {};

	let reqId = 0;
	const pending = new Map();

	function readStore() {
		try {
			return JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
		} catch (e) {
			return {};
		}
	}
	function writeStore(store) {
		try {
			localStorage.setItem(STORE_KEY, JSON.stringify(store));
		} catch (e) {}
	}
	function localSet(key, value) {
		const store = readStore();
		const oldValue = store[key];
		store[key] = value;
		writeStore(store);
		window.dispatchEvent(
			new CustomEvent(CHANGE_EVT, { detail: { key: key, oldValue: oldValue, newValue: value, remote: false } })
		);
	}
	function localDelete(key) {
		const store = readStore();
		const oldValue = store[key];
		delete store[key];
		writeStore(store);
		window.dispatchEvent(
			new CustomEvent(CHANGE_EVT, { detail: { key: key, oldValue: oldValue, newValue: undefined, remote: false } })
		);
	}
	function localDelete(key) {
		const store = readStore();
		delete store[key];
		writeStore(store);
		window.dispatchEvent(new CustomEvent(CHANGE_EVT, { detail: { key: key, newValue: undefined, remote: false } }));
	}

	function postReq(id, type, payload) {
		const obj = { [BRIDGE]: 'req', id: id, type: type };
		if (payload !== undefined) obj.payload = payload;
		window.postMessage(obj, '*');
	}

	function send(type, payload, opts) {
		opts = opts || {};
		const timeout = opts.timeout || 150;
		const retry = opts.retry == null ? 15 : opts.retry;
		return new Promise(function (resolve) {
			const id = ++reqId;
			let tries = 0;
			function attempt() {
				pending.set(id, resolve);
				postReq(id, type, payload);
				setTimeout(function () {
					if (pending.has(id)) {
						pending.delete(id);
						if (tries < retry) {
							tries++;
							attempt();
						} else {
							resolve(undefined);
						}
					}
				}, timeout);
			}
			attempt();
		});
	}

	window.addEventListener('message', function (e) {

		const d = e.data;
		if (!d || d[BRIDGE] !== 'resp') return;
		const p = pending.get(d.id);
		if (p) {
			pending.delete(d.id);
			p(d.result);
		}
	});

	const valueListeners = new Map();
	let listenerSeq = 0;

	window.addEventListener('message', function (e) {

		const d = e.data;
		if (!d || d[BRIDGE] !== 'storageChanged') return;
		const store = readStore();
		const oldValue = store[d.key];
		if (d.newValue === undefined) delete store[d.key];
		else store[d.key] = d.newValue;
		writeStore(store);
		valueListeners.forEach(function (l) {
			if (l.key === d.key) {
				try {
					l.cb(d.key, oldValue, d.newValue, true);
				} catch (err) {}
			}
		});
	});

	window.addEventListener(CHANGE_EVT, function (e) {
		const detail = e.detail;
		valueListeners.forEach(function (l) {
			if (l.key === detail.key) {
				try {
					l.cb(detail.key, detail.oldValue, detail.newValue, detail.remote);
				} catch (err) {}
			}
		});
	});

	const readyPromise = send('storageInit', undefined, { timeout: 120, retry: 25 }).then(function (res) {
		if (res && res.data) {
			const store = {};
			const data = res.data;
			for (const k in data) {
				if (Object.prototype.hasOwnProperty.call(data, k) && k.indexOf('__ocs_tab_') !== 0) {
					store[k] = data[k];
				}
			}
			writeStore(store);
		}
	});

	globalThis.__OCS_GM_READY__ = readyPromise;

	globalThis.GM_info = {
		scriptHandler: 'Honghu-Extension',
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

	globalThis.GM_setValue = function (key, value) {
		localSet(key, value);
		send('setValue', { key: key, value: value }, { retry: 5 });
	};
	globalThis.GM_getValue = function (key, defaultValue) {
		const store = readStore();
		return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : defaultValue;
	};
	globalThis.GM_listValues = function () {
		return Object.keys(readStore());
	};
	globalThis.GM_deleteValue = function (key) {
		localDelete(key);
		send('deleteValue', { key: key }, { retry: 5 });
	};
	globalThis.GM_addValueChangeListener = function (key, cb) {
		const id = ++listenerSeq;
		valueListeners.set(id, { key: key, cb: cb });
		return id;
	};
	globalThis.GM_removeValueChangeListener = function (id) {
		return valueListeners.delete(id);
	};

	globalThis.GM_xmlhttpRequest = function (details) {
		const onload = details.onload;
		const onerror = details.onerror;
		const payload = {
			url: details.url,
			method: details.method,
			headers: details.headers,
			data: details.data,
			responseType: details.responseType
		};
		send(
			'xhr',
			payload,
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
	};

	globalThis.GM_notification = function (details, ondone) {
		send('notification', details, { retry: 3 }).then(function () {
			if (ondone) ondone();
		});
	};

	globalThis.GM_getTab = function (cb) {
		send('getTab', undefined, { retry: 5 }).then(function (res) {
			if (cb) cb((res && res.tab) || {});
		});
	};
	globalThis.GM_saveTab = function (tab, cb) {
		send('saveTab', { tab: tab }, { retry: 5 }).then(function () {
			if (cb) cb();
		});
	};

	globalThis.unsafeWindow = window;

	globalThis.GM_getResourceText = function (name) {
		const resources = RES.resources || {};
		return resources[name];
	};
})();