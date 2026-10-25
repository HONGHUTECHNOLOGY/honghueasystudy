<template>
	<div
		v-if="browser"
		class="mask"
		@click.self="emit('close')"
	>
		<div class="sheet">
			<div class="grabber"></div>

			<header class="head">
				<div class="head-main">
					<div class="title-row">
						<span
							class="dot"
							:class="statusMeta.dot"
						></span>
						<h2>{{ browser.name }}</h2>
					</div>
					<p class="muted">
						{{ statusMeta.label }}
						<span v-if="browser.notes"> · {{ browser.notes }}</span>
					</p>
				</div>
				<button
					class="close-btn"
					aria-label="关闭"
					@click="emit('close')"
				>
					<Icon
						name="close"
						:size="18"
					/>
				</button>
			</header>

			<div
				class="screen"
				@click="fullscreen = true"
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
					<Icon
						name="image"
						:size="26"
					/>
					<span>{{ browser.status === 'launched' ? '正在获取画面…' : '实例未运行' }}</span>
				</div>
				<div
					v-if="thumb"
					class="screen-tip faint"
				>
					点击查看大图
				</div>
			</div>

			<div
				v-if="browser.pages.length"
				class="pages"
			>
				<div
					v-for="(page, index) in browser.pages"
					:key="index"
					class="page-item"
				>
					<span class="page-index num">{{ index + 1 }}</span>
					<div class="page-text">
						<p class="page-title ellipsis">{{ page.title || '（无标题）' }}</p>
						<p class="page-url faint ellipsis">{{ page.url }}</p>
					</div>
				</div>
			</div>

			<div class="actions">
				<button
					v-if="browser.status === 'closed'"
					class="btn btn-primary"
					:disabled="!!pending"
					@click="launch"
				>
					<Icon
						name="play"
						:size="16"
					/>
					启动浏览器
				</button>

				<template v-else>
					<button
						class="btn"
						:disabled="!!pending || browser.status !== 'launched'"
						@click="bringToFront"
					>
						<Icon
							name="top"
							:size="16"
						/>
						置顶
					</button>
					<button
						class="btn btn-danger"
						:disabled="!!pending"
						@click="closeBrowser"
					>
						<Icon
							name="stop"
							:size="16"
						/>
						关闭
					</button>
				</template>

				<span
					v-if="pending"
					class="spinner"
				></span>
			</div>

			<div class="log-block">
				<div class="log-head">
					<span class="muted">最近日志</span>
					<span class="faint num">{{ logLines.length }} 行</span>
				</div>
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
import { runCommand, state, ui } from '../store';

const emit = defineEmits<{ (e: 'close'): void }>();

const thumb = ref('');
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

	const url = snapshotUrl(target.uid);
	const img = new Image();
	img.onload = () => {
		thumb.value = url;
	};
	img.src = url;
}

function startPolling() {
	stopPolling();
	const target = browser.value;
	if (!target || target.status !== 'launched') {
		thumb.value = '';
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

onMounted(() => {
	document.body.style.overflow = 'hidden';
	document.addEventListener('visibilitychange', onVisibility);
	startPolling();
});

onBeforeUnmount(() => {
	document.body.style.overflow = '';
	document.removeEventListener('visibilitychange', onVisibility);
	stopPolling();
});

// ------------------------------------------------------------------ 操作

async function launch() {
	const target = browser.value;
	if (!target) return;
	try {
		await runCommand('browser.launch', { uid: target.uid }, target.uid);
	} catch {}
}

async function closeBrowser() {
	const target = browser.value;
	if (!target) return;
	try {
		await runCommand('browser.close', { uid: target.uid }, target.uid);
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
	background: rgba(0, 0, 0, 0.55);
	backdrop-filter: blur(4px);
	display: flex;
	align-items: flex-end;
	justify-content: center;
	animation: fade-in 0.2s var(--ease);
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
	max-width: 640px;
	max-height: 92vh;
	overflow-y: auto;
	background: linear-gradient(180deg, rgba(22, 27, 37, 0.98), rgba(12, 16, 22, 0.99));
	border: 1px solid var(--line);
	border-bottom: none;
	border-radius: 24px 24px 0 0;
	padding: 8px 16px calc(var(--safe-bottom) + 20px);
	animation: slide-up 0.28s var(--ease);
	-webkit-overflow-scrolling: touch;
}

@keyframes slide-up {
	from {
		transform: translateY(24px);
		opacity: 0.4;
	}
	to {
		transform: translateY(0);
		opacity: 1;
	}
}

.grabber {
	width: 36px;
	height: 4px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.18);
	margin: 2px auto 12px;
}

.head {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	margin-bottom: 14px;
}

.head-main {
	flex: 1;
	min-width: 0;
}

.title-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

h2 {
	margin: 0;
	font-size: 17px;
	font-weight: 600;
}

.head p {
	margin: 2px 0 0 16px;
	font-size: 12px;
}

.close-btn {
	width: 36px;
	height: 36px;
	border-radius: 50%;
	display: grid;
	place-items: center;
	background: rgba(255, 255, 255, 0.06);
	color: var(--text-2);
	flex: none;
}

.screen {
	position: relative;
	width: 100%;
	aspect-ratio: 16 / 10;
	border-radius: 16px;
	overflow: hidden;
	background: rgba(0, 0, 0, 0.4);
	border: 1px solid var(--line);
	margin-bottom: 14px;
}

.screen img {
	width: 100%;
	height: 100%;
	object-fit: contain;
}

.screen-empty {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	color: var(--text-3);
	font-size: 12px;
}

.screen-tip {
	position: absolute;
	right: 8px;
	bottom: 8px;
	font-size: 11px;
	padding: 2px 8px;
	border-radius: 999px;
	background: rgba(0, 0, 0, 0.45);
}

.pages {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin-bottom: 14px;
}

.page-item {
	display: flex;
	gap: 10px;
	padding: 10px 12px;
	border-radius: 12px;
	background: var(--card);
	border: 1px solid var(--line);
}

.page-index {
	font-size: 11px;
	color: var(--text-3);
	padding-top: 2px;
	flex: none;
}

.page-text {
	min-width: 0;
	flex: 1;
}

.page-title {
	margin: 0;
	font-size: 13px;
}

.page-url {
	margin: 2px 0 0;
	font-size: 11px;
}

.actions {
	display: flex;
	gap: 10px;
	margin-bottom: 16px;
	align-items: center;
}

.actions .btn {
	flex: 1;
}

.log-block {
	border-radius: 14px;
	background: rgba(0, 0, 0, 0.28);
	border: 1px solid var(--line);
	overflow: hidden;
}

.log-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: 10px 12px;
	font-size: 12px;
	border-bottom: 1px solid var(--line);
}

.log-body {
	max-height: 180px;
	overflow-y: auto;
	padding: 10px 12px;
	font-family: 'SF Mono', 'JetBrains Mono', Consolas, monospace;
	font-size: 11px;
	line-height: 1.6;
}

.log-line {
	margin: 0 0 2px;
	white-space: pre-wrap;
	word-break: break-all;
	color: rgba(242, 245, 250, 0.7);
}

.log-empty {
	margin: 0;
	text-align: center;
	font-family: inherit;
	padding: 12px 0;
}

.fullscreen {
	position: fixed;
	inset: 0;
	z-index: 70;
	background: rgba(0, 0, 0, 0.92);
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 16px;
	padding: 16px;
}

.fullscreen img {
	max-width: 100%;
	max-height: 84vh;
	object-fit: contain;
	border-radius: 12px;
}

.fullscreen p {
	font-size: 12px;
	margin: 0;
}
</style>
