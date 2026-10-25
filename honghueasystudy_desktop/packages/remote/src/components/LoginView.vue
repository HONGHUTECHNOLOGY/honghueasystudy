<template>
	<div class="auth">
		<!-- 左侧品牌区（桌面端） -->
		<aside class="aside">
			<div
				class="aside__deco"
				aria-hidden="true"
			>
				<span class="ring ring--1"></span>
				<span class="ring ring--2"></span>
				<span class="ring ring--3"></span>
			</div>

			<div class="aside__brand">
				<span class="mark">鸿</span>
				<span class="aside__brand-text">
					<strong>鸿鹄易学</strong>
					<small>远程控制台</small>
				</span>
			</div>

			<div class="aside__pitch">
				<p class="eyebrow">
					<i></i>
					REMOTE CONSOLE
				</p>
				<h2>
					在手机或另一台电脑上<br />
					<span>接住正在跑的学习</span>
				</h2>
				<ul class="features">
					<li
						v-for="item in FEATURES"
						:key="item.title"
					>
						<span class="features__icon"
							><Icon
								:name="item.icon"
								:size="15"
						/></span>
						<span class="features__text">
							<strong>{{ item.title }}</strong>
							<small class="faint">{{ item.desc }}</small>
						</span>
					</li>
				</ul>
			</div>

			<p class="aside__foot faint">本页面由电脑端本地服务提供，关闭软件或关闭开关后立即失效</p>
		</aside>

		<!-- 右侧验证区 -->
		<section class="panel-wrap">
			<div class="panel-head">
				<span class="mark mark--lg">鸿</span>
				<h1>鸿鹄易学</h1>
				<p class="faint">远程控制台</p>
			</div>

			<div
				class="card panel"
				:class="{ shake: shaking }"
			>
				<div class="panel__title">
					<span class="panel__lock"
						><Icon
							name="lock"
							:size="15"
					/></span>
					<div>
						<p class="panel__label">{{ isPassword ? '输入访问密码' : '输入配对码' }}</p>
						<p class="panel__sub faint">
							{{ isPassword ? '由电脑端设置的访问密码' : '电脑端「设置 → 远程控制」中查看' }}
						</p>
					</div>
				</div>

				<!-- 配对码：6 格分段输入 -->
				<div
					v-if="!isPassword"
					class="otp"
					:class="{ filled: secret.length > 0, failed: !!error }"
					@click="focusInput"
				>
					<span
						v-for="slot in 6"
						:key="slot"
						class="otp__cell"
						:class="{ active: focused && secret.length === slot - 1, done: secret.length >= slot }"
					>
						{{ secret[slot - 1] || '' }}
					</span>
					<input
						ref="inputRef"
						v-model="secret"
						class="otp__input"
						type="tel"
						inputmode="numeric"
						autocomplete="one-time-code"
						maxlength="6"
						aria-label="配对码"
						@input="onInput"
						@keyup.enter="submit"
						@focus="focused = true"
						@blur="focused = false"
					/>
				</div>

				<!-- 密码模式 -->
				<input
					v-else
					ref="inputRef"
					v-model="secret"
					class="field"
					type="password"
					autocomplete="current-password"
					maxlength="64"
					aria-label="访问密码"
					placeholder="请输入访问密码"
					@input="onSecretInput"
					@keyup.enter="submit"
					@focus="focused = true"
					@blur="focused = false"
				/>

				<button
					type="button"
					class="btn btn-primary submit"
					:disabled="!canSubmit"
					@click="submit"
				>
					<span
						v-if="state.loading"
						class="spinner"
					></span>
					<template v-else>
						{{ isPassword ? '进入控制台' : '连接设备' }}
						<Icon
							name="chevron"
							:size="15"
						/>
					</template>
				</button>

				<p
					v-if="error"
					class="err"
					role="alert"
				>
					{{ error }}
				</p>
				<p
					v-else
					class="hint faint"
				>
					{{ hint }}
				</p>
			</div>

			<p class="foot faint">
				{{ state.deviceName || '鸿鹄易学' }}
				<span v-if="state.appVersion"> · v{{ state.appVersion }}</span>
			</p>
		</section>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import Icon from './Icon.vue';
import { authenticate, state } from '../store';

const FEATURES = [
	{ icon: 'monitor', title: '实时画面', desc: '每 2 秒同步一次截图，进度随时可见' },
	{ icon: 'play', title: '一键启停', desc: '启动、置顶、关闭，不必回到电脑前' },
	{ icon: 'logs', title: '日志同看', desc: '运行日志实时推送，异常第一时间发现' }
];

const secret = ref('');
const error = ref('');
const focused = ref(false);
const shaking = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

const isPassword = computed(() => state.authMode === 'password');

const canSubmit = computed(() => {
	if (state.loading) return false;
	return isPassword.value ? secret.value.length > 0 : secret.value.length === 6;
});

const hint = computed(() => {
	if (isPassword.value) {
		return '验证成功后本设备会被记住，除非在电脑端修改密码或退出登录。';
	}
	return '配对成功后本设备会被记住；电脑端刷新配对码或重启服务后需要重新验证。';
});

function focusInput() {
	inputRef.value?.focus();
}

function onInput() {
	secret.value = secret.value.replace(/[^0-9]/g, '').slice(0, 6);
	error.value = '';
}

function onSecretInput() {
	error.value = '';
}

function triggerShake() {
	shaking.value = false;
	/** 下一帧再加回来，保证动画能重复触发 */
	setTimeout(() => {
		shaking.value = true;
	}, 16);
	setTimeout(() => {
		shaking.value = false;
	}, 460);
}

async function submit() {
	if (!canSubmit.value) return;
	error.value = '';
	try {
		await authenticate(secret.value);
	} catch (e) {
		error.value = e instanceof Error ? e.message : String(e);
		secret.value = '';
		triggerShake();
		if (navigator.vibrate) navigator.vibrate(28);
		inputRef.value?.focus();
	}
}

onMounted(() => {
	/** 服务探测失败时给出原因，避免白屏 */
	if (state.error) {
		error.value = '无法连接电脑端服务：' + state.error;
	}

	/** 配对码模式下，扫码进入会带上 ?c=，自动填满后一键连接 */
	if (!isPassword.value) {
		const params = new URLSearchParams(location.search);
		const preset = (params.get('c') || '').replace(/[^0-9]/g, '').slice(0, 6);
		if (preset.length === 6) {
			secret.value = preset;
		}
	}

	/** 桌面端不自动聚焦，避免误触键盘打断阅读 */
	if (window.innerWidth < 1024) {
		setTimeout(() => inputRef.value?.focus(), 260);
	}
});
</script>

<style scoped>
.auth {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: calc(var(--safe-top) + 34px) 20px calc(var(--safe-bottom) + 30px);
	gap: 26px;
}

/* ------------------------------------------------------------------ 品牌区 */

.aside {
	display: none;
}

.mark {
	width: 38px;
	height: 38px;
	border-radius: 12px;
	display: grid;
	place-items: center;
	font-size: 16px;
	font-weight: 600;
	color: #fff;
	background: linear-gradient(140deg, var(--brand), var(--brand-2));
	box-shadow: var(--shadow-brand);
	flex: none;
}

.mark--lg {
	width: 58px;
	height: 58px;
	border-radius: 19px;
	font-size: 25px;
}

/* ------------------------------------------------------------------ 验证区 */

.panel-wrap {
	width: 100%;
	max-width: 392px;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 20px;
}

.panel-head {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	text-align: center;
}

.panel-head h1 {
	margin: 12px 0 0;
	font-size: 21px;
	font-weight: 650;
	letter-spacing: -0.01em;
}

.panel-head p {
	margin: 0;
	font-size: 12.5px;
	letter-spacing: 0.02em;
}

.panel {
	width: 100%;
	padding: 20px 18px;
	display: flex;
	flex-direction: column;
	gap: 14px;
	animation: fade-up 0.45s var(--ease) both;
}

.panel.shake {
	animation: shake 0.42s var(--ease) both;
}

@keyframes shake {
	10%,
	90% {
		transform: translateX(-1.5px);
	}
	20%,
	80% {
		transform: translateX(3px);
	}
	30%,
	50%,
	70% {
		transform: translateX(-5px);
	}
	40%,
	60% {
		transform: translateX(5px);
	}
}

.panel__title {
	display: flex;
	align-items: center;
	gap: 10px;
}

.panel__lock {
	width: 32px;
	height: 32px;
	border-radius: 10px;
	display: grid;
	place-items: center;
	background: var(--brand-soft);
	color: var(--brand-text);
	flex: none;
}

.panel__label {
	margin: 0;
	font-size: 14px;
	font-weight: 550;
	line-height: 1.35;
}

.panel__sub {
	margin: 1px 0 0;
	font-size: 11.5px;
	line-height: 1.4;
}

/* 6 格配对码 */

.otp {
	position: relative;
	display: grid;
	grid-template-columns: repeat(6, 1fr);
	gap: 7px;
	cursor: text;
}

.otp__cell {
	position: relative;
	height: 56px;
	border-radius: 13px;
	display: grid;
	place-items: center;
	background: var(--inset);
	border: 1px solid var(--line);
	font-size: 22px;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--text);
	transition: border-color 0.18s var(--ease), background 0.18s var(--ease), transform 0.18s var(--ease);
	overflow: hidden;
}

.otp__cell.done {
	border-color: var(--line-strong);
	background: var(--surface-2);
}

.otp__cell.active {
	border-color: var(--line-brand);
	background: var(--brand-soft);
	box-shadow: 0 0 0 3px var(--brand-soft);
}

.otp__cell.active::after {
	content: '';
	width: 2px;
	height: 20px;
	border-radius: 2px;
	background: var(--brand);
	position: absolute;
	animation: caret 1s steps(1) infinite;
}

@keyframes caret {
	50% {
		opacity: 0;
	}
}

.otp.failed .otp__cell {
	border-color: rgba(255, 95, 122, 0.5);
}

.otp__input {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	opacity: 0;
	font-size: 16px;
	letter-spacing: 8px;
	caret-color: transparent;
}

/* 密码输入 */

.field {
	width: 100%;
	height: 52px;
	padding: 0 14px;
	border-radius: 13px;
	background: var(--inset);
	border: 1px solid var(--line);
	font-size: 15px;
	letter-spacing: 0.06em;
	transition: border-color 0.18s var(--ease), background 0.18s var(--ease);
}

.field:focus {
	border-color: var(--line-brand);
	background: var(--surface-2);
	box-shadow: 0 0 0 3px var(--brand-soft);
}

.field::placeholder {
	color: var(--text-3);
	letter-spacing: 0;
	font-size: 13.5px;
}

.submit {
	width: 100%;
	margin-top: 2px;
	min-height: 46px;
	font-size: 14px;
}

.hint {
	margin: 0;
	font-size: 11.5px;
	line-height: 1.65;
}

.err {
	margin: 0;
	color: var(--danger);
	font-size: 12.5px;
	line-height: 1.6;
	text-align: center;
}

.foot {
	font-size: 11.5px;
	margin: 0;
	text-align: center;
	letter-spacing: 0.02em;
}

/* ------------------------------------------------------------------ 桌面分栏 */

@media (min-width: 900px) {
	.auth {
		flex-direction: row;
		align-items: stretch;
		justify-content: center;
		gap: 0;
		padding: 0;
		min-height: 100vh;
	}

	.aside {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		flex: 1 1 52%;
		max-width: 620px;
		padding: 44px 48px;
		overflow: hidden;
		border-right: 1px solid var(--line);
		background: var(--rail-bg);
	}

	.aside__deco {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.ring {
		position: absolute;
		border-radius: 50%;
		border: 1px solid var(--line);
	}

	.ring--1 {
		width: 460px;
		height: 460px;
		right: -170px;
		top: -130px;
		border-color: var(--line-brand);
		opacity: 0.55;
	}

	.ring--2 {
		width: 300px;
		height: 300px;
		right: -90px;
		top: -50px;
		animation: float 9s var(--ease) infinite alternate;
	}

	.ring--3 {
		width: 620px;
		height: 620px;
		left: -280px;
		bottom: -330px;
		opacity: 0.6;
		animation: float 12s var(--ease) infinite alternate-reverse;
	}

	@keyframes float {
		from {
			transform: translate3d(0, 0, 0);
		}
		to {
			transform: translate3d(0, -16px, 0);
		}
	}

	.aside__brand {
		position: relative;
		display: flex;
		align-items: center;
		gap: 11px;
	}

	.aside__brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.3;
	}

	.aside__brand-text strong {
		font-size: 15px;
		font-weight: 650;
		letter-spacing: 0.01em;
	}

	.aside__brand-text small {
		font-size: 10.5px;
		color: var(--text-3);
		letter-spacing: 0.08em;
	}

	.aside__pitch {
		position: relative;
		max-width: 420px;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: 9px;
		margin: 0 0 20px;
		font-size: 9.5px;
		font-weight: 650;
		letter-spacing: 0.2em;
		color: var(--text-3);
	}

	.eyebrow i {
		width: 20px;
		height: 2px;
		border-radius: 2px;
		background: var(--brand);
	}

	.aside__pitch h2 {
		margin: 0;
		font-size: clamp(27px, 2.5vw, 33px);
		font-weight: 650;
		line-height: 1.28;
		letter-spacing: -0.03em;
	}

	.aside__pitch h2 span {
		color: var(--brand-text);
	}

	.features {
		list-style: none;
		margin: 30px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.features li {
		display: flex;
		align-items: flex-start;
		gap: 11px;
	}

	.features__icon {
		width: 30px;
		height: 30px;
		border-radius: 10px;
		display: grid;
		place-items: center;
		flex: none;
		background: var(--surface);
		border: 1px solid var(--line);
		color: var(--brand-text);
	}

	.features__text {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.features__text strong {
		font-size: 13px;
		font-weight: 550;
	}

	.features__text small {
		font-size: 11.5px;
		line-height: 1.55;
	}

	.aside__foot {
		position: relative;
		margin: 0;
		font-size: 11px;
		line-height: 1.6;
		max-width: 340px;
	}

	.panel-wrap {
		flex: 0 0 auto;
		width: 440px;
		max-width: none;
		justify-content: center;
		padding: 40px 44px;
	}

	.panel-head {
		display: none;
	}

	.panel {
		padding: 24px 22px;
		gap: 16px;
	}

	.otp__cell {
		height: 60px;
		font-size: 24px;
	}

	.foot {
		margin-top: 4px;
	}
}

@media (min-width: 1280px) {
	.aside {
		flex: 1 1 auto;
		max-width: none;
		padding: 52px 64px;
	}

	.panel-wrap {
		width: 520px;
		padding: 40px 60px;
	}
}
</style>
