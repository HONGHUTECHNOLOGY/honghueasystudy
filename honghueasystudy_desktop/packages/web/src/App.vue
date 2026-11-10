<template>
	<a-config-provider :locale="zhCN">
		<!--
			.app-root 是壳层的高度传递点。
			它必须自己也是 flex 列：外层 #app 的 flex 只作用于直接子元素，
			中间夹一层普通 block 会让 Title 与 .main-container 的 flex
			分配全部失效（表现为内容区高度为 0 或页面整体溢出）。
		-->
		<div class="app-root w-100 h-100">
			<!-- 全局顶部栏 -->
			<Title id="title" />

			<div class="main-container w-100">
				<!--
					内容区域
					Transition 包在 keep-alive 外面是标准写法：两者都不产生真实 DOM，
					所以 .main-container 的 flex 高度链不受影响。
					不加 mode="out-in"：它与 keep-alive 组合时偶发缓存组件不显示，
					靠 leave 极短（90ms）已经能达到「切换」而不是「交叠」的观感。
				-->
				<router-view v-slot="{ Component }">
					<Transition name="t-page">
						<keep-alive>
							<!--
								这里**不能**绑 `:key="route.path"`。
								专业模式的五个子页面共用同一个布局组件（pages/index.vue，
								里面装着侧栏 + 内容区），一旦把 key 绑到完整路径上，
								/browsers → /dashboard 会被当成"换了一个组件"——
								整个布局连同侧栏一起销毁重建：侧栏入场动画每次重播、
								侧栏滚动位置丢失、DOM 全部重排。
								嵌套路由本来就该由内部的 <router-view> 负责切换。
							-->
							<component :is="Component" />
						</keep-alive>
					</Transition>
				</router-view>
			</div>

			<!-- 全局：浏览器操作面板 -->
			<a-modal
				:closable="false"
				:visible="!!currentBrowser"
				:width="600"
				:top="8"
				:align-center="false"
				:footer="false"
				:header="false"
				@cancel="store.render.browser.currentBrowserUid = ''"
			>
				<div v-if="panelBrowser">
					<BrowserPanelOperators :browser="panelBrowser"></BrowserPanelOperators>
					<a-divider class="mt-2 mb-1" />
					<div style="max-height: 80vh; overflow: auto">
						<BrowserPanel :browser="panelBrowser"></BrowserPanel>
					</div>
				</div>
			</a-modal>

			<!-- 全局：一键安装 -->
			<Setup
				v-model:visible="store.render.state.setup"
				:preset-steps="['show_desc', 'init_env']"
			></Setup>

			<!-- 全局：新建浏览器自动初始化 -->
			<Setup
				v-model:visible="store.render.state.newBrowserSetup"
				auto-setup
				title="新建浏览器"
				confirm-text="开始初始化"
				:preset-steps="['new_browser', 'init_automationScript']"
				@finish="
					() => {
						store.render.state.newBrowserSetup = false;
						Message.success('新建浏览器成功');
					}
				"
			></Setup>
		</div>
	</a-config-provider>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { store } from './store';
import { remote } from './utils/remote';
import { root } from './fs/folder';
import { electron } from './utils/node';
import { closeAllBrowser, showClearBrowserCachesModal } from './utils/browser';
import { fetchRemoteLangs, setAlwaysOnTop, setAutoLaunch, setTrayEnabled } from './utils';
import { applyTheme, initTheme } from './utils/theme';
import { activeIpcRenderListener } from './utils/ipc';
import { activeRemoteControlBridge } from './utils/remoteControl';
import { startAutomationScheduler } from './utils/automationPlan';
import { getWindowsRelease } from './utils/os';
import { observeVisibleBrand } from './utils/brand-sanitizer';
import { currentBrowser } from './fs';
import { Modal, Message } from '@arco-design/web-vue';
import zhCN from '@arco-design/web-vue/es/locale/lang/zh-cn';
import cloneDeep from 'lodash/cloneDeep';
import debounce from 'lodash/debounce';
import Title from './components/Title.vue';
import BrowserPanel from './components/browsers/BrowserPanel.vue';
import BrowserPanelOperators from './components/BrowserPanelOperators.vue';
import Setup from './components/Setup.vue';

const { ipcRenderer } = electron;

/**
 * 浏览器面板的内容快照
 *
 * `currentBrowser` 在点关闭时立刻变 undefined，若模板直接用它，弹窗会在
 * 离场动画开始前就把内容卸载掉——看到的是一个空白的玻璃框在淡出，
 * 高度还会瞬间塌下来，非常突兀。
 *
 * 保留最后一次的有效值，DOM 在动画期间维持原样；Arco 的 Modal 默认
 * unmount-on-close，动画结束销毁后这份引用自然没人再用。
 */
const panelBrowser = ref<typeof currentBrowser.value | undefined>(undefined);

watch(
	currentBrowser,
	(v) => {
		if (v) panelBrowser.value = v;
	},
	{ immediate: true }
);

/** 异步保存，用于实时持久化（单次 IPC 调用，加密+写入在主进程完成） */
async function saveStoreToLocal(_store: typeof store) {
	try {
		const shouldEncrypt = remote.methods.callSync('isEncryptionAvailable');
		await remote.methods.call('saveStore', JSON.stringify(_store), shouldEncrypt);
	} catch (e) {
		console.error(e);
	}
}

/** 同步版本保存，用于关闭时确保数据写入磁盘（单次 IPC 调用） */
function saveStoreToLocalSync(_store: typeof store) {
	try {
		const shouldEncrypt = remote.methods.callSync('isEncryptionAvailable');
		remote.methods.callSync('saveStore', JSON.stringify(_store), shouldEncrypt);
	} catch (e) {
		console.error(e);
	}
}

onMounted(async () => {
	/** 清理界面中残留的旧品牌字样 */
	observeVisibleBrand(document.body);

	/** 开启 Ipc 通道监听 */
	activeIpcRenderListener();

	/** 开启远程控制桥接（状态上报 + 命令执行） */
	activeRemoteControlBridge();

	/**
	 * 开启自动化调度
	 *
	 * 负责两件「用户不在电脑前也要发生」的事：每日定时拉起浏览器刷课、
	 * 到点暂停/关闭。放在应用启动后执行，是因为它依赖配置树与 Process 实例，
	 * 而这两者都要等 store 初始化完成。
	 */
	startAutomationScheduler();

	/**
	 * 主题、平台、壳层度量统一初始化
	 *
	 * 原来这里是两段：一段 remote.os.call('platform') 手动加 platform-xxx 类与
	 * window-frame，另一段单独调 changeTheme()。两段都要拿平台却各拿一次，
	 * 且后者还漏了 setTitleBarOverlay。现在合成一次 initTheme。
	 */
	initTheme()
		.then(async (platform) => {
			if (platform === 'win32') {
				const release = await getWindowsRelease();
				if (release !== 'win11') {
					document.documentElement.classList.add('window-frame');
				}
			}
		})
		.catch(console.error);

	/** 初始化标题 */
	remote.win.call('setTitle', `鸿鹄易学 - 首页`);

	/** 初始化 store */
	remote.logger.call('info', 'render store init');
	/** 开机自启由主进程启动时按存档注册，这里只跟随设置面板的开关变化 */
	setAlwaysOnTop();

	/** 监听屏幕变化 */
	onResize();
	window.addEventListener('resize', onResize);

	/** 获取远程语言 */
	fetchRemoteLangs().catch(console.error);

	/** 检测浏览器缓存大小，超过阈值则提示 */
	remote.methods.call('statisticFolderSize', store.paths.userDataDirsFolder).then((totalSize) => {
		if (totalSize > 1024 * 1024 * 1024 * (store.render.setting.browser.cachesSizeWarningPoint ?? 10)) {
			showClearBrowserCachesModal(totalSize);
		}
	});

	/** 监听主题变化：统一走 applyTheme，保证属性与标题栏按钮配色同步 */
	watch(
		() => cloneDeep(store.render.setting.theme),
		(cur) => {
			applyTheme(!!cur.dark);
		}
	);

	/** 监听自动启动/置顶/托盘变化 */
	watch(() => store.window.autoLaunch, setAutoLaunch);
	watch(() => store.window.alwaysOnTop, setAlwaysOnTop);
	watch(() => store.window.tray, setTrayEnabled);

	/** 监听窗口高度 */
	window.onresize = () => {
		store.render.state.height = document.documentElement.clientHeight;
	};

	/** 准实时持久化：极短防抖 + 保存期间跳过 + 脏标记重试 */
	let saveInFlight = false;
	let dirtyWhileSaving = false;

	async function performSave() {
		if (saveInFlight) {
			dirtyWhileSaving = true;
			return;
		}
		saveInFlight = true;
		try {
			await saveStoreToLocal(store);
		} finally {
			saveInFlight = false;
			if (dirtyWhileSaving) {
				dirtyWhileSaving = false;
				performSave();
			}
		}
	}

	watch([() => store.render], debounce(performSave, 100), { deep: true });

	/** 全局唯一关闭处理 */
	let isExiting = false;
	ipcRenderer.on('close', async () => {
		// 防重入：避免重复点击关闭按钮或 window.close 循环导致并发触发关闭流程、重复弹窗
		if (isExiting) return;
		isExiting = true;
		console.log('关闭浏览器中...');
		const res = await closeAllBrowser();
		if (res === false) {
			isExiting = false;
			console.log('有浏览器拒绝关闭，取消退出');
			// 主进程有 4 秒强制退出看门狗，用户选「取消」必须把它撤掉
			ipcRenderer.send('cancel-exit');
			return;
		}
		console.log('保存数据中...');
		const m = Modal.info({ content: '正在保存数据...', closable: false, maskClosable: false, footer: false });
		store.render.browser.root = JSON.parse(JSON.stringify(root()));
		saveStoreToLocalSync(store);
		m.close();
		console.log('数据已保存');
		remote.app.call('exit', 0);
	});

	/**
	 * 安装更新的强制退出通道。
	 *
	 * 主进程改用 app.exit(0)，不走 window close → 渲染端回执那条链路（避免被
	 * 残留浏览器对象的确认框挂死），所以配置必须在这里同步落一次盘。
	 */
	ipcRenderer.on('prepare-exit', () => {
		try {
			store.render.browser.root = JSON.parse(JSON.stringify(root()));
			saveStoreToLocalSync(store);
		} catch (e) {
			console.error('退出前保存数据失败', e);
		}
	});
});

onUnmounted(() => {
	closeAllBrowser();
});

/** 屏幕响应式检测 */
function onResize() {
	const width = document.documentElement.clientWidth;

	/**
	 * 侧栏折叠交给 CSS 媒体查询（pages/index.vue 的 max-width: 860px），
	 * 这里只维护通用的响应式标记。
	 *
	 * 不再写 store.render.setting.showSideBarText：那是用户的持久化偏好，
	 * 原来每拖一次窗口就会被改写一次并触发加密写盘，
	 * 用户手动收起的侧栏也会在窗口变宽后被强行展开。
	 */
	const isNarrow = width < 1100;
	store.render.state.mini = isNarrow;
	store.render.state.responsive = isNarrow ? 'mini' : 'small';
}
</script>

<style lang="less">
/**
 * 注意：bootstrap.min.css 与 common.css 已移到 main.ts 统一引入。
 * 组件内 @import 会让层叠顺序取决于 Vite 的模块求值顺序，不可读也不可靠。
 * 这里只保留 App 自身需要的布局。
 */

.main-container {
	flex: 1 1 auto;
	min-height: 0;
	display: flex;
	overflow: hidden;
	/* 教程遮罩是 absolute 定位，需要一个定位祖先把范围限制在内容区内 */
	position: relative;

	/**
	 * 首屏入场：内容区柔和浮现。
	 *
	 * 只给内容区、不给标题栏——标题栏立即出现才能给人「已经启动好了」的感觉，
	 * 两处一起淡入反而显得整台机器在慢慢苏醒。
	 * 用 opacity 而不是 transform：这里包着 sticky 工具栏，transform 会破坏它的定位。
	 * 只在应用启动时播一次（.main-container 不随路由重建）。
	 */
	animation: content-in var(--dur-5) var(--ease-dec);

	/**
	 * 页面根节点直接吃满剩余空间。
	 *
	 * 这里只给尺寸，**不要设 display / flex-direction**：
	 * 实测 a-dropdown 并不会生成包裹元素，slot 内容（.app-main 或 .app-page）
	 * 就是本容器的直接子元素。它们各自已经定义了布局方向
	 * （.app-main 是横向、.app-page 是纵向滚动），外层再强行规定方向
	 * 会把「侧栏 + 内容」压成上下堆叠。
	 */
	> * {
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
	}
}

@keyframes content-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

/* 新手教程遮罩层 */
.tutorial {
	position: absolute;
	width: 100%;
	height: 100%;
	background-color: rgba(16, 24, 40, 0.4);
	z-index: 100;
	top: 0;
	left: 0;
}

/** 浏览器编辑抽屉导航栏样式 */
.bp-toc {
	position: absolute;
	background: var(--surface-raised);
	z-index: 999;
	right: 400px;

	animation-duration: var(--dur-3);
	animation-name: slide-in;
	animation-timing-function: var(--ease-dec);
	padding: 4px;
	border: 1px solid var(--border-subtle);
	border-radius: var(--r-md) 0 0 var(--r-md);
	font-size: var(--fs-12);
	top: 24px;
	color: var(--text-tertiary);
	box-shadow: var(--shadow-lg);

	* {
		cursor: pointer;
		margin: 6px 0 6px 6px;
		padding: 4px;
		border-radius: var(--r-xs);
		transition: background-color var(--dur-1) var(--ease-std), color var(--dur-1) var(--ease-std);

		&:hover {
			background-color: var(--surface-hover);
			color: var(--text-primary);
		}
	}
}

@keyframes slide-in {
	from {
		top: -500px;
	}

	to {
		top: 24px;
	}
}
</style>
