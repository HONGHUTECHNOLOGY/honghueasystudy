<template>
	<div
		ref="cardEl"
		class="browser-card card"
		:class="{ active: browser.status === 'launched' }"
		@click="emit('open')"
	>
		<div class="head">
			<div class="title-row">
				<span
					class="dot"
					:class="statusMeta.dot"
				></span>
				<span class="name ellipsis">{{ browser.name }}</span>
				<span class="status">{{ statusMeta.label }}</span>
			</div>

			<div
				v-if="browser.tags.length"
				class="tags"
			>
				<span
					v-for="tag in browser.tags.slice(0, 3)"
					:key="tag.name"
					class="tag"
					:style="{ borderColor: tag.color + '55', color: tag.color }"
				>
					{{ tag.name }}
				</span>
			</div>

			<p
				v-else-if="browser.notes"
				class="notes faint ellipsis"
			>
				{{ browser.notes }}
			</p>
		</div>

		<div
			class="preview"
			:class="{ empty: !thumb }"
		>
			<img
				v-if="thumb"
				:src="thumb"
				alt=""
				@error="showPlaceholder"
			/>
			<div
				v-else
				class="placeholder"
			>
				<Icon
					name="image"
					:size="22"
				/>
				<span>{{ browser.status === 'launched' ? '正在获取画面' : '未运行' }}</span>
			</div>
		</div>

		<div
			v-if="browser.pages.length"
			class="page-line faint ellipsis"
		>
			{{ browser.pages[browser.pages.length - 1].title || browser.pages[browser.pages.length - 1].url }}
		</div>

		<div
			class="actions"
			@click.stop
		>
			<button
				v-if="browser.status === 'closed'"
				class="btn btn-sm btn-primary"
				:disabled="!!pending"
				@click="launch"
			>
				<Icon
					name="play"
					:size="15"
				/>
				启动
			</button>

			<template v-else>
				<button
					class="btn btn-sm"
					:disabled="!!pending || browser.status !== 'launched'"
					@click="bringToFront"
				>
					<Icon
						name="top"
						:size="15"
					/>
					置顶
				</button>
				<button
					class="btn btn-sm btn-danger"
					:disabled="!!pending"
					@click="close"
				>
					<Icon
						name="stop"
						:size="15"
					/>
					关闭
				</button>
			</template>

			<span
				v-if="pending"
				class="spinner pending-dot"
			></span>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { BrowserSnapshot, snapshotUrl } from '../api';
import { runCommand, state } from '../store';

const props = defineProps<{ browser: BrowserSnapshot }>();
const emit = defineEmits<{ (e: 'open'): void }>();

const thumb = ref('');
const visible = ref(false);
const cardEl = ref<HTMLElement | null>(null);

const pending = computed(() => state.pending[props.browser.uid]);

const STATUS_META: Record<string, { label: string; dot: string }> = {
	closed: { label: '未运行', dot: 'off' },
	launching: { label: '启动中', dot: 'warn' },
	launched: { label: '运行中', dot: 'ok' },
	closing: { label: '关闭中', dot: 'warn' }
};

const statusMeta = computed(() => STATUS_META[props.browser.status] || STATUS_META.closed);

// ------------------------------------------------------------------ 缩略图

let timer: ReturnType<typeof setInterval> | undefined;
let observer: IntersectionObserver | null = null;

function stopPolling() {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
}

function startPolling() {
	stopPolling();
	if (props.browser.status !== 'launched' || !visible.value) return;
	fetchThumb();
	timer = setInterval(fetchThumb, 2000);
}

function fetchThumb() {
	if (props.browser.status !== 'launched') return;
	const url = snapshotUrl(props.browser.uid);
	const img = new Image();
	img.onload = () => {
		thumb.value = url;
	};
	img.src = url;
}

function showPlaceholder() {
	thumb.value = '';
}

watch(
	() => props.browser.status,
	() => {
		if (props.browser.status !== 'launched') {
			thumb.value = '';
		}
		startPolling();
	}
);

onMounted(() => {
	/** 仅当卡片进入视口时才轮询，避免后台消耗流量 */
	observer = new IntersectionObserver(
		(entries) => {
			visible.value = entries.some((e) => e.isIntersecting);
			startPolling();
		},
		{ threshold: 0.15 }
	);

	const root = cardEl.value;
	if (root) observer.observe(root);
});

onBeforeUnmount(() => {
	stopPolling();
	observer?.disconnect();
});

// ------------------------------------------------------------------ 操作

async function launch() {
	try {
		await runCommand('browser.launch', { uid: props.browser.uid }, props.browser.uid);
	} catch {}
}

async function close() {
	try {
		await runCommand('browser.close', { uid: props.browser.uid }, props.browser.uid);
	} catch {}
}

async function bringToFront() {
	try {
		await runCommand('browser.bringToFront', { uid: props.browser.uid }, props.browser.uid);
	} catch {}
}
</script>

<style scoped>
.browser-card {
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 12px;
	transition: border-color 0.2s var(--ease), transform 0.16s var(--ease);
}

.browser-card:active {
	transform: scale(0.995);
}

.browser-card.active {
	border-color: rgba(79, 140, 255, 0.28);
}

.head {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.title-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.name {
	font-size: 15px;
	font-weight: 600;
	min-width: 0;
	flex: 1;
}

.status {
	font-size: 12px;
	color: var(--text-3);
	flex: none;
}

.tags {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	padding-left: 16px;
}

.tag {
	font-size: 11px;
	padding: 1px 7px;
	border-radius: 999px;
	border: 1px solid;
	line-height: 1.6;
}

.notes {
	margin: 0;
	padding-left: 16px;
	font-size: 12px;
}

.preview {
	position: relative;
	width: 100%;
	aspect-ratio: 16 / 10;
	border-radius: 14px;
	overflow: hidden;
	background: rgba(0, 0, 0, 0.32);
	border: 1px solid var(--line);
}

.preview img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}

.placeholder {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 6px;
	color: var(--text-3);
	font-size: 12px;
}

.page-line {
	font-size: 12px;
	margin-top: -4px;
}

.actions {
	display: flex;
	gap: 8px;
	align-items: center;
}

.actions .btn {
	flex: 1;
}

.pending-dot {
	width: 16px;
	height: 16px;
	flex: none;
}
</style>
