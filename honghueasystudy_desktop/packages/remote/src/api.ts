/** 任务进度：桌面端从脚本日志推断后随状态快照推送 */
export interface TaskProgress {
	/** 浏览器就绪时间戳（0 表示未就绪） */
	startedAt: number;
	/** 最后一次有日志输出的时间戳（0 表示还没有输出） */
	lastActivityAt: number;
	/** 推断出的当前任务名 */
	currentTask: string;
	/** 已完成任务点数 */
	completed: number;
	/** 已作答题目数 */
	answered: number;
	/** 错误条数 */
	errors: number;
	/** 是否收到「全部完成」信号 */
	finished: boolean;
}

export interface BrowserSnapshot {
	uid: string;
	name: string;
	notes: string;
	tags: { name: string; color: string }[];
	status: 'closed' | 'closing' | 'launching' | 'launched';
	/** active 为 true 表示该页是浏览器当前前台可见的标签页 */
	pages: { url: string; title: string; active?: boolean }[];
	/** 可选：桌面端旧版本不上报该字段 */
	progress?: TaskProgress;
	/**
	 * 页面内视频状态；null / 缺省表示当前页没有视频。
	 * 用来区分「正在看视频（没有日志是正常的）」和「真的卡住了」。
	 */
	media?: { playing: boolean; currentTime: number; duration: number } | null;
}

export interface RemoteSnapshot {
	browsers: BrowserSnapshot[];
	logs: { [uid: string]: string[] };
	ts: number;
}

export interface TunnelStatus {
	state: 'idle' | 'downloading' | 'starting' | 'running' | 'error';
	url: string;
	error: string;
	progress: number;
	provider: string;
}

export interface ServiceInfo {
	running: boolean;
	port: number;
	allowLan: boolean;
	addresses: string[];
	tunnel: TunnelStatus;
	appVersion: string;
	deviceName: string;
}

export type AuthMode = 'pair' | 'password' | 'none';

export interface PingResult {
	ok: boolean;
	authed: boolean;
	needPair: boolean;
	authMode: AuthMode;
	hasPassword: boolean;
	appVersion: string;
	deviceName: string;
	port: number;
}

/** 未登录/会话失效 */
export class AuthError extends Error {
	constructor(message?: string) {
		super(message || '登录已失效');
		this.name = 'AuthError';
	}
}

// eslint-disable-next-line no-undef -- RequestInit 为 TS lib.dom 类型，no-undef 对 TS 类型误报
async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		credentials: 'same-origin',
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(init && init.headers ? (init.headers as Record<string, string>) : {})
		}
	});

	if (res.status === 401) {
		throw new AuthError('登录已失效，请重新配对');
	}

	let body: any = null;
	try {
		body = await res.json();
	} catch {
		throw new Error(`服务响应异常（${res.status}）`);
	}

	if (!res.ok || !body || body.ok === false) {
		throw new Error((body && body.error) || `请求失败（${res.status}）`);
	}

	return body as T;
}

export const api = {
	ping: () => request<PingResult>('/api/ping'),

	/** 校验凭据（配对码或密码，由服务端按当前模式判定） */
	auth: (secret: string) =>
		request<{ ok: boolean }>('/api/auth', {
			method: 'POST',
			body: JSON.stringify({ secret })
		}),

	logout: () => request<{ ok: boolean }>('/api/logout', { method: 'POST', body: '{}' }),

	state: () => request<{ snapshot: RemoteSnapshot | null; service: ServiceInfo; sessions: number }>('/api/state'),

	/** 催桌面端立即补报一次快照（远程端发现状态停滞时用） */
	sync: () => request<{ ok: boolean; ts: number }>('/api/sync', { method: 'POST', body: '{}' }),

	command: (action: string, payload: Record<string, any> = {}) =>
		request<{ ok: boolean; data: any }>('/api/command', {
			method: 'POST',
			body: JSON.stringify({ action, payload })
		})
};

/**
 * 截图地址，带时间戳防止缓存
 *
 * page 为选中的标签页索引；不传则由后端自动挑选当前前台可见的页面。
 */
export function snapshotUrl(uid: string, page?: number): string {
	const suffix = typeof page === 'number' && page >= 0 ? `&page=${page}` : '';
	return `/api/snapshot/${encodeURIComponent(uid)}?t=${Date.now()}${suffix}`;
}
