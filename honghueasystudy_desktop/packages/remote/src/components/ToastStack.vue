<template>
	<div class="toasts">
		<TransitionGroup name="toast">
			<div
				v-for="item in state.toasts"
				:key="item.id"
				class="toast"
				:class="item.type"
			>
				<span class="toast__icon">
					<Icon
						:name="iconOf(item.type)"
						:size="14"
						:stroke-width="2"
					/>
				</span>
				<span class="toast__text">{{ item.text }}</span>
			</div>
		</TransitionGroup>
	</div>
</template>

<script setup lang="ts">
import Icon from './Icon.vue';
import { state } from '../store';
import type { ToastItem } from '../store';

function iconOf(type: ToastItem['type']): string {
	if (type === 'success') return 'check';
	if (type === 'error') return 'close';
	return 'info';
}
</script>

<style scoped>
.toasts {
	position: fixed;
	left: 0;
	right: 0;
	top: calc(var(--safe-top) + 12px);
	z-index: 90;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
	pointer-events: none;
	padding: 0 16px;
}

.toast {
	display: flex;
	align-items: center;
	gap: 8px;
	max-width: 440px;
	padding: 9px 14px 9px 11px;
	border-radius: 13px;
	font-size: 12.5px;
	line-height: 1.5;
	background: var(--surface-solid);
	border: 1px solid var(--line-strong);
	box-shadow: 0 16px 36px -16px rgba(0, 0, 0, 0.8);
	backdrop-filter: blur(16px);
	-webkit-backdrop-filter: blur(16px);
}

html[data-theme='light'] .toast {
	box-shadow: 0 18px 38px -20px rgba(20, 24, 32, 0.3);
}

.toast__icon {
	width: 20px;
	height: 20px;
	border-radius: 7px;
	display: grid;
	place-items: center;
	flex: none;
	background: var(--brand-soft);
	color: var(--brand-text);
}

.toast.success .toast__icon {
	background: var(--ok-soft);
	color: var(--ok);
}

.toast.error .toast__icon {
	background: var(--danger-soft);
	color: var(--danger);
}

.toast__text {
	min-width: 0;
}

.toast-enter-active,
.toast-leave-active {
	transition: opacity 0.24s var(--ease), transform 0.24s var(--ease);
}

.toast-enter-from,
.toast-leave-to {
	opacity: 0;
	transform: translateY(-9px) scale(0.98);
}

@media (min-width: 1024px) {
	.toasts {
		left: auto;
		right: 28px;
		top: auto;
		bottom: 28px;
		align-items: flex-end;
		padding: 0;
	}

	.toast-enter-from,
	.toast-leave-to {
		opacity: 0;
		transform: translateY(10px) scale(0.98);
	}
}
</style>
