<template>
	<div class="overview">
		<!-- 状态概览 -->
		<section class="hero card fade-up">
			<div class="hero__main">
				<p class="hero__eyebrow">
					<i></i>
					运行概览
				</p>

				<div class="hero__value">
					<strong class="num">{{ runningCount }}</strong>
					<span class="num">/ {{ state.browsers.length || 0 }}</span>
				</div>
				<p class="hero__desc faint">实例正在运行，可在此启动、置顶或关闭</p>

				<div class="hero__metrics">
					<div class="metric">
						<span class="metric__label">在线设备</span>
						<strong class="num">{{ state.sessionCount }}</strong>
					</div>
					<div class="metric">
						<span class="metric__label">连接状态</span>
						<strong :class="state.connected ? 'is-ok' : 'is-warn'">{{ state.connected ? '实时' : '重连中' }}</strong>
					</div>
					<div class="metric">
						<span class="metric__label">最近同步</span>
						<strong class="num">{{ agoText }}</strong>
					</div>
				</div>
			</div>

			<div class="hero__ring">
				<svg
					viewBox="0 0 96 96"
					aria-hidden="true"
				>
					<circle
						class="ring__track"
						cx="48"
						cy="48"
						r="40"
					/>
					<circle
						class="ring__value"
						cx="48"
						cy="48"
						r="40"
						:stroke-dasharray="ringDash"
					/>
				</svg>
				<span class="ring__label num">{{ percent }}<small>%</small></span>
			</div>
		</section>

		<!-- 公网地址 -->
		<div
			v-if="tunnelUrl"
			class="link-bar card fade-up"
		>
			<span class="link-bar__icon">
				<Icon
					name="link"
					:size="15"
				/>
			</span>
			<span class="link-bar__text">
				<small class="faint">公网地址</small>
				<strong class="ellipsis">{{ tunnelUrl }}</strong>
			</span>
			<button
				type="button"
				class="btn btn-sm"
				@click="copyWithToast(tunnelUrl, '公网地址已复制')"
			>
				<Icon
					name="copy"
					:size="14"
				/>
				复制
			</button>
		</div>

		<!-- 工具栏 -->
		<div class="toolbar">
			<div class="toolbar__actions">
				<button
					type="button"
					class="btn btn-sm"
					:disabled="!closedCount"
					@click="launchAll"
				>
					<Icon
						name="play"
						:size="14"
					/>
					全部启动
				</button>
				<button
					type="button"
					class="btn btn-sm btn-danger"
					:disabled="!runningCount"
					@click="closeAll"
				>
					<Icon
						name="stop"
						:size="14"
					/>
					全部关闭
				</button>
			</div>
			<span
				v-if="state.browsers.length"
				class="toolbar__hint faint num"
			>
				{{ state.browsers.length }} 个实例
			</span>
		</div>

		<!-- 实例列表 -->
		<div
			v-if="state.browsers.length"
			class="list"
		>
			<BrowserCard
				v-for="browser in state.browsers"
				:key="browser.uid"
				:browser="browser"
				@open="ui.detailUid = browser.uid"
			/>
		</div>

		<div
			v-else
			class="empty card fade-up"
		>
			<span class="empty__icon"
				><Icon
					name="monitor"
					:size="24"
			/></span>
			<p class="empty__title">还没有浏览器实例</p>
			<p class="empty__desc faint">请先在电脑端创建一个浏览器，再回到这里操作</p>
		</div>

		<p
			v-if="state.error"
			class="err"
		>
			{{ state.error }}
		</p>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import BrowserCard from './BrowserCard.vue';
import Icon from './Icon.vue';
import { copyWithToast, refresh, runCommand, state, toast, ui } from '../store';
import { formatAgo } from '../utils';

const runningCount = computed(
	() => state.browsers.filter((b) => b.status === 'launched' || b.status === 'launching').length
);
const closedCount = computed(() => state.browsers.filter((b) => b.status === 'closed').length);

const percent = computed(() => {
	const total = state.browsers.length;
	if (!total) return 0;
	return Math.round((runningCount.value / total) * 100);
});

/** 半径 40，周长约 251.33 */
const ringDash = computed(() => {
	const circumference = 2 * Math.PI * 40;
	const filled = (percent.value / 100) * circumference;
	return filled + ' ' + circumference;
});

const tunnelUrl = computed(() => {
	const tunnel = state.tunnel || (state.service ? state.service.tunnel : null);
	return tunnel && tunnel.state === 'running' ? tunnel.url : '';
});

const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

const agoText = computed(() => (state.lastUpdate ? formatAgo(state.lastUpdate, now.value) : '—'));

async function launchAll() {
	try {
		await runCommand('browser.batchLaunch', {}, 'batch');
		toast('已发送启动指令', 'success');
	} catch {}
}

async function closeAll() {
	if (!window.confirm(`确定关闭全部 ${runningCount.value} 个浏览器吗？`)) return;
	try {
		await runCommand('browser.batchClose', {}, 'batch');
		toast('已发送关闭指令', 'success');
	} catch {}
}

onMounted(() => {
	ticker = setInterval(() => {
		now.value = Date.now();
	}, 5000);
	/** 进入总览时补一次全量，避免 SSE 尚未推送时的空白 */
	if (!state.lastUpdate) refresh();
});

onBeforeUnmount(() => {
	if (ticker) clearInterval(ticker);
});
</script>

<style scoped>
.overview {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 0 16px 20px;
}

/* ------------------------------------------------------------------ 概览 */

.hero {
	display: flex;
	align-items: center;
	gap: 18px;
	padding: 20px 18px;
	position: relative;
	overflow: hidden;
}

.hero::after {
	content: '';
	position: absolute;
	width: 220px;
	height: 220px;
	right: -110px;
	top: -130px;
	border-radius: 50%;
	background: radial-gradient(circle, var(--glow-a), transparent 68%);
	pointer-events: none;
}

.hero__main {
	flex: 1;
	min-width: 0;
	position: relative;
	z-index: 1;
}

.hero__eyebrow {
	display: flex;
	align-items: center;
	gap: 7px;
	margin: 0 0 8px;
	font-size: 10px;
	font-weight: 600;
	letter-spacing: 0.16em;
	color: var(--text-3);
	text-transform: uppercase;
}

.hero__eyebrow i {
	width: 14px;
	height: 2px;
	border-radius: 2px;
	background: var(--brand);
}

.hero__value {
	display: flex;
	align-items: baseline;
	gap: 5px;
	line-height: 1;
}

.hero__value strong {
	font-size: 40px;
	font-weight: 650;
	letter-spacing: -0.04em;
	background: linear-gradient(135deg, var(--text) 20%, var(--brand-text));
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
}

.hero__value span {
	font-size: 15px;
	font-weight: 500;
	color: var(--text-3);
}

.hero__desc {
	margin: 7px 0 0;
	font-size: 11.5px;
	line-height: 1.5;
}

.hero__metrics {
	display: flex;
	gap: 22px;
	margin-top: 16px;
	flex-wrap: wrap;
}

.metric {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.metric__label {
	font-size: 10.5px;
	color: var(--text-3);
	letter-spacing: 0.02em;
}

.metric strong {
	font-size: 13px;
	font-weight: 550;
}

.metric strong.is-ok {
	color: var(--ok);
}

.metric strong.is-warn {
	color: var(--warn);
}

/* 进度环 */

.hero__ring {
	position: relative;
	width: 84px;
	height: 84px;
	flex: none;
	display: grid;
	place-items: center;
}

.hero__ring svg {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	transform: rotate(-90deg);
}

.ring__track {
	fill: none;
	stroke: var(--line);
	stroke-width: 7;
}

.ring__value {
	fill: none;
	stroke: var(--brand);
	stroke-width: 7;
	stroke-linecap: round;
	transition: stroke-dasharray 0.6s var(--ease);
}

.ring__label {
	font-size: 19px;
	font-weight: 650;
	letter-spacing: -0.02em;
	display: flex;
	align-items: baseline;
	gap: 1px;
}

.ring__label small {
	font-size: 10px;
	font-weight: 500;
	color: var(--text-3);
}

/* ------------------------------------------------------------------ 公网地址 */

.link-bar {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 10px 12px;
	border-radius: var(--r-md);
}

.link-bar__icon {
	width: 30px;
	height: 30px;
	border-radius: 9px;
	display: grid;
	place-items: center;
	background: var(--brand-soft);
	color: var(--brand-text);
	flex: none;
}

.link-bar__text {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
	line-height: 1.3;
}

.link-bar__text small {
	font-size: 10px;
}

.link-bar__text strong {
	font-size: 12px;
	font-weight: 500;
	font-family: var(--font-mono);
}

/* ------------------------------------------------------------------ 工具栏 */

.toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 0 2px;
}

.toolbar__actions {
	display: flex;
	gap: 8px;
	flex: 1;
}

.toolbar__actions .btn {
	flex: 1;
}

.toolbar__hint {
	font-size: 11px;
	white-space: nowrap;
}

/* ------------------------------------------------------------------ 列表 */

.list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.empty {
	padding: 40px 22px;
	text-align: center;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
}

.empty__icon {
	width: 52px;
	height: 52px;
	border-radius: 17px;
	display: grid;
	place-items: center;
	background: var(--surface-2);
	color: var(--text-3);
	margin-bottom: 8px;
}

.empty__title {
	margin: 0;
	font-size: 14px;
	font-weight: 550;
}

.empty__desc {
	margin: 0;
	font-size: 12px;
	max-width: 280px;
	line-height: 1.6;
}

.err {
	color: var(--danger);
	font-size: 12px;
	text-align: center;
	margin: 0;
}

/* ------------------------------------------------------------------ 自适应 */

@media (min-width: 560px) {
	.overview {
		padding: 0 20px 24px;
	}

	.hero {
		padding: 22px 22px;
	}

	.hero__value strong {
		font-size: 46px;
	}

	.hero__ring {
		width: 96px;
		height: 96px;
	}

	.toolbar__actions {
		flex: none;
	}

	.toolbar__actions .btn {
		flex: none;
		padding: 0 14px;
	}
}

@media (min-width: 720px) {
	.overview {
		padding: 0 24px 26px;
		gap: 16px;
	}

	.list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 14px;
	}
}

@media (min-width: 1024px) {
	.overview {
		padding: 0 32px 32px;
	}

	.hero {
		padding: 26px 28px;
	}

	.hero__value strong {
		font-size: 52px;
	}

	.hero__ring {
		width: 104px;
		height: 104px;
	}

	.list {
		grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
	}
}
</style>
