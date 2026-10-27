<template>
	<article
		ref="cardEl"
		class="browser-card card"
		:class="browser.status"
		role="button"
		tabindex="0"
		@click="emit('open')"
		@keydown.enter="emit('open')"
	>
		<header class="head">
			<span
				class="dot"
				:class="statusMeta.dot"
			></span>
			<h3 class="name ellipsis">{{ browser.name }}</h3>
			<span
				class="chip"
				:class="statusMeta.tone"
			>
				{{ statusMeta.label }}
			</span>
			<span class="chev">
				<Icon
					name="chevron"
					:size="14"
				/>
			</span>
		</header>

		<div
			v-if="browser.tags.length || browser.notes"
			class="meta"
		>
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
				<span
					v-if="browser.tags.length > 3"
					class="tag tag--more"
					>+{{ browser.tags.length - 3 }}</span
				>
			</div>
			<p
				v-else
				class="notes faint ellipsis"
			>
				{{ browser.notes }}
			</p>
		</div>

		<div
			class="preview"
			:class="{ empty: !thumb, live: browser.status === 'launched' }"
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
				<span>{{ placeholderText }}</span>
			</div>
			<span
				v-if="browser.status === 'launched'"
				class="preview__live"
			>
				<i></i>
				LIVE
			</span>
		</div>

		<div
			v-if="currentPage"
			class="page-line"
		>
			<Icon
				name="link"
				:size="12"
			/>
			<span class="ellipsis">{{ currentPage.title || currentPage.url }}</span>
		</div>

		<div
			class="actions"
			@click.stop
		>
			<button
				v-if="browser.status === 'closed'"
				type="button"
				class="btn btn-sm btn-primary"
				:disabled="!!pending"
				@click="launch"
			>
				<Icon
					name="play"
					:size="14"
				/>
				启动
			</button>

			<template v-else>
				<button
					type="button"
					class="btn btn-sm"
					:disabled="!!pending || browser.status !== 'launched'"
					@click="bringToFront"
				>
					<Icon
						name="top"
						:size="14"
					/>
					置顶
				</button>
				<button
					type="button"
					class="btn btn-sm btn-danger"
					:disabled="!!pending"
					@click="close"
				>
					<Icon
						name="stop"
						:size="14"
					/>
					关闭
				</button>
			</template>

			<span
				v-if="pending"
				class="spinner pending"
			></span>
		</div>
	</article>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { BrowserSnapshot, snapshotUrl } from '../api';
import { runCommand, state } from '../store';

const props = defineProps<{ browser: BrowserSnapshot }>();
const emit = defineEmits<{ (e: 'open'): void }>();

const thumb = ref('');
/** 连续拉图失败次数：失败时清掉旧图给出可见反馈，避免画面永远停格在过期截图上 */
const thumbFailed = ref(0);
const visible = ref(false);
const cardEl = ref<HTMLElement | null>(null);

const pending = computed(() => state.pending[props.browser.uid]);

const STATUS_META: Record<string, { label: string; dot: string; tone: string }> = {
	closed: { label: '未运行', dot: 'off', tone: 'tone-off' },
	launching: { label: '启动中', dot: 'warn', tone: 'tone-warn' },
	launched: { label: '运行中', dot: 'ok', tone: 'tone-ok' },
	closing: { label: '关闭中', dot: 'warn', tone: 'tone-warn' }
};

const statusMeta = computed(() => STATUS_META[props.browser.status] || STATUS_META.closed);

const currentPage = computed(() => {
	const pages = props.browser.pages || [];
	return pages.length ? pages[pages.length - 1] : null;
});

const placeholderText = computed(() => {
	if (props.browser.status === 'launching') return '正在启动浏览器…';
	if (props.browser.status === 'launched') {
		return thumbFailed.value >= 3 ? '画面获取失败，正在重试…' : '正在获取画面…';
	}
	return '实例未运行';
});

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
	/** 先预加载再替换 src，避免图片切换时闪烁 */
	const img = new Image();
	img.onload = () => {
		thumbFailed.value = 0;
		thumb.value = url;
	};
	img.onerror = () => {
		thumbFailed.value += 1;
		// 连续 3 次失败清掉旧图，让占位文案露出「画面获取失败」
		if (thumbFailed.value >= 3) {
			thumb.value = '';
		}
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
			thumbFailed.value = 0;
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
	position: relative;
	max-width: 620px;
	padding: 13px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	cursor: pointer;
	transition: border-color 0.22s var(--ease), background 0.22s var(--ease), transform 0.22s var(--ease),
		box-shadow 0.22s var(--ease);
}

.browser-card:hover {
	border-color: var(--line-strong);
	transform: translateY(-2px);
	box-shadow: var(--shadow-2);
}

.browser-card.launched {
	border-color: rgba(124, 108, 255, 0.22);
}

html[data-theme='light'] .browser-card.launched {
	border-color: rgba(99, 91, 255, 0.24);
}

.browser-card:hover.launched {
	border-color: rgba(124, 108, 255, 0.38);
}

/* ------------------------------------------------------------------ 头部 */

.head {
	display: flex;
	align-items: center;
	gap: 8px;
}

.name {
	margin: 0;
	font-size: 14.5px;
	font-weight: 600;
	letter-spacing: -0.01em;
	min-width: 0;
	flex: 1;
}

.chip {
	font-size: 10.5px;
	font-weight: 550;
	padding: 2px 8px;
	border-radius: 999px;
	border: 1px solid var(--line);
	color: var(--text-3);
	background: var(--surface);
	flex: none;
	letter-spacing: 0.01em;
}

.chip.tone-ok {
	color: var(--ok);
	border-color: rgba(53, 211, 154, 0.28);
	background: var(--ok-soft);
}

.chip.tone-warn {
	color: var(--warn);
	border-color: rgba(255, 182, 72, 0.28);
	background: var(--warn-soft);
}

.chev {
	color: var(--text-3);
	display: grid;
	place-items: center;
	flex: none;
	transition: transform 0.2s var(--ease), color 0.2s var(--ease);
}

.browser-card:hover .chev {
	color: var(--text-2);
	transform: translateX(2px);
}

/* ------------------------------------------------------------------ 元信息 */

.meta {
	display: flex;
	padding-left: 15px;
	margin-top: -4px;
}

.tags {
	display: flex;
	gap: 5px;
	flex-wrap: wrap;
}

.tag {
	font-size: 10.5px;
	padding: 1px 7px;
	border-radius: 999px;
	border: 1px solid;
	line-height: 1.55;
}

.tag--more {
	border-color: var(--line);
	color: var(--text-3);
}

.notes {
	margin: 0;
	font-size: 11.5px;
}

/* ------------------------------------------------------------------ 预览 */

.preview {
	position: relative;
	width: 100%;
	aspect-ratio: 16 / 10;
	border-radius: 12px;
	overflow: hidden;
	background: var(--preview-bg);
	border: 1px solid var(--line);
}

.preview img {
	width: 100%;
	height: 100%;
	object-fit: cover;
	animation: fade-up 0.35s var(--ease);
}

.preview.live::after {
	content: '';
	position: absolute;
	inset: 0;
	border-radius: inherit;
	box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
	pointer-events: none;
}

.preview__live {
	position: absolute;
	left: 8px;
	top: 8px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	height: 18px;
	padding: 0 6px;
	border-radius: 6px;
	font-size: 9px;
	font-weight: 650;
	letter-spacing: 0.1em;
	color: #fff;
	background: rgba(0, 0, 0, 0.42);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
}

.preview__live i {
	width: 5px;
	height: 5px;
	border-radius: 50%;
	background: var(--ok);
	animation: pulse-ok 2s var(--ease) infinite;
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
	font-size: 11.5px;
}

/* ------------------------------------------------------------------ 页面与操作 */

.page-line {
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 11.5px;
	color: var(--text-2);
	min-width: 0;
	margin-top: -2px;
}

.page-line :deep(svg) {
	flex: none;
	color: var(--text-3);
}

.actions {
	display: flex;
	gap: 7px;
	align-items: center;
	margin-top: auto;
	padding-top: 2px;
}

.actions .btn {
	flex: 1;
}

.pending {
	width: 15px;
	height: 15px;
	flex: none;
}
</style>
