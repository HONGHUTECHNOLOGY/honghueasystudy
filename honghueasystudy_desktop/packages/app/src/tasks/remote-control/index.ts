import { app, BrowserWindow } from 'electron';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { Logger } from '../../logger';
import { store, OriginalAppStore } from '../../store';
import { getProjectPath } from '../../utils';
import { hasBuiltinCloudflared } from '@honghu-desktop/common';
import { AuthMode, RemoteAuth, RemoteSession } from './auth';
import { CommandBridge, CommandResultPayload } from './command';
import { detectNetwork, NetworkReport } from './network';
import { buildLanUrls, buildLanUrlsSync, normalizeClientIp } from './network.addr';
import { createQRCodeSafe, QRCodeResult } from './qr';
import { AutomationJob, AutomationRunner } from './automation';
import { RemoteServer, RemoteSnapshot, ServiceInfo } from './server';
import { RemoteScriptInfo, AutomationScriptValues, buildAutomationScripts, exportAutomationScripts } from './script-catalog';
import { CloudflaredTunnel, TunnelStatus } from './tunnel';
import { normalizeBrowserAutomation, type BrowserAutomation } from '../../scripts/plan';

const logger = Logger('remote-control');

type RemoteControlStore = typeof OriginalAppStore.remoteControl;

/** 公网检测结果缓存时长 */
const NETWORK_CACHE_TTL = 5 * 60 * 1000;

/** 自动化任务结构定义在 automation.ts，这里重新导出供 server.ts 引用 */
export type { AutomationJob };

export interface RemoteControlStatus {
	running: boolean;
	starting: boolean;
	port: number;
	allowLan: boolean;
	addresses: string[];
	pairCode: string;
	/** 当前访问验证方式 */
	authMode: AuthMode;
	/** 是否已设置访问密码 */
	hasPassword: boolean;
	tunnel: TunnelStatus;
	/** 设置里是否开启了内网穿透（与隧道实时状态分开，避免界面开关与真实配置不一致） */
	tunnelEnabled: boolean;
	sessionCount: number;
	error: string;
	appVersion: string;
	deviceName: string;
	/** 推荐用于扫码访问的地址 */
	preferredUrl: string;
	/** 是否存在局域网地址 */
	hasLan: boolean;
}

/**
 * 远程控制服务
 *
 * 负责：服务生命周期、设置变更响应、状态聚合、二维码、公网检测、隧道管理。
 *
 * 注意：所有依赖 store 的资源都采用惰性初始化。
 * 因为本模块可能在 initStore() 之前被加载（bootstrap 中各 task 并行），
 * 构造期读取 store 会拿到未初始化的 paths。
 */
export class RemoteControlService {
	private static instance?: RemoteControlService;

	static getInstance(): RemoteControlService {
		if (!RemoteControlService.instance) {
			RemoteControlService.instance = new RemoteControlService();
		}
		return RemoteControlService.instance;
	}

	private window?: BrowserWindow;
	private server?: RemoteServer;
	private snapshot: RemoteSnapshot | null = null;
	private running = false;
	private starting = false;
	private lastError = '';
	/** 最近一次收到渲染进程快照的时间 */
	private lastStateAt = 0;
	/** 最近一次向渲染进程催报的时间（去重） */
	private lastPingAt = 0;
	/** 主进程侧的催报定时器 */
	private stateTimer?: ReturnType<typeof setInterval>;
	private networkReport?: { report: NetworkReport; ts: number };
	private listeners: ((status: RemoteControlStatus) => void)[] = [];
	/** 「登录 → 选课」编排（惰性创建，内部持有每个实例的任务状态） */
	private _automation?: AutomationRunner;
	private inited = false;

	/**
	 * 局域网地址缓存。
	 *
	 * 排序需要一次异步的「默认路由网卡」探测，而 getStatus() 是同步的，
	 * 因此把探测结果缓存下来：启动时刷新一次，之后定时刷新（Wi-Fi 切换、插拔网线）。
	 * 缓存未就绪时 buildUrls 会退回同步排序，至少保证物理网卡排在虚拟网卡前面。
	 */
	private lanCache: { port: number; urls: string[]; primary: string; ts: number } = {
		port: 0,
		urls: [],
		primary: '',
		ts: 0
	};

	private lanTimer?: ReturnType<typeof setInterval>;

	private _auth?: RemoteAuth;
	private _bridge?: CommandBridge;
	private _tunnel?: CloudflaredTunnel;

	// eslint-disable-next-line no-useless-constructor
	private constructor() {}

	// ---------------------------------------------------------------- 惰性依赖

	private get auth(): RemoteAuth {
		if (!this._auth) {
			const settings = this.settings();
			this._auth = new RemoteAuth(this.ensureSecret(), {
				mode: settings.authMode,
				passwordHash: settings.passwordHash
			});
		}
		return this._auth;
	}

	private get bridge(): CommandBridge {
		if (!this._bridge) {
			this._bridge = new CommandBridge(() => this.window);
		}
		return this._bridge;
	}

	/** 远程自动化编排：命令走同一条 CommandBridge，结果通过 SSE 推送 */
	private get automation(): AutomationRunner {
		if (!this._automation) {
			this._automation = new AutomationRunner(
				(action, payload) => this.bridge.dispatch(action, payload),
				(job) => {
					if (this.server) this.server.broadcast('automation', job);
				}
			);
		}
		return this._automation;
	}

	private get tunnel(): CloudflaredTunnel {
		if (!this._tunnel) {
			this._tunnel = new CloudflaredTunnel(
				this.appsDir(),
				() => this.emitStatus(),
				/** 隧道自愈判据：服务在跑且设置要求开穿透 */
				() => this.running && this.settings().tunnel.enabled
			);
		}
		return this._tunnel;
	}

	private appsDir(): string {
		const folder = store.store && store.store.paths && store.store.paths.downloadFolder;
		return path.join(folder || path.join(app.getPath('userData'), 'downloads'), 'apps');
	}

	// ---------------------------------------------------------------- 生命周期

	/** 初始化：绑定窗口、监听设置变化、按配置恢复服务 */
	async init(window: BrowserWindow): Promise<void> {
		this.window = window;

		/**
		 * 关闭渲染进程的后台节流。
		 *
		 * 窗口最小化或被完全遮挡时，Chromium 会把该页面的定时器节流到极低频率（甚至冻结），
		 * 而远程控制的状态上报完全靠渲染进程的 `setInterval` 心跳驱动。
		 * 一旦心跳被冻住，主进程手里就只剩最后一次快照——浏览器其实已经启动完成，
		 * 远程端却永远停在「启动中」，直到窗口重新可见才恢复。
		 */
		try {
			window.webContents.setBackgroundThrottling(false);
		} catch (e) {
			logger.warn('关闭窗口后台节流失败：' + String(e));
		}

		if (this.inited) {
			if (this.settings().enabled && !this.running) {
				await this.start().catch((e) => logger.error('恢复远程控制服务失败', e));
			}
			return;
		}
		this.inited = true;

		store.onDidChange('remoteControl', (newValue, oldValue) => {
			this.applySettings(newValue as RemoteControlStore, oldValue as RemoteControlStore);
		});

		if (this.settings().enabled) {
			await this.start().catch((e) => logger.error('恢复远程控制服务失败', e));
		}
	}

	/** 启动服务（含隧道） */
	async start(): Promise<RemoteControlStatus> {
		if (this.running || this.starting) return this.getStatus();

		const settings = this.settings();
		this.starting = true;
		this.lastError = '';

		try {
			const staticDir = path.join(getProjectPath(), 'public-remote');
			this.server = new RemoteServer(
				{
					auth: this.auth,
					staticDir,
					getSnapshot: () => this.snapshot,
					dispatch: (action, payload) => this.bridge.dispatch(action, payload),
					getServiceInfo: () => this.serviceInfo(),
					getTunnelStatus: () => this.tunnel.getStatus(),
					listSessions: () => this.auth.list(),
					revokeSession: (id) => this.auth.revoke(id),
					refreshCode: () => this.auth.getCode(),
					requestStateRefresh: () => this.requestStateRefresh(),
					listScripts: () => this.listScripts(),
					getAutomation: (uid) => this.getAutomation(uid),
					startAutomation: (opts) => this.startAutomation(opts),
					refreshCourses: (opts) => this.refreshCourses(opts),
					enterCourse: (opts) => this.enterCourse(opts),
					getPlan: (uid) => this.getPlan(uid),
					savePlan: (opts) => this.savePlan(opts),
					runStudy: (uid) => this.runStudy(uid),
					stopStudy: (opts) => this.stopStudy(opts),
					listCourses: (opts) => this.listCourses(opts)
				},
				this.bridge
			);

			await this.server.listen(settings.port, settings.allowLan);
			this.running = true;
			this.startStateTicker();

			/** 先算出排序后的访问地址，保证二维码一打开就是可用的那个 */
			await this.refreshAddresses(true);
			this.startAddressWatcher();

			if (settings.tunnel.enabled) {
				this.startTunnel().catch((e) => logger.error('隧道启动失败', e));
			}

			logger.info(`远程控制已开启：${this.buildUrls(settings.port).join(', ')}`);
		} catch (e) {
			this.lastError = e instanceof Error ? e.message : String(e);
			logger.error('远程控制启动失败：' + this.lastError);
			this.server = undefined;
			this.running = false;
		} finally {
			this.starting = false;
			this.emitStatus();
		}

		return this.getStatus();
	}

	/** 停止服务（含隧道） */
	async stop(): Promise<RemoteControlStatus> {
		this.stopAddressWatcher();
		this.stopStateTicker();

		if (this._tunnel) {
			this._tunnel.stop();
		}

		if (this._bridge) {
			this._bridge.disposeAll();
		}

		const server = this.server;
		this.server = undefined;
		this.running = false;

		if (server) {
			await server.close().catch((e) => logger.error('关闭远程控制服务失败', e));
			logger.info('远程控制已关闭');
		}

		this.emitStatus();
		return this.getStatus();
	}

	/** 退出时清理 */
	dispose(): void {
		this.stopAddressWatcher();
		this.stopStateTicker();
		if (this._tunnel) this._tunnel.stop();
		if (this._bridge) this._bridge.disposeAll();
		if (this.server) {
			this.server.close().catch(() => {});
			this.server = undefined;
		}
		this.running = false;
	}

	// ---------------------------------------------------------------- 状态桥

	/** 渲染进程上报的状态快照 */
	handleState(snapshot: RemoteSnapshot): void {
		this.lastStateAt = Date.now();
		this.snapshot = snapshot;
		/** 浏览器关闭/重开：登录态与课程标记都失效，清掉旧的自动化结果，避免远程看到过期的课程列表 */
		/** 浏览器关闭：登录态与课程标记全部失效，清掉旧任务，避免远程端看到过期的课程列表 */
		try {
			snapshot.browsers.forEach((item) => {
				if (item.status === 'closed') this.automation.forget(item.uid);
			});
		} catch {
			// 快照结构异常不影响状态下发
		}
		if (this.server) {
			this.server.broadcast('state', snapshot);
		}
	}

	// ---------------------------------------------------------------- 远程自动化

	/** 远程台可选的自动化脚本（登录脚本目录） */
	listScripts(): RemoteScriptInfo[] {
		return this.automation.listScripts();
	}

	/** 某实例最近一次自动化任务 */
	getAutomation(uid: string): AutomationJob | undefined {
		return this.automation.get(uid);
	}

	/**
	 * 远程触发登录脚本
	 *
	 * 两件事在这里完成：用最新快照校验浏览器是否就绪，然后把编排交给 AutomationRunner。
	 * 登录本身要过滑块验证码、等跳转，几十秒到几分钟都可能，手机锁屏就会掐断 fetch，
	 * 所以立刻返回 running，真实结果通过 SSE（automation）推给远程端。
	 */
	startAutomation(opts: { uid: string; name: string; configs?: Record<string, any> }): AutomationJob {
		const uid = String((opts && opts.uid) || '');
		const browser = this.snapshot ? this.snapshot.browsers.find((item) => item.uid === uid) : undefined;
		if (!browser) throw new Error('浏览器实例不存在');

		return this.automation.start({
			uid,
			name: String((opts && opts.name) || ''),
			configs: (opts && opts.configs) || {},
			browserStatus: browser.status
		});
	}

	/** 重新读取课程列表（登录完成后的「刷新」按钮） */
	refreshCourses(opts: { uid: string; refresh?: boolean }): Promise<AutomationJob> {
		return this.automation.refresh(opts);
	}

	/** 进入课程（进入后由桌面端扩展里的刷课脚本接管） */
	enterCourse(opts: { uid: string; id: string; name?: string }): Promise<{ url: string; title: string }> {
		return this.automation.enter(opts);
	}

	// ---------------------------------------------------------------- 自动化方案

	/**
	 * 读取自动化方案
	 *
	 * 「自动化方案」= 每次启动浏览器都会自动执行的那一份配置（脚本 + 刷课 + 定时），
	 * 和上面 `startAutomation` 的「临时执行一次」是两件不同的事：
	 * 前者落盘、长期生效，后者只在这次请求里跑一遍就忘。
	 *
	 * 脚本里的密码在这里统一抹掉：手机端没有理由拿到桌面端已存的账号密码。
	 */
	async getPlan(uid: string): Promise<{ plan: BrowserAutomation; scripts: AutomationScriptValues[] }> {
		const id = String(uid || '');
		if (!id) throw new Error('缺少浏览器实例');

		const raw = await this.bridge.dispatch('automation.get', { uid: id });
		return {
			plan: normalizeBrowserAutomation(raw && raw.plan),
			scripts: exportAutomationScripts((raw && raw.scripts) || [])
		};
	}

	/**
	 * 保存自动化方案
	 *
	 * 先读一次现有配置再合并：手机端提交的密码框总是空的（读不到原值），
	 * 直接覆盖会把用户已保存的密码抹成空串，下次自动登录直接失败。
	 */
	async savePlan(opts: {
		uid: string;
		plan?: any;
		scripts?: any[];
		/** 手机打开面板时读到的脚本列表（三路合并的基线） */
		baseline?: any[];
	}): Promise<{ plan: BrowserAutomation; scripts: AutomationScriptValues[] }> {
		const id = String((opts && opts.uid) || '');
		if (!id) throw new Error('缺少浏览器实例');

		const current = await this.bridge.dispatch('automation.get', { uid: id });

		/**
		 * 只在请求真的带了脚本列表时才重建。
		 *
		 * `scripts` 缺省表示「这次只改刷课/定时」，此时必须沿用桌面端已有的脚本；
		 * 拿空数组去重建等于把用户配好的登录脚本整批删掉，
		 * 表现为「在手机上改了个时间，电脑开机就不自动登录了」。
		 */
		const incomingScripts = opts && Array.isArray(opts.scripts) ? opts.scripts : null;
		const baseline = opts && Array.isArray(opts.baseline) ? opts.baseline : undefined;
		const scripts = incomingScripts
			? buildAutomationScripts(incomingScripts, (current && current.scripts) || [], baseline)
			: (current && current.scripts) || [];

		/**
		 * 定时器的记账字段由桌面端独占维护。
		 *
		 * `lastRunDate/lastStopDate/runStartedAt` 决定「今天是否已经自动跑过/收过尾」，
		 * 手机端根本不知道这些值，如果跟着表单一起覆盖：
		 * 用户在定时窗口内保存一次方案，桌面端就会以为「今天还没跑过」，
		 * 于是又拉起一次浏览器（或重复收尾）。
		 */
		const previous = normalizeBrowserAutomation(current && current.plan);
		const plan = normalizeBrowserAutomation(opts && opts.plan);
		plan.schedule.lastRunDate = previous.schedule.lastRunDate;
		plan.schedule.lastStopDate = previous.schedule.lastStopDate;
		plan.schedule.runStartedAt = previous.schedule.runStartedAt;

		const saved = await this.bridge.dispatch('automation.save', { uid: id, plan, scripts });
		return {
			plan: normalizeBrowserAutomation(saved && saved.plan),
			scripts: exportAutomationScripts((saved && saved.scripts) || [])
		};
	}

	/** 立即执行一次自动刷课（后台跑，进度随快照上报） */
	runStudy(uid: string): Promise<any> {
		const id = String(uid || '');
		if (!id) return Promise.reject(new Error('缺少浏览器实例'));
		return this.bridge.dispatch('automation.run', { uid: id });
	}

	/** 暂停刷课（可选顺便关浏览器） */
	stopStudy(opts: { uid: string; keepTab?: boolean; closeBrowser?: boolean }): Promise<any> {
		const id = String((opts && opts.uid) || '');
		if (!id) return Promise.reject(new Error('缺少浏览器实例'));
		return this.bridge.dispatch('automation.stop', {
			uid: id,
			keepTab: !!(opts && opts.keepTab),
			closeBrowser: !!(opts && opts.closeBrowser)
		});
	}

	/** 读课程列表（选课用） */
	listCourses(opts: { uid: string; refresh?: boolean }): Promise<any> {
		const id = String((opts && opts.uid) || '');
		if (!id) return Promise.reject(new Error('缺少浏览器实例'));
		return this.bridge.dispatch('automation.courses', { uid: id, refresh: opts && opts.refresh !== false });
	}

	/**
	 * 主进程驱动的状态催报
	 *
	 * 渲染进程自己每 3 秒上报一次，但它的定时器会被 Chromium 的后台节流冻结
	 * （窗口最小化、被遮挡、系统休眠唤醒后都可能发生）。主进程的定时器不受影响，
	 * 所以这里在「有客户端在线但 6 秒没收到上报」时发一条 tick，
	 * 让渲染进程立刻补一次快照，避免远程端状态永久停在「启动中」。
	 */
	private startStateTicker(): void {
		if (this.stateTimer) return;
		this.stateTimer = setInterval(() => {
			if (!this.running) return;
			const server = this.server;
			if (!server || server.clientCount() === 0) return;
			if (Date.now() - this.lastStateAt < 6000) return;
			this.requestStateRefresh();
			/** 长时间完全没有上报，顺便确认渲染进程是否还在执行 JS */
			if (Date.now() - this.lastStateAt > 15000) this.probeRenderer();
		}, 2000);
	}

	private stopStateTicker(): void {
		if (this.stateTimer) {
			clearInterval(this.stateTimer);
			this.stateTimer = undefined;
		}
	}

	/** 请求渲染进程立即上报一次（远程端「同步」按钮也走这里） */
	requestStateRefresh(): void {
		const now = Date.now();
		if (now - this.lastPingAt < 1200) return;
		this.lastPingAt = now;

		const win = this.window;
		if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;
		try {
			win.webContents.send('remote-ctl:tick');
		} catch (e) {
			logger.warn('催报渲染进程状态失败：' + String(e));
		}
	}

	/** 最近一次探针时间（探针本身也是 IPC，不能太频繁） */
	private lastProbeAt = 0;

	/**
	 * 探测渲染进程是否还在执行 JS
	 *
	 * 催报发出后仍然收不到快照时，需要区分两种故障：
	 * - 渲染进程还活着，只是上报被卡住（能恢复）
	 * - 渲染进程主线程已经不响应（只能回电脑前处理）
	 * 用一次极轻的 executeJavaScript 就能判定，结论写进日志方便事后定位。
	 */
	private probeRenderer(): void {
		const now = Date.now();
		if (now - this.lastProbeAt < 10000) return;
		this.lastProbeAt = now;

		const win = this.window;
		if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return;

		const timer = setTimeout(() => {
			logger.warn('渲染进程 3 秒内未响应探针，界面可能已卡死（远程状态将停止更新）');
		}, 3000);

		win.webContents
			.executeJavaScript('1', true)
			.then(() => {
				clearTimeout(timer);
				logger.info('渲染进程探针正常，但已超过 15 秒没有上报快照');
			})
			.catch((e) => {
				clearTimeout(timer);
				logger.warn('渲染进程探针失败：' + String(e));
			});
	}

	/** 渲染进程回传的命令执行结果 */
	handleCommandResult(payload: CommandResultPayload): void {
		if (this._bridge) {
			this._bridge.handleResult(payload);
		}
	}

	/** 订阅状态变化（桌面端 UI 用） */
	onStatusChange(listener: (status: RemoteControlStatus) => void): void {
		this.listeners.push(listener);
	}

	// ---------------------------------------------------------------- 对外方法（IPC）

	getStatus(): RemoteControlStatus {
		const settings = this.settings();
		const urls = this.buildUrls(settings.port);
		const tunnelStatus = this._tunnel
			? this._tunnel.getStatus()
			: {
					state: 'idle' as const,
					url: '',
					error: '',
					progress: 0,
					provider: settings.tunnel.provider,
					builtin: hasBuiltinCloudflared()
			  };

		let preferredUrl = urls.length > 0 ? urls[0] : `http://127.0.0.1:${settings.port}`;
		if (tunnelStatus.state === 'running' && tunnelStatus.url) {
			preferredUrl = tunnelStatus.url;
		}

		return {
			running: this.running,
			starting: this.starting,
			port: settings.port,
			allowLan: settings.allowLan,
			addresses: urls,
			pairCode: this.auth.getCode(),
			authMode: this.auth.getMode(),
			hasPassword: this.auth.hasPassword(),
			tunnel: tunnelStatus,
			tunnelEnabled: settings.tunnel.enabled,
			sessionCount: this.auth.list().length,
			error: this.lastError,
			appVersion: app.getVersion(),
			deviceName: os.hostname(),
			preferredUrl,
			hasLan: urls.length > 0 && urls[0].indexOf('127.0.0.1') === -1
		};
	}

	/** 生成访问二维码（配对码模式下附带配对码，扫码后自动填充） */
	async getQRCode(url?: string): Promise<QRCodeResult | null> {
		const status = this.getStatus();
		let target = url || status.preferredUrl;

		if (status.authMode === 'pair') {
			const separator = target.indexOf('?') === -1 ? '?' : '&';
			target = `${target}${separator}c=${status.pairCode}`;
		}

		return createQRCodeSafe(target);
	}

	/** 切换访问验证方式 */
	async setAuthMode(mode: AuthMode): Promise<RemoteControlStatus> {
		if (mode === 'password' && !this.auth.hasPassword()) {
			throw new Error('请先设置访问密码');
		}

		store.set('remoteControl.authMode', mode);
		/** update 内部会清空全部会话，确保旧凭据立刻失效 */
		this.auth.update({ mode });

		if (this.server) {
			this.server.broadcast('sessions', []);
			this.server.broadcast('revoked', { reason: '访问方式已修改，请重新验证' });
		}

		logger.info('访问验证方式已切换为：' + mode);
		this.emitStatus();
		return this.getStatus();
	}

	/** 设置（或修改）访问密码，成功后自动切到密码模式 */
	async setPassword(plain: string): Promise<RemoteControlStatus> {
		const value = String(plain || '');
		if (value.length < 6) {
			throw new Error('密码至少需要 6 位');
		}
		if (value.length > 64) {
			throw new Error('密码不能超过 64 位');
		}

		const hash = RemoteAuth.hashPassword(value);
		store.set('remoteControl.passwordHash', hash);
		store.set('remoteControl.authMode', 'password');

		this.auth.update({ passwordHash: hash, mode: 'password' });

		if (this.server) {
			this.server.broadcast('sessions', []);
			this.server.broadcast('revoked', { reason: '访问密码已修改，请重新验证' });
		}

		logger.info('访问密码已更新');
		this.emitStatus();
		return this.getStatus();
	}

	/** 清除访问密码；若当前是密码模式则回退到配对码 */
	async clearPassword(): Promise<RemoteControlStatus> {
		const wasPasswordMode = this.settings().authMode === 'password';
		store.set('remoteControl.passwordHash', '');

		if (wasPasswordMode) {
			store.set('remoteControl.authMode', 'pair');
			this.auth.update({ passwordHash: '', mode: 'pair' });
		} else {
			this.auth.update({ passwordHash: '' });
		}

		this.auth.refreshCode();

		if (this.server) {
			this.server.broadcast('sessions', []);
			this.server.broadcast('revoked', { reason: '访问密码已清除，请重新验证' });
		}

		this.emitStatus();
		return this.getStatus();
	}

	/** 网络环境检测（带缓存） */
	async detectNetwork(force?: boolean): Promise<NetworkReport> {
		const now = Date.now();
		if (!force && this.networkReport && now - this.networkReport.ts < NETWORK_CACHE_TTL) {
			return this.networkReport.report;
		}
		const report = await detectNetwork(this.settings().port);
		this.networkReport = { report, ts: now };
		return report;
	}

	/** 刷新配对码，并踢出所有已连接设备 */
	refreshPairCode(): string {
		const code = this.auth.refreshCode();
		this.auth.revokeAll();
		if (this.server) {
			this.server.broadcast('sessions', []);
			this.server.broadcast('revoked', { reason: '配对码已刷新，请重新连接' });
		}
		this.emitStatus();
		return code;
	}

	listSessions(): RemoteSession[] {
		return this.auth.list();
	}

	revokeSession(id: string): boolean {
		const removed = this.auth.revoke(id);
		if (removed && this.server) {
			this.server.broadcast('sessions', this.auth.list());
		}
		return removed;
	}

	/** 开关远程控制（只负责落设置，启停交给设置监听统一处理，避免双份状态） */
	async setEnabled(enabled: boolean): Promise<RemoteControlStatus> {
		store.set('remoteControl.enabled', enabled);
		if (!enabled) {
			await this.stop();
		} else if (!this.running) {
			await this.start();
		}
		this.emitStatus();
		return this.getStatus();
	}

	/** 开关内网穿透 */
	async setTunnel(enabled: boolean): Promise<TunnelStatus> {
		/**
		 * 硬性拦截：免验证 + 公网隧道 = 把电脑控制权交给任何拿到地址的人。
		 * 隧道域名可被扫描，不能依赖「地址没人知道」这种假设。
		 */
		if (enabled && this.settings().authMode === 'none') {
			throw new Error(
				'免验证模式下不能开启内网穿透：公网地址一旦泄露，任何人都能操作你的电脑。请先切换为配对码或密码访问。'
			);
		}

		store.set('remoteControl.tunnel.enabled', enabled);

		if (!enabled) {
			if (this._tunnel) this._tunnel.stop();
			this.emitStatus();
			return this.getStatus().tunnel;
		}

		if (!this.running) {
			return this.getStatus().tunnel;
		}

		/** 隧道建立（含首次下载）可能持续数十秒，不阻塞调用方，进度通过状态轮询反馈 */
		this.startTunnel().catch((e) => logger.error('隧道启动失败', e));
		return this.getStatus().tunnel;
	}

	/** 修改端口（运行中会自动重启） */
	async setPort(port: number): Promise<RemoteControlStatus> {
		const wasRunning = this.running;
		if (wasRunning) await this.stop();
		store.set('remoteControl.port', port);
		if (wasRunning) await this.start();
		return this.getStatus();
	}

	/** 修改是否允许局域网访问（运行中会自动重启） */
	async setAllowLan(allowLan: boolean): Promise<RemoteControlStatus> {
		const wasRunning = this.running;
		if (wasRunning) await this.stop();
		store.set('remoteControl.allowLan', allowLan);
		if (wasRunning) await this.start();
		return this.getStatus();
	}

	/** 外网连通性自测地址（用出口公网 IP 拼装） */
	getExternalTestUrl(): string {
		const report = this.networkReport && this.networkReport.report;
		const port = this.settings().port;
		if (report && report.egressIp) {
			return `http://${report.egressIp}:${port}`;
		}
		return this.getStatus().preferredUrl;
	}

	// ---------------------------------------------------------------- 内部

	/** 读取设置并补齐缺失字段（兼容旧配置文件） */
	private settings(): RemoteControlStore {
		const defaults = OriginalAppStore.remoteControl;
		const current = (store.store && store.store.remoteControl) || ({} as Partial<RemoteControlStore>);
		const tunnel = current.tunnel || ({} as any);

		return {
			enabled: current.enabled === undefined ? defaults.enabled : current.enabled,
			port: current.port || defaults.port,
			allowLan: current.allowLan === undefined ? defaults.allowLan : current.allowLan,
			authMode: current.authMode || defaults.authMode,
			passwordHash: current.passwordHash || defaults.passwordHash,
			tunnel: {
				enabled: tunnel.enabled === undefined ? defaults.tunnel.enabled : tunnel.enabled,
				provider: tunnel.provider || defaults.tunnel.provider
			},
			sessionSecret: current.sessionSecret || defaults.sessionSecret
		};
	}

	/** 确保存在会话签名密钥并落盘 */
	private ensureSecret(): string {
		const settings = this.settings();
		if (settings.sessionSecret) return settings.sessionSecret;

		const secret = crypto.randomBytes(32).toString('hex');
		try {
			store.set('remoteControl.sessionSecret', secret);
		} catch (e) {
			logger.error('写入会话密钥失败', e);
		}
		return secret;
	}

	/** 设置变化时按需启停 */
	private async applySettings(newValue: RemoteControlStore, oldValue: RemoteControlStore): Promise<void> {
		const next = this.settings();
		const prev = oldValue || ({} as RemoteControlStore);

		try {
			/**
			 * 同步鉴权配置（渲染端也可能直接改 store）。
			 * update 内部只在真正变化时才清空会话。
			 */
			if (this._auth) {
				this._auth.update({
					mode: next.authMode || 'pair',
					passwordHash: next.passwordHash || ''
				});
			}

			/** 切到免验证模式时，必须关闭已开启的公网隧道 */
			if (next.authMode === 'none' && next.tunnel.enabled) {
				logger.warn('免验证模式下已自动关闭内网穿透');
				store.set('remoteControl.tunnel.enabled', false);
				if (this._tunnel) this._tunnel.stop();
			}

			if (!prev || prev.enabled !== next.enabled) {
				if (next.enabled) {
					await this.start();
				} else {
					await this.stop();
				}
				return;
			}

			if (prev.port !== next.port || prev.allowLan !== next.allowLan) {
				if (this.running) {
					await this.stop();
					await this.start();
				}
				return;
			}

			const tunnelNext = next.tunnel ? next.tunnel.enabled : false;
			const tunnelPrev = prev.tunnel ? prev.tunnel.enabled : false;
			if (tunnelNext !== tunnelPrev) {
				if (tunnelNext && this.running) {
					this.startTunnel().catch((e) => logger.error('隧道启动失败', e));
				} else if (!tunnelNext && this._tunnel) {
					this._tunnel.stop();
					this.emitStatus();
				}
			}
		} catch (e) {
			logger.error('应用远程控制设置失败', e);
		}
	}

	private async startTunnel(): Promise<void> {
		const settings = this.settings();
		const url = await this.tunnel.start(settings.port);
		if (url && this.server) {
			this.server.broadcast('tunnel', this.tunnel.getStatus());
		}
		this.emitStatus();
	}

	/**
	 * 重新计算局域网访问地址（按「默认路由网卡 > 物理网卡 > 虚拟网卡」排序）。
	 * 返回地址列表是否发生变化（变化时上层需要推送状态，让二维码/列表跟着更新）。
	 */
	private async refreshAddresses(force = false): Promise<boolean> {
		const settings = this.settings();
		const port = settings.port;

		/** 4 秒内重复调用直接复用，避免状态轮询把探测打满 */
		if (!force && this.lanCache.ts && Date.now() - this.lanCache.ts < 4000) return false;

		let urls: string[] = [];
		let primary = '';
		if (settings.allowLan) {
			/**
			 * 已连接设备的 IP 是「手机真的连通过」的证据：
			 * 与它在同一网段的本机地址，优先作为二维码目标。
			 * 这样用户第一次手动换成正确 IP 之后，二维码会自动记住，不用每次都试。
			 */
			let confirmed: string[] = [];
			try {
				confirmed = this.auth
					.list()
					.map((session) => normalizeClientIp(session.ip))
					.filter((ip) => !!ip && ip.indexOf(':') === -1);
			} catch (e) {
				/** 会话读取失败不影响地址枚举 */
				confirmed = [];
			}

			try {
				urls = await buildLanUrls(port, confirmed);
				primary = urls.length ? urls[0].replace(/^http:\/\//, '').split(':')[0] : '';
			} catch (e) {
				logger.error('获取局域网地址失败', e);
				urls = [];
			}
		} else {
			urls = [`http://127.0.0.1:${port}`];
			primary = '127.0.0.1';
		}

		const changed = urls.join(',') !== this.lanCache.urls.join(',') || port !== this.lanCache.port;
		this.lanCache = { port, urls, primary, ts: Date.now() };

		if (changed) {
			logger.info(`可用访问地址已更新：${urls.join(', ') || '（无）'}`);
		}
		return changed;
	}

	/** 定时刷新地址：覆盖切换 Wi-Fi、插拔网线、开关 VPN 等场景 */
	private startAddressWatcher(): void {
		this.stopAddressWatcher();
		this.lanTimer = setInterval(() => {
			if (!this.running) return;
			this.refreshAddresses()
				.then((changed) => {
					if (changed) this.emitStatus();
				})
				.catch(() => {});

			/**
			 * 兜底：设置要求开隧道，但隧道对象还没被创建（启动链路被中断过），
			 * 这里补一次启动。已存在时不做任何事，避免打断隧道自身的退避重连。
			 */
			if (this.settings().tunnel.enabled && !this._tunnel) {
				this.startTunnel().catch((e) => logger.error('补齐隧道启动失败', e));
			}
		}, 20000);
		/** 不阻塞进程退出 */
		if (this.lanTimer.unref) this.lanTimer.unref();
	}

	private stopAddressWatcher(): void {
		if (this.lanTimer) {
			clearInterval(this.lanTimer);
			this.lanTimer = undefined;
		}
	}

	/**
	 * 生成本机可访问地址（同步）。
	 *
	 * 优先用缓存（含默认路由网卡判定）；缓存未就绪时退回同步排序——
	 * 即便没有出口探测，物理网卡也已排在虚拟网卡（VMware/VirtualBox/Docker/WSL 等）前面。
	 */
	private buildUrls(port: number): string[] {
		if (!this.settings().allowLan) {
			return [`http://127.0.0.1:${port}`];
		}

		if (this.lanCache.port === port && this.lanCache.urls.length) {
			return this.lanCache.urls;
		}

		try {
			return buildLanUrlsSync(port);
		} catch (e) {
			logger.error('枚举网卡失败', e);
			return [];
		}
	}

	private serviceInfo(): ServiceInfo {
		const settings = this.settings();
		const status = this.getStatus();
		return {
			running: this.running,
			port: settings.port,
			allowLan: settings.allowLan,
			addresses: status.addresses,
			pairCode: this.auth.getCode(),
			tunnel: status.tunnel,
			appVersion: app.getVersion(),
			deviceName: os.hostname()
		};
	}

	private emitStatus(): void {
		if (this.listeners.length === 0) return;
		const status = this.getStatus();
		this.listeners.forEach((listener) => {
			try {
				listener(status);
			} catch (e) {
				logger.error('status listener error', e);
			}
		});
	}
}

/** 全局单例（惰性安全：构造期不访问 store） */
export const remoteControl = RemoteControlService.getInstance();

/** 在 index.ts 启动时调用 */
export async function initRemoteControl(window: BrowserWindow): Promise<void> {
	await remoteControl.init(window);
}
