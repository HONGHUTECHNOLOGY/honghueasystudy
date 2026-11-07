<template>
	<div class="app-title">
		<!-- 品牌：点击回官网。no-drag 由 .app-title a/button 统一处理，这里保留手型 -->
		<span
			class="app-title__brand no-drag"
			:title="'鸿鹄易学 · 打开官网'"
			@click="openSite"
		>
			<img
				class="app-title__logo"
				src="../../public/favicon.png"
				alt=""
			/>
			<span class="app-title__name">鸿鹄易学</span>
		</span>

		<!-- 工具菜单：13 个操作按用途分 4 组 -->
		<TitleBarToolsMenu />

		<!-- macOS 上把当前页名绝对居中（Windows 右上角被原生按钮占着，不放） -->
		<span class="app-title__center">{{ pageTitle }}</span>

		<!-- 右侧：运行状态 + 模式切换 -->
		<div class="app-title__right">
			<StatusBar />
			<div
				class="segmented"
				role="tablist"
				aria-label="界面模式"
			>
				<span
					class="segmented__item"
					:class="{ 'is-active': isSimpleMode }"
					role="tab"
					:aria-selected="isSimpleMode"
					@click="setMode('simple')"
				>
					简洁
				</span>
				<span
					class="segmented__item"
					:class="{ 'is-active': !isSimpleMode }"
					role="tab"
					:aria-selected="!isSimpleMode"
					@click="setMode('professional')"
				>
					专业
				</span>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { store } from '../store/index';
import { router } from '../route';
import { electron } from '../utils/node';
import StatusBar from './StatusBar.vue';
import TitleBarToolsMenu from './TitleBarToolsMenu.vue';

const { shell } = electron;

const OFFICIAL_SITE = 'https://easystudy.honghutech.eu.org';

const isSimpleMode = computed(() => router.currentRoute.value.path === '/simple');

/** 当前页名：给 macOS 的居中标题用 */
const pageTitle = computed(() => {
	const name = router.currentRoute.value.name;
	const meta = router.currentRoute.value.meta as { title?: string };
	if (meta?.title) return meta.title;
	if (name === 'simple') return '简洁模式';
	if (name === 'bookmarks') return '学习平台';
	if (name === 'guide') return '使用指南';
	if (name === 'about') return '关于';
	return '鸿鹄易学';
});

function openSite() {
	shell.openExternal(OFFICIAL_SITE);
}

/**
 * 切到指定模式
 *
 * 原来是单个按钮显示「目标模式」（在简洁模式里显示"专业模式"）配左右箭头，
 * 用户看不出当前在哪。现在拆成两个明确的目标项，当前项高亮，
 * 但写入的值与跳转的路由和原来完全一致，习惯零改变。
 */
function setMode(mode: 'simple' | 'professional') {
	if (mode === 'simple') {
		if (isSimpleMode.value) return;
		store.render.setting.mode = 'simple';
		router.push('/simple');
	} else {
		if (!isSimpleMode.value) return;
		store.render.setting.mode = 'professional';
		router.push('/browsers');
	}
}
</script>

<style scoped lang="less">
/**
 * 标题栏的几何（高度、左右原生按钮避让、拖拽区）全部在 styles/shell.less。
 * 这里只处理标题栏内部的排版。
 */

.app-title__brand {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	padding: 0 8px 0 4px;
	height: 26px;
	border-radius: var(--r-sm);
	cursor: pointer;
	transition: background-color var(--dur-2) var(--ease-std);

	&:hover {
		background: var(--surface-hover);
	}
}

.app-title__logo {
	width: 17px;
	height: 17px;
	border-radius: var(--r-xs);
	transition: transform var(--dur-3) var(--ease-dec);
}

.app-title__brand:hover .app-title__logo {
	transform: scale(1.08);
}

/** 品牌名在窄窗口下让位：空间不够时优先保住工具与模式开关 */
.app-title__name {
	font-size: var(--fs-12);
	font-weight: var(--fw-semibold);
	letter-spacing: -0.01em;
	color: var(--text-primary);
	white-space: nowrap;
}

@media (max-width: 720px) {
	.app-title__name {
		display: none;
	}
}

.app-title__right {
	display: flex;
	align-items: center;
	gap: 10px;
	/* 推到最右：左侧内容宽度变化时不会带动右侧 */
	margin-left: auto;
}
</style>
