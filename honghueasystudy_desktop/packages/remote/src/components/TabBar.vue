<template>
	<nav
		class="tabbar"
		aria-label="主导航"
	>
		<div class="tabbar__inner">
			<button
				v-for="item in NAV_ITEMS"
				:key="item.key"
				type="button"
				class="tab"
				:class="{ active: ui.tab === item.key }"
				@click="ui.tab = item.key"
			>
				<span class="tab__icon">
					<Icon
						:name="item.icon"
						:size="20"
					/>
					<i
						v-if="item.key === 'home' && runningCount > 0"
						class="tab__dot"
					></i>
				</span>
				<span class="tab__label">{{ item.label }}</span>
			</button>
		</div>
	</nav>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import { NAV_ITEMS } from '../nav';
import { state, ui } from '../store';

const runningCount = computed(
	() => state.browsers.filter((b) => b.status === 'launched' || b.status === 'launching').length
);
</script>

<style scoped>
.tabbar {
	position: fixed;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 40;
	padding: 0 0 calc(var(--safe-bottom) + 4px);
	background: var(--tabbar-bg);
	backdrop-filter: blur(18px) saturate(120%);
	-webkit-backdrop-filter: blur(18px) saturate(120%);
}

.tabbar__inner {
	display: flex;
	gap: 2px;
	padding: 6px 10px;
}

.tab {
	flex: 1;
	min-height: 46px;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 3px;
	border-radius: 12px;
	color: var(--text-3);
	font-size: 11px;
	font-weight: 500;
	transition: color 0.18s var(--ease), background 0.18s var(--ease);
}

.tab:active {
	background: var(--surface);
}

.tab.active {
	color: var(--text);
}

.tab.active :deep(svg) {
	color: var(--brand-text);
}

.tab__icon {
	position: relative;
	display: grid;
	place-items: center;
	width: 26px;
	height: 22px;
}

.tab__dot {
	position: absolute;
	top: 1px;
	right: 1px;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--ok);
	box-shadow: 0 0 0 2px var(--bg);
}

.tab__label {
	letter-spacing: 0.02em;
}

@media (min-width: 720px) {
	.tabbar {
		left: 50%;
		right: auto;
		transform: translateX(-50%);
		bottom: calc(var(--safe-bottom) + 14px);
		width: min(400px, calc(100% - 40px));
		border: 1px solid var(--line);
		border-radius: 18px;
		padding: 0;
		background: var(--surface-solid);
		box-shadow: 0 20px 46px -20px rgba(0, 0, 0, 0.55);
	}

	html[data-theme='light'] .tabbar {
		box-shadow: 0 20px 42px -22px rgba(20, 24, 32, 0.3);
	}

	.tabbar__inner {
		padding: 5px;
	}

	.tab {
		min-height: 44px;
		border-radius: 14px;
		flex-direction: row;
		gap: 7px;
		font-size: 12.5px;
	}

	.tab.active {
		background: var(--brand-soft);
	}

	.tab.active :deep(svg) {
		color: var(--brand-text);
	}
}

@media (min-width: 1024px) {
	.tabbar {
		display: none;
	}
}
</style>
