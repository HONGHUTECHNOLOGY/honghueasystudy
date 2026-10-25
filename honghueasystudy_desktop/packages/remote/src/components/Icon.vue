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
		focusable="false"
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
		strokeWidth: 1.7
	}
);

const ICONS: Record<string, string[]> = {
	/* 导航 */
	home: ['M3.5 10.6 12 3.4l8.5 7.2', 'M5.6 9.5V20h12.8V9.5', 'M9.9 20v-4.6h4.2V20'],
	logs: ['M5 5.5h14', 'M5 12h14', 'M5 18.5h8'],
	sliders: [
		'M4 8h9',
		'M17 8h3',
		'M4 16h4',
		'M12 16h8',
		'M15 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
		'M10 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0z'
	],
	info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],

	/* 操作 */
	play: ['M8.5 5.6v12.8L19 12z'],
	stop: ['M7.5 7.5h9v9h-9z'],
	top: ['M12 19.5V5', 'M5.5 11.5 12 5l6.5 6.5'],
	refresh: ['M20.5 12a8.5 8.5 0 1 1-2.5-6', 'M20.5 4v5.5H15'],
	logout: ['M15.5 17 20 12l-4.5-5', 'M20 12H9.5', 'M12.5 3.5H6A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h6.5'],
	close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
	chevron: ['M9.5 6.5 15 12l-5.5 5.5'],
	down: ['M12 4.5v15', 'M6 13.5 12 19.5l6-6'],
	copy: [
		'M9 9h9.5v9.5a1.5 1.5 0 0 1-1.5 1.5H9a1.5 1.5 0 0 1-1.5-1.5V10.5A1.5 1.5 0 0 1 9 9z',
		'M15 9V5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H7'
	],
	check: ['M4.5 12.5 9.5 17.5 19.5 6.5'],
	search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M16.2 16.2 21 21'],
	expand: ['M4 9V4h5', 'M20 15v5h-5', 'M15 4h5v5', 'M9 20H4v-5'],
	pause: ['M9 5.5v13', 'M15 5.5v13'],

	/* 状态 / 信息 */
	image: ['M3.5 5.5h17v13h-17z', 'M3.5 15 8.5 10l3.6 3.6L15 11l5.5 5.5', 'M15.4 8.6h.01'],
	tag: ['M20 12.6 12.6 20 4 11.4V4h7.4z', 'M8 8h.01'],
	lock: ['M6.5 10.5h11V20h-11z', 'M8.8 10.5V7.8a3.2 3.2 0 0 1 6.4 0v2.7'],
	key: ['M20 8.5a3.5 3.5 0 1 1-4.6-3.3L7.5 13v3h3l1.3-1.3', 'M15.4 8.5h.01'],
	shield: ['M12 3.5 19 6v6c0 4-3 7-7 8.5C8 19 5 16 5 12V6z', 'M9.2 12l2 2 3.6-3.6'],
	monitor: ['M3.5 5.5h17v10h-17z', 'M9 20h6', 'M12 15.5V20'],
	smartphone: [
		'M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14A1.5 1.5 0 0 1 16 20.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5z',
		'M11 17.5h2'
	],
	wifi: ['M4 9.5a12 12 0 0 1 16 0', 'M7 13a7.5 7.5 0 0 1 10 0', 'M10 16.4a3.2 3.2 0 0 1 4 0', 'M12 20h.01'],
	link: [
		'M10.5 13.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 1 0-5-5L11.6 7.4',
		'M13.5 10.5a3.5 3.5 0 0 0-5 0L6 13a3.5 3.5 0 0 0 5 5l1.4-1.4'
	],
	external: [
		'M14 4.5h5.5V10',
		'M19.5 4.5 11 13',
		'M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h4.5'
	],

	/* 主题 */
	sun: [
		'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
		'M12 2.5v2',
		'M12 19.5v2',
		'M2.5 12h2',
		'M19.5 12h2',
		'M5.2 5.2l1.4 1.4',
		'M17.4 17.4l1.4 1.4',
		'M18.8 5.2l-1.4 1.4',
		'M6.6 17.4l-1.4 1.4'
	],
	moon: ['M20 13.4A8.4 8.4 0 0 1 10.6 4 8.5 8.5 0 1 0 20 13.4z'],
	auto: ['M12 3.5v18', 'M12 3.5a8.5 8.5 0 0 1 0 17z']
};

const paths = computed(() => ICONS[props.name] || []);
</script>
