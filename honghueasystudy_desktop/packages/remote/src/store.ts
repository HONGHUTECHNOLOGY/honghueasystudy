import { reactive } from 'vue';
import {
	api,
	AuthError,
	AutomationJob,
	BrowserSnapshot,
	RemoteScript,
	RemoteSnapshot,
	ServiceInfo,
	TunnelStatus
} from './api';
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
	/**
	 * 最近一次「快照内容真正变化」的时间（本地时钟）
	 *
	 * 主进程会缓存桌面端最后一次上报的快照，反复拉 /api/state 拿到的还是同一份内容。
	 * 因此不能用 lastUpdate 判断停滞——那只会证明「我们在轮询」，不证明「桌面端在上报」。
	 * 这里改成跟踪快照自身的时间戳是否推进。
	 */
	snapshotAt: number;
	/** 自动化脚本目录（登录脚本 + 字段声明） */
	scripts: RemoteScript[];
	/** 每个实例最近一次「登录 → 选课」任务 */
	automation: { [uid: string]: AutomationJob };
	/** 自动化相关请求的进行中标记：uid → run / courses / enter */
	automationBusy: { [uid: string]: 'run' | 'courses' | 'enter' };
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
	lastUpdate: 0,
	snapshotAt: 0,
	scripts: [],
	automation: {},
	automationBusy: {}
});

/** 界面态（与业务数据分开） */
export const ui = reactive({
	tab: 'home' as 'home' | 'logs' | 'about',
	detailUid: '',
	/** 是否打开了「自动登录 / 选课」面板（挂在当前详情实例上） */
	automationOpen: false,
	theme: 'auto' as ThemeMode
});

/**
 * 远程端时钟
 *
 * 用来判断「当前展示的状态是不是已经停止推进了」。
 * 页面里的时间不能只靠一次性计算，否则卡片会一直停留在旧的判断上。
 */
export const clock = reactive({ now: Date.now() });

/**
 * 状态停滞的判断阈值
 *
 * 桌面端正常时每 3 秒上报一次，SSE 会立刻推过来；
 * 超过这个时间还没有新快照，说明桌面端的上报链路停了（窗口被冻结、桥接异常）。
 */
const STALE_AFTER = 12000;

/** 当前展示的状态是否可能已经停滞 */
export function isSnapshotStale(): boolean {
	if (!state.authed) return false;
	if (!state.snapshotAt) return true;
	return clock.now - state.snapshotAt > STALE_AFTER;
}

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

// ------------------------------------------------------------------ 过渡态

/**
 * 本地乐观状态
 *
 * 点击「启动」后，主进程要等渲染进程把 worker 拉起来才会有新的状态可上报，
 * 这段空窗里推送过来的快照仍然是「未运行」，界面看起来就像点了没反应。
 * 所以点击瞬间先在本地把该实例标成 launching / closing，
 * 等后端快照确认（状态已离开原状态）或超时后自动交还给后端数据。
 */
const optimistic = new Map<string, { status: 'launching' | 'closing' | 'launched'; at: number }>();

/**
 * 乐观状态兜底过期时间
 *
 * 正常情况下后端 1~2 秒内就会把状态改成 launching，20 秒还没被确认基本可以判定失败
 * （worker 起不来 / 命令没送达），此时必须回落到真实状态，不能永远显示「启动中」。
 */
const OPTIMISTIC_TTL = 20 * 1000;

/** 过渡态轮询间隔：只要还有 launching / closing，就按这个节奏主动拉状态 */
const TRACK_INTERVAL = 2000;
/** 实时连接断开时的兜底轮询间隔 */
const FALLBACK_INTERVAL = 8000;

let trackTimer: ReturnType<typeof setInterval> | undefined;
let fallbackTimer: ReturnType<typeof setInterval> | undefined;

function isTransient(list: BrowserSnapshot[]): boolean {
	return list.some((b) => b.status === 'launching' || b.status === 'closing');
}

/**
 * 已确认启动后的「粘住」时长
 *
 * 启动命令返回 launched 时浏览器确实已经起来了，但桌面端的快照可能有 1~2 秒延迟
 * （渲染进程要先刷新页面列表才会打包上报）。这段时间里拉回来的还是旧的「启动中」，
 * 直接覆盖会让界面从「运行中 + 截图」闪回「启动中」，看起来像启动失败。
 */
const LAUNCHED_HOLD = 8000;

/** 把本地乐观状态叠加到后端快照上 */
function mergeOptimistic(list: BrowserSnapshot[]): BrowserSnapshot[] {
	if (optimistic.size === 0) return list;
	const now = Date.now();

	return list.map((item) => {
		const local = optimistic.get(item.uid);
		if (!local) return item;

		/** 已确认启动：短暂压住更旧的快照，避免闪回启动中 */
		if (local.status === 'launched') {
			if (item.status === 'launched' || now - local.at > LAUNCHED_HOLD) {
				optimistic.delete(item.uid);
				return item;
			}
			return { ...item, status: 'launched' };
		}

		if (now - local.at > OPTIMISTIC_TTL) {
			optimistic.delete(item.uid);
			return item;
		}

		if (local.status === 'launching') {
			/** 后端已确认（启动中或已就绪）→ 交还给后端数据 */
			if (item.status !== 'closed') {
				optimistic.delete(item.uid);
				return item;
			}
			return { ...item, status: 'launching' };
		}

		/** closing：后端已变成关闭态则交还，否则继续显示关闭中 */
		if (item.status === 'closed') {
			optimistic.delete(item.uid);
			return item;
		}
		return { ...item, status: 'closing' };
	});
}

/** 就地改本地显示状态，点击瞬间立刻见效，不必等下一次快照 */
function patchLocalStatus(uid: string, status: BrowserSnapshot['status']) {
	const item = state.browsers.find((b) => b.uid === uid);
	if (item) item.status = status;
}

/**
 * 过渡态跟踪
 *
 * SSE 正常时状态会主动推过来，但推送依赖渲染进程的上报（最长 5 秒心跳），
 * 移动网络下 SSE 也可能被中间设备掐断。这里在「启动中 / 关闭中」期间
 * 以 2 秒的节奏主动拉取，状态稳定后自动停止，保证操作后一定能看到结果。
 */
function ensureTracking(): void {
	const need = optimistic.size > 0 || isTransient(state.browsers);

	if (!need) {
		if (trackTimer) {
			clearInterval(trackTimer);
			trackTimer = undefined;
		}
		return;
	}

	if (trackTimer) return;
	trackTimer = setInterval(async () => {
		if (!state.authed) {
			if (trackTimer) {
				clearInterval(trackTimer);
				trackTimer = undefined;
			}
			return;
		}
		await refresh();
		if (optimistic.size === 0 && !isTransient(state.browsers)) {
			if (trackTimer) {
				clearInterval(trackTimer);
				trackTimer = undefined;
			}
		}
	}, TRACK_INTERVAL);
}

/** 实时连接不可用时的兜底刷新，避免状态彻底停滞 */
function ensureFallbackTimer(): void {
	if (fallbackTimer) return;
	fallbackTimer = setInterval(() => {
		if (!state.authed || state.connected) return;
		refresh();
	}, FALLBACK_INTERVAL);
}

/**
 * 主动唤醒桌面端
 *
 * 桌面端窗口被最小化 / 被遮挡时，Chromium 可能冻结渲染进程的定时器，
 * 状态上报随之停摆——浏览器其实已经起来了，远程端却一直显示「启动中」。
 * 这里让远程端发现停滞时推一把，主进程会催渲染进程立刻补报。
 */
let lastSyncAt = 0;

export async function requestSync(): Promise<void> {
	if (!state.authed) return;
	if (Date.now() - lastSyncAt < 4000) return;
	lastSyncAt = Date.now();
	try {
		await api.sync();
	} catch {
		/* 唤醒失败不打扰用户，下一个时钟周期会重试 */
	}
}

/** 远程端时钟 + 停滞自愈 */
let clockTimer: ReturnType<typeof setInterval> | undefined;

function ensureClock(): void {
	if (clockTimer) return;
	clockTimer = setInterval(() => {
		clock.now = Date.now();
		if (!state.authed) return;
		if (isSnapshotStale()) requestSync();
	}, 2500);
}

// ------------------------------------------------------------------ SSE

let source: EventSource | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 1000;
let disposed = false;

/** 最近一次快照的原始时间戳，用于识别内容是否真的推进了 */
let lastSnapshotTs = 0;

function applySnapshot(snapshot: RemoteSnapshot | null) {
	if (!snapshot) return;
	state.browsers = mergeOptimistic(snapshot.browsers || []);
	state.logs = snapshot.logs || {};
	state.lastUpdate = Date.now();
	if (snapshot.ts && snapshot.ts !== lastSnapshotTs) {
		lastSnapshotTs = snapshot.ts;
		state.snapshotAt = state.lastUpdate;
	}
	ensureTracking();
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
		/** 断线期间可能错过了状态变化，重连后立即补一次全量 */
		refresh();
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

	/** 登录脚本跑完 / 课程列表刷新完成：桌面端主动推送，不必等轮询 */
	source.addEventListener('automation', (event: MessageEvent) => {
		try {
			const job = JSON.parse(event.data) as AutomationJob;
			if (!job || !job.uid) return;
			state.automation[job.uid] = job;
			if (job.state !== 'running') stopAutomationPoll(job.uid);
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
			ensureFallbackTimer();
			ensureClock();
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
		ensureFallbackTimer();
		ensureClock();
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

// ------------------------------------------------------------------ 启动 / 关闭

/** 标记为「启动中」并开始跟踪（乐观反馈） */
function markLaunching(uid: string) {
	optimistic.set(uid, { status: 'launching', at: Date.now() });
	patchLocalStatus(uid, 'launching');
	ensureTracking();
}

/** 标记为「关闭中」并开始跟踪（乐观反馈） */
function markClosing(uid: string) {
	optimistic.set(uid, { status: 'closing', at: Date.now() });
	patchLocalStatus(uid, 'closing');
	ensureTracking();
}

/**
 * 启动浏览器
 *
 * 点击后立刻在本地显示「启动中」，命令返回后不丢弃结果；
 * 失败时撤销乐观状态并回落到真实快照，避免界面停在「启动中」。
 */
export async function launchBrowser(uid: string) {
	markLaunching(uid);
	try {
		const data = await runCommand('browser.launch', { uid }, uid);

		/** 命令返回时浏览器可能已经就绪（冷启动很快的情况），直接收敛，不用再等快照 */
		if (data && data.status === 'launched') {
			/** 用「已确认启动」压住随后可能到达的旧快照，避免闪回启动中 */
			optimistic.set(uid, { status: 'launched', at: Date.now() });
			patchLocalStatus(uid, 'launched');
			ensureTracking();
		} else if (optimistic.has(uid)) {
			/** 后端已受理，续期一次，避免后端状态上报稍慢时本地标记先过期 */
			optimistic.set(uid, { status: 'launching', at: Date.now() });
		}
		return data;
	} catch (e) {
		optimistic.delete(uid);
		await refresh();
		throw e;
	}
}

/** 关闭浏览器 */
export async function closeBrowser(uid: string) {
	markClosing(uid);
	try {
		const data = await runCommand('browser.close', { uid }, uid);
		if (optimistic.has(uid)) optimistic.set(uid, { status: 'closing', at: Date.now() });
		return data;
	} catch (e) {
		optimistic.delete(uid);
		await refresh();
		throw e;
	}
}

/** 批量启动：先全部标成启动中，再发一条批量指令 */
export async function launchAllBrowsers() {
	const targets = state.browsers.filter((b) => b.status === 'closed');
	targets.forEach((b) => markLaunching(b.uid));
	try {
		const data = await runCommand('browser.batchLaunch', {}, 'batch');
		toast(targets.length ? `已发送启动指令（${targets.length} 个）` : '没有需要启动的实例', 'success');
		return data;
	} catch (e) {
		targets.forEach((b) => optimistic.delete(b.uid));
		await refresh();
		throw e;
	}
}

/** 批量关闭 */
export async function closeAllBrowsers() {
	const targets = state.browsers.filter((b) => b.status === 'launched' || b.status === 'launching');
	targets.forEach((b) => markClosing(b.uid));
	try {
		const data = await runCommand('browser.batchClose', {}, 'batch');
		toast(`已发送关闭指令（${targets.length} 个）`, 'success');
		return data;
	} catch (e) {
		targets.forEach((b) => optimistic.delete(b.uid));
		await refresh();
		throw e;
	}
}

// ------------------------------------------------------------------ 自动化（登录 → 选课）

/** 进行中的自动化轮询：SSE 断线时仍能看到登录结果 */
const automationTimers = new Map<string, ReturnType<typeof setInterval>>();

/** 轮询上限：登录 + 选课最坏也就几分钟，超时后停掉，避免后台常驻 */
const AUTOMATION_POLL_LIMIT = 8 * 60 * 1000;

function startAutomationPoll(uid: string): void {
	if (automationTimers.has(uid)) return;

	const startedAt = Date.now();
	const timer = setInterval(async () => {
		if (Date.now() - startedAt > AUTOMATION_POLL_LIMIT) {
			stopAutomationPoll(uid);
			return;
		}
		const job = await fetchAutomation(uid);
		if (!job || job.state !== 'running') stopAutomationPoll(uid);
	}, 3000);

	automationTimers.set(uid, timer);
}

function stopAutomationPoll(uid: string): void {
	const timer = automationTimers.get(uid);
	if (timer) {
		clearInterval(timer);
		automationTimers.delete(uid);
	}
}

/** 拉取脚本目录（登录脚本 + 字段声明），只成功拉一次 */
export async function loadScripts(force = false): Promise<RemoteScript[]> {
	if (!force && state.scripts.length > 0) return state.scripts;
	try {
		const res = await api.scripts();
		state.scripts = res.scripts || [];
	} catch (e) {
		if (e instanceof AuthError) handleAuthLost('登录已失效，请重新配对');
		else toast(e instanceof Error ? e.message : String(e), 'error');
	}
	return state.scripts;
}

/** 拉取某实例的自动化任务状态 */
export async function fetchAutomation(uid: string): Promise<AutomationJob | null> {
	try {
		const res = await api.automation(uid);
		if (res.job) state.automation[uid] = res.job;
		return res.job;
	} catch {
		return null;
	}
}

/** 触发登录脚本（配置为手机端手填） */
export async function runLoginScript(uid: string, name: string, configs: Record<string, any>) {
	state.automationBusy[uid] = 'run';
	try {
		const res = await api.runAutomation(uid, name, configs);
		if (res.job) state.automation[uid] = res.job;
		startAutomationPoll(uid);
		toast('登录脚本已开始执行', 'success');
		return res.job;
	} catch (e) {
		if (e instanceof AuthError) handleAuthLost('登录已失效，请重新配对');
		else toast(e instanceof Error ? e.message : String(e), 'error');
		throw e;
	} finally {
		delete state.automationBusy[uid];
	}
}

/** 重新读取课程列表 */
export async function refreshCourseList(uid: string) {
	state.automationBusy[uid] = 'courses';
	try {
		const res = await api.refreshCourses(uid, true);
		if (res.job) state.automation[uid] = res.job;
		const count = res.job ? res.job.courses.length : 0;
		toast(count ? `识别到 ${count} 门课程` : '没有识别到课程', count ? 'success' : 'error');
		return res.job;
	} catch (e) {
		if (e instanceof AuthError) handleAuthLost('登录已失效，请重新配对');
		else toast(e instanceof Error ? e.message : String(e), 'error');
		throw e;
	} finally {
		delete state.automationBusy[uid];
	}
}

/**
 * 静默探测课程列表（不弹提示）
 *
 * 浏览器配了「启动后自动运行自动程序」时，课程页早就开着；打开面板先探一次，
 * 能读就直接列出来，用户不必先点「刷新」。
 *
 * 不会动用户正在看的页面；只有当前页根本不是网页（about:blank / 只剩导航页）时，
 * 才会按平台打开课程列表 —— 那种页面没什么可打扰的，不打开就永远读不到课程。
 */
export async function probeCourses(uid: string): Promise<void> {
	try {
		const res = await api.refreshCourses(uid, false);
		const job = res && res.job;
		if (!job) return;
		/** 已经有课程就别覆盖，免得把刚跑完登录的结果冲掉 */
		const existing = state.automation[uid];
		if (existing && existing.courses.length) return;
		state.automation[uid] = job;
	} catch {
		/* 探测失败保持安静，用户点「刷新」时会给明确错误 */
	}
}

/** 进入课程，之后由桌面端扩展里的刷课脚本接管 */
export async function enterCourseById(uid: string, id: string, name: string) {
	state.automationBusy[uid] = 'enter';
	try {
		const res = await api.enterCourse(uid, id, name);
		/** 提示只用课程名：页面 title 在 SPA 课程页上常是站点名（「智慧树」/「超星」） */
		toast(`已进入课程：${name}`, 'success');
		/** 进入后刷新一次快照，让「打开的页面」立刻反映新课程页 */
		refresh();
		return res.data;
	} catch (e) {
		if (e instanceof AuthError) handleAuthLost('登录已失效，请重新配对');
		else toast(e instanceof Error ? e.message : String(e), 'error');
		throw e;
	} finally {
		delete state.automationBusy[uid];
	}
}
