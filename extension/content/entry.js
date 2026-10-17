/* 鸿鹄易学 · 启动逻辑
 *
 * 【重要】本文件不是独立脚本。它会被 scripts/bundle-main.js 内联进 content/main.js 的统一 IIFE，
 * 与 resources.js / gm-polyfill.js / lib/index.js 共享同一个函数作用域，可直接引用：
 *   OCS、GM_info、GM_getTab ... GM_getResourceText、__bootReady__
 *
 * 变量名统一加 __cs 前缀：核心包 lib/index.js 顶层已声明 infos / projects / start 等同名变量，
 * 合并到同一个函数作用域后若重名会互相覆盖，导致核心包行为异常。
 */

// OCS 由 bundle-main.js 的包装层捕获后声明；这里只做兜底判断
if (!OCS) {
	console.error('[鸿鹄易学] 核心包未就绪，跳过启动。');
} else {
	var __csReady = typeof __bootReady__ !== 'undefined' ? __bootReady__ : null;

	var __csBoot = function () {
		var __csMissing = !(
			typeof GM_getTab === 'function' &&
			typeof GM_saveTab === 'function' &&
			typeof GM_setValue === 'function' &&
			typeof GM_getValue === 'function' &&
			typeof GM_listValues === 'function' &&
			typeof GM_deleteValue === 'function' &&
			typeof GM_notification === 'function' &&
			typeof GM_xmlhttpRequest === 'function' &&
			typeof GM_getResourceText === 'function' &&
			typeof GM_addValueChangeListener === 'function' &&
			typeof GM_removeValueChangeListener === 'function'
		);
		if (__csMissing) {
			confirm('鸿鹄易学缺少必要的 GM API polyfill，请重新构建 content/main.js。');
			return;
		}

		var __csProjects = OCS.definedProjects();

		OCS.start({
			projects: __csProjects,
			renderConfig: {
				renderScript: OCS.RenderScript,
				styles: [GM_getResourceText('STYLE') || ''],
				defaultPanelName: OCS.CommonProject.scripts.guide.namespace,
				title: '鸿鹄易学-' + GM_info.script.version
			}
		});
	};

	if (__csReady && typeof __csReady.then === 'function') {
		__csReady.then(__csBoot).catch(function (err) {
			console.error('[鸿鹄易学] 启动失败:', err);
			__csBoot();
		});
	} else {
		__csBoot();
	}
}
