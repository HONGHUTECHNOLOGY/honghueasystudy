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
							<span>{{ browser.status === 'launched' ? (thumbFailed >= 3 ? '画面获取失败，正在重试…' : '正在获取画面…') : '实例未运行' }}</span>
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
								:disabled="!!pending"
								@click="closeBrowser"
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
							class="spinner"
						></span>
					</div>
				</div>

				<div class="col">
					<div
						v-if="browser.pages.length"
						class="block"
					>
						<p class="block__title">
							<span>打开的页面</span>
							<span class="faint num">{{ browser.pages.length }}</span>
						</p>
						<div class="pages">
							<div
								v-for="(page, index) in browser.pages"
								:key="index"
								class="page-item"
							>
								<span class="page-index num">{{ index + 1 }}</span>
								<span class="page-text">
									<span class="page-title ellipsis">{{ page.title || '（无标题）' }}</span>
									<span class="page-url faint ellipsis">{{ page.url }}</span>
								</span>
							</div>
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
import { runCommand, state, ui } from '../store';

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
	gap: 8px;
	padding: 7px 8px;
	border-radius: 9px;
	transition: background 0.16s var(--ease);
}

.page-item:hover {
	background: var(--surface-2);
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
