<template>
	<div class="app">
		<div
			v-if="!state.ready"
			class="boot"
		>
			<div class="spinner"></div>
			<p class="faint">正在连接鸿鹄易学…</p>
		</div>

		<LoginView v-else-if="!state.authed" />

		<template v-else>
			<header class="topbar">
				<div class="brand">
					<span class="mark">鸿</span>
					<div class="brand-text">
						<p class="brand-title">远程控制</p>
						<p class="brand-sub faint ellipsis">{{ state.deviceName || '鸿鹄易学' }}</p>
					</div>
				</div>

				<div class="conn">
					<span
						class="dot"
						:class="state.connected ? 'ok' : 'warn'"
					></span>
					<span class="num">{{ runningCount }}</span>
					<span class="faint">/{{ state.browsers.length }}</span>
				</div>
			</header>

			<main class="main">
				<OverviewView v-if="ui.tab === 'home'" />
				<LogsView v-else-if="ui.tab === 'logs'" />
				<AboutView v-else />
			</main>

			<TabBar />
		</template>

		<ToastStack />

		<DetailSheet
			v-if="ui.detailUid"
			@close="ui.detailUid = ''"
		/>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import LoginView from './components/LoginView.vue';
import OverviewView from './components/OverviewView.vue';
import LogsView from './components/LogsView.vue';
import AboutView from './components/AboutView.vue';
import TabBar from './components/TabBar.vue';
import ToastStack from './components/ToastStack.vue';
import DetailSheet from './components/DetailSheet.vue';
import { bootstrap, state, ui } from './store';

const runningCount = computed(
	() => state.browsers.filter((b) => b.status === 'launched' || b.status === 'launching').length
);

onMounted(() => {
	bootstrap();
});
</script>

<style scoped>
.app {
	min-height: 100vh;
}

.boot {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 14px;
}

.boot p {
	font-size: 13px;
	margin: 0;
}

.topbar {
	position: sticky;
	top: 0;
	z-index: 30;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: calc(var(--safe-top) + 14px) 16px 12px;
	background: linear-gradient(180deg, rgba(7, 9, 13, 0.92), rgba(7, 9, 13, 0));
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
}

.brand {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.mark {
	width: 34px;
	height: 34px;
	border-radius: 11px;
	display: grid;
	place-items: center;
	font-size: 15px;
	font-weight: 600;
	color: #fff;
	background: linear-gradient(135deg, var(--accent-a), var(--accent-b));
	flex: none;
}

.brand-text {
	min-width: 0;
}

.brand-title {
	margin: 0;
	font-size: 14px;
	font-weight: 600;
	letter-spacing: 0.01em;
}

.brand-sub {
	margin: 0;
	font-size: 11px;
	max-width: 42vw;
}

.conn {
	display: flex;
	align-items: center;
	gap: 5px;
	font-size: 13px;
	flex: none;
}

.main {
	padding-bottom: calc(var(--safe-bottom) + 72px);
}
</style>
