import { store } from '../store';
import { remote } from './remote';

/**
 * 主题与壳层度量 · 唯一入口
 * ============================================================================
 * 原来主题有两条写入路径：
 *   utils/index.ts 的 changeTheme()   —— 改 arco-theme 属性 + setTitleBarOverlay
 *   App.vue 里对 theme 的 watch        —— 只改 arco-theme 属性
 * 两条路径不同步，表现是：切换夜间模式后窗口右上角三个按钮还是黑字压在深色标题栏上，
 * 直到重启才对。现在统一走 applyTheme。
 *
 * 【为什么变量写在 body 而不是 html】
 * tokens.less 把 --surface-* 这些声明在 `body {}` 上（必须如此，见该文件注释）。
 * CSS 变量继承是「就近覆盖」：body 自己的声明优先于从 html 继承来的值。
 * 所以任何 JS 注入的覆盖也必须落在 body 上，写在 documentElement 上会被静默忽略。
 * ============================================================================
 */

let currentPlatform = '';

/** 与 tokens.less 保持一致：亮色面板 #FFFFFF / 暗色面板 #16191E */
const TITLE_BAR = {
	light: { color: '#FFFFFF', symbolColor: '#1F242B' },
	dark: { color: '#16191E', symbolColor: '#A0A8B4' }
} as const;

/**
 * 注入壳层几何
 *
 * 标题栏 40px，Windows 右上留 138px 给三个原生按钮（3 × 46），
 * macOS 左侧留 76px 给红绿灯。
 *
 * 为什么用固定值而不是 env(titlebar-area-width)：
 * 后者在窗口最大化/还原、跨屏拖动、DPI 变化时都出现过返回 0 的情况，
 * 一旦为 0 状态提示就被按钮压住。固定值在任何情况下都不会错。
 */
function applyShellMetrics() {
	const style = document.body.style;
	style.setProperty('--title-height', '40px');
	style.setProperty('--title-inset-right', currentPlatform === 'win32' ? '138px' : '0px');
	style.setProperty('--title-inset-left', currentPlatform === 'darwin' ? '76px' : '0px');
}

/**
 * 应用主题
 *
 * 幂等：可以反复调用。切换主题、启动初始化都走这里。
 */
export function applyTheme(dark: boolean) {
	/**
	 * 必须写 `arco-theme="dark"` 这个具体值。
	 *
	 * 不能用 toggleAttribute：它只会加上一个空属性（arco-theme=""），
	 * 而 Arco 全部暗色规则的选择器是 `body[arco-theme='dark']`，
	 * 空值匹配不上——表现就是主题切换毫无反应，属性看起来"设了"。
	 */
	if (dark) {
		document.body.setAttribute('arco-theme', 'dark');
	} else {
		document.body.removeAttribute('arco-theme');
	}

	// macOS 的红绿灯由系统绘制且跟随系统主题，不需要也无法通过 overlay 改色
	if (currentPlatform && currentPlatform !== 'darwin') {
		const c = dark ? TITLE_BAR.dark : TITLE_BAR.light;
		remote.win.call('setTitleBarOverlay', { color: c.color, symbolColor: c.symbolColor });
	}
}

/**
 * 初始化：识别平台、注入度量、应用当前主题
 *
 * 分两段执行，原因不同：
 *   第一段（同步）只设 arco-theme —— 不依赖平台，能在挂载前就把配色定下来，
 *              暗色用户不会看到一帧亮色底。
 *   第二段（异步）拿平台信息后补 platform-xxx 类与左右留白，并重设一次主题
 *              （标题栏按钮配色要按平台判断，macOS 不需要也不能改）。
 */
export async function initTheme() {
	// 同步段：先定配色，避免首帧闪白
	applyTheme(!!store.render.setting.theme.dark);

	try {
		currentPlatform = await remote.methods.call('getPlatform');
	} catch {
		// 纯浏览器调试模式下拿不到平台，按 win32 处理即可
		currentPlatform = 'win32';
	}

	document.body.classList.add('platform-' + currentPlatform);
	applyShellMetrics();
	applyTheme(!!store.render.setting.theme.dark);

	return currentPlatform;
}

/** 当前平台（供需要按平台微调的组件使用） */
export function getPlatform() {
	return currentPlatform;
}
