<template>
	<div class="about">
		<div class="card panel fade-up">
			<div class="device">
				<div class="device-logo">鸿</div>
				<div class="device-main">
					<p class="device-name">{{ state.deviceName || '鸿鹄易学' }}</p>
					<p class="faint">鸿鹄易学 v{{ state.appVersion || '—' }}</p>
				</div>
				<span
					class="dot"
					:class="state.connected ? 'ok' : 'warn'"
				></span>
			</div>

			<div class="rows">
				<div class="row">
					<span class="muted">连接状态</span>
					<span>{{ state.connected ? '实时连接中' : '正在重连' }}</span>
				</div>
				<div class="row">
					<span class="muted">服务端口</span>
					<span class="num">{{ state.service ? state.service.port : state.port || '—' }}</span>
				</div>
				<div class="row">
					<span class="muted">在线设备</span>
					<span class="num">{{ state.sessionCount }}</span>
				</div>
				<div
					v-if="tunnelUrl"
					class="row"
				>
					<span class="muted">公网地址</span>
					<span class="ellipsis value-ellipsis">{{ tunnelUrl }}</span>
				</div>
				<div
					v-if="lanAddresses.length"
					class="row"
				>
					<span class="muted">局域网</span>
					<span class="ellipsis value-ellipsis">{{ lanAddresses[0] }}</span>
				</div>
			</div>
		</div>

		<div class="card panel fade-up">
			<p class="section-title">关于远程控制</p>
			<p class="desc muted">
				远程控制台通过本机启动的网页服务运行，仅在电脑端开启开关时可用。所有操作都需要配对码验证，关闭软件后服务自动停止。
			</p>
			<p class="desc muted">若不再需要此设备接入，可在电脑端「设置 → 远程控制」中刷新配对码，当前会话将立即失效。</p>
		</div>

		<button
			class="btn btn-danger logout"
			@click="handleLogout"
		>
			<Icon
				name="logout"
				:size="16"
			/>
			退出登录
		</button>

		<p class="foot faint">鸿鹄易学 · 远程控制台</p>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import Icon from './Icon.vue';
import { logout, state } from '../store';

const tunnelUrl = computed(() => {
	const tunnel = state.tunnel || (state.service ? state.service.tunnel : null);
	return tunnel && tunnel.state === 'running' ? tunnel.url : '';
});

const lanAddresses = computed(() => (state.service && state.service.addresses ? state.service.addresses : []));

async function handleLogout() {
	if (!window.confirm('确定退出登录吗？下次访问需要重新输入配对码。')) return;
	await logout();
}
</script>

<style scoped>
.about {
	padding: 0 16px 100px;
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.panel {
	padding: 16px;
}

.device {
	display: flex;
	align-items: center;
	gap: 12px;
	padding-bottom: 14px;
	border-bottom: 1px solid var(--line);
}

.device-logo {
	width: 44px;
	height: 44px;
	border-radius: 14px;
	display: grid;
	place-items: center;
	font-size: 20px;
	font-weight: 600;
	color: #fff;
	background: linear-gradient(135deg, var(--accent-a), var(--accent-b));
	flex: none;
}

.device-main {
	flex: 1;
	min-width: 0;
}

.device-name {
	margin: 0;
	font-size: 15px;
	font-weight: 600;
}

.device-main .faint {
	font-size: 12px;
}

.rows {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-top: 14px;
}

.row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	font-size: 13px;
}

.value-ellipsis {
	max-width: 58%;
	text-align: right;
}

.section-title {
	margin: 0 0 8px;
	font-size: 13px;
	font-weight: 600;
}

.desc {
	margin: 0 0 8px;
	font-size: 12px;
	line-height: 1.7;
}

.desc:last-child {
	margin-bottom: 0;
}

.logout {
	width: 100%;
}

.foot {
	text-align: center;
	font-size: 11px;
	margin: 8px 0 0;
}
</style>
