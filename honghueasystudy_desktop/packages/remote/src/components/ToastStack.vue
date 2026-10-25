<template>
	<div class="toasts">
		<TransitionGroup name="toast">
			<div
				v-for="item in state.toasts"
				:key="item.id"
				class="toast"
				:class="item.type"
			>
				{{ item.text }}
			</div>
		</TransitionGroup>
	</div>
</template>

<script setup lang="ts">
import { state } from '../store';
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
	max-width: 420px;
	padding: 10px 16px;
	border-radius: 14px;
	font-size: 13px;
	line-height: 1.5;
	background: rgba(24, 29, 39, 0.96);
	border: 1px solid var(--line-strong);
	box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.8);
	backdrop-filter: blur(16px);
}

.toast.success {
	border-color: rgba(61, 220, 151, 0.4);
	color: #b8f5da;
}

.toast.error {
	border-color: rgba(255, 92, 122, 0.42);
	color: #ffc4cf;
}

.toast-enter-active,
.toast-leave-active {
	transition: opacity 0.22s var(--ease), transform 0.22s var(--ease);
}

.toast-enter-from,
.toast-leave-to {
	opacity: 0;
	transform: translateY(-8px);
}
</style>
