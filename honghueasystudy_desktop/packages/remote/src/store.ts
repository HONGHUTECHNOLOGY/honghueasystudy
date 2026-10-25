import { reactive } from 'vue';
import { api, AuthError, BrowserSnapshot, RemoteSnapshot, ServiceInfo, TunnelStatus } from './api';
import { copyText } from './utils';

export interface ToastItem {
	id: number;
	text: string;
	type: 'info' | 'success' | 'error';
}

export type ThemeMode = 'auto' | 'dark' | 'light';

interface State {
	ready: boolean;
	authed: boolean;
	loading: boolean;
	appVersion: string;
	deviceName: string;
	port: number;
	/** 服务端当前的访问验证方式 */
	authMode: 'pair' | 'password' | 'none';
	hasPassword: boolean;
	browsers: BrowserSnapshot[];
	logs: { [uid: string]: string[] };
	service: ServiceInfo | null;
	tunnel: TunnelStatus | null;
	sessionCount: number;
	connected: boolean;
	error: string;
	toasts: ToastItem[];
	pending: { [uid: string]: string };
	/** 最近一次收到快照的时间 */
	lastUpdate: number;
}

export const state = reactive<State>({
	ready: false,
	authed: false,
	loading: false,
	appVersion: '',
	deviceName: '',
	port: 0,
	authMode: 'pair',
	hasPassword: false,
	browsers: [],
	logs: {},
	service: null,
	tunnel: null,
	sessionCount: 0,
	connected: false,
	error: '',
	toasts: [],
	pending: {},
	lastUpdate: 0
});

/** 界面态（与业务数据分开） */
export const ui = reactive({
	tab: 'home' as 'home' | 'logs' | 'about',
	detailUid: '',
	theme: 'auto' as ThemeMode
});

// ------------------------------------------------------------------ Toast

let toastSeq = 0;

export function toast(text: string, type: ToastItem['type'] = 'info') {
	const id = ++toastSeq;
	state.toasts.push({ id, text, type });
	setTimeout(() => {
		const index = state.toasts.findIndex((t) => t.id === id);
		if (index !== -1) state.toasts.splice(index, 1);
	}, 3200);
}

/** 复制并给出反馈；非安全上下文下会走 execCommand 回退 */
export async function copyWithToast(text: string, label = '已复制') {
	const ok = await copyText(text);
	toast(ok ? label : '复制失败，请长按手动选择', ok ? 'success' : 'error');
}

// ------------------------------------------------------------------ 主题

const THEME_KEY = 'hh-remote:theme';

function readTheme(): ThemeMode {
	try {
		const raw = localStorage.getItem(THEME_KEY);
		if (!raw) return 'auto';
		let value: unknown = raw;
		try {
			value = JSON.parse(raw);
		} catch {
			/* 兼容直接写入裸字符串的旧值 */
		}
		if (value === 'dark' || value === 'light' || value === 'auto') return value;
	} catch {
		/* 隐私模式 */
	}
	return 'auto';
}

function preferDark(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return true;
	return !window.matchMedia('(prefers-color-scheme: light)').matches;
}

export function resolveDark(): boolean {
	if (ui.theme === 'dark') return true;
	if (ui.theme === 'light') return false;
	return preferDark();
}

export function applyTheme(): void {
	const dark = resolveDark();
	const root = document.documentElement;
	root.setAttribute('data-theme', dark ? 'dark' : 'light');
	/** 让移动端浏览器地址栏 / 状态栏跟随主题 */
	const metas = document.querySelectorAll('meta[name="theme-color"]');
	for (let i = 0; i < metas.length; i++) {
		metas[i].removeAttribute('media');
		metas[i].setAttribute('content', dark ? '#08090c' : '#f4f5f8');
	}
}

export function setTheme(mode: ThemeMode): void {
	ui.theme = mode;
	try {
		localStorage.setItem(THEME_KEY, JSON.stringify(mode));
	} catch {
		/* 忽略写入失败 */
	}
	applyTheme();
}

/** 启动时初始化主题，并跟随系统变化 */
export function initTheme(): void {
	ui.theme = readTheme();
	applyTheme();
	if (typeof window !== 'undefined' && window.matchMedia) {
		const media = window.matchMedia('(prefers-color-scheme: light)');
		const onChange = () => {
			if (ui.theme === 'auto') applyTheme();
		};
		if (media.addEventListener) media.addEventListener('change', onChange);
		else if (media.addListener) media.addListener(onChange);
	}
}

// ------------------------------------------------------------------ SSE

let source: EventSource | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;
let disposed = false;

function applySnapshot(snapshot: RemoteSnapshot | null) {
	if (!snapshot) return;
	state.browsers = snapshot.browsers || [];
	state.logs = snapshot.logs || {};
	state.lastUpdate = Date.now();
}

export function connect() {
	if (disposed) return;
	closeSource();

	try {
		source = new EventSource('/api/events');
	} catch {
		scheduleReconnect();
		return;
	}

	source.onopen = () => {
		state.connected = true;
		retryDelay = 1000;
	};

	source.addEventListener('state', (event: MessageEvent) => {
		try {
			applySnapshot(JSON.parse(event.data));
		} catch {}
	});

	source.addEventListener('sessions', (event: MessageEvent) => {
		try {
			const list = JSON.parse(event.data);
			state.sessionCount = Array.isArray(list) ? list.length : 0;
		} catch {}
	});

	source.addEventListener('tunnel', (event: MessageEvent) => {
		try {
			state.tunnel = JSON.parse(event.data);
		} catch {}
	});

	source.addEventListener('revoked', (event: MessageEvent) => {
		let reason = '连接已被断开，请重新配对';
		try {
			const data = JSON.parse(event.data);
			if (data && data.reason) reason = data.reason;
		} catch {}
		handleAuthLost(reason);
	});

	source.onerror = () => {
		state.connected = false;
		closeSource();
		scheduleReconnect();
	};
}

function closeSource() {
	if (source) {
		source.close();
		source = null;
	}
}

function scheduleReconnect() {
	if (disposed) return;
	if (retryTimer) clearTimeout(retryTimer);

	retryTimer = setTimeout(async () => {
		retryTimer = undefined;
		try {
			const ping = await api.ping();
			if (!ping.authed) {
				handleAuthLost('登录已失效，请重新配对');
				return;
			}
			connect();
		} catch {
			retryDelay = Math.min(retryDelay * 1.8, 15000);
			scheduleReconnect();
		}
	}, retryDelay);
}

export function disconnect() {
	disposed = true;
	closeSource();
	if (retryTimer) clearTimeout(retryTimer);
	state.connected = false;
}

// ------------------------------------------------------------------ 会话

function handleAuthLost(reason: string) {
	state.authed = false;
	state.browsers = [];
	state.logs = {};
	state.connected = false;
	closeSource();
	toast(reason, 'error');
}

/** 首次进入：探测会话状态 */
export async function bootstrap() {
	state.loading = true;
	try {
		const ping = await api.ping();
		state.appVersion = ping.appVersion || '';
		state.deviceName = ping.deviceName || '';
		state.port = ping.port || 0;
		state.authMode = ping.authMode || 'pair';
		state.hasPassword = !!ping.hasPassword;
		state.authed = !!ping.authed;
		if (state.authed) {
			await refresh();
			connect();
		}
	} catch (e) {
		state.error = e instanceof Error ? e.message : String(e);
	} finally {
		state.loading = false;
		state.ready = true;
	}
}

/** 拉取一次完整状态 */
export async function refresh() {
	try {
		const data = await api.state();
		applySnapshot(data.snapshot);
		state.service = data.service || null;
		state.tunnel = data.service ? data.service.tunnel : null;
		state.sessionCount = data.sessions || 0;
		state.error = '';
	} catch (e) {
		if (e instanceof AuthError) {
			handleAuthLost('登录已失效，请重新配对');
		} else {
			state.error = e instanceof Error ? e.message : String(e);
		}
	}
}

/** 手动刷新（带反馈） */
export async function refreshManually() {
	await refresh();
	if (!state.error) toast('已同步最新状态', 'success');
}

/** 验证访问（配对码或密码，由服务端按当前模式判定） */
export async function authenticate(secret: string) {
	state.loading = true;
	try {
		await api.auth(secret);
		state.authed = true;
		await refresh();
		connect();
		toast('连接成功', 'success');
		return true;
	} finally {
		state.loading = false;
	}
}

/** 退出登录 */
export async function logout() {
	try {
		await api.logout();
	} catch {}
	disconnect();
	state.authed = false;
	state.browsers = [];
	state.logs = {};
	state.service = null;
	disposed = false;
	toast('已退出登录', 'info');
}

// ------------------------------------------------------------------ 命令

/** 执行命令，自动处理错误与 pending 态 */
export async function runCommand(action: string, payload: Record<string, any> = {}, pendingKey?: string) {
	const key = pendingKey || payload.uid || action;
	state.pending[key] = action;
	try {
		const res = await api.command(action, payload);
		return res.data;
	} catch (e) {
		if (e instanceof AuthError) {
			handleAuthLost('登录已失效，请重新配对');
		} else {
			toast(e instanceof Error ? e.message : String(e), 'error');
		}
		throw e;
	} finally {
		delete state.pending[key];
	}
}
