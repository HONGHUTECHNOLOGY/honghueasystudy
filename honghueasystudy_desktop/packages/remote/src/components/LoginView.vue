<template>
	<div class="login">
		<div class="brand fade-up">
			<div class="logo">鸿</div>
			<h1>鸿鹄易学</h1>
			<p class="muted">远程控制台</p>
		</div>

		<div class="card panel fade-up">
			<label class="label">{{ isPassword ? '输入访问密码' : '输入配对码' }}</label>

			<input
				v-if="isPassword"
				ref="inputRef"
				v-model="secret"
				class="password-input"
				type="password"
				autocomplete="current-password"
				maxlength="64"
				placeholder="请输入电脑端设置的访问密码"
				@input="error = ''"
				@keyup.enter="submit"
			/>

			<input
				v-else
				ref="inputRef"
				v-model="secret"
				class="code-input num"
				type="tel"
				inputmode="numeric"
				autocomplete="one-time-code"
				maxlength="6"
				placeholder="······"
				@input="onInput"
				@keyup.enter="submit"
			/>

			<p class="hint faint">{{ hint }}</p>

			<button
				class="btn btn-primary submit"
				:disabled="!canSubmit"
				@click="submit"
			>
				<span
					v-if="state.loading"
					class="spinner"
				></span>
				<span v-else>{{ isPassword ? '进入控制台' : '连接设备' }}</span>
			</button>

			<p
				v-if="error"
				class="err"
			>
				{{ error }}
			</p>
		</div>

		<p class="foot faint">
			{{ state.deviceName || '鸿鹄易学' }}
			<span v-if="state.appVersion"> · v{{ state.appVersion }}</span>
		</p>
	</div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { authenticate, state } from '../store';

const secret = ref('');
const error = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

const isPassword = computed(() => state.authMode === 'password');

const canSubmit = computed(() => {
	if (state.loading) return false;
	return isPassword.value ? secret.value.length > 0 : secret.value.length === 6;
});

const hint = computed(() => {
	if (isPassword.value) {
		return '访问密码由电脑端「设置 → 远程控制」中设定，验证成功后本设备将被记住。';
	}
	return '在电脑端「设置 → 远程控制」中查看 6 位配对码。配对成功后会记住本设备，电脑端重启服务后需重新验证。';
});

function onInput() {
	secret.value = secret.value.replace(/[^0-9]/g, '').slice(0, 6);
	error.value = '';
}

async function submit() {
	if (!canSubmit.value) return;
	error.value = '';
	try {
		await authenticate(secret.value);
	} catch (e) {
		error.value = e instanceof Error ? e.message : String(e);
		secret.value = '';
		if (navigator.vibrate) navigator.vibrate(30);
		inputRef.value?.focus();
	}
}

onMounted(() => {
	/** 服务探测失败时给出原因，避免白屏 */
	if (state.error) {
		error.value = '无法连接电脑端服务：' + state.error;
	}

	/** 配对码模式下，扫码进入会带上 ?c=，自动填充，点一下即可连接 */
	if (!isPassword.value) {
		const params = new URLSearchParams(location.search);
		const preset = (params.get('c') || '').replace(/[^0-9]/g, '').slice(0, 6);
		if (preset.length === 6) {
			secret.value = preset;
		}
	}

	inputRef.value?.focus();
});
</script>

<style scoped>
.login {
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: calc(var(--safe-top) + 32px) 24px calc(var(--safe-bottom) + 32px);
	gap: 28px;
}

.brand {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
}

.logo {
	width: 64px;
	height: 64px;
	border-radius: 20px;
	display: grid;
	place-items: center;
	font-size: 30px;
	font-weight: 600;
	color: #fff;
	background: linear-gradient(135deg, var(--accent-a), var(--accent-b));
	box-shadow: 0 16px 40px -16px rgba(79, 140, 255, 0.9);
	margin-bottom: 8px;
}

h1 {
	margin: 0;
	font-size: 22px;
	font-weight: 600;
	letter-spacing: 0.02em;
}

.brand p {
	margin: 0;
	font-size: 13px;
}

.panel {
	width: 100%;
	max-width: 380px;
	padding: 24px 20px;
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.label {
	font-size: 13px;
	color: var(--text-2);
	font-weight: 500;
}

.code-input {
	width: 100%;
	height: 64px;
	border-radius: 16px;
	background: rgba(255, 255, 255, 0.05);
	border: 1px solid var(--line-strong);
	text-align: center;
	font-size: 28px;
	font-weight: 600;
	letter-spacing: 14px;
	text-indent: 14px;
	transition: border-color 0.2s var(--ease);
}

.password-input {
	width: 100%;
	height: 56px;
	padding: 0 16px;
	border-radius: 16px;
	background: rgba(255, 255, 255, 0.05);
	border: 1px solid var(--line-strong);
	font-size: 16px;
	letter-spacing: 0.05em;
	transition: border-color 0.2s var(--ease);
}

.code-input:focus,
.password-input:focus {
	border-color: rgba(79, 140, 255, 0.65);
}

.code-input::placeholder {
	color: var(--text-3);
	letter-spacing: 8px;
	text-indent: 8px;
}

.password-input::placeholder {
	color: var(--text-3);
	letter-spacing: 0;
	font-size: 14px;
}

.hint {
	margin: 0;
	font-size: 12px;
	line-height: 1.6;
}

.submit {
	width: 100%;
	margin-top: 4px;
}

.err {
	margin: 0;
	color: var(--danger);
	font-size: 13px;
	text-align: center;
}

.foot {
	font-size: 12px;
	margin: 0;
}
</style>
