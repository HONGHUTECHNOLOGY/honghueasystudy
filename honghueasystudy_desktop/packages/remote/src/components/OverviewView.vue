<template>
	<div class="overview">
		<div class="summary card fade-up">
			<div class="row">
				<div class="stat">
					<div class="stat-value num">
						{{ runningCount }}<span class="stat-total">/{{ state.browsers.length }}</span>
					</div>
					<div class="stat-label">运行中</div>
				</div>

				<div class="sep"></div>

				<div class="stat">
					<div class="stat-value num">{{ state.sessionCount }}</div>
					<div class="stat-label">在线设备</div>
				</div>

				<div class="conn">
					<span
						class="dot"
						:class="state.connected ? 'ok' : 'warn'"
					></span>
					<span>{{ state.connected ? '实时连接' : '重连中' }}</span>
				</div>
			</div>

			<div
				v-if="tunnelUrl"
				class="tunnel faint ellipsis"
			>
				公网地址 {{ tunnelUrl }}
			</div>
		</div>

		<div class="toolbar">
			<button
				class="btn btn-sm"
				:disabled="!closedCount"
				@click="launchAll"
			>
				<Icon
					name="play"
					:size="15"
				/>
				全部启动
			</button>

			<button
				class="btn btn-sm"
				@click="refresh"
			>
				<Icon
					name="refresh"
					:size="15"
				/>
				刷新
			</button>

			<button
				class="btn btn-sm btn-danger"
				:disabled="!runningCount"
				@click="closeAll"
			>
				<Icon
					name="stop"
					:size="15"
				/>
				全部关闭
			</button>
		</div>

		<div class="list">
			<BrowserCard
				v-for="browser in state.browsers"
				:key="browser.uid"
				:browser="browser"
				@open="ui.detailUid = browser.uid"
			/>
		</div>

		<div
			v-if="state.browsers.length === 0"
			class="empty card fade-up"
		>
			<p>还没有浏览器实例</p>
			<p class="faint">请先在电脑端创建一个浏览器，再回到这里操作</p>
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
import { computed } from 'vue';
import BrowserCard from './BrowserCard.vue';
import Icon from './Icon.vue';
import { refresh, runCommand, state, toast, ui } from '../store';

const runningCount = computed(
	() => state.browsers.filter((b) => b.status === 'launched' || b.status === 'launching').length
);
const closedCount = computed(() => state.browsers.filter((b) => b.status === 'closed').length);

const tunnelUrl = computed(() => {
	const tunnel = state.tunnel || (state.service ? state.service.tunnel : null);
	return tunnel && tunnel.state === 'running' ? tunnel.url : '';
});

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
</script>

<style scoped>
.overview {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 0 16px 24px;
}

.summary {
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.row {
	display: flex;
	align-items: center;
	gap: 18px;
}

.stat {
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.stat-value {
	font-size: 24px;
	font-weight: 600;
	letter-spacing: -0.02em;
}

.stat-total {
	font-size: 14px;
	color: var(--text-3);
	font-weight: 400;
}

.stat-label {
	font-size: 12px;
	color: var(--text-3);
}

.sep {
	width: 1px;
	height: 28px;
	background: var(--line);
}

.conn {
	margin-left: auto;
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
	color: var(--text-2);
}

.tunnel {
	font-size: 12px;
}

.toolbar {
	display: flex;
	gap: 8px;
}

.toolbar .btn {
	flex: 1;
}

.list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.empty {
	padding: 32px 20px;
	text-align: center;
}

.empty p {
	margin: 0 0 6px;
	font-size: 14px;
}

.empty p.faint {
	font-size: 12px;
}

.err {
	color: var(--danger);
	font-size: 12px;
	text-align: center;
	margin: 0;
}

@media (min-width: 720px) {
	.list {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}
</style>
