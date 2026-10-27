<template>
	<div class="app">
		<!-- 连接中：骨架 + 品牌，避免白屏跳动 -->
		<div
			v-if="!state.ready"
			class="boot"
		>
			<img
				class="boot__mark"
				src="/logo.png"
				alt="鸿鹄易学"
			/>
			<div class="boot__bar"><i></i></div>
			<p class="boot__text faint">正在连接电脑端…</p>
		</div>

		<LoginView v-else-if="!state.authed" />

		<template v-else>
			<div class="shell">
				<!-- 桌面端：左侧竖栏 -->
				<aside class="rail">
				<div class="rail__brand">
					<img
						class="mark"
						src="/logo.png"
						alt="鸿鹄易学"
					/>
					<span class="rail__brand-text">
						<strong>鸿鹄易学</strong>
						<small>远程控制台</small>
					</span>
				</div>

				<nav
					class="rail__nav"
					aria-label="主导航"
				>
					<button
						v-for="item in NAV_ITEMS"
						:key="item.key"
						type="button"
						class="rail__item"
						:class="{ active: ui.tab === item.key }"
						@click="ui.tab = item.key"
					>
						<Icon
							:name="item.icon"
							:size="18"
						/>
						<span class="rail__label">{{ item.label }}</span>
						<em
							v-if="item.key === 'home' && state.browsers.length"
							class="rail__count num"
							:class="{ live: runningCount > 0 }"
							>{{ runningCount }}</em
						>
					</button>
				</nav>

				<div class="rail__foot">
					<div class="rail__conn">
						<span
							class="dot"
							:class="state.connected ? 'ok' : 'warn'"
						></span>
						<span class="rail__conn-text">
							<strong>{{ state.connected ? '实时连接' : '正在重连' }}</strong>
							<small class="faint ellipsis">{{ state.deviceName || '鸿鹄易学' }}</small>
						</span>
					</div>
				</div>
			</aside>

			<div class="body">
				<header class="head">
					<!-- 移动端展示品牌，桌面端展示页标题 -->
					<div class="head__brand">
						<img
							class="mark mark--sm"
							src="/logo.png"
							alt="鸿鹄易学"
						/>
						<span class="head__brand-text">
							<strong>远程控制台</strong>
							<small class="faint ellipsis">{{ state.deviceName || '鸿鹄易学' }}</small>
						</span>
					</div>

					<div class="head__title">
						<h1>{{ meta.label }}</h1>
						<p class="faint ellipsis">{{ meta.desc }}</p>
					</div>

					<div class="head__side">
						<span class="pill pill--brand">
							<span
								class="dot"
								:class="state.connected ? 'ok' : 'warn'"
							></span>
							<span class="num">{{ runningCount }}</span>
							<span class="faint">/{{ state.browsers.length }}</span>
						</span>
						<span
							v-if="state.lastUpdate"
							class="head__time faint num"
						>
							{{ agoText }}
						</span>
						<button
							type="button"
							class="btn btn-icon head__refresh"
							:class="{ spinning: refreshing }"
							title="刷新状态"
							aria-label="刷新状态"
							@click="doRefresh"
						>
							<Icon
								name="refresh"
								:size="16"
							/>
						</button>
					</div>
				</header>

				<main class="main">
					<OverviewView v-if="ui.tab === 'home'" />
					<LogsView v-else-if="ui.tab === 'logs'" />
					<AboutView v-else />
				</main>
			</div>

			<TabBar />
			</div>
		</template>

		<ToastStack />

		<DetailSheet
			v-if="ui.detailUid"
			@close="ui.detailUid = ''"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import LoginView from './components/LoginView.vue';
import OverviewView from './components/OverviewView.vue';
import LogsView from './components/LogsView.vue';
import AboutView from './components/AboutView.vue';
import TabBar from './components/TabBar.vue';
import ToastStack from './components/ToastStack.vue';
import DetailSheet from './components/DetailSheet.vue';
import Icon from './components/Icon.vue';
import { NAV_ITEMS, findNav } from './nav';
import { bootstrap, refreshManually, state, ui } from './store';
import { formatAgo } from './utils';

const meta = computed(() => findNav(ui.tab));

const runningCount = computed(
	() => state.browsers.filter((b) => b.status === 'launched' || b.status === 'launching').length
);

/** 让「x 秒前」自动走动，无需等下一次快照 */
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

const agoText = computed(() => (state.lastUpdate ? formatAgo(state.lastUpdate, now.value) + '同步' : ''));

const refreshing = ref(false);

async function doRefresh() {
	if (refreshing.value) return;
	refreshing.value = true;
	try {
		await refreshManually();
	} finally {
		setTimeout(() => {
			refreshing.value = false;
		}, 420);
	}
}

onMounted(() => {
	bootstrap();
	ticker = setInterval(() => {
		now.value = Date.now();
	}, 5000);
});

onBeforeUnmount(() => {
	if (ticker) clearInterval(ticker);
});
</script>

<style scoped>
.app {
	min-height: 100vh;
}

/* ------------------------------------------------------------------ 启动 */

.boot {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 18px;
	padding: 24px;
}

.boot__mark {
	width: 54px;
	height: 54px;
	border-radius: 17px;
	display: block;
	object-fit: cover;
	/* 图片加载失败时退回品牌底色方块，而不是裂图 */
	background: linear-gradient(140deg, var(--brand), var(--brand-2));
	box-shadow: var(--shadow-brand);
	animation: boot-pop 0.6s var(--ease) both;
}

@keyframes boot-pop {
	from {
		opacity: 0;
		transform: scale(0.86);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}

.boot__bar {
	width: 132px;
	height: 3px;
	border-radius: 999px;
	background: var(--surface-2);
	overflow: hidden;
}

.boot__bar i {
	display: block;
	width: 45%;
	height: 100%;
	border-radius: 999px;
	background: linear-gradient(90deg, transparent, var(--brand), var(--brand-2), transparent);
	animation: boot-slide 1.1s var(--ease) infinite;
}

@keyframes boot-slide {
	from {
		transform: translateX(-110%);
	}
	to {
		transform: translateX(230%);
	}
}

.boot__text {
	margin: 0;
	font-size: 12.5px;
	letter-spacing: 0.03em;
}

/* ------------------------------------------------------------------ 桌面竖栏 */

.rail {
	display: none;
}

.body {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
}

/* ------------------------------------------------------------------ 页头 */

.head {
	position: sticky;
	top: 0;
	z-index: 30;
	display: flex;
	align-items: center;
	gap: 12px;
	padding: calc(var(--safe-top) + 13px) 16px 12px;
	background: var(--head-bg);
	backdrop-filter: blur(14px);
	-webkit-backdrop-filter: blur(14px);
}

.mark {
	width: 36px;
	height: 36px;
	border-radius: 12px;
	display: block;
	object-fit: cover;
	/* 图片加载失败时退回品牌底色方块，而不是裂图 */
	background: linear-gradient(140deg, var(--brand), var(--brand-2));
	box-shadow: var(--shadow-brand);
	flex: none;
}

.mark--sm {
	width: 34px;
	height: 34px;
	border-radius: 11px;
}

.head__brand {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
	flex: 1;
}

.head__brand-text {
	display: flex;
	flex-direction: column;
	min-width: 0;
	line-height: 1.3;
}

.head__brand-text strong {
	font-size: 13.5px;
	font-weight: 600;
	letter-spacing: 0.01em;
}

.head__brand-text small {
	font-size: 11px;
	max-width: 34vw;
}

.head__title {
	display: none;
	min-width: 0;
	flex: 1;
}

.head__title h1 {
	margin: 0;
	font-size: 20px;
	font-weight: 650;
	letter-spacing: -0.02em;
}

.head__title p {
	margin: 2px 0 0;
	font-size: 12.5px;
}

.head__side {
	display: flex;
	align-items: center;
	gap: 8px;
	flex: none;
}

.head__side .pill {
	height: 30px;
	padding: 0 11px;
	font-size: 12px;
}

.head__time {
	display: none;
	font-size: 11.5px;
}

.head__refresh {
	/* 各尺寸都提供手动刷新（移动端没有底栏按钮可替代） */
	display: inline-flex;
}

.spinning :deep(svg) {
	animation: spin 0.8s linear infinite;
}

/* ------------------------------------------------------------------ 主区 */

.main {
	flex: 1;
	min-height: 0;
	display: flex;
	flex-direction: column;
	padding-bottom: calc(var(--safe-bottom) + 84px);
}

/* ------------------------------------------------------------------ 平板与桌面 */

@media (min-width: 720px) {
	.head {
		padding: calc(var(--safe-top) + 16px) 24px 14px;
	}

	.head__brand-text small {
		max-width: none;
	}

	.head__time {
		display: inline;
	}
}

@media (min-width: 1024px) {
	.shell {
		display: flex;
		align-items: stretch;
		min-height: 100vh;
	}

	.rail {
		position: sticky;
		top: 0;
		height: 100vh;
		width: 244px;
		flex: none;
		display: flex;
		flex-direction: column;
		gap: 22px;
		padding: 22px 14px 16px;
		border-right: 1px solid var(--line);
		background: var(--rail-bg);
		backdrop-filter: blur(18px);
		-webkit-backdrop-filter: blur(18px);
	}

	.rail__brand {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 6px;
	}

	.rail__brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.3;
	}

	.rail__brand-text strong {
		font-size: 14.5px;
		font-weight: 650;
		letter-spacing: 0.01em;
	}

	.rail__brand-text small {
		font-size: 10.5px;
		color: var(--text-3);
		letter-spacing: 0.06em;
	}

	.rail__nav {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.rail__item {
		display: flex;
		align-items: center;
		gap: 10px;
		height: 42px;
		padding: 0 11px;
		border-radius: 11px;
		color: var(--text-2);
		font-size: 13.5px;
		font-weight: 500;
		transition: background 0.18s var(--ease), color 0.18s var(--ease);
	}

	.rail__item:hover {
		background: var(--surface);
		color: var(--text);
	}

	.rail__item.active {
		background: var(--brand-soft);
		color: var(--text);
	}

	.rail__item.active :deep(svg) {
		color: var(--brand-text);
	}

	.rail__label {
		flex: 1;
		min-width: 0;
	}

	.rail__count {
		font-style: normal;
		font-size: 11px;
		padding: 0 7px;
		height: 19px;
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--text-3);
	}

	.rail__count.live {
		background: var(--ok-soft);
		color: var(--ok);
	}

	.rail__foot {
		margin-top: auto;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 11px 11px 11px 12px;
		border-radius: 13px;
		border: 1px solid var(--line);
		background: var(--surface);
	}

	.rail__conn {
		display: flex;
		align-items: center;
		gap: 9px;
		min-width: 0;
		flex: 1;
	}

	.rail__conn-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.35;
	}

	.rail__conn-text strong {
		font-size: 12px;
		font-weight: 550;
		color: var(--text-2);
	}

	.rail__conn-text small {
		font-size: 10.5px;
	}

	.body {
		flex: 1;
		min-width: 0;
	}

	.head {
		padding: 20px 32px 16px;
	}

	.head__brand {
		display: none;
	}

	.head__title {
		display: block;
	}

	.head__refresh {
		display: inline-flex;
	}

	.head__side {
		gap: 12px;
	}

	.main {
		padding-bottom: 40px;
	}
}
</style>
