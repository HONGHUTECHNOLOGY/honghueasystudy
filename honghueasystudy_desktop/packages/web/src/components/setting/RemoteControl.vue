<template>
	<a-card title="远程控制">
		<Description label="开启远程控制">
			<a-tooltip
				content="开启后会在本机启动一个网页服务，手机等设备可通过浏览器访问，查看运行状态并操作浏览器实例。关闭软件后服务自动停止。"
			>
				<a-switch
					size="small"
					:model-value="status.running"
					:loading="state.pending"
					@change="onToggle"
				/>
			</a-tooltip>
		</Description>

		<Description label="允许局域网访问">
			<a-tooltip content="关闭后仅本机可访问（127.0.0.1），手机将无法连接。仅在需要排查问题时关闭。">
				<a-switch
					size="small"
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
					size="small"
					:model-value="settings.tunnel.enabled"
					:disabled="!status.running"
					@change="onTunnelChange"
				/>
			</a-tooltip>
		</Description>

		<!-- 固定域名（Cloudflare 命名隧道） -->
		<div
			v-if="settings.tunnel.enabled"
			class="rc-named"
		>
			<div class="rc-named-row">
				<a-input
					v-model="tunnelHostnameDraft"
					size="small"
					placeholder="固定域名，如 remote.example.com"
					allow-clear
					@input="tunnelDirty = true"
				/>
				<a-input-password
					v-model="tunnelTokenDraft"
					size="small"
					:placeholder="
						status.tunnelConfig?.hasToken ? 'Token 已保存（留空不修改）' : 'Cloudflare 隧道 Token'
					"
					allow-clear
					@input="tunnelDirty = true"
				/>
				<a-button
					size="mini"
					type="primary"
					:loading="state.savingTunnel"
					@click="saveTunnelConfig"
				>
					保存
				</a-button>
				<a-button
					v-if="status.tunnelConfig?.hasToken || status.tunnelConfig?.hostname"
					size="mini"
					@click="clearTunnelConfig"
				>
					用随机域名
				</a-button>
				<a-button
					size="mini"
					type="text"
					@click="guideVisible = true"
				>
					操作指导
				</a-button>
			</div>
			<p class="rc-faint rc-note">
				填了域名和 Token 就走固定域名；两项留空则继续使用随机域名。不知道 Cloudflare 那边怎么点，点上方「操作指导」。
			</p>
		</div>

		<a-modal
			v-model:visible="guideVisible"
			title="Cloudflare 固定域名配置指导"
			:footer="false"
			:width="620"
		>
			<div class="rc-guide">
				<p class="rc-guide-lead">
					只需要配一次，之后软件每次启动都用同一个域名。前提：你的域名已托管在
					Cloudflare（域名的 DNS 服务器改成了 Cloudflare 分配的那两个）。
				</p>

				<ol>
					<li>
						<b>创建隧道</b>：打开
						<a @click.prevent="openExternal(CF_DASHBOARD)">Cloudflare 控制台 · Tunnels</a>
						→ 左侧「Networking / 网络」→「Tunnels / 隧道」→「Create a tunnel / 创建隧道」→
						输入一个名字 →「Create Tunnel / 创建隧道」。
					</li>
					<li>
						<b>复制 Token</b>：下一步会显示安装命令（Windows 下形如
						<code>cloudflared.exe service install eyJ...</code>），只复制
						<code>eyJ...</code> 这一段。<b>不要在本机执行这条命令</b>：连接器由本软件启动，
						重复安装会多出一个开机自启的后台服务，和软件重复连接同一个隧道。
					</li>
					<li>
						<b>添加公网地址</b>（新版控制台在「路由」里）：如果向导停在「等待连接器连接」不用等，
						直接回「Tunnels / 隧道」列表选中刚建的隧道 →「Routes / 路由」标签 →
						「Add route / 添加路由」→「Published application / 已发布应用」：
						<ul>
							<li>子域 + 域名：例如 <code>remote</code> + <code>example.com</code>，最终域名是 <code>https://remote.example.com</code></li>
							<li>Service URL：<code>http://127.0.0.1:{{ status.port }}</code>（端口要和上面「服务端口」一致）</li>
						</ul>
						保存后 Cloudflare 会自动创建好 DNS 记录，不用手动加。
					</li>
					<li>
						<b>回到本软件</b>：在「固定域名」里填
						<code>https://remote.example.com</code>，Token 粘贴刚复制的那段，点「保存」。隧道状态变为
						「固定域名」即成功。
					</li>
					<li>
						<b>手机访问</b>：打开这个固定域名，输入上方显示的配对码即可。之后地址一直不变，可以直接收藏。
					</li>
				</ol>

				<a-alert
					type="info"
					:show-icon="false"
					content="常见问题：新版控制台的「公共主机名 / Public Hostname」已改名为「Routes → Add route → Published application」。提示「固定域名未就绪」多为 Service URL 的端口与软件端口不一致，或域名还没托管在 Cloudflare；提示「Token 无效」说明 Token 复制不完整或隧道已被删除，重新复制即可；隧道一直连不上时，检查网络是否放行到 Cloudflare 的 7844 端口（UDP）。"
				/>

				<div class="rc-guide-actions">
					<a-button
						size="small"
						type="primary"
						@click="openExternal(CF_DASHBOARD)"
					>
						打开 Cloudflare 控制台
					</a-button>
					<a-button
						size="small"
						@click="openExternal(CF_DOCS)"
					>
						官方文档
					</a-button>
				</div>
			</div>
		</a-modal>

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
					v-for="(url, index) in status.addresses"
					:key="url"
					class="rc-address"
					@click="copy(url)"
				>
					<span class="ellipsis">
						{{ url }}
					</span>
					<em
						v-if="index === 0 && status.addresses.length > 1"
						class="rc-addr-badge"
					>
						推荐
					</em>
					<a-tag
						v-if="status.addresses.length > 1"
						size="small"
						:bordered="false"
						@click.stop="useUrl(url)"
					>
						生成二维码
					</a-tag>
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
					>
						{{ status.tunnel.mode === 'named' ? '固定域名' : '随机域名' }}
					</a-tag>
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
					<a-spin
						:size="14"
						style="margin-right: 6px"
					/>
					<span class="rc-faint">隧道未运行，正在自动重连…</span>
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
						v-if="qrFullTarget"
						class="rc-faint rc-qr-target ellipsis"
					>
						{{ qrFullTarget }}
					</p>
					<p
						v-if="status.addresses.length > 1 && !qrTarget"
						class="rc-faint"
					>
						扫码打不开？用上方其他地址重新生成二维码。
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
import { remote } from '../../utils/remote';
import { electron } from '../../utils/node';

/** Cloudflare 控制台 · Tunnels（新版在主导航 Networking > Tunnels，直接深链过去） */
const CF_DASHBOARD = 'https://dash.cloudflare.com/?to=/:account/tunnels';
/** 官方文档：创建远程隧道（Token 方式，2026 版路径） */
const CF_DOCS =
	'https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/';

const { shell } = electron;

/** 外链走系统浏览器，不在应用内新开页面 */
function openExternal(url: string) {
	shell.openExternal(url);
}

interface TunnelInfo {
	state: string;
	url: string;
	error: string;
	progress: number;
	/** 是否随安装包内置（内置时无需下载） */
	builtin?: boolean;
	/** quick=随机域名；named=账号固定域名 */
	mode?: 'quick' | 'named';
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
	/** 设置里是否开启了内网穿透（后端权威值，用来校正界面开关） */
	tunnelEnabled?: boolean;
	/** 固定域名配置（后端不回传 Token 本身，只告诉是否已设置） */
	tunnelConfig?: { hasToken: boolean; hostname: string };
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
	savingPassword: false,
	savingTunnel: false
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
/** 固定域名草稿（后端只回传域名，不清空用户正在输入的内容） */
const tunnelHostnameDraft = ref('');
/** Token 草稿：留空表示「保持已保存的 Token 不变」 */
const tunnelTokenDraft = ref('');
/** 用户正在编辑时，3 秒轮询不要用后端值覆盖输入框 */
let tunnelDirty = false;
/** 固定域名操作指导弹窗 */
const guideVisible = ref(false);

/** 穿透组件提示：内置版和需下载版的说明不同 */
const tunnelTip = computed(() => {
	const prefix = status.tunnel.builtin
		? '开启后会通过 Cloudflare 生成公网地址，手机在任意网络下都能访问。穿透组件已随安装包内置，无需下载。'
		: '开启后会通过 Cloudflare 生成公网地址，手机在任意网络下都能访问。当前安装包未内置穿透组件，首次使用需下载（约 40MB，视网络情况可能耗时数分钟）。';
	return prefix + '默认是每次都不一样的随机域名；填了固定域名和 Token 后地址固定不变。';
});

/** 二维码提示语随验证方式变化 */
const qrTip = computed(() => {
	if (authModeDraft.value === 'password') return '扫码后输入你设置的访问密码即可进入';
	if (authModeDraft.value === 'none') return '扫码后可直接进入（免验证模式）';
	return '扫码后配对码已自动填充，点「连接设备」即可';
});

/**
 * 二维码当前指向的地址。
 * 默认用后端算出的推荐地址（隧道运行时为公网地址），手动选地址时显示所选地址——
 * 让用户一眼看出码扫的是哪个 IP，出问题时能直接判断是不是选错了网卡。
 */
const qrFullTarget = computed(() => qrTarget.value || status.preferredUrl || '');

let timer: ReturnType<typeof setInterval> | undefined;
/**
 * 上次与后端同步过的访问方式。
 * 轮询回填时只在「用户没有进行中的切换」时覆盖界面选择，
 * 否则用户刚点开「密码」还没来得及设置，就会被 3 秒轮询重置回配对码。
 */
let lastSyncedMode: 'pair' | 'password' | 'none' = 'pair';

/** 上次见到的推荐地址，用于判断网络变化后是否需要重建二维码 */
let lastPreferredUrl = '';

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

		/**
		 * 开关状态以后端设置为准。
		 * 之前只在组件挂载时读一次设置，后端因故关掉隧道（如切到免验证）后，
		 * 界面开关会一直显示「开」，用户看到的就是「开关是打开的但隧道没了」。
		 */
		if (typeof data.tunnelEnabled === 'boolean' && data.tunnelEnabled !== settings.tunnel.enabled) {
			settings.tunnel.enabled = data.tunnelEnabled;
		}
		settings.allowLan = data.allowLan !== false;

		/** 回填已保存的固定域名（用户正在编辑时不覆盖） */
		if (!tunnelDirty && data.tunnelConfig) {
			tunnelHostnameDraft.value = data.tunnelConfig.hostname || '';
		}

		/** 以后端已生效的配置为准回填界面选择（用户有进行中的切换时不覆盖） */
		const serverMode = data.authMode || 'pair';
		if (authModeDraft.value === lastSyncedMode) {
			authModeDraft.value = serverMode;
		}
		lastSyncedMode = serverMode;

		/**
		 * 推荐地址会随网络变化（切换 Wi-Fi、插拔网线、开隧道）。
		 * 用户没有手动指定地址时，让它自动跟着重建二维码；手动指定过就不打扰。
		 */
		const preferred = data.preferredUrl || '';
		if (!qrTarget.value && preferred && preferred !== lastPreferredUrl) {
			const isFirstSync = !lastPreferredUrl;
			lastPreferredUrl = preferred;
			if (!isFirstSync) await loadQR();
		}
	} catch (e) {
		console.error('获取远程控制状态失败', e);
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
		/** 由主进程写入设置并启停，避免渲染端整份覆盖配置 */
		await remote.methods.call('rcSetEnabled' as any, enabled);
		if (enabled) {
			Message.success('远程控制已开启');
			await loadQR();
			await detect(false);
		} else {
			Message.info('远程控制已关闭');
		}
		await loadStatus();
	} catch (e) {
		Message.error('操作失败：' + String(e));
		await loadStatus();
	} finally {
		state.pending = false;
	}
}

async function onAllowLanChange(value: string | number | boolean) {
	const allowLan = !!value;
	try {
		await remote.methods.call('rcSetAllowLan' as any, allowLan);
		await loadStatus();
		qrDataUrl.value = '';
		await loadQR();
	} catch (e) {
		Message.error(String(e));
		await loadStatus();
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

/** 保存固定域名配置：域名 + Token 齐备后隧道会自动从随机域名切换过去 */
async function saveTunnelConfig() {
	const hostname = tunnelHostnameDraft.value.trim();
	const token = tunnelTokenDraft.value.trim();

	if (!hostname) {
		Message.warning('请填写固定域名（例如 remote.example.com）');
		return;
	}
	if (!token && !status.tunnelConfig?.hasToken) {
		Message.warning('还需要填写 Cloudflare 隧道 Token');
		return;
	}

	state.savingTunnel = true;
	try {
		const patch: { token?: string; hostname?: string } = { hostname };
		/** 留空表示不修改已保存的 Token */
		if (token) patch.token = token;
		await remote.methods.call('rcSetTunnelConfig' as any, patch);
		tunnelTokenDraft.value = '';
		tunnelDirty = false;
		await loadStatus();
		Message.success('已保存，隧道正在切换到固定域名…');
	} catch (e) {
		Message.error(errText(e));
	} finally {
		state.savingTunnel = false;
	}
}

/** 清空固定域名配置，回到随机域名 */
async function clearTunnelConfig() {
	state.savingTunnel = true;
	try {
		await remote.methods.call('rcSetTunnelConfig' as any, { token: '', hostname: '' });
		tunnelTokenDraft.value = '';
		tunnelHostnameDraft.value = '';
		tunnelDirty = false;
		await loadStatus();
		Message.success('已改回随机域名');
	} catch (e) {
		Message.error(errText(e));
	} finally {
		state.savingTunnel = false;
	}
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

/** 持久化设置：已移除，远程控制配置统一由主进程 rc* 接口写入 */

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
	/** 开关与地址全部来自后端状态，不再读取渲染端的设置快照 */
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
	border-radius: var(--r-md);
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

.rc-addr-badge {
	flex: none;
	padding: 0 5px;
	border-radius: var(--r-xs);
	background: rgb(var(--primary-1));
	color: rgb(var(--primary-6));
	font-size: 10px;
	font-style: normal;
	line-height: 16px;
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

/** 固定域名配置区 */
.rc-named {
	margin: 4px 0 10px;
	padding: 10px 12px;
	border-radius: var(--r-sm);
	background: var(--color-fill-1);
}

.rc-named-row {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.rc-named-row > :first-child {
	flex: 1 1 200px;
	min-width: 160px;
}

.rc-named-row > :nth-child(2) {
	flex: 1 1 240px;
	min-width: 180px;
}

.rc-named code {
	padding: 1px 4px;
	border-radius: 3px;
	background: var(--color-fill-2);
	font-size: 11px;
}

/** 操作指导弹窗 */
.rc-guide {
	font-size: 13px;
	line-height: 1.75;
	color: var(--color-text-1);
}

.rc-guide-lead {
	margin: 0 0 10px;
	color: var(--color-text-2);
}

.rc-guide ol {
	margin: 0 0 12px;
	padding-left: 20px;
}

.rc-guide li {
	margin-bottom: 8px;
}

.rc-guide li ul {
	margin: 4px 0;
	padding-left: 18px;
	color: var(--color-text-2);
}

.rc-guide code {
	padding: 1px 5px;
	border-radius: 3px;
	background: var(--color-fill-2);
	font-size: 12px;
	word-break: break-all;
}

.rc-guide a {
	color: rgb(var(--primary-6));
	cursor: pointer;
}

.rc-guide a:hover {
	text-decoration: underline;
}

.rc-guide-actions {
	display: flex;
	gap: 8px;
	margin-top: 14px;
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
	border-radius: var(--r-md);
	border: 1px solid var(--color-border-2);
}

.rc-auth {
	margin: 12px 0;
	padding: 14px;
	border-radius: var(--r-md);
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
	border-radius: var(--r-md);
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
	border-radius: var(--r-sm);
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
