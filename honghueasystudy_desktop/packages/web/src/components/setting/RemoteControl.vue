<template>
	<a-card title="远程控制">
		<Description label="开启远程控制">
			<a-tooltip
				content="开启后会在本机启动一个网页服务，手机等设备可通过浏览器访问，查看运行状态并操作浏览器实例。关闭软件后服务自动停止。"
			>
				<a-switch
					:model-value="status.running"
					:loading="state.pending"
					@change="onToggle"
				/>
			</a-tooltip>
		</Description>

		<Description label="允许局域网访问">
			<a-tooltip content="关闭后仅本机可访问（127.0.0.1），手机将无法连接。仅在需要排查问题时关闭。">
				<a-switch
					:model-value="settings.allowLan"
					:disabled="!status.running"
					@change="onAllowLanChange"
				/>
			</a-tooltip>
		</Description>

		<Description label="服务端口">
			<a-input-number
				v-model="portDraft"
				:min="1024"
				:max="65535"
				:disabled="!status.running"
				style="width: 160px"
				@change="onPortChange"
			/>
			<a-tooltip content="修改端口后服务会自动重启，已连接的手机会断开，需要重新扫码。">
				<Icon
					class="ms-2"
					type="help_outline"
				/>
			</a-tooltip>
		</Description>

		<Description label="内网穿透">
			<a-tooltip :content="tunnelTip">
				<a-switch
					:model-value="settings.tunnel.enabled"
					:disabled="!status.running"
					@change="onTunnelChange"
				/>
			</a-tooltip>
		</Description>

		<!-- 运行状态 -->
		<div
			v-if="status.running"
			class="rc-block"
		>
			<div class="rc-status">
				<span class="rc-dot on"></span>
				<span class="fw-bold">服务运行中</span>
				<span class="rc-faint">端口 {{ status.port }}</span>
			</div>

			<div
				v-if="status.addresses.length"
				class="rc-addresses"
			>
				<div
					v-for="url in status.addresses"
					:key="url"
					class="rc-address"
					@click="copy(url)"
				>
					<span class="ellipsis">{{ url }}</span>
					<a-tag
						size="small"
						:bordered="false"
					>
						复制
					</a-tag>
				</div>
			</div>

			<!-- 隧道状态 -->
			<div
				v-if="settings.tunnel.enabled"
				class="rc-tunnel"
			>
				<template v-if="status.tunnel.state === 'downloading'">
					<a-spin
						:size="14"
						style="margin-right: 6px"
					/>
					<span>正在下载穿透组件… {{ status.tunnel.progress }}%</span>
				</template>
				<template v-else-if="status.tunnel.state === 'starting'">
					<a-spin
						:size="14"
						style="margin-right: 6px"
					/>
					<span>正在建立隧道…</span>
				</template>
				<template v-else-if="status.tunnel.state === 'running'">
					<span class="rc-dot on"></span>
					<span class="ellipsis">{{ status.tunnel.url }}</span>
					<a-tag
						size="small"
						:bordered="false"
						@click="copy(status.tunnel.url)"
					>
						复制
					</a-tag>
				</template>
				<template v-else-if="status.tunnel.state === 'error'">
					<span class="rc-dot off"></span>
					<span class="rc-error">{{ status.tunnel.error || '隧道连接失败' }}</span>
				</template>
				<template v-else>
					<span class="rc-faint">隧道未启动</span>
				</template>
			</div>
		</div>

		<a-alert
			v-else-if="status.error"
			type="error"
			:content="status.error"
			class="mb-2"
		/>

		<!-- 访问验证 -->
		<div
			v-if="status.running"
			class="rc-auth"
		>
			<div class="rc-auth-head">
				<span>访问验证</span>
				<a-tooltip content="修改后所有已连接设备会被立即断开，需要重新验证。">
					<Icon
						class="ms-1"
						type="help_outline"
					/>
				</a-tooltip>
			</div>

			<a-radio-group
				v-model="authModeDraft"
				type="button"
				size="small"
				@change="onAuthModeChange"
			>
				<a-radio value="pair">配对码</a-radio>
				<a-radio value="password">密码</a-radio>
				<a-radio value="none">免验证</a-radio>
			</a-radio-group>

			<!-- 配对码 -->
			<div
				v-if="authModeDraft === 'pair'"
				class="rc-mode-body"
			>
				<div class="rc-code-row">
					<span class="rc-faint">当前配对码</span>
					<span class="rc-code num">{{ status.pairCode }}</span>
					<a-button
						size="mini"
						@click="refreshCode"
					>
						刷新
					</a-button>
				</div>
				<p class="rc-faint rc-note">刷新配对码会立即断开所有已连接设备，需要重新扫码</p>
			</div>

			<!-- 密码 -->
			<div
				v-else-if="authModeDraft === 'password'"
				class="rc-mode-body"
			>
				<div class="rc-pwd-row">
					<a-input-password
						v-model="passwordDraft"
						placeholder="设置访问密码（至少 6 位）"
						allow-clear
						style="flex: 1"
						@press-enter="savePassword"
					/>
					<a-button
						size="small"
						type="primary"
						:loading="state.savingPassword"
						@click="savePassword"
					>
						{{ status.hasPassword ? '修改密码' : '设置密码' }}
					</a-button>
				</div>
				<p
					v-if="status.hasPassword"
					class="rc-faint rc-note"
				>
					已设置访问密码。修改密码会断开全部已连接设备。
				</p>
				<p
					v-else
					class="rc-faint rc-note"
				>
					尚未设置密码，设置后将自动切换为密码访问。
				</p>
			</div>

			<!-- 免验证 -->
			<div
				v-else
				class="rc-mode-body"
			>
				<a-alert
					type="warning"
					title="存在安全风险"
					content="免验证模式下，任何能访问到该端口的人都可以直接操作你的浏览器。请仅在完全可信的网络中使用；该模式下无法开启内网穿透。"
				/>
			</div>
		</div>

		<!-- 二维码 -->
		<div
			v-if="status.running"
			class="rc-pair"
		>
			<div class="rc-qr">
				<div class="rc-qr-box">
					<img
						v-if="qrDataUrl"
						:src="qrDataUrl"
						alt="扫码访问"
						width="150"
						height="150"
					/>
					<div
						v-else
						class="rc-qr-empty"
					>
						二维码生成中
					</div>
				</div>
				<div class="rc-qr-tip">
					<p>手机扫码打开远程控制台</p>
					<p class="rc-faint">{{ qrTip }}</p>
					<p
						v-if="qrTarget"
						class="rc-faint rc-qr-target ellipsis"
					>
						{{ qrTarget }}
					</p>
					<a-button
						v-if="qrTarget"
						size="mini"
						class="mt-1"
						@click="resetQR"
					>
						恢复默认地址
					</a-button>
				</div>
			</div>

			<div
				v-if="sessions.length"
				class="rc-sessions"
			>
				<div class="rc-sessions-head">
					<span class="rc-faint">已连接设备（{{ sessions.length }}）</span>
					<a-button
						size="mini"
						status="danger"
						@click="revokeAll"
					>
						全部断开
					</a-button>
				</div>
				<div
					v-for="session in sessions"
					:key="session.id"
					class="rc-session"
				>
					<div class="rc-session-main">
						<span class="ellipsis">{{ session.userAgent || '未知设备' }}</span>
						<span class="rc-faint">{{ session.ip }} · {{ formatTime(session.lastSeen) }}</span>
					</div>
					<a-button
						size="mini"
						@click="revoke(session.id)"
					>
						断开
					</a-button>
				</div>
			</div>
		</div>

		<!-- 网络环境检测 -->
		<div class="rc-network">
			<div class="rc-network-head">
				<span>网络环境</span>
				<a-button
					size="mini"
					:loading="state.detecting"
					@click="detect(true)"
				>
					检测公网访问
				</a-button>
			</div>

			<div
				v-if="report"
				class="rc-report"
				:class="report.status"
			>
				<p class="rc-report-title">{{ report.title }}</p>
				<p class="rc-report-msg">{{ report.message }}</p>
				<p class="rc-report-tip">{{ report.suggestion }}</p>

				<div
					v-if="report.publicUrls && report.publicUrls.length"
					class="rc-public"
				>
					<p class="rc-faint">公网地址（点击可用该地址生成二维码）</p>
					<div
						v-for="url in report.publicUrls"
						:key="url"
						class="rc-address"
						@click="useUrl(url)"
					>
						<span class="ellipsis">{{ url }}</span>
						<a-tag
							size="small"
							:bordered="false"
						>
							用此地址出码
						</a-tag>
					</div>
				</div>
			</div>

			<p
				v-else
				class="rc-faint rc-note"
			>
				点击「检测公网访问」判断当前网络是否支持外网直连，或是否需要开启内网穿透。
			</p>
		</div>
	</a-card>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Message, Modal } from '@arco-design/web-vue';
import Description from '../Description.vue';
import Icon from '../Icon.vue';
import { store } from '../../store';
import { remote } from '../../utils/remote';

interface TunnelInfo {
	state: string;
	url: string;
	error: string;
	progress: number;
	/** 是否随安装包内置（内置时无需下载） */
	builtin?: boolean;
}

interface Status {
	running: boolean;
	starting: boolean;
	port: number;
	allowLan: boolean;
	addresses: string[];
	pairCode: string;
	/** 访问验证方式 */
	authMode: 'pair' | 'password' | 'none';
	/** 是否已设置访问密码 */
	hasPassword: boolean;
	tunnel: TunnelInfo;
	sessionCount: number;
	error: string;
	appVersion: string;
	deviceName: string;
	preferredUrl: string;
}

interface SessionInfo {
	id: string;
	createdAt: number;
	lastSeen: number;
	ip: string;
	userAgent: string;
}

interface NetworkReportInfo {
	status: 'public-direct' | 'nat' | 'unknown';
	title: string;
	message: string;
	suggestion: string;
	publicUrls?: string[];
}

const status = reactive<Status>({
	running: false,
	starting: false,
	port: 15320,
	allowLan: true,
	addresses: [],
	pairCode: '------',
	authMode: 'pair',
	hasPassword: false,
	tunnel: { state: 'idle', url: '', error: '', progress: 0 },
	sessionCount: 0,
	error: '',
	appVersion: '',
	deviceName: '',
	preferredUrl: ''
});

const state = reactive({
	pending: false,
	detecting: false,
	savingPassword: false
});

const settings = reactive({
	allowLan: true,
	tunnel: { enabled: false }
});

const qrDataUrl = ref('');
const qrTarget = ref('');
const sessions = ref<SessionInfo[]>([]);
const report = ref<NetworkReportInfo | null>(null);
const portDraft = ref(15320);
/** 访问验证方式的界面选择值（可能领先于已生效的后端配置） */
const authModeDraft = ref<'pair' | 'password' | 'none'>('pair');
const passwordDraft = ref('');

/** 穿透组件提示：内置版和需下载版的说明不同 */
const tunnelTip = computed(() => {
	if (status.tunnel.builtin) {
		return '开启后会通过 Cloudflare 快速隧道生成公网地址，手机在任意网络下都能访问。穿透组件已随安装包内置，无需下载。';
	}
	return '开启后会通过 Cloudflare 快速隧道生成公网地址，手机在任意网络下都能访问。当前安装包未内置穿透组件，首次使用需下载（约 40MB，视网络情况可能耗时数分钟）。';
});

/** 二维码提示语随验证方式变化 */
const qrTip = computed(() => {
	if (authModeDraft.value === 'password') return '扫码后输入你设置的访问密码即可进入';
	if (authModeDraft.value === 'none') return '扫码后可直接进入（免验证模式）';
	return '扫码后配对码已自动填充，点「连接设备」即可';
});

let timer: ReturnType<typeof setInterval> | undefined;
/**
 * 上次与后端同步过的访问方式。
 * 轮询回填时只在「用户没有进行中的切换」时覆盖界面选择，
 * 否则用户刚点开「密码」还没来得及设置，就会被 3 秒轮询重置回配对码。
 */
let lastSyncedMode: 'pair' | 'password' | 'none' = 'pair';

// ------------------------------------------------------------------ 数据

async function loadStatus() {
	try {
		const data = (await remote.methods.call('rcStatus' as any)) as unknown as Status;
		if (!data) return;
		Object.assign(status, {
			...data,
			tunnel: data.tunnel || { state: 'idle', url: '', error: '', progress: 0 }
		});
		portDraft.value = data.port;

		/** 以后端已生效的配置为准回填界面选择（用户有进行中的切换时不覆盖） */
		const serverMode = data.authMode || 'pair';
		if (authModeDraft.value === lastSyncedMode) {
			authModeDraft.value = serverMode;
		}
		lastSyncedMode = serverMode;
	} catch (e) {
		console.error('获取远程控制状态失败', e);
	}
}

async function loadSettings() {
	try {
		const raw = (await remote['electron-store'].get('remoteControl' as any)) as any;
		if (raw) {
			settings.allowLan = raw.allowLan !== false;
			settings.tunnel.enabled = !!(raw.tunnel && raw.tunnel.enabled);
		}
	} catch (e) {
		console.error(e);
	}
}

async function loadQR(url?: string) {
	try {
		const qr = (await remote.methods.call('rcGetQRCode' as any, url)) as any;
		qrDataUrl.value = qr && qr.dataUrl ? qr.dataUrl : '';
		qrTarget.value = url || '';
	} catch (e) {
		qrDataUrl.value = '';
	}
}

/** 用指定地址（通常是公网 IPv6/IPv4）生成二维码 */
async function useUrl(url: string) {
	await loadQR(url);
	if (qrDataUrl.value) {
		Message.success('已切换二维码地址');
	}
}

async function resetQR() {
	await loadQR();
}

async function loadSessions() {
	try {
		const list = (await remote.methods.call('rcListSessions' as any)) as unknown as SessionInfo[];
		sessions.value = Array.isArray(list) ? list : [];
	} catch {
		sessions.value = [];
	}
}

async function detect(force = false) {
	state.detecting = true;
	try {
		const result = (await remote.methods.call('rcDetectNetwork' as any, force)) as unknown as NetworkReportInfo;
		report.value = result || null;
	} catch (e) {
		Message.error('网络检测失败：' + String(e));
	} finally {
		state.detecting = false;
	}
}

// ------------------------------------------------------------------ 操作

async function onToggle(value: string | number | boolean) {
	const enabled = !!value;
	state.pending = true;
	try {
		await persist({ enabled });
		if (enabled) {
			await remote.methods.call('rcStart' as any);
			Message.success('远程控制已开启');
			await loadQR();
			await detect(false);
		} else {
			await remote.methods.call('rcStop' as any);
			Message.info('远程控制已关闭');
		}
		await loadStatus();
	} catch (e) {
		Message.error('操作失败：' + String(e));
	} finally {
		state.pending = false;
	}
}

async function onAllowLanChange(value: string | number | boolean) {
	const allowLan = !!value;
	settings.allowLan = allowLan;
	await persist({ allowLan });
	try {
		await remote.methods.call('rcSetAllowLan' as any, allowLan);
		await loadStatus();
		qrDataUrl.value = '';
		await loadQR();
	} catch (e) {
		Message.error(String(e));
	}
}

async function onPortChange(value: any) {
	const port = Number(value);
	if (!port || port < 1024 || port > 65535 || port === status.port) return;
	try {
		await remote.methods.call('rcSetPort' as any, port);
		await loadStatus();
		qrDataUrl.value = '';
		await loadQR();
		Message.success('端口已切换为 ' + port);
	} catch (e) {
		Message.error('切换端口失败：' + String(e));
	}
}

async function onTunnelChange(value: string | number | boolean) {
	const enabled = !!value;
	try {
		/** 由主进程统一写入设置：免验证模式下会被拒绝 */
		await remote.methods.call('rcSetTunnel' as any, enabled);
		settings.tunnel.enabled = enabled;
		await loadStatus();
	} catch (e) {
		settings.tunnel.enabled = !enabled;
		Message.error(errText(e));
	}
}

/** 去掉 IPC 层包装的 Error 前缀，便于直接展示 */
function errText(e: any): string {
	return String(e).replace(/^Error:\s*/, '');
}

/** 切换访问验证方式 */
async function onAuthModeChange(value: any) {
	const mode = String(value) as 'pair' | 'password' | 'none';

	/** 还没设过密码：停留在密码页，等用户设置后再真正切换 */
	if (mode === 'password' && !status.hasPassword) {
		return;
	}

	if (mode === 'none') {
		Modal.confirm({
			title: '确认关闭访问验证？',
			content: '关闭后，任何能访问到该端口的人都能直接操作你的电脑，无需任何凭据。请仅在完全可信的网络中使用。',
			okText: '仍然关闭',
			cancelText: '取消',
			okButtonProps: { status: 'danger' },
			onOk: async () => {
				await applyAuthMode('none');
			},
			onCancel: () => {
				authModeDraft.value = status.authMode;
			}
		});
		return;
	}

	await applyAuthMode(mode);
}

async function applyAuthMode(mode: 'pair' | 'password' | 'none') {
	try {
		await remote.methods.call('rcSetAuthMode' as any, mode);
		await loadStatus();
		qrDataUrl.value = '';
		await loadQR();
		await loadSessions();
		Message.success('访问方式已更新，已连接设备需重新验证');
	} catch (e) {
		Message.error(errText(e));
		authModeDraft.value = status.authMode;
	}
}

/** 设置或修改访问密码 */
async function savePassword() {
	const pwd = passwordDraft.value;
	if (pwd.length < 6) {
		Message.error('密码至少需要 6 位');
		return;
	}

	state.savingPassword = true;
	try {
		await remote.methods.call('rcSetPassword' as any, pwd);
		passwordDraft.value = '';
		await loadStatus();
		qrDataUrl.value = '';
		await loadQR();
		await loadSessions();
		Message.success('访问密码已保存，当前为密码访问');
	} catch (e) {
		Message.error(errText(e));
	} finally {
		state.savingPassword = false;
	}
}

async function refreshCode() {
	try {
		await remote.methods.call('rcRefreshPairCode' as any);
		await loadStatus();
		await loadSessions();
		qrDataUrl.value = '';
		await loadQR();
		Message.success('配对码已刷新，请重新扫码连接');
	} catch (e) {
		Message.error(String(e));
	}
}

async function revoke(id: string) {
	try {
		await remote.methods.call('rcRevokeSession' as any, id);
		await loadSessions();
		await loadStatus();
	} catch (e) {
		Message.error(String(e));
	}
}

async function revokeAll() {
	try {
		await remote.methods.call('rcRefreshPairCode' as any);
		await loadStatus();
		await loadSessions();
		qrDataUrl.value = '';
		await loadQR();
		Message.success('已断开全部设备');
	} catch (e) {
		Message.error(String(e));
	}
}

/** 持久化设置，保留主进程写入的 sessionSecret */
async function persist(patch: Record<string, any>) {
	try {
		const current = ((await remote['electron-store'].get('remoteControl' as any)) as any) || {};
		const next = { ...current, ...patch };
		await remote['electron-store'].set('remoteControl' as any, next);
		if (store.remoteControl) {
			Object.assign(store.remoteControl as any, next);
		}
	} catch (e) {
		console.error('保存远程控制设置失败', e);
	}
}

function copy(text: string) {
	if (!text) return;
	navigator.clipboard
		.writeText(text)
		.then(() => Message.success('已复制'))
		.catch(() => Message.error('复制失败'));
}

function formatTime(ts: number) {
	const diff = Date.now() - ts;
	if (diff < 60 * 1000) return '刚刚活跃';
	if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
	if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
	return new Date(ts).toLocaleDateString();
}

// ------------------------------------------------------------------ 生命周期

onMounted(async () => {
	await loadSettings();
	await loadStatus();

	if (status.running) {
		await loadQR();
		await loadSessions();
	}

	/** 运行中时轻量轮询状态，保证隧道进度与设备列表实时 */
	timer = setInterval(async () => {
		if (!status.running) return;
		await loadStatus();
		await loadSessions();
	}, 3000);
});

onBeforeUnmount(() => {
	if (timer) clearInterval(timer);
});
</script>

<style scoped lang="less">
.rc-block {
	margin: 8px 0 12px;
	padding: 12px 14px;
	border-radius: 10px;
	background: var(--color-fill-1);
}

.rc-status {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
}

.rc-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #c9cdd4;
	flex: none;
}

.rc-dot.on {
	background: #00b42a;
	box-shadow: 0 0 0 3px rgba(0, 180, 42, 0.15);
}

.rc-faint {
	color: var(--color-text-3);
	font-size: 12px;
}

.rc-addresses {
	margin-top: 8px;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.rc-address {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 12px;
	font-family: monospace;
	cursor: pointer;
	color: var(--color-text-2);
}

.rc-address:hover {
	color: rgb(var(--primary-6));
}

.rc-address > span:first-child {
	flex: 1;
	min-width: 0;
}

.rc-tunnel {
	margin-top: 10px;
	padding-top: 10px;
	border-top: 1px dashed var(--color-border-2);
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 12px;
}

.rc-tunnel .ellipsis {
	flex: 1;
	min-width: 0;
}

.rc-error {
	color: rgb(var(--danger-6));
	font-size: 12px;
	line-height: 1.5;
}

.rc-pair {
	margin: 12px 0;
	padding: 14px;
	border-radius: 10px;
	border: 1px solid var(--color-border-2);
}

.rc-auth {
	margin: 12px 0;
	padding: 14px;
	border-radius: 10px;
	background: var(--color-fill-1);
}

.rc-auth-head {
	display: flex;
	align-items: center;
	font-size: 13px;
	font-weight: 500;
	margin-bottom: 10px;
}

.rc-mode-body {
	margin-top: 12px;
}

.rc-pwd-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.rc-qr {
	display: flex;
	gap: 16px;
	align-items: center;
}

.rc-qr-box {
	width: 150px;
	height: 150px;
	border-radius: 10px;
	background: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	flex: none;
	padding: 4px;
}

.rc-qr-box img {
	width: 100%;
	height: 100%;
	object-fit: contain;
}

.rc-qr-empty {
	color: #999;
	font-size: 12px;
}

.rc-qr-tip p {
	margin: 0 0 4px;
	font-size: 13px;
}

.rc-code-row {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-top: 14px;
}

.rc-code {
	font-size: 20px;
	font-weight: 600;
	letter-spacing: 4px;
	font-family: monospace;
}

.rc-note {
	margin: 4px 0 0;
	line-height: 1.5;
}

.rc-sessions {
	margin-top: 14px;
	padding-top: 12px;
	border-top: 1px dashed var(--color-border-2);
}

.rc-sessions-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 8px;
}

.rc-session {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 6px 0;
}

.rc-session-main {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	font-size: 12px;
}

.rc-session-main > span:first-child {
	max-width: 100%;
}

.rc-network {
	margin-top: 12px;
	padding-top: 12px;
	border-top: 1px solid var(--color-border-2);
}

.rc-network-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	font-size: 13px;
	margin-bottom: 8px;
}

.rc-report {
	padding: 10px 12px;
	border-radius: 8px;
	background: var(--color-fill-1);
	border-left: 3px solid var(--color-border-3);
}

.rc-report.public-direct {
	border-left-color: rgb(var(--success-6));
}

.rc-report.nat {
	border-left-color: rgb(var(--warning-6));
}

.rc-report.unknown {
	border-left-color: var(--color-border-3);
}

.rc-report-title {
	margin: 0 0 4px;
	font-size: 13px;
	font-weight: 600;
}

.rc-report-msg {
	margin: 0 0 4px;
	font-size: 12px;
	line-height: 1.6;
	color: var(--color-text-2);
}

.rc-report-tip {
	margin: 0;
	font-size: 12px;
	line-height: 1.6;
	color: var(--color-text-3);
}

.rc-public {
	margin-top: 8px;
	padding-top: 8px;
	border-top: 1px dashed var(--color-border-2);
}

.rc-public > p {
	margin: 0 0 6px;
}

.rc-qr-target {
	max-width: 180px;
	word-break: break-all;
}

.num {
	font-variant-numeric: tabular-nums;
}

:deep(.arco-card) {
	margin-bottom: 16px;
}
</style>
