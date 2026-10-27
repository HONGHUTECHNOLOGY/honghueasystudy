<template>
	<div class="settings">
		<!-- 设备 -->
		<section class="device card fade-up">
			<img
				class="device__mark"
				src="/logo.png"
				alt="鸿鹄易学"
			/>
			<span class="device__text">
				<strong class="ellipsis">{{ state.deviceName || '鸿鹄易学' }}</strong>
				<small class="faint">
					鸿鹄易学
					<span v-if="state.appVersion"> v{{ state.appVersion }}</span>
					· 远程控制台
				</small>
			</span>
			<span
				class="pill"
				:class="state.connected ? 'pill--ok' : 'pill--warn'"
			>
				<span
					class="dot"
					:class="state.connected ? 'ok' : 'warn'"
				></span>
				{{ state.connected ? '实时连接' : '重连中' }}
			</span>
		</section>

		<!-- 连接信息 -->
		<section class="block card fade-up">
			<p class="block__title">连接信息</p>
			<div class="rows">
				<div class="row">
					<span class="row__label">服务端口</span>
					<span class="row__value num">{{ servicePort }}</span>
				</div>

				<div
					v-if="lanAddress"
					class="row"
				>
					<span class="row__label">局域网地址</span>
					<span class="row__value mono ellipsis">{{ lanAddress }}</span>
					<button
						type="button"
						class="row__copy"
						aria-label="复制局域网地址"
						@click="copyWithToast(lanAddress, '局域网地址已复制')"
					>
						<Icon
							name="copy"
							:size="13"
						/>
					</button>
				</div>

				<div
					v-if="tunnelUrl"
					class="row"
				>
					<span class="row__label">公网地址</span>
					<span class="row__value mono ellipsis">{{ tunnelUrl }}</span>
					<button
						type="button"
						class="row__copy"
						aria-label="复制公网地址"
						@click="copyWithToast(tunnelUrl, '公网地址已复制')"
					>
						<Icon
							name="copy"
							:size="13"
						/>
					</button>
				</div>

				<div class="row">
					<span class="row__label">在线设备</span>
					<span class="row__value num">{{ state.sessionCount }}</span>
				</div>

				<div class="row">
					<span class="row__label">验证方式</span>
					<span class="row__value">{{ authLabel }}</span>
				</div>

				<div class="row">
					<span class="row__label">最近同步</span>
					<span class="row__value num">{{ agoText }}</span>
				</div>
			</div>
		</section>

		<!-- 外观 -->
		<section class="block card fade-up">
			<p class="block__title">外观</p>
			<div
				class="theme"
				role="group"
				aria-label="主题模式"
			>
				<button
					v-for="option in THEMES"
					:key="option.value"
					type="button"
					class="theme__item"
					:class="{ active: ui.theme === option.value }"
					@click="setTheme(option.value)"
				>
					<Icon
						:name="option.icon"
						:size="15"
					/>
					{{ option.label }}
				</button>
			</div>
			<p class="block__hint faint">跟随系统时会随手机或电脑的深浅色设置自动切换。</p>
		</section>

		<!-- 说明 -->
		<section class="block block--wide card fade-up">
			<p class="block__title">关于远程控制</p>
			<p class="desc muted">
				远程控制台由电脑端本机启动的网页服务提供，只有在电脑端「设置 →
				远程控制」中开启开关时才能访问。关闭软件或关闭开关后，本页面会立即失去响应。
			</p>
			<p class="desc muted">
				会话通过配对码或访问密码换取，验证结果以 Cookie
				形式保存在本机浏览器中。若不再需要此设备接入，可在电脑端刷新配对码或修改密码，当前会话会立刻失效。
			</p>
			<p class="desc muted">
				为保护隐私，远程画面为压缩后的低画质截图，仅用于确认运行状态；所有操作都需要在已通过验证的会话内发起。
			</p>
		</section>

		<button
			type="button"
			class="btn btn-danger logout"
			@click="handleLogout"
		>
			<Icon
				name="logout"
				:size="15"
			/>
			退出登录
		</button>

		<p class="foot faint">鸿鹄易学 · 远程控制台</p>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import { copyWithToast, logout, setTheme, state, ui } from '../store';
import type { ThemeMode } from '../store';
import { formatAgo } from '../utils';

const THEMES: { value: ThemeMode; label: string; icon: string }[] = [
	{ value: 'auto', label: '跟随系统', icon: 'auto' },
	{ value: 'dark', label: '深色', icon: 'moon' },
	{ value: 'light', label: '浅色', icon: 'sun' }
];

const tunnelUrl = computed(() => {
	const tunnel = state.tunnel || (state.service ? state.service.tunnel : null);
	return tunnel && tunnel.state === 'running' ? tunnel.url : '';
});

const servicePort = computed(() => {
	if (state.service && state.service.port) return state.service.port;
	return state.port || '—';
});

const lanAddress = computed(() => {
	const list = state.service && state.service.addresses ? state.service.addresses : [];
	if (list.length) return list[0];
	return '';
});

const authLabel = computed(() => {
	if (state.authMode === 'password') return '访问密码';
	if (state.authMode === 'none') return '免验证（仅本机）';
	return '配对码';
});

const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | undefined;

const agoText = computed(() => (state.lastUpdate ? formatAgo(state.lastUpdate, now.value) : '—'));

async function handleLogout() {
	if (!window.confirm('确定退出登录吗？下次访问需要重新输入配对码。')) return;
	await logout();
}

onMounted(() => {
	ticker = setInterval(() => {
		now.value = Date.now();
	}, 5000);
});

onBeforeUnmount(() => {
	if (ticker) clearInterval(ticker);
});
</script>

<style scoped>
.settings {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 0 16px 24px;
}

/* ------------------------------------------------------------------ 设备 */

.device {
	display: flex;
	align-items: center;
	gap: 11px;
	padding: 14px;
}

.device__mark {
	width: 42px;
	height: 42px;
	border-radius: 14px;
	display: block;
	object-fit: cover;
	/* 图片加载失败时退回品牌底色方块，而不是裂图 */
	background: linear-gradient(140deg, var(--brand), var(--brand-2));
	box-shadow: var(--shadow-brand);
	flex: none;
}

.device__text {
	display: flex;
	flex-direction: column;
	min-width: 0;
	flex: 1;
	line-height: 1.35;
}

.device__text strong {
	font-size: 14px;
	font-weight: 600;
}

.device__text small {
	font-size: 11px;
}

.pill--ok {
	color: var(--ok);
	border-color: rgba(53, 211, 154, 0.28);
	background: var(--ok-soft);
}

.pill--warn {
	color: var(--warn);
	border-color: rgba(255, 182, 72, 0.28);
	background: var(--warn-soft);
}

/* ------------------------------------------------------------------ 分组 */

.block {
	padding: 13px 14px 15px;
}

.block__title {
	margin: 0 0 11px;
	font-size: 12px;
	font-weight: 600;
	letter-spacing: 0.02em;
	color: var(--text-2);
}

.block__hint {
	margin: 10px 0 0;
	font-size: 11px;
	line-height: 1.6;
}

.rows {
	display: flex;
	flex-direction: column;
}

.row {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 9px 0;
	border-top: 1px solid var(--line);
	font-size: 12.5px;
}

.row:first-child {
	border-top: none;
	padding-top: 0;
}

.row:last-child {
	padding-bottom: 0;
}

.row__label {
	color: var(--text-2);
	flex: none;
}

.row__value {
	margin-left: auto;
	min-width: 0;
	text-align: right;
	color: var(--text);
}

.row__copy {
	width: 24px;
	height: 24px;
	border-radius: 7px;
	display: grid;
	place-items: center;
	background: var(--surface-2);
	color: var(--text-3);
	flex: none;
	transition: color 0.18s var(--ease), background 0.18s var(--ease);
}

.row__copy:hover {
	color: var(--brand-text);
	background: var(--brand-soft);
}

/* ------------------------------------------------------------------ 主题 */

.theme {
	display: flex;
	gap: 4px;
	padding: 4px;
	border-radius: 12px;
	background: var(--inset);
	border: 1px solid var(--line);
}

.theme__item {
	flex: 1;
	height: 34px;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 5px;
	border-radius: 9px;
	font-size: 12px;
	color: var(--text-2);
	transition: background 0.18s var(--ease), color 0.18s var(--ease), box-shadow 0.18s var(--ease);
}

.theme__item.active {
	background: var(--surface-solid);
	color: var(--text);
	box-shadow: var(--shadow-1);
}

.theme__item.active :deep(svg) {
	color: var(--brand-text);
}

.desc {
	margin: 0 0 9px;
	font-size: 12px;
	line-height: 1.72;
	max-width: 86ch;
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
	margin: 6px 0 0;
	letter-spacing: 0.02em;
}

/* ------------------------------------------------------------------ 自适应 */

@media (min-width: 720px) {
	.settings {
		padding: 0 24px 28px;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: min-content;
		align-items: start;
		gap: 14px;
	}

	.device {
		grid-column: 1 / -1;
	}

	.block--wide {
		grid-column: 1 / -1;
	}

	.logout,
	.foot {
		grid-column: 1 / -1;
	}

	.logout {
		max-width: 280px;
	}
}

@media (min-width: 1024px) {
	.settings {
		padding: 0 32px 32px;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 16px;
	}

	.block {
		padding: 15px 16px 17px;
	}
}
</style>
