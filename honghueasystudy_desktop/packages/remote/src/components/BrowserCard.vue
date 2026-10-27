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
			v-if="browser.pages.length > 1"
			class="page-tabs"
			@click.stop
		>
			<button
				v-for="(page, index) in browser.pages"
				:key="index"
				type="button"
				class="page-tab"
				:class="{ on: index === pageIndex, current: page.active }"
				:title="page.title || page.url"
				@click="selectPage(index)"
			>
				{{ index + 1 }}
			</button>
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
			v-if="browser.status === 'launching' && stalled"
			class="sync-line"
			@click.stop="syncNow"
		>
			<Icon
				name="wifi"
				:size="12"
			/>
			<span class="ellipsis">电脑端状态未同步，点此重新获取</span>
		</div>

		<div
			v-if="hasTaskBlock"
			class="task-line"
			:class="{ stale: isStale, done: progress?.finished }"
		>
			<span
				v-if="!isStale"
				class="pulse"
			></span>
			<Icon
				v-else
				name="pause"
				:size="12"
			/>
			<span class="ellipsis">{{ taskText || (isStale ? staleText : '任务进行中') }}</span>
			<span
				v-if="isStale && taskText"
				class="task-stats num stale"
				>{{ staleText }}</span
			>
			<span
				v-else-if="taskStats"
				class="task-stats num"
				>{{ taskStats }}</span
			>
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
				{{ pending ? '启动中…' : '启动' }}
			</button>

			<button
				v-else-if="browser.status === 'launching' && stalled"
				type="button"
				class="btn btn-sm"
				:disabled="syncing"
				@click="syncNow"
			>
				<span
					v-if="syncing"
					class="spinner"
				></span>
				<Icon
					v-else
					name="refresh"
					:size="14"
				/>
				{{ syncing ? '同步中…' : '重新同步' }}
			</button>

			<button
				v-else-if="browser.status === 'launching'"
				type="button"
				class="btn btn-sm btn-primary btn-busy"
				disabled
			>
				<span class="spinner"></span>
				启动中…
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
					:class="{ 'btn-busy': browser.status === 'closing' }"
					:disabled="!!pending || browser.status === 'closing'"
					@click="close"
				>
					<span
						v-if="browser.status === 'closing'"
						class="spinner"
					></span>
					<Icon
						v-else
						name="stop"
						:size="14"
					/>
					{{ browser.status === 'closing' ? '关闭中…' : '关闭' }}
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
import { closeBrowser, isSnapshotStale, launchBrowser, refresh, requestSync, runCommand, state } from '../store';

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

/** 用户手动选中的标签页索引；undefined 表示自动跟随浏览器当前前台页 */
const selectedPage = ref<number | undefined>(undefined);

/** 浏览器当前前台可见页的索引（后端用 visibilityState 判定） */
const activeIndex = computed(() => {
	const pages = props.browser.pages || [];
	for (let i = 0; i < pages.length; i++) {
		if (pages[i].active) return i;
	}
	return undefined;
});

/** 实际用于截图的页面索引：手动选中优先，其次跟随前台页 */
const pageIndex = computed(() => {
	const pages = props.browser.pages || [];
	if (!pages.length) return undefined;
	if (selectedPage.value !== undefined && selectedPage.value < pages.length) return selectedPage.value;
	return activeIndex.value;
});

const currentPage = computed(() => {
	const pages = props.browser.pages || [];
	if (!pages.length) return null;
	const index = pageIndex.value;
	return index !== undefined ? pages[index] : pages[pages.length - 1];
});

// ------------------------------------------------------------------ 任务进度

/** 每 5 秒刷新一次「x 秒前」，让静止状态自己浮现，不必等新快照 */
const now = ref(Date.now());
const nowTimer = setInterval(() => (now.value = Date.now()), 5000);

const progress = computed(() => props.browser.progress);

/** 距最后一次日志输出多久（毫秒）；-1 表示还没有输出 */
const idleMs = computed(() => {
	const last = progress.value?.lastActivityAt || 0;
	if (!last) return -1;
	return Math.max(0, now.value - last);
});

/** 超过这个时长没有新输出，认为任务可能卡住了 */
const STALE_MS = 120 * 1000;

const isStale = computed(() => {
	if (props.browser.status !== 'launched') return false;
	if (progress.value?.finished) return false;
	return idleMs.value >= STALE_MS;
});

/** 进度主文案：当前任务 → 完成态 → 空 */
const taskText = computed(() => {
	const p = progress.value;
	if (!p) return '';
	if (p.finished) return '全部任务已完成';
	if (p.currentTask) return p.currentTask;
	return '';
});

/** 进度副文案：统计数字 */
const taskStats = computed(() => {
	const p = progress.value;
	if (!p) return '';
	const parts: string[] = [];
	if (p.completed > 0) parts.push(`完成 ${p.completed}`);
	if (p.answered > 0) parts.push(`作答 ${p.answered}`);
	if (p.errors > 0) parts.push(`异常 ${p.errors}`);
	return parts.join(' · ');
});

/** 静止提示：优先展示「x 分钟没有输出」，这比堆统计更能说明问题 */
const staleText = computed(() => {
	if (!isStale.value) return '';
	const ms = Math.max(0, idleMs.value);
	if (ms >= 60000) return Math.floor(ms / 60000) + ' 分钟无输出';
	return Math.floor(ms / 1000) + ' 秒无输出';
});

const hasTaskBlock = computed(
	() => props.browser.status === 'launched' && (!!taskText.value || !!taskStats.value || isStale.value)
);

// ------------------------------------------------------------------ 状态同步

/**
 * 快照是否停止推进
 *
 * 桌面端窗口被最小化或遮挡时，渲染进程的上报可能被系统冻结，
 * 主进程只能反复给出最后一份快照——浏览器其实已经启动完成，
 * 远程端却会一直停在「启动中」。这里把这种情况单独标出来，
 * 让用户知道是「状态没同步」而不是「机器卡住了」。
 */
const stalled = computed(() => isSnapshotStale());

const syncing = ref(false);

/** 手动唤醒：催桌面端补报一次，再拉一遍最新状态 */
async function syncNow() {
	if (syncing.value) return;
	syncing.value = true;
	try {
		await requestSync();
		await refresh();
	} finally {
		syncing.value = false;
	}
}

/** 切换查看的标签页；清了旧图避免短暂显示上一页画面 */
function selectPage(index: number) {
	if (index === pageIndex.value) return;
	selectedPage.value = index;
	thumb.value = '';
	thumbFailed.value = 0;
	fetchThumb();
}

/** 标签页数量变化后，手动选中的索引可能失效：重置回「跟随前台页」 */
watch(
	() => (props.browser.pages || []).length,
	(len) => {
		if (selectedPage.value !== undefined && selectedPage.value >= len) {
			selectedPage.value = undefined;
		}
	}
);

const placeholderText = computed(() => {
	if (props.browser.status === 'launching') {
		return stalled.value ? '电脑端未响应，正在重新同步…' : '正在启动浏览器…';
	}
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
	/** 带上选中页索引：不传时后端自动挑选前台可见页 */
	const url = snapshotUrl(props.browser.uid, pageIndex.value);
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
	clearInterval(nowTimer);
	stopPolling();
	observer?.disconnect();
});

// ------------------------------------------------------------------ 操作

async function launch() {
	try {
		await launchBrowser(props.browser.uid);
	} catch {}
}

async function close() {
	try {
		await closeBrowser(props.browser.uid);
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

/**
 * 标签页切换条
 * 只在多标签时出现；选中项以品牌色填充，浏览器当前前台页用底部内阴影标出，
 * 两者都不改变元素尺寸，避免切换时卡片高度跳动。
 */
.page-tabs {
	display: flex;
	gap: 5px;
	overflow-x: auto;
	scrollbar-width: none;
	margin-top: -1px;
}

.page-tabs::-webkit-scrollbar {
	display: none;
}

.page-tab {
	flex: none;
	min-width: 25px;
	height: 22px;
	padding: 0 7px;
	border-radius: 7px;
	border: 1px solid var(--line);
	background: var(--surface-2);
	color: var(--text-2);
	font-size: 11.5px;
	line-height: 1;
	font-variant-numeric: tabular-nums;
	cursor: pointer;
	transition: background 0.15s, color 0.15s, border-color 0.15s;
}

/* 浏览器当前前台显示的标签页 */
.page-tab.current {
	color: var(--text);
	box-shadow: inset 0 -2px 0 var(--line-strong);
}

/* 远程台正在查看的标签页 */
.page-tab.on {
	background: var(--brand);
	border-color: transparent;
	color: #fff;
	box-shadow: none;
}

.page-tab:active {
	transform: scale(0.96);
}

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

/* ---------------------------------------------------------------- 状态同步 */

/* 桌面端停止上报时的提示条：可点，用来手动催一次 */
.sync-line {
	display: flex;
	align-items: center;
	gap: 5px;
	min-width: 0;
	margin-top: -2px;
	padding: 3px 6px;
	border-radius: 6px;
	font-size: 11.5px;
	color: var(--warn, #d9902f);
	background: var(--warn-soft, rgba(217, 134, 19, 0.12));
	cursor: pointer;
}

.sync-line :deep(svg) {
	flex: none;
}

/* ---------------------------------------------------------------- 任务进度 */

.task-line {
	display: flex;
	align-items: center;
	gap: 5px;
	min-width: 0;
	margin-top: -2px;
	font-size: 11.5px;
	color: var(--text-2);
}

.task-line :deep(svg) {
	flex: none;
}

/* 有输出时的小绿点：让人一眼看出脚本还在动 */
.task-line .pulse {
	flex: none;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--ok, #2fbf71);
	animation: task-pulse 1.6s var(--ease, ease) infinite;
}

@keyframes task-pulse {
	0%,
	100% {
		opacity: 1;
		transform: scale(1);
	}
	50% {
		opacity: 0.35;
		transform: scale(0.82);
	}
}

.task-line .ellipsis {
	flex: 1;
	min-width: 0;
}

.task-stats {
	flex: none;
	font-size: 11px;
	color: var(--text-3);
}

.task-stats.stale {
	color: var(--warn, #d98800);
}

/* 长时间没有输出：进度行转为警示色，提示任务可能卡住 */
.task-line.stale {
	color: var(--warn, #d98800);
}

.task-line.stale :deep(svg) {
	color: var(--warn, #d98800);
}

.task-line.done {
	color: var(--ok, #2fbf71);
}

@media (prefers-reduced-motion: reduce) {
	.task-line .pulse {
		animation: none;
	}
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
