(function () {
	const BRIDGE = '__OCS_BRIDGE__';

	window.addEventListener('message', function (e) {

		const data = e.data;
		if (!data || data[BRIDGE] !== 'req') return;
		const id = data.id;
		const type = data.type;
		const payload = data.payload;
		chrome.runtime.sendMessage({ __OCS__: type, payload: payload }, function (result) {
			const err = chrome.runtime.lastError;
			window.postMessage({ [BRIDGE]: 'resp', id: id, result: err ? { error: String(err) } : result }, '*');
		});
	});

	chrome.storage.onChanged.addListener(function (changes, area) {
		if (area !== 'local') return;
		for (const key in changes) {
			if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
			const nv = changes[key].newValue;
			const ov = changes[key].oldValue;
			window.postMessage({ [BRIDGE]: 'storageChanged', key: key, oldValue: ov, newValue: nv, remote: true }, '*');
		}
	});
})();