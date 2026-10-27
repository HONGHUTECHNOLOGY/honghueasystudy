<template>
	<div
		v-if="browser"
		class="mask"
		@click.self="emit('close')"
	>
		<section
			class="sheet"
			role="dialog"
			aria-modal="true"
			:aria-label="browser.name"
		>
			<span class="grabber"></span>

			<header class="head">
				<span
					class="dot"
					:class="statusMeta.dot"
				></span>
				<div class="head__text">
					<h2 class="ellipsis">{{ browser.name }}</h2>
					<p class="faint ellipsis">
						{{ statusMeta.label }}
						<span v-if="browser.tags.length"> · {{ browser.tags.map((t) => t.name).join(' / ') }}</span>
						<span v-else-if="browser.notes"> · {{ browser.notes }}</span>
					</p>
				</div>
				<button
					type="button"
					class="close-btn"
					aria-label="关闭"
					@click="emit('close')"
				>
					<Icon
						name="close"
						:size="17"
					/>
				</button>
			</header>

			<div class="grid">
				<div class="col">
					<div
						class="screen"
						:class="{ ready: !!thumb }"
						@click="openFullscreen"
					>
						<img
							v-if="thumb"
							:src="thumb"
							alt=""
						/>
						<div
							v-else
							class="screen-empty"
						>
							<span class="screen-empty__icon"
								><Icon
									name="image"
									:size="24"
							/></span>
							<span>{{ screenEmptyText }}</span>
						</div>
						<span
							v-if="thumb"
							class="screen-tip"
						>
							<Icon
								name="expand"
								:size="12"
							/>
							查看大图
						</span>
					</div>

					<div class="actions">
						<button
							v-if="browser.status === 'closed'"
							type="button"
							class="btn btn-primary"
							:disabled="!!pending"
							@click="launch"
						>
							<Icon
								name="play"
								:size="15"
							/>
							启动浏览器
						</button>

						<button
							v-else-if="browser.status === 'launching' && stalled"
							type="button"
							class="btn"
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
								:size="15"
							/>
							{{ syncing ? '同步中…' : '状态未同步，重新获取' }}
						</button>

						<button
							v-else-if="browser.status === 'launching'"
							type="button"
							class="btn btn-primary btn-busy"
							disabled
						>
							<span class="spinner"></span>
							启动中…
						</button>

						<template v-else>
							<button
								type="button"
								class="btn"
								:disabled="!!pending || browser.status !== 'launched'"
								@click="bringToFront"
							>
								<Icon
									name="top"
									:size="15"
								/>
								置于最前
							</button>
							<button
								type="button"
								class="btn btn-danger"
								:class="{ 'btn-busy': browser.status === 'closing' }"
								:disabled="!!pending || browser.status === 'closing'"
								@click="closeBrowser"
							>
								<span
									v-if="browser.status === 'closing'"
									class="spinner"
								></span>
								<Icon
									v-else
									name="stop"
									:size="15"
								/>
								{{ browser.status === 'closing' ? '关闭中…' : '关闭' }}
							</button>
						</template>

						<span
							v-if="pending && browser.status === 'closed'"
							class="spinner"
						></span>
					</div>
				</div>

				<div class="col">
					<div
						v-if="browser.status === 'launched'"
						class="block block--task"
						:class="{ stale: isStale, done: progress?.finished }"
					>
						<p class="block__title">
							<span>任务进度</span>
							<span class="faint">{{ progress?.finished ? '已完成' : playing ? '播放中' : isStale ? '无输出' : '进行中' }}</span>
						</p>

						<p
							v-if="taskTitle"
							class="task-now"
							:title="taskTitle"
						>
							{{ taskTitle }}
						</p>
						<p
							v-else
							class="task-now faint"
						>
							等待脚本输出任务节点…
						</p>

						<p
							v-if="mediaText"
							class="task-media"
							:class="{ playing }"
						>
							<Icon
								:name="playing ? 'play' : 'pause'"
								:size="12"
							/>
							{{ mediaText }}
						</p>

						<p
							v-if="isStale"
							class="task-alert"
						>
							<Icon
								name="pause"
								:size="12"
							/>
							已 {{ staleText }}无输出，任务可能卡住
						</p>

						<div class="task-stats">
							<div class="stat">
								<b class="num">{{ progress?.completed || 0 }}</b>
								<span>完成任务</span>
							</div>
							<div class="stat">
								<b class="num">{{ progress?.answered || 0 }}</b>
								<span>已作答</span>
							</div>
							<div
								class="stat"
								:class="{ bad: (progress?.errors || 0) > 0 }"
							>
								<b class="num">{{ progress?.errors || 0 }}</b>
								<span>异常</span>
							</div>
						</div>

						<p class="task-meta faint">已运行 {{ runtimeText }} · 最后活动 {{ lastActivityText }}</p>
					</div>

					<div
						v-if="browser.pages.length"
						class="block"
					>
						<p class="block__title">
							<span>打开的页面</span>
							<span class="faint num">{{ browser.pages.length }}</span>
						</p>
						<div class="pages">
							<button
								v-for="(page, index) in browser.pages"
								:key="index"
								type="button"
								class="page-item"
								:class="{ on: index === pageIndex }"
								:title="page.url"
								@click="selectPage(index)"
							>
								<span class="page-index num">{{ index + 1 }}</span>
								<span class="page-text">
									<span class="page-title ellipsis">
										{{ page.title || '（无标题）' }}
										<span
											v-if="page.active"
											class="page-now"
											>当前</span
										>
									</span>
									<span class="page-url faint ellipsis">{{ page.url }}</span>
								</span>
								<span
									v-if="index === pageIndex"
									class="page-check"
								>
									<Icon
										name="check"
										:size="13"
									/>
								</span>
							</button>
						</div>
					</div>

					<div class="block block--log">
						<p class="block__title">
							<span>最近日志</span>
							<span class="faint num">{{ logLines.length }} 行</span>
						</p>
						<div class="log-body">
							<p
								v-for="(line, index) in logLines"
								:key="index"
								class="log-line"
							>
								{{ line }}
							</p>
							<p
								v-if="logLines.length === 0"
								class="faint log-empty"
							>
								暂无日志输出
							</p>
						</div>
					</div>
				</div>
			</div>
		</section>

		<div
			v-if="fullscreen && thumb"
			class="fullscreen"
			@click="fullscreen = false"
		>
			<img
				:src="thumb"
				alt=""
			/>
			<p class="faint">点击任意处退出</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from './Icon.vue';
import { snapshotUrl } from '../api';
import {
	closeBrowser as closeBrowserAction,
	isSnapshotStale,
	launchBrowser,
	refresh,
	requestSync,
	runCommand,
	state,
	ui
} from '../store';
import { formatAgo, formatDuration } from '../utils';

const emit = defineEmits<{ (e: 'close'): void }>();

const thumb = ref('');
/** 连续拉图失败次数：失败时清掉旧图给出可见反馈，避免画面永远停格在过期截图上 */
const thumbFailed = ref(0);
const fullscreen = ref(false);

const browser = computed(() => state.browsers.find((b) => b.uid === ui.detailUid));

const STATUS_META: Record<string, { label: string; dot: string }> = {
	closed: { label: '未运行', dot: 'off' },
	launching: { label: '启动中', dot: 'warn' },
	launched: { label: '运行中', dot: 'ok' },
	closing: { label: '关闭中', dot: 'warn' }
};

const statusMeta = computed(() => STATUS_META[browser.value?.status || 'closed'] || STATUS_META.closed);
const pending = computed(() => state.pending[ui.detailUid]);

/** 快照是否停止推进（桌面端上报被冻结时会一直停在「启动中」） */
const stalled = computed(() => isSnapshotStale());

/**
 * 无画面时的占位文案
 *
 * 之前启动中也显示「实例未运行」，看起来像自相矛盾：
 * 明明正在启动，却说没运行，用户会以为启动命令丢了。
 */
const screenEmptyText = computed(() => {
	const status = browser.value?.status;
	if (status === 'launched') {
		return thumbFailed.value >= 3 ? '画面获取失败，正在重试…' : '正在获取画面…';
	}
	if (status === 'launching') return stalled.value ? '电脑端未响应，正在重新同步…' : '正在启动浏览器…';
	if (status === 'closing') return '正在关闭浏览器…';
	return '实例未运行';
});

const syncing = ref(false);

/** 唤醒桌面端补报一次快照 */
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

/** 用户手动点选的标签页索引；undefined 表示自动跟随浏览器当前前台页 */
const selectedPage = ref<number | undefined>(undefined);

/** 浏览器当前前台可见页的索引（后端用 visibilityState 判定） */
const activeIndex = computed(() => {
	const pages = browser.value?.pages || [];
	for (let i = 0; i < pages.length; i++) {
		if (pages[i].active) return i;
	}
	return undefined;
});

/** 实际用于截图的页面索引：手动选中优先，其次跟随前台页 */
const pageIndex = computed(() => {
	const pages = browser.value?.pages || [];
	if (!pages.length) return undefined;
	if (selectedPage.value !== undefined && selectedPage.value < pages.length) return selectedPage.value;
	return activeIndex.value;
});

/** 切换查看的标签页；先清图避免短暂显示上一页画面 */
function selectPage(index: number) {
	if (index === pageIndex.value) return;
	selectedPage.value = index;
	thumb.value = '';
	thumbFailed.value = 0;
	fetchThumb();
}

/** 标签页数量变化后，手动选中的索引可能失效：重置回「跟随前台页」 */
watch(
	() => (browser.value?.pages || []).length,
	(len) => {
		if (selectedPage.value !== undefined && selectedPage.value >= len) {
			selectedPage.value = undefined;
		}
	}
);

const logLines = computed(() => {
	const raw = state.logs[ui.detailUid] || [];
	const result: string[] = [];
	raw.forEach((chunk) => {
		String(chunk)
			.split(/\r?\n/)
			.filter((line) => line.trim().length > 0)
			.forEach((line) => result.push(line));
	});
	return result.slice(-40);
});

// ------------------------------------------------------------------ 任务进度

/** 每 5 秒刷新一次，让「已运行」「最后活动」自己走字，不依赖新快照 */
const now = ref(Date.now());
const nowTimer = setInterval(() => (now.value = Date.now()), 5000);

const progress = computed(() => browser.value?.progress);

const runtimeText = computed(() => {
	const startedAt = progress.value?.startedAt || 0;
	if (!startedAt) return '—';
	return formatDuration(Math.max(0, now.value - startedAt));
});

const lastActivityText = computed(() => {
	const last = progress.value?.lastActivityAt || 0;
	if (!last) return '暂无输出';
	return formatAgo(last, now.value);
});

/** 距最后一次输出多久（毫秒）；-1 表示还没有输出 */
const idleMs = computed(() => {
	const last = progress.value?.lastActivityAt || 0;
	if (!last) return -1;
	return Math.max(0, now.value - last);
});

const STALE_MS = 10 * 60 * 1000;

/**
 * 视频播放状态
 *
 * 网课一个视频几十分钟，播放期间本来就没有日志输出。
 * 播放中一律不算「卡住」，改为展示播放进度。
 */
const media = computed(() => browser.value?.media || null);
const playing = computed(() => !!media.value?.playing);

/** 任务长时间没有输出：可能卡在某个环节，值得在详情里明确提示 */
const isStale = computed(() => {
	if (browser.value?.status !== 'launched') return false;
	if (progress.value?.finished) return false;
	if (playing.value) return false;
	return idleMs.value >= STALE_MS;
});

/** 播放进度：播放中 12:30 / 45:00 */
const mediaText = computed(() => {
	const m = media.value;
	if (!m) return '';
	const at = formatClock(m.currentTime);
	const total = m.duration > 0 ? ' / ' + formatClock(m.duration) : '';
	if (m.playing) return '播放中 ' + at + total;
	if ((m.currentTime || 0) > 0) return '已暂停 ' + at + total;
	return '';
});

/** 秒 → 12:30 / 1:02:30 */
function formatClock(seconds: number) {
	const total = Math.max(0, Math.floor(seconds || 0));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const mm = String(m).padStart(2, '0');
	const ss = String(s).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

const taskTitle = computed(() => {
	const p = progress.value;
	if (!p) return '';
	if (p.finished) return '全部任务已完成';
	return p.currentTask || '';
});

/** 静止时长文案：3 分钟 / 42 秒 */
const staleText = computed(() => {
	if (!isStale.value) return '';
	const ms = Math.max(0, idleMs.value);
	if (ms >= 60000) return Math.floor(ms / 60000) + ' 分钟';
	return Math.floor(ms / 1000) + ' 秒';
});

// ------------------------------------------------------------------ 画面

let timer: ReturnType<typeof setInterval> | undefined;

function stopPolling() {
	if (timer) {
		clearInterval(timer);
		timer = undefined;
	}
}

function fetchThumb() {
	const target = browser.value;
	if (!target || target.status !== 'launched' || document.visibilityState !== 'visible') return;

	const url = snapshotUrl(target.uid, pageIndex.value);
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

function startPolling() {
	stopPolling();
	const target = browser.value;
	if (!target || target.status !== 'launched') {
		thumb.value = '';
		thumbFailed.value = 0;
		return;
	}
	fetchThumb();
	timer = setInterval(fetchThumb, 2000);
}

watch(
	() => browser.value && browser.value.status,
	() => startPolling()
);

function onVisibility() {
	if (document.visibilityState === 'visible') {
		fetchThumb();
	}
}

function onKeydown(event: KeyboardEvent) {
	if (event.key !== 'Escape') return;
	if (fullscreen.value) {
		fullscreen.value = false;
		return;
	}
	emit('close');
}

function openFullscreen() {
	if (thumb.value) fullscreen.value = true;
}

onMounted(() => {
	document.body.style.overflow = 'hidden';
	document.addEventListener('visibilitychange', onVisibility);
	document.addEventListener('keydown', onKeydown);
	startPolling();
});

onBeforeUnmount(() => {
	clearInterval(nowTimer);
	document.body.style.overflow = '';
	document.removeEventListener('visibilitychange', onVisibility);
	document.removeEventListener('keydown', onKeydown);
	stopPolling();
});

// ------------------------------------------------------------------ 操作

async function launch() {
	const target = browser.value;
	if (!target) return;
	try {
		await launchBrowser(target.uid);
	} catch {}
}

async function closeBrowser() {
	const target = browser.value;
	if (!target) return;
	try {
		await closeBrowserAction(target.uid);
	} catch {}
}

async function bringToFront() {
	const target = browser.value;
	if (!target) return;
	try {
		await runCommand('browser.bringToFront', { uid: target.uid }, target.uid);
	} catch {}
}
</script>

<style scoped>
.mask {
	position: fixed;
	inset: 0;
	z-index: 60;
	background: var(--overlay);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
	display: flex;
	align-items: flex-end;
	justify-content: center;
	animation: fade-in 0.22s var(--ease);
}

@keyframes fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

.sheet {
	width: 100%;
	max-width: 660px;
	max-height: 92vh;
	overflow-y: auto;
	background: var(--sheet-bg);
	border: 1px solid var(--line);
	border-bottom: none;
	border-radius: 22px 22px 0 0;
	padding: 8px 16px calc(var(--safe-bottom) + 18px);
	animation: slide-up 0.3s var(--ease);
	-webkit-overflow-scrolling: touch;
	overscroll-behavior: contain;
}

@keyframes slide-up {
	from {
		transform: translateY(26px);
		opacity: 0.5;
	}
	to {
		transform: translateY(0);
		opacity: 1;
	}
}

.grabber {
	width: 34px;
	height: 4px;
	border-radius: 999px;
	background: var(--line-strong);
	margin: 2px auto 12px;
}

/* ------------------------------------------------------------------ 头部 */

.head {
	display: flex;
	align-items: flex-start;
	gap: 9px;
	margin-bottom: 14px;
	padding-top: 2px;
}

.head .dot {
	margin-top: 8px;
}

.head__text {
	flex: 1;
	min-width: 0;
}

.head h2 {
	margin: 0;
	font-size: 16.5px;
	font-weight: 650;
	letter-spacing: -0.01em;
}

.head p {
	margin: 2px 0 0;
	font-size: 11.5px;
}

.close-btn {
	width: 32px;
	height: 32px;
	border-radius: 10px;
	display: grid;
	place-items: center;
	background: var(--surface-2);
	color: var(--text-2);
	flex: none;
	transition: background 0.18s var(--ease), color 0.18s var(--ease);
}

.close-btn:hover {
	background: var(--surface-2);
	color: var(--text);
}

/* ------------------------------------------------------------------ 内容 */

.grid {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.col {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-width: 0;
}

.screen {
	position: relative;
	width: 100%;
	aspect-ratio: 16 / 10;
	border-radius: 14px;
	overflow: hidden;
	background: var(--preview-bg);
	border: 1px solid var(--line);
	cursor: zoom-in;
}

.screen img {
	width: 100%;
	height: 100%;
	object-fit: contain;
	background: rgba(0, 0, 0, 0.2);
}

.screen-empty {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 9px;
	color: var(--text-3);
	font-size: 12px;
	cursor: default;
}

.screen-empty__icon {
	width: 44px;
	height: 44px;
	border-radius: 14px;
	display: grid;
	place-items: center;
	background: var(--surface);
	border: 1px solid var(--line);
}

.screen-tip {
	position: absolute;
	right: 8px;
	bottom: 8px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-size: 10.5px;
	padding: 3px 8px;
	border-radius: 999px;
	background: rgba(0, 0, 0, 0.5);
	color: rgba(255, 255, 255, 0.86);
	backdrop-filter: blur(6px);
	-webkit-backdrop-filter: blur(6px);
}

.actions {
	display: flex;
	gap: 9px;
	align-items: center;
}

.actions .btn {
	flex: 1;
}

/* ------------------------------------------------------------------ 页面 / 日志 */

.block {
	border-radius: 14px;
	border: 1px solid var(--line);
	background: var(--surface);
	overflow: hidden;
}

.block__title {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin: 0;
	padding: 9px 12px;
	font-size: 11.5px;
	font-weight: 550;
	color: var(--text-2);
	border-bottom: 1px solid var(--line);
}

/* ------------------------------------------------------------------ 任务进度 */

.block--task {
	padding-bottom: 10px;
}

.task-now {
	margin: 10px 12px 0;
	font-size: 13px;
	line-height: 1.45;
	color: var(--text);
	word-break: break-all;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.block--task.done .task-now {
	color: var(--ok);
}

.task-alert {
	display: flex;
	align-items: center;
	gap: 5px;
	margin: 8px 12px 0;
	padding: 6px 9px;
	border-radius: 8px;
	background: var(--warn-soft);
	color: var(--warn);
	font-size: 11.5px;
}

/* 视频播放进度：证明「没有日志」是正常的 */
.task-media {
	display: flex;
	align-items: center;
	gap: 5px;
	margin: 8px 12px 0;
	font-size: 11.5px;
	color: var(--text-3);
	font-variant-numeric: tabular-nums;
}

.task-media :deep(svg) {
	flex: none;
}

.task-media.playing {
	color: var(--ok);
}

.task-alert :deep(svg) {
	flex: none;
}

.task-stats {
	display: flex;
	gap: 8px;
	margin: 10px 12px 0;
}

.task-stats .stat {
	flex: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 2px;
	padding: 7px 4px;
	border-radius: 9px;
	background: var(--surface-2);
}

.task-stats .stat b {
	font-size: 15px;
	font-weight: 600;
	color: var(--text);
	line-height: 1.1;
}

.task-stats .stat span {
	font-size: 10.5px;
	color: var(--text-3);
}

.task-stats .stat.bad b {
	color: var(--danger);
}

.task-meta {
	margin: 9px 12px 0;
	font-size: 11px;
}

.pages {
	display: flex;
	flex-direction: column;
	padding: 6px;
	gap: 2px;
	max-height: 168px;
	overflow-y: auto;
}

.page-item {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	width: 100%;
	padding: 7px 8px;
	border-radius: 9px;
	/* 该元素由 div 改为 button：清掉浏览器默认外观 */
	border: none;
	background: transparent;
	font: inherit;
	color: inherit;
	text-align: left;
	cursor: pointer;
	transition: background 0.16s var(--ease), box-shadow 0.16s var(--ease);
}

.page-item:hover {
	background: var(--surface-2);
}

/* 远程台正在查看的标签页 */
.page-item.on {
	background: var(--brand-soft);
	box-shadow: inset 0 0 0 1px var(--line-brand);
}

.page-item.on .page-title {
	color: var(--brand-text);
}

/* 浏览器当前前台显示的标签页 */
.page-now {
	display: inline-block;
	margin-left: 5px;
	padding: 0 4px;
	border-radius: 4px;
	background: var(--ok-soft);
	color: var(--ok);
	font-size: 9.5px;
	line-height: 15px;
	vertical-align: 1px;
	flex: none;
}

.page-check {
	flex: none;
	display: flex;
	align-items: center;
	color: var(--brand-text);
	padding-top: 1px;
}

.page-index {
	font-size: 10.5px;
	color: var(--text-3);
	padding-top: 2px;
	flex: none;
	width: 14px;
}

.page-text {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
	line-height: 1.45;
}

.page-title {
	font-size: 12.5px;
}

.page-url {
	font-size: 10.5px;
}

.block--log .log-body {
	max-height: 168px;
	overflow-y: auto;
	padding: 9px 11px;
	font-family: var(--font-mono);
	font-size: 11px;
	line-height: 1.6;
	background: var(--inset);
}

.log-line {
	margin: 0 0 2px;
	white-space: pre-wrap;
	word-break: break-all;
	color: var(--text-2);
}

.log-empty {
	margin: 0;
	text-align: center;
	font-family: inherit;
	padding: 14px 0;
	font-size: 11.5px;
}

/* ------------------------------------------------------------------ 大图 */

.fullscreen {
	position: fixed;
	inset: 0;
	z-index: 70;
	background: rgba(0, 0, 0, 0.93);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 16px;
	padding: 18px;
	animation: fade-in 0.2s var(--ease);
}

.fullscreen img {
	max-width: 100%;
	max-height: 84vh;
	object-fit: contain;
	border-radius: 12px;
}

.fullscreen p {
	font-size: 11.5px;
	margin: 0;
	color: rgba(255, 255, 255, 0.5);
}

/* ------------------------------------------------------------------ 桌面弹窗 */

@media (min-width: 900px) {
	.mask {
		align-items: center;
		padding: 28px;
	}

	.sheet {
		max-width: 1040px;
		max-height: 88vh;
		border-radius: 22px;
		border-bottom: 1px solid var(--line);
		padding: 16px 22px 20px;
		box-shadow: 0 40px 100px -40px rgba(0, 0, 0, 0.7);
		animation: pop-in 0.28s var(--ease);
	}

	@keyframes pop-in {
		from {
			transform: translateY(14px) scale(0.985);
			opacity: 0;
		}
		to {
			transform: translateY(0) scale(1);
			opacity: 1;
		}
	}

	.grabber {
		display: none;
	}

	.head {
		margin-bottom: 16px;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) minmax(288px, 1fr);
		gap: 18px;
		align-items: start;
	}

	.screen {
		cursor: zoom-in;
	}

	.block--log .log-body {
		max-height: 300px;
	}

	.pages {
		max-height: 200px;
	}
}

@media (min-width: 1200px) {
	.sheet {
		padding: 18px 26px 24px;
	}

	.block--log .log-body {
		max-height: 360px;
	}
}
</style>
