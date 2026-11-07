/**
 * 样式入口 · 顺序是硬约束，不要重排
 *
 * ① arco.css 把 --primary-* / --color-neutral-* 声明在 `body{}` 上，
 *    必须最先加载，之后由 arco-bridge.less 用同选择器覆盖。
 * ② material-icons 是图标字体，与主题无关，放哪都行，跟着 arco 走便于理解。
 * ③④ bootstrap 与 common.css 是过渡期保留：前者提供 d-flex / mb-2 / text-center
 *    这类排版工具类（95 个文件里 50 个类名在用），后者有一批历史暗色补丁。
 *    它们必须排在 styles/index.less 之前，否则新体系会被旧 !important 压掉。
 *    两者都会在 P6 阶段被 styles/ 完全取代后删除。
 * ⑤ 新设计系统：令牌 → 桥接 → 重置 → 排版 → 组件 → 动效 → 壳层 → 工具类。
 */
import '@arco-design/web-vue/dist/arco.css';
import 'material-icons/iconfont/material-icons.css';
import './assets/css/bootstrap.min.css';
import './assets/css/common.css';
import './styles/index.less';

import { remote } from './utils/remote';
import { createApp } from 'vue';
import ArcoVue, { Icon } from '@arco-design/web-vue';
import ArcoVueIcon from '@arco-design/web-vue/es/icon';
import App from './App.vue';
import AppInBrowser from './AppInBrowser.vue';
import { router } from './route';
import { notify } from './utils/notify';
import { inBrowser } from './utils/node';
import { store } from './store';
import { applyTheme } from './utils/theme';

window.addEventListener('error', function (e) {
	console.error(e);
	if (e instanceof ErrorEvent) {
		if (errorFilter(e?.message || String(e) || '')) {
			return;
		}
	}

	remote.logger.call('error', '未知的错误', e);
	notify('未知的错误', e, 'render-error', {
		type: 'error',
		copy: true
	});
});

window.addEventListener('unhandledrejection', function (e) {
	e.promise.catch((e) => {
		console.error(e);
		try {
			if (errorFilter(e?.message || String(e) || '')) {
				return;
			}
			remote.logger.call('error', '未捕获的异步错误', e?.stack || e?.message || e || '');
			notify('未捕获的异步错误', e, 'render-error', {
				type: 'error',
				copy: true
			});
		} catch (e) {
			console.error(e);
		}
	});
});

function errorFilter(str: string) {
	// arco design 问题，暂时无需处理，复现方式，鼠标重复经过 tooltip 或者 dropdown ， 打开 modal 都会出现
	if (str.includes('ResizeObserver loop')) {
		return true;
	}
	//  operation not permitted, stat xxxxx CrashpadMetrics.pma ， 这个是 playwright 问题，暂时无需处理
	if (str.includes('CrashpadMetrics')) {
		return true;
	}
}

(() => {
	/**
	 * 挂载前先把主题定下来
	 *
	 * 主题值在 store 模块加载时就已经从加密存档里解密出来了（同步 IPC），
	 * 所以这里可以直接用。提前设置的收益是：暗色用户不会在启动瞬间看到一帧白底。
	 * 完整初始化（平台识别 + 壳层度量注入）稍后在 App.vue 里异步完成。
	 */
	applyTheme(!!store.render?.setting?.theme?.dark);

	/**
	 * 区分浏览器环境和electron渲染进程环境
	 */
	if (inBrowser) {
		createApp(AppInBrowser)
			.use(router)
			.use(ArcoVue)
			.use(ArcoVueIcon)
			.component('IconFont', Icon.addFromIconFontCn({ src: 'js/acro.font.js' }))
			.directive('focus', {
				mounted(el) {
					el.focus();
				}
			})
			.mount('#app');
		return;
	}

	createApp(App)
		.use(router)
		.use(ArcoVue)
		.use(ArcoVueIcon)
		.component('IconFont', Icon.addFromIconFontCn({ src: 'js/acro.font.js' }))
		.directive('focus', {
			mounted(el) {
				el.focus();
			}
		})
		.mount('#app');
})();
