// @ts-check
/**
 * 把 content/resources.js + content/gm-polyfill.js + lib/index.js + content/entry.js
 * 合并成单文件 extension/content/main.js，并统一包进一个 IIFE。
 *
 * 目的：让 GM_* 与核心包的 HH 导出对象只存在于闭包里。
 *   - 不在 window 上        → Object.keys / getOwnPropertyNames / in 都探不到
 *   - 不在全局词法环境里    → 页面连「按名字取值」都做不到（这是相比分散注入的关键提升）
 *
 * 为什么单独一个脚本、不塞进 build-extension.js 的 buildLib：
 *   buildLib 会用 vite 从 packages/scripts 重新打包并覆盖 extension/lib/index.js。
 *   本脚本只读取现有的 lib/index.js，绝不重建它。
 *
 * 用法：node scripts/bundle-main.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const contentDir = path.join(root, 'extension/content');
const libFile = path.join(root, 'extension/lib/index.js');
const outFile = path.join(contentDir, 'main.js');

const BANNER = [
	'/*!',
	' * 鸿鹄易学 · MAIN world 单文件入口【自动生成，请勿直接编辑】',
	' *',
	' * 由 scripts/bundle-main.js 合并以下文件而成：',
	' *   content/resources.js   （构建生成：版本 / 元数据 / 样式）',
	' *   content/gm-polyfill.js （GM API polyfill）',
	' *   lib/index.js           （核心包，vite 打包产物）',
	' *   content/entry.js       （启动逻辑）',
	' *',
	' * 重新生成：node scripts/bundle-main.js',
	' */',
	''
].join('\n');

// 遮蔽 exports / module / define，强制核心包的 UMD 走「浏览器全局」分支；
// 再用 getter/setter 拦截 HH 的全局写入，把导出对象接进闭包。
const LIB_PRELUDE = [
	'/* ===== 3/4 核心包 lib/index.js（UMD） ===== */',
	'var exports = void 0;',
	'var module = void 0;',
	'var define = void 0;',
	'',
	'var __csPrevHH = null;',
	'var __csCapturedHH = null;',
	'var __csHooked = false;',
	'try {',
	"\t__csPrevHH = Object.getOwnPropertyDescriptor(globalThis, 'HH') || null;",
	"\tObject.defineProperty(globalThis, 'HH', {",
	'\t\tconfigurable: true,',
	'\t\tget: function () {',
	'\t\t\treturn __csCapturedHH;',
	'\t\t},',
	'\t\tset: function (v) {',
	'\t\t\t__csCapturedHH = v;',
	'\t\t}',
	'\t});',
	'\t__csHooked = true;',
	'} catch (e) {',
	'\t__csHooked = false;',
	'}',
	''
].join('\n');

const LIB_POSTLUDE = [
	'',
	'// 取出导出对象后立刻把 globalThis.HH 还原成进入前的状态（通常就是不存在）',
	'var HH = __csHooked ? __csCapturedHH : globalThis.HH;',
	'if (__csHooked) {',
	'\tif (__csPrevHH) {',
	"\t\ttry { Object.defineProperty(globalThis, 'HH', __csPrevHH); } catch (e) {}",
	'\t} else {',
	"\t\ttry { delete globalThis.HH; } catch (e) {}",
	'\t}',
	'}',
	'if (!HH) {',
	"\tconsole.error('[鸿鹄易学] 核心包加载失败：未捕获到 HH 导出对象。');",
	'\treturn;',
	'}',
	'',
	'// 核心包会往 window.top 上挂这几个属性做跨 frame 状态共享',
	'// （见 lib/index.js 中 `let top$1 = globalThis.top` 之后的四行赋值）。',
	'// 功能上不能删，但可以改成不可枚举：top.jobs 仍可读写，Object.keys(top) / for-in 扫不到。',
	'// 注意：跨域 iframe 下访问 top 会抛异常，且核心包自身会回退到 _self，这里同样静默跳过。',
	'var __csTopKeys = ["typrMapping", "jobs", "currentMedia", "_preChapterId"];',
	'for (var __csTi = 0; __csTi < __csTopKeys.length; __csTi++) {',
	'\tvar __csTk = __csTopKeys[__csTi];',
	'\ttry {',
	'\t\tvar __csTop = globalThis.top;',
	'\t\tvar __csTd = Object.getOwnPropertyDescriptor(__csTop, __csTk);',
	'\t\tif (__csTd && __csTd.configurable && __csTd.enumerable) {',
	'\t\t\tObject.defineProperty(__csTop, __csTk, {',
	'\t\t\t\tvalue: __csTd.value,',
	'\t\t\t\twritable: true,',
	'\t\t\t\tenumerable: false,',
	'\t\t\t\tconfigurable: true',
	'\t\t\t});',
	'\t\t}',
	'\t} catch (e) {}',
	'}',
	''
].join('\n');

function bundleMain() {
	for (const file of [path.join(contentDir, 'resources.js'), path.join(contentDir, 'gm-polyfill.js'), libFile, path.join(contentDir, 'entry.js')]) {
		if (!fs.existsSync(file)) {
			throw new Error('[bundle-main] 缺少依赖文件: ' + file);
		}
	}

	const read = (p) => fs.readFileSync(p, 'utf8');
	const resources = read(path.join(contentDir, 'resources.js'));
	const polyfill = read(path.join(contentDir, 'gm-polyfill.js'));
	const lib = read(libFile);
	const entry = read(path.join(contentDir, 'entry.js'));

	const parts = [
		BANNER,
		"(function () {",
		"\t'use strict';",
		'',
		'\t/* ===== 1/4 resources（构建生成） ===== */',
		resources.trim(),
		'',
		'\t/* ===== 2/4 GM API polyfill ===== */',
		polyfill.trim(),
		'',
		LIB_PRELUDE,
		lib.trim(),
		LIB_POSTLUDE,
		'',
		'\t/* ===== 4/4 启动 ===== */',
		entry.trim(),
		'})();',
		'//# sourceURL=app.js',
		''
	];

	const output = parts.join('\n');
	fs.writeFileSync(outFile, output, 'utf8');

	// 生成给 chrome.scripting.executeScript({ world: "MAIN", files }) 用的静态文件。
	// 浏览器注入文件不受页面 CSP 限制，是 userScripts 不可用时的主回退路径。
	const keyFile = path.join(contentDir, 'bridge-key.js');
	const runtimeFile = path.join(contentDir, 'inject-runtime.js');
	if (!fs.existsSync(keyFile)) throw new Error('[bundle-main] 缺少 bridge-key.js');
	if (!fs.existsSync(runtimeFile)) throw new Error('[bundle-main] 缺少 inject-runtime.js');
	const keyMatch = read(keyFile).match(/__HH_BRIDGE_KEY__\s*=\s*["']([^"']+)["']/);
	if (!keyMatch) throw new Error('[bundle-main] bridge-key.js 缺少 __HH_BRIDGE_KEY__');
	const runtime = read(runtimeFile);
	const mainWorldFile = path.join(contentDir, 'main-world.js');
	const mainWorldOutput = [
		'(function(){',
		'"use strict";',
		'var __HH_BRIDGE_KEY__=' + JSON.stringify(keyMatch[1]) + ';',
		runtime.trim(),
		'var __ocsMarker=Symbol.for("__"+__HH_BRIDGE_KEY__);',
		'if (globalThis[__ocsMarker]) return;',
		'try { Object.defineProperty(globalThis, __ocsMarker, {value:1, configurable:true}); } catch(e) {}',
		'var __ocs_sandbox__=__ocsCreateSandbox();',
		'(function(window){',
		output.trim(),
		'})(__ocs_sandbox__);',
		'})();',
		'//# sourceURL=app.js',
		''
	].join('\n');
	fs.writeFileSync(mainWorldFile, mainWorldOutput, 'utf8');

	return {
		outFile,
		mainWorldFile,
		size: Buffer.byteLength(output),
		mainWorldSize: Buffer.byteLength(mainWorldOutput),
		parts: {
			resources: Buffer.byteLength(resources),
			polyfill: Buffer.byteLength(polyfill),
			lib: Buffer.byteLength(lib),
			entry: Buffer.byteLength(entry)
		}
	};
}

if (require.main === module) {
	const r = bundleMain();
	console.log('[bundle-main] 已生成 ' + path.relative(root, r.outFile));
	console.log('[bundle-main] 已生成 ' + path.relative(root, r.mainWorldFile) + ' (' + (r.mainWorldSize / 1024).toFixed(1) + ' KB)');
	console.log(
		'[bundle-main] 合计 ' +
			(r.size / 1024).toFixed(1) +
			' KB  (resources ' +
			(r.parts.resources / 1024).toFixed(1) +
			' / polyfill ' +
			(r.parts.polyfill / 1024).toFixed(1) +
			' / lib ' +
			(r.parts.lib / 1024).toFixed(1) +
			' / entry ' +
			(r.parts.entry / 1024).toFixed(1) +
			' KB)'
	);
}

module.exports = { bundleMain };
