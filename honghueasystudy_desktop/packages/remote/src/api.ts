export interface BrowserSnapshot {
	uid: string;
	name: string;
	notes: string;
	tags: { name: string; color: string }[];
	status: 'closed' | 'closing' | 'launching' | 'launched';
	pages: { url: string; title: string }[];
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

	command: (action: string, payload: Record<string, any> = {}) =>
		request<{ ok: boolean; data: any }>('/api/command', {
			method: 'POST',
			body: JSON.stringify({ action, payload })
		})
};

/** 截图地址，带时间戳防止缓存 */
export function snapshotUrl(uid: string): string {
	return `/api/snapshot/${encodeURIComponent(uid)}?t=${Date.now()}`;
}
