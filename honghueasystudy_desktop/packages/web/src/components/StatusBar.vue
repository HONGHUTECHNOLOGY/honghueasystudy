<template>
	<Transition name="status-bar">
		<span
			v-if="statusBarState.visible"
			class="status-bar"
			:class="'status-bar--' + statusBarState.type"
		>
			<IconLoading
				v-if="statusBarState.loading"
				class="status-bar__spin"
			/>
			<Icon
				v-else-if="statusBarState.icon"
				:type="statusBarState.icon"
			/>
			<span class="status-bar__text">{{ statusBarState.message }}</span>
		</span>
	</Transition>
</template>

<script setup lang="ts">
import Icon from './Icon.vue';
import { IconLoading } from '@arco-design/web-vue/es/icon';
import { statusBarState } from '../utils/statusBar';
</script>

<style scoped lang="less">
/**
 * 状态提示条
 *
 * 颜色从「JS 里按亮/暗两套硬编码 hex + v-bind 注入」改成纯 CSS 类。
 * 原来那套有两个问题：
 *   1. 模板上的 :style 内联 color 优先级高于 CSS 里的暗色规则，
 *      于是暗色主题下状态条一直显示亮色配色（这是现存 bug）；
 *   2. 颜色值不跟设计 token 走，改主题要改两个地方。
 * 现在只按类型选类，亮暗由 token 自动决定。
 */

.status-bar {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	max-width: 320px;
	height: 22px;
	padding: 0 9px;
	/* 状态条是标题栏里的一个小「贴片」，胶囊比圆角矩形更像一个可忽略的提示 */
	border-radius: var(--r-pill);
	font-size: var(--fs-11);
	line-height: 1;
	color: var(--text-secondary);
	background: var(--surface-sunken);
	user-select: none;
	white-space: nowrap;
	overflow: hidden;

	.material-icons {
		font-size: 13px;
		flex: 0 0 auto;
	}
}

.status-bar__text {
	overflow: hidden;
	text-overflow: ellipsis;
}

.status-bar--success {
	color: var(--ok);
	background: var(--ok-subtle);
}

.status-bar--warning {
	color: var(--warn);
	background: var(--warn-subtle);
}

.status-bar--error {
	color: var(--danger);
	background: var(--danger-subtle);
}

/** 加载旋转：只动 transform，不动颜色 */
.status-bar__spin {
	font-size: 12px;
	animation: status-bar-spin 0.9s linear infinite;
}

/**
 * 进出场：只做透明度与 4px 位移。
 * 原来过渡 max-width（0 → auto）会每帧触发布局重排，
 * 在一个位于标题栏的状态条上尤其浪费。
 */
.status-bar-enter-active {
	transition: opacity var(--dur-2) var(--ease-dec), transform var(--dur-2) var(--ease-dec);
}

.status-bar-leave-active {
	transition: opacity var(--dur-1) var(--ease-acc), transform var(--dur-1) var(--ease-acc);
}

.status-bar-enter-from,
.status-bar-leave-to {
	opacity: 0;
	transform: translateY(-3px);
}

@keyframes status-bar-spin {
	from {
		transform: rotate(0deg);
	}
	to {
		transform: rotate(360deg);
	}
}
</style>
