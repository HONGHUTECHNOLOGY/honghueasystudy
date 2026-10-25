<template>
	<svg
		:width="size"
		:height="size"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		:stroke-width="strokeWidth"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path
			v-for="(d, index) in paths"
			:key="index"
			:d="d"
		/>
	</svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
	defineProps<{
		name: string;
		size?: number | string;
		strokeWidth?: number;
	}>(),
	{
		size: 20,
		strokeWidth: 1.8
	}
);

const ICONS: Record<string, string[]> = {
	play: ['M8 5.5v13l11-6.5z'],
	stop: ['M7 7h10v10H7z'],
	top: ['M12 19V5', 'M5 12l7-7 7 7'],
	refresh: ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6'],
	logout: ['M15 17l5-5-5-5', 'M20 12H9', 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7'],
	home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5'],
	logs: ['M4 5h16', 'M4 12h16', 'M4 19h10'],
	info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
	chevron: ['M9 6l6 6-6 6'],
	close: ['M6 6l12 12', 'M18 6L6 18'],
	image: ['M3 5h18v14H3z', 'M3 15l5-5 4 4 3-3 6 6'],
	tag: ['M20 12.5 12.5 20 4 11.5V4h7.5z', 'M8 8h.01'],
	plus: ['M12 5v14', 'M5 12h14']
};

const paths = computed(() => ICONS[props.name] || []);
</script>
