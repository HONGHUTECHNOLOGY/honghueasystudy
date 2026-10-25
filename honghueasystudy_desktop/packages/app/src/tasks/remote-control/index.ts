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
import { createQRCodeSafe, QRCodeResult } from './qr';
import { RemoteServer, RemoteSnapshot, ServiceInfo } from './server';
import { CloudflaredTunnel, TunnelStatus } from './tunnel';

const logger = Logger('remote-control');

type RemoteControlStore = typeof OriginalAppStore.remoteControl;

/** 公网检测结果缓存时长 */
const NETWORK_CACHE_TTL = 5 * 60 * 1000;

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
	private networkReport?: { report: NetworkReport; ts: number };
	private listeners: ((status: RemoteControlStatus) => void)[] = [];
	private inited = false;

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

	private get tunnel(): CloudflaredTunnel {
		if (!this._tunnel) {
			this._tunnel = new CloudflaredTunnel(this.appsDir(), () => this.emitStatus());
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
					refreshCode: () => this.auth.getCode()
				},
				this.bridge
			);

			await this.server.listen(settings.port, settings.allowLan);
			this.running = true;

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
		this.snapshot = snapshot;
		if (this.server) {
			this.server.broadcast('state', snapshot);
		}
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

	/** 生成本机可访问地址 */
	private buildUrls(port: number): string[] {
		if (!this.settings().allowLan) {
			return [`http://127.0.0.1:${port}`];
		}

		const urls: string[] = [];
		try {
			const interfaces = os.networkInterfaces();
			Object.keys(interfaces).forEach((name) => {
				const list = interfaces[name] || [];
				list.forEach((item) => {
					if (item.internal) return;
					const family = String(item.family);
					if (family === 'IPv4' || family === '4') {
						urls.push(`http://${item.address}:${port}`);
					}
				});
			});
		} catch (e) {
			logger.error('枚举网卡失败', e);
		}

		return urls;
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
