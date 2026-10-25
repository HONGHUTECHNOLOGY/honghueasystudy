import crypto from 'crypto';

/** 会话有效期：7 天 */
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
/** 连续错误多少次后锁定 */
const MAX_FAILURES = 5;
/** 锁定时长 */
const LOCK_DURATION = 60 * 1000;
/** Cookie 名 */
export const SESSION_COOKIE = 'hh_rc';

/**
 * 访问验证方式
 * - pair：6 位随机配对码（默认，每次服务启动重新生成）
 * - password：用户自设密码，长期有效
 * - none：免验证，任何能访问到端口的人都能操作（高危，仅在可信网络使用）
 */
export type AuthMode = 'pair' | 'password' | 'none';

export interface AuthOptions {
	mode: AuthMode;
	/** 密码哈希，格式 `scrypt$salt$hash` */
	passwordHash?: string;
}

export interface RemoteSession {
	id: string;
	createdAt: number;
	lastSeen: number;
	ip: string;
	userAgent: string;
}

export interface VerifyResult {
	ok: boolean;
	error?: string;
}

/**
 * 远程控制鉴权
 *
 * 三种模式的共同点：验证通过后都会签发会话（`sessionId.hmac` 的 httpOnly Cookie），
 * 之后 7 天内免重复输入；切换模式会清空全部会话，强制所有设备重新验证。
 */
export class RemoteAuth {
	private code = '';
	private sessions = new Map<string, RemoteSession>();
	private failures = 0;
	private lockedUntil = 0;
	private mode: AuthMode = 'pair';
	private passwordHash = '';

	constructor(private secret: string, options?: Partial<AuthOptions>) {
		if (!this.secret) {
			this.secret = crypto.randomBytes(32).toString('hex');
		}
		if (options && options.mode) this.mode = options.mode;
		if (options && options.passwordHash) this.passwordHash = options.passwordHash;
		this.refreshCode();
	}

	// ---------------------------------------------------------------- 模式

	getMode(): AuthMode {
		return this.mode;
	}

	hasPassword(): boolean {
		return !!this.passwordHash;
	}

	/**
	 * 更新鉴权配置
	 *
	 * 切换模式或改密码都会踢出所有已连接设备：旧会话不应继续拥有旧权限。
	 */
	update(options: Partial<AuthOptions>): void {
		let changed = false;

		if (options.mode && options.mode !== this.mode) {
			this.mode = options.mode;
			changed = true;
		}
		if (options.passwordHash !== undefined && options.passwordHash !== this.passwordHash) {
			this.passwordHash = options.passwordHash;
			changed = true;
		}

		if (changed) {
			this.revokeAll();
			this.failures = 0;
			this.lockedUntil = 0;
		}
	}

	/** 生成密码哈希（scrypt + 随机盐） */
	static hashPassword(plain: string): string {
		const salt = crypto.randomBytes(16).toString('hex');
		const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
		return `scrypt$${salt}$${hash}`;
	}

	// ---------------------------------------------------------------- 配对码

	/** 重新生成配对码，并清空失败计数 */
	refreshCode(): string {
		// 不使用 padStart，兼容 tsconfig 的 es2016 target
		const raw = String(crypto.randomInt(0, 1000000));
		this.code = '000000'.slice(raw.length) + raw;
		this.failures = 0;
		this.lockedUntil = 0;
		return this.code;
	}

	getCode(): string {
		return this.code;
	}

	/**
	 * 统一校验入口（按当前模式分派）
	 *
	 * 免验证模式直接通过，仅用于「可信局域网」场景。
	 */
	verify(input: unknown): VerifyResult {
		if (this.mode === 'none') {
			return { ok: true };
		}

		const locked = this.checkLock();
		if (locked) return locked;

		const value = String(input === undefined || input === null ? '' : input).trim();

		if (this.mode === 'password') {
			if (!this.passwordHash) {
				return { ok: false, error: '尚未设置访问密码，请在电脑端设置后再试' };
			}
			return this.finish(this.comparePassword(value), '密码不正确');
		}

		return this.finish(value === this.code, '配对码不正确');
	}

	/** 兼容旧调用：仅校验配对码 */
	verifyCode(input: unknown): VerifyResult {
		return this.verify(input);
	}

	private checkLock(): VerifyResult | null {
		const now = Date.now();
		if (now < this.lockedUntil) {
			return { ok: false, error: `尝试次数过多，请 ${Math.ceil((this.lockedUntil - now) / 1000)} 秒后重试` };
		}
		return null;
	}

	/** 统一处理失败计数 */
	private finish(passed: boolean, errorText: string): VerifyResult {
		if (passed) {
			this.failures = 0;
			return { ok: true };
		}

		const now = Date.now();
		this.failures += 1;
		if (this.failures >= MAX_FAILURES) {
			this.failures = 0;
			this.lockedUntil = now + LOCK_DURATION;
			return { ok: false, error: '尝试次数过多，已锁定 60 秒' };
		}
		return { ok: false, error: errorText };
	}

	/** 定长比较密码哈希 */
	private comparePassword(value: string): boolean {
		const parts = this.passwordHash.split('$');
		if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

		const salt = parts[1];
		const expected = parts[2];
		let actual = '';
		try {
			actual = crypto.scryptSync(value, salt, 64).toString('hex');
		} catch {
			return false;
		}
		return this.safeEqual(actual, expected);
	}

	// ---------------------------------------------------------------- 会话

	/** 创建会话，返回 Cookie 值 */
	createSession(ip: string, userAgent: string): { token: string; session: RemoteSession } {
		const id = crypto.randomBytes(16).toString('hex');
		const session: RemoteSession = {
			id,
			createdAt: Date.now(),
			lastSeen: Date.now(),
			ip: ip || '',
			userAgent: (userAgent || '').slice(0, 200)
		};
		this.sessions.set(id, session);
		return { token: `${id}.${this.sign(id)}`, session };
	}

	/** 从 Cookie 头解析出会话，无效返回 null */
	resolve(cookieHeader: string | undefined, queryToken?: string): RemoteSession | null {
		const raw = this.readCookie(cookieHeader) || queryToken || '';
		if (!raw) return null;

		const index = raw.lastIndexOf('.');
		if (index <= 0) return null;

		const id = raw.slice(0, index);
		const signature = raw.slice(index + 1);
		if (!this.safeEqual(signature, this.sign(id))) return null;

		const session = this.sessions.get(id);
		if (!session) return null;

		const now = Date.now();
		if (now - session.createdAt > SESSION_TTL) {
			this.sessions.delete(id);
			return null;
		}

		session.lastSeen = now;
		return session;
	}

	/** 撤销单个会话 */
	revoke(id: string): boolean {
		return this.sessions.delete(id);
	}

	/** 撤销全部会话 */
	revokeAll(): void {
		this.sessions.clear();
	}

	/** 会话列表（不含签名） */
	list(): RemoteSession[] {
		const now = Date.now();
		const result: RemoteSession[] = [];
		this.sessions.forEach((session) => {
			if (now - session.createdAt <= SESSION_TTL) {
				result.push({ ...session });
			}
		});
		return result.sort((a, b) => b.lastSeen - a.lastSeen);
	}

	/** 生成 Set-Cookie 头 */
	buildCookie(token: string, secure: boolean): string {
		const parts = [
			`${SESSION_COOKIE}=${token}`,
			'Path=/',
			'HttpOnly',
			'SameSite=Lax',
			`Max-Age=${Math.floor(SESSION_TTL / 1000)}`
		];
		if (secure) parts.push('Secure');
		return parts.join('; ');
	}

	/** 生成清除 Cookie 的头 */
	buildClearCookie(): string {
		return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
	}

	private sign(id: string): string {
		return crypto.createHmac('sha256', this.secret).update(id).digest('hex');
	}

	private readCookie(cookieHeader: string | undefined): string | null {
		if (!cookieHeader) return null;
		const pairs = cookieHeader.split(';');
		for (let i = 0; i < pairs.length; i++) {
			const pair = pairs[i].trim();
			if (pair.indexOf(SESSION_COOKIE + '=') === 0) {
				return decodeURIComponent(pair.slice(SESSION_COOKIE.length + 1));
			}
		}
		return null;
	}

	/** 定长比较，避免时序侧信道 */
	private safeEqual(a: string, b: string): boolean {
		if (a.length !== b.length) return false;
		let diff = 0;
		for (let i = 0; i < a.length; i++) {
			diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
		}
		return diff === 0;
	}
}

/** 简单的滑动窗口限流器 */
export class RateLimiter {
	private hits: number[] = [];

	// eslint-disable-next-line no-useless-constructor
	constructor(private windowMs: number, private max: number) {}

	/** 返回 true 表示允许通过 */
	take(): boolean {
		const now = Date.now();
		this.hits = this.hits.filter((t) => now - t < this.windowMs);
		if (this.hits.length >= this.max) return false;
		this.hits.push(now);
		return true;
	}
}
