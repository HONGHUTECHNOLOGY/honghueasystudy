/* eslint-disable no-undef */
/// <reference path="./global.d.ts" />

// 环境检测
if (
	[
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
	].some((api) => typeof Reflect.get(globalThis, api) === 'undefined')
) {
	const open = confirm(
		`鸿鹄易学不支持当前的脚本管理器（${GM_info.scriptHandler}）。` +
			'请使用浏览器扩展版本，加载 extension 目录即可。'
	);

	if (open) {
		return;
	}
	return;
}

const { start, definedProjects, CommonProject, RenderScript } = HH;

const infos = GM_info;

(function () {
	'use strict';

	const projects = definedProjects();

	// 运行脚本
	start({
		projects: projects,
		renderConfig: {
			renderScript: RenderScript,
			styles: [GM_getResourceText('STYLE')],
			defaultPanelName: CommonProject.scripts.guide.namespace,
			title: `鸿鹄易学 DEV-${infos.script.version}`
		}
	});
})();
