import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Logger } from '../../logger';
import { RateLimiter, RemoteAuth, RemoteSession } from './auth';
import { CommandBridge, isAllowedAction } from './command';
import { TunnelStatus } from './tunnel';

const logger = Logger('remote-server');

/** 单个浏览器实例的状态快照 */
export interface BrowserSnapshot {
	uid: string;
	name: string;
	notes?: string;
	tags: { name: string; color: string }[];
	status: 'closed' | 'closing' | 'launching' | 'launched';
	pages: { url: string; title: string }[];
}

/** 渲染进程上报的完整快照 */
export interface RemoteSnapshot {
	browsers: BrowserSnapshot[];
	logs: { [uid: string]: string[] };
	ts: number;
}

/** 对外暴露的服务信息 */
export interface ServiceInfo {
	running: boolean;
	port: number;
	allowLan: boolean;
	addresses: string[];
	pairCode: string;
	tunnel: TunnelStatus;
	appVersion: string;
	deviceName: string;
}

export interface RemoteServerContext {
	auth: RemoteAuth;
	staticDir: string;
	getSnapshot(): RemoteSnapshot | null;
	dispatch(action: string, payload: any): Promise<any>;
	getServiceInfo(): ServiceInfo;
	getTunnelStatus(): TunnelStatus;
	listSessions(): RemoteSession[];
	revokeSession(id: string): boolean;
	refreshCode(): string;
}

/** 快照缓存的有效期（ms） */
const SNAPSHOT_TTL = 1000;

export class RemoteServer {
	private app = express();
	private httpServer?: http.Server;
	private clients = new Set<express.Response>();
	private heartbeat?: ReturnType<typeof setInterval>;
	private snapshotCache = new Map<string, { data: string; ts: number }>();

	private pairLimiter = new RateLimiter(60 * 1000, 10);
	private commandLimiter = new RateLimiter(1000, 10);

	// eslint-disable-next-line no-useless-constructor
	constructor(private ctx: RemoteServerContext, private bridge: CommandBridge) {}

	/** 启动监听，返回实际端口 */
	async listen(port: number, allowLan: boolean): Promise<number> {
		this.registerRoutes();

		return new Promise<number>((resolve, reject) => {
			const host = allowLan ? '0.0.0.0' : '127.0.0.1';
			const server = http.createServer(this.app);

			server.on('error', (err: any) => {
				if (err.code === 'EADDRINUSE') {
					reject(new Error(`端口 ${port} 已被占用，请在设置中更换端口`));
				} else {
					reject(err);
				}
			});

			server.listen(port, host, () => {
				this.httpServer = server;
				this.heartbeat = setInterval(() => this.broadcast('heartbeat', { ts: Date.now() }), 15000);
				logger.info(`远程控制服务已启动 => ${host}:${port}`);
				resolve(port);
			});
		});
	}

	/** 关闭服务，断开所有客户端 */
	async close(): Promise<void> {
		if (this.heartbeat) {
			clearInterval(this.heartbeat);
			this.heartbeat = undefined;
		}

		this.clients.forEach((res) => {
			try {
				res.end();
			} catch {}
		});
		this.clients.clear();

		const server = this.httpServer;
		this.httpServer = undefined;
		if (!server) return;

		await new Promise<void>((resolve) => {
			server.close(() => resolve());
			/** 兜底：3 秒后强制释放 */
			setTimeout(() => resolve(), 3000);
		});
	}

	/** 向所有已连接客户端推送事件 */
	broadcast(event: string, payload: any): void {
		if (this.clients.size === 0) return;
		const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
		this.clients.forEach((res) => {
			try {
				res.write(chunk);
			} catch {
				this.clients.delete(res);
			}
		});
	}

	/** 清空截图缓存（浏览器关闭时调用） */
	clearSnapshotCache(): void {
		this.snapshotCache.clear();
	}

	// ---------------------------------------------------------------- 路由

	private registerRoutes(): void {
		const app = this.app;

		app.disable('x-powered-by');
		app.use(express.json({ limit: '1mb' }));
		app.use(express.urlencoded({ extended: false, limit: '1mb' }));

		/** 统一安全响应头 + 禁止缓存 */
		app.use((req, res, next) => {
			res.setHeader('X-Content-Type-Options', 'nosniff');
			res.setHeader('Referrer-Policy', 'no-referrer');
			res.setHeader('Cache-Control', 'no-store');
			next();
		});

		/** ---------- 无需鉴权 ---------- */

		app.get('/api/ping', (req, res) => {
			let session = this.ctx.auth.resolve(req.headers.cookie as string, req.query.t as string);

			/** 免验证模式：自动签发会话，使设备列表与「断开」仍可工作 */
			if (!session && this.ctx.auth.getMode() === 'none') {
				const created = this.ctx.auth.createSession(getClientIp(req), String(req.headers['user-agent'] || ''));
				const secure = !!(req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https');
				res.setHeader('Set-Cookie', this.ctx.auth.buildCookie(created.token, secure));
				session = created.session;
				this.broadcast('sessions', this.ctx.listSessions());
			}

			const info = this.ctx.getServiceInfo();
			res.json({
				ok: true,
				authed: !!session,
				needPair: !session,
				authMode: this.ctx.auth.getMode(),
				hasPassword: this.ctx.auth.hasPassword(),
				appVersion: info.appVersion,
				deviceName: info.deviceName,
				port: info.port
			});
		});

		/** 校验凭据并签发会话；配对码与密码共用此接口 */
		const handleAuth = (req: express.Request, res: express.Response) => {
			if (!this.pairLimiter.take()) {
				res.status(429).json({ ok: false, error: '请求过于频繁，请稍后再试' });
				return;
			}

			const body = req.body || {};
			const secret = body.secret !== undefined ? body.secret : body.code;
			const result = this.ctx.auth.verify(secret);

			if (!result.ok) {
				res.status(401).json({ ok: false, error: result.error });
				return;
			}

			const ip = getClientIp(req);
			const { token, session } = this.ctx.auth.createSession(ip, String(req.headers['user-agent'] || ''));
			const secure = !!(req.headers['x-forwarded-proto'] === 'https' || req.protocol === 'https');

			res.setHeader('Set-Cookie', this.ctx.auth.buildCookie(token, secure));
			logger.info(`新设备接入：${session.ip} ${session.userAgent.slice(0, 60)}`);
			this.broadcast('sessions', this.ctx.listSessions());

			res.json({ ok: true, sessionId: session.id });
		};

		app.post('/api/auth', handleAuth);
		/** 兼容旧路径 */
		app.post('/api/pair', handleAuth);

		/** ---------- 需要鉴权 ---------- */

		const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
			const session = this.ctx.auth.resolve(req.headers.cookie as string, req.query.t as string);

			/**
			 * 免验证模式：即使没有会话也放行。
			 * 正常情况下 ping 已自动签发 Cookie，这里只是兜底（例如浏览器禁用 Cookie）。
			 */
			if (!session && this.ctx.auth.getMode() !== 'none') {
				res.status(401).json({ ok: false, error: '未登录或会话已失效' });
				return;
			}

			(res.locals as any).session = session;
			next();
		};

		/** CSRF：拒绝来源与本站不一致的写请求 */
		const csrfGuard = (req: express.Request, res: express.Response, next: express.NextFunction) => {
			if (req.method === 'GET' || req.method === 'HEAD') {
				next();
				return;
			}
			const origin = req.headers.origin as string | undefined;
			if (!origin) {
				next();
				return;
			}
			try {
				const originHost = new URL(origin).host;
				if (originHost !== req.headers.host) {
					res.status(403).json({ ok: false, error: '来源不被允许' });
					return;
				}
			} catch {
				res.status(403).json({ ok: false, error: '来源不被允许' });
				return;
			}
			next();
		};

		app.post('/api/logout', auth, csrfGuard, (req, res) => {
			const session = (res.locals as any).session as RemoteSession | null;
			if (session) {
				this.ctx.auth.revoke(session.id);
			}
			res.setHeader('Set-Cookie', this.ctx.auth.buildClearCookie());
			this.broadcast('sessions', this.ctx.listSessions());
			res.json({ ok: true });
		});

		app.get('/api/state', auth, (req, res) => {
			res.json({
				ok: true,
				snapshot: this.ctx.getSnapshot(),
				service: sanitizeServiceInfo(this.ctx.getServiceInfo()),
				sessions: this.ctx.listSessions().length
			});
		});

		app.get('/api/events', auth, (req, res) => {
			res.writeHead(200, {
				'Content-Type': 'text/event-stream; charset=utf-8',
				'Cache-Control': 'no-store, no-transform',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no'
			});

			res.write('retry: 3000\n\n');
			res.write(`event: state\ndata: ${JSON.stringify(this.ctx.getSnapshot())}\n\n`);

			this.clients.add(res);

			const cleanup = () => {
				this.clients.delete(res);
			};
			req.on('close', cleanup);
			req.on('aborted', cleanup);
		});

		app.post('/api/command', auth, csrfGuard, async (req, res) => {
			if (!this.commandLimiter.take()) {
				res.status(429).json({ ok: false, error: '操作过于频繁，请稍后再试' });
				return;
			}

			const action = String((req.body && req.body.action) || '');
			const payload = (req.body && req.body.payload) || {};

			if (!isAllowedAction(action)) {
				res.status(400).json({ ok: false, error: '不支持的操作' });
				return;
			}

			try {
				const data = await this.ctx.dispatch(action, payload);
				res.json({ ok: true, data });
			} catch (e) {
				res.status(500).json({ ok: false, error: String(e && (e as Error).message ? (e as Error).message : e) });
			}
		});

		app.get('/api/snapshot/:uid', auth, async (req, res) => {
			const uid = String(req.params.uid || '');
			if (!uid) {
				res.status(400).json({ ok: false, error: '缺少 uid' });
				return;
			}

			const cached = this.snapshotCache.get(uid);
			const now = Date.now();
			if (cached && now - cached.ts < SNAPSHOT_TTL) {
				res.setHeader('Content-Type', 'image/jpeg');
				res.setHeader('Cache-Control', 'no-store');
				res.send(Buffer.from(cached.data, 'base64'));
				return;
			}

			try {
				const base64 = await this.ctx.dispatch('browser.snapshot', { uid, quality: 55 });
				if (typeof base64 !== 'string' || !base64) {
					throw new Error('截图失败');
				}
				this.snapshotCache.set(uid, { data: base64, ts: now });
				res.setHeader('Content-Type', 'image/jpeg');
				res.setHeader('Cache-Control', 'no-store');
				res.send(Buffer.from(base64, 'base64'));
			} catch (e) {
				res.status(503).json({ ok: false, error: String(e && (e as Error).message ? (e as Error).message : e) });
			}
		});

		/** 设备管理只允许本机操作 */
		const localOnly = (req: express.Request, res: express.Response, next: express.NextFunction) => {
			const ip = getClientIp(req);
			if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
				res.status(403).json({ ok: false, error: '仅允许在本机操作' });
				return;
			}
			next();
		};

		app.get('/api/sessions', auth, localOnly, (req, res) => {
			res.json({ ok: true, sessions: this.ctx.listSessions() });
		});

		app.delete('/api/sessions/:id', auth, csrfGuard, localOnly, (req, res) => {
			const removed = this.ctx.revokeSession(String(req.params.id || ''));
			this.broadcast('sessions', this.ctx.listSessions());
			res.json({ ok: removed });
		});

		/** ---------- 静态资源 ---------- */

		const staticDir = this.ctx.staticDir;
		if (fs.existsSync(staticDir)) {
			app.use(
				express.static(staticDir, {
					index: 'index.html',
					maxAge: '1h',
					setHeaders: (res, filePath) => {
						/** 入口 HTML 必须不缓存：否则升级后手机仍加载旧的资源引用 */
						if (filePath.indexOf('index.html') !== -1) {
							res.setHeader('Cache-Control', 'no-store');
						}
					}
				})
			);
		}

		/** API 404 统一 JSON，避免返回 HTML 让前端解析失败 */
		app.use('/api', (req, res) => {
			res.status(404).json({ ok: false, error: '接口不存在' });
		});

		/** SPA 兜底 */
		app.get('*', (req, res) => {
			const indexFile = path.join(staticDir, 'index.html');
			if (fs.existsSync(indexFile)) {
				res.sendFile(indexFile);
			} else {
				res
					.status(503)
					.type('html')
					.send(
						'<meta charset="utf-8"><div style="font:16px/1.6 system-ui;padding:40px;color:#333">' +
							'<h2>远程控制台尚未构建</h2><p>请先在开发环境中执行 <code>pnpm build</code> 生成 public-remote 目录。</p></div>'
					);
			}
		});
	}
}

/** 对外信息中去掉配对码，避免通过 API 泄露 */
function sanitizeServiceInfo(info: ServiceInfo) {
	return {
		running: info.running,
		port: info.port,
		allowLan: info.allowLan,
		addresses: info.addresses,
		tunnel: info.tunnel,
		appVersion: info.appVersion,
		deviceName: info.deviceName
	};
}

function getClientIp(req: express.Request): string {
	const forwarded = req.headers['x-forwarded-for'];
	if (typeof forwarded === 'string' && forwarded) {
		return forwarded.split(',')[0].trim();
	}
	return req.socket.remoteAddress || '';
}
