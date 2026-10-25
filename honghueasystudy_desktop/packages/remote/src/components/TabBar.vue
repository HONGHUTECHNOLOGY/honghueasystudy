<template>
	<nav class="tabbar">
		<button
			v-for="item in ITEMS"
			:key="item.key"
			class="tab"
			:class="{ active: ui.tab === item.key }"
			@click="ui.tab = item.key"
		>
			<Icon
				:name="item.icon"
				:size="20"
			/>
			<span>{{ item.label }}</span>
		</button>
	</nav>
</template>

<script setup lang="ts">
import Icon from './Icon.vue';
import { ui } from '../store';

const ITEMS: { key: 'home' | 'logs' | 'about'; label: string; icon: string }[] = [
	{ key: 'home', label: '总览', icon: 'home' },
	{ key: 'logs', label: '日志', icon: 'logs' },
	{ key: 'about', label: '我的', icon: 'info' }
];
</script>

<style scoped>
.tabbar {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 40;
	display: flex;
	padding: 6px 12px calc(var(--safe-bottom) + 6px);
	gap: 4px;
	background: linear-gradient(180deg, rgba(7, 9, 13, 0) 0%, rgba(7, 9, 13, 0.86) 42%, rgba(7, 9, 13, 0.98) 100%);
	backdrop-filter: blur(18px);
	-webkit-backdrop-filter: blur(18px);
}

.tab {
	flex: 1;
	min-height: 48px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 2px;
	color: var(--text-3);
	font-size: 11px;
	transition: color 0.16s var(--ease);
}

.tab.active {
	color: var(--text-1);
}

.tab.active :deep(svg) {
	stroke: var(--accent-a);
}
</style>
