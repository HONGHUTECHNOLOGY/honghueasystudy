(function () {
	'use strict';

	function boot() {
		var requiredApis = [
			'GM_getTab',
			'GM_saveTab',
			'GM_setValue',
			'GM_getValue',
			'unsafeWindow',
			'GM_listValues',
			'GM_deleteValue',
			'GM_notification',
			'GM_xmlhttpRequest',
			'GM_getResourceText',
			'GM_addValueChangeListener',
			'GM_removeValueChangeListener'
		];
		var missing = requiredApis.some(function (api) {
			return typeof Reflect.get(globalThis, api) === 'undefined';
		});
		if (missing) {
			var open = confirm(
				'鸿鹄易学缺少必要的 GM API polyfill，请确认扩展文件完整（content/gm-polyfill.js 已加载）。'
			);
		if (open) {
			return;
		}
			return;
		}

		var OCS = globalThis.OCS;
		if (!OCS) {
			console.error('[鸿鹄易学] lib/index.js 未加载，无法启动。');
			return;
		}

		var start = OCS.start;
		var definedProjects = OCS.definedProjects;
		var CommonProject = OCS.CommonProject;
		var RenderScript = OCS.RenderScript;

		var infos = GM_info;
		var STYLE = GM_getResourceText('STYLE') || '';

		var projects = definedProjects();

		start({
			projects: projects,
			renderConfig: {
				renderScript: RenderScript,
				styles: [STYLE],
				defaultPanelName: CommonProject.scripts.guide.namespace,
			title: '鸿鹄易学-' + infos.script.version
		}
	});
	}

	var ready = globalThis.__OCS_GM_READY__;
	if (ready && typeof ready.then === 'function') {
		ready.then(boot).catch(function (err) {
			console.error('[鸿鹄易学] 启动失败:', err);
			boot();
		});
	} else {
		boot();
	}
})();