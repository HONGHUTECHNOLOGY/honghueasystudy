import { createWriteStream, rmSync } from 'fs';
import { createHash } from 'crypto';
import axios from 'axios';
import { UpdateInformationResource } from '@honghu-desktop/common';

/**
 * 更新包多源下载。
 *
 * 独立于 electron，便于直接跑单测：主进程只负责传进度回调和日志回调。
 */

/** 各源下载时：这么久收不到任何数据就判定该源不可用，直接切下一个 */
export const MIRROR_STALL_MS = 20000;

/**
 * 提示更新前的可达性探测超时。
 *
 * 比下载的 20 秒短得多：这一步只是决定「要不要打扰用户」，
 * 卡太久会让启动检测拖到十几秒，而后台下载本身等得起。
 */
export const PROBE_TIMEOUT_MS = 6000;

/**
 * GitCode 的附件下载会 302 到 file-cdn.gitcode.com，默认 UA（axios/x.y.z）在部分节点会被拦，
 * 用一个常规浏览器 UA 最稳。GitHub 侧无影响。
 */
const DOWNLOAD_USER_AGENT =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

export interface DownloadOptions {
	sha256?: string;
	size?: number;
	onProgress?: (rate: number, total: number, received: number) => void;
	/** 日志出口：主进程写 Logger，测试写 console */
	onLog?: (level: 'info' | 'warn', message: string) => void;
	/** 停滞判定阈值（毫秒），测试时可调小 */
	stallMs?: number;
}

/** 把候选地址整理成去重后的 http(s) 列表 */
export function normalizeUrls(urls: unknown): string[] {
	const list = (Array.isArray(urls) ? urls : []).filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u));
	return [...new Set(list)];
}

/** 把清单里的多源地址整理成去重后的候选列表；urls 优先，url 兜底（兼容旧版清单） */
export function normalizeSources(version: UpdateInformationResource): string[] {
	return normalizeUrls([...(Array.isArray(version.urls) ? version.urls : []), version.url]);
}

export function hostOf(url: string) {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

/**
 * 按来源决定是否走系统代理。
 *
 * - GitCode 走的是国内 CDN（file-cdn.gitcode.com），经代理反而绕远甚至被拦，强制直连；
 *   直连不通时多源回退会自动切到 GitHub，不会卡死在这里。
 * - GitHub 直连在部分网络下不可用，保留 axios 默认行为（读取 HTTP_PROXY/HTTPS_PROXY 等环境代理）。
 */
function proxyFor(url: string): false | undefined {
	try {
		const host = new URL(url).host;
		if (/(^|\.)gitcode\.com$/i.test(host)) return false;
	} catch {}
	return undefined;
}

/**
 * 从单个源下载，边写盘边算 SHA256（更新包 20MB+，不再二次读盘）。
 * 连接建立后若超过 stallMs 收不到数据则中止，避免某个源被墙时卡到天荒地老。
 */
export function downloadOne(url: string, dest: string, opts: DownloadOptions = {}): Promise<void> {
	const stallMs = opts.stallMs ?? MIRROR_STALL_MS;
	let stream: any;
	let writer: any;
	let timer: any;
	let received = 0;
	let lastTick = Date.now();
	const hash = createHash('sha256');
	let settled = false;

	const cleanup = () => {
		clearInterval(timer);
		try {
			stream?.destroy();
		} catch {}
		try {
			writer?.destroy();
		} catch {}
	};

	return new Promise<void>((resolve, reject) => {
		const abort = (err: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(err);
		};

		axios
			.get(url, {
				responseType: 'stream',
				timeout: 20000,
				maxRedirects: 5,
				headers: { 'User-Agent': DOWNLOAD_USER_AGENT },
				proxy: proxyFor(url),
				validateStatus: (s) => s === 200 || s === 206
			})
			.then((res) => {
				if (settled) {
					res.data?.destroy?.();
					return;
				}
				const total = Number(res.headers['content-length']) || opts.size || 0;
				stream = res.data;
				writer = createWriteStream(dest);

				timer = setInterval(() => {
					if (Date.now() - lastTick > stallMs) {
						abort(new Error(`下载停滞超过 ${Math.round(stallMs / 1000)} 秒`));
					}
				}, Math.min(2000, Math.max(200, Math.floor(stallMs / 4))));

				stream.on('data', (chunk: Buffer) => {
					received += chunk.length;
					lastTick = Date.now();
					hash.update(chunk);
					opts.onProgress?.(total ? (received / total) * 100 : 0, total, received);
				});
				stream.on('error', (e: any) => abort(e));
				writer.on('error', (e: any) => abort(e));
				writer.on('close', () => {
					if (settled) return;
					settled = true;
					clearInterval(timer);
					const actual = hash.digest('hex');
					if (opts.size && received !== opts.size) {
						return reject(
							new Error(`包大小不符：期望 ${opts.size} 字节，实际 ${received} 字节（源可能返回了错误页或被截断）`)
						);
					}
					if (opts.sha256 && actual.toLowerCase() !== String(opts.sha256).toLowerCase()) {
						return reject(new Error(`SHA256 校验失败（期望 ${opts.sha256}，实际 ${actual}）`));
					}
					opts.onProgress?.(100, total || received, received);
					resolve();
				});
				stream.pipe(writer);
			})
			.catch((e) => abort(e));
	});
}

/**
 * 多源下载：按清单顺序逐个尝试，任一步失败（连不上 / 中断 / 大小或 sha256 不符）立刻换下一个源。
 *
 * 校验必须放在这里而不只是下载之后 —— 镜像站最常见的故障是「返回 200 但内容是错误页」，
 * 那种情况只有校验能发现，否则会拿一个坏包去覆盖用户的程序目录。
 */
export async function downloadFromMirrors(sources: string[], dest: string, opts: DownloadOptions = {}): Promise<string> {
	const failures: string[] = [];
	const log = opts.onLog || (() => {});

	for (let i = 0; i < sources.length; i++) {
		const url = sources[i];
		try {
			log('info', `下载更新包（源 ${i + 1}/${sources.length}）：${hostOf(url)}`);
			await downloadOne(url, dest, opts);
			log('info', '下载完成：' + url);
			return url;
		} catch (e: any) {
			const msg = e?.message || String(e);
			log('warn', `源不可用，切换下一个：${url} — ${msg}`);
			failures.push(`${hostOf(url)}：${msg}`);
			rmSync(dest, { force: true });
		}
	}

	throw new Error('所有下载源均不可用：\n  ' + failures.join('\n  '));
}

export interface ProbeAttempt {
	url: string;
	ok: boolean;
	/** 供日志展示：HTTP 状态码 / 超时 / 网络错误 */
	detail: string;
}

export interface ProbeResult {
	/** 是否至少有一个源可用 */
	ok: boolean;
	/** 第一个可用的源 */
	url?: string;
	attempts: ProbeAttempt[];
}

/**
 * 探测单个地址能否真正下载。
 *
 * 两个必须注意的点：
 * - **只能用带 Range 的 GET**。GitCode 的附件地址对 HEAD 直接返回 401（实测），
 *   用 HEAD 探测会把唯一可用的源误判成死链，导致永远不提示更新。
 * - **拿到响应头就要销毁流**。服务器可能忽略 Range 直接返回 200 + 整个安装包，
 *   读下去等于白下 324MB；responseType 设成 stream 才有机会在首块数据前中断。
 */
export async function probeOne(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProbeAttempt> {
	try {
		const res = await axios.get(url, {
			responseType: 'stream',
			timeout: timeoutMs,
			maxRedirects: 5,
			headers: { 'User-Agent': DOWNLOAD_USER_AGENT, Range: 'bytes=0-0' },
			proxy: proxyFor(url),
			validateStatus: () => true
		});
		try {
			res.data?.destroy?.();
		} catch {}
		// 200 是服务器忽略了 Range（仍然可用），206 才是标准的分段响应
		const ok = res.status === 200 || res.status === 206;
		return { url, ok, detail: `HTTP ${res.status}` };
	} catch (e: any) {
		const detail = e?.code === 'ECONNABORTED' ? `超时 ${timeoutMs}ms` : e?.code || e?.message || String(e);
		return { url, ok: false, detail: String(detail) };
	}
}

/**
 * 并发探测所有下载源，任一可达即可。
 *
 * 必须并发：两个源都不可达时，串行会把 6 秒超时叠加成 12 秒，
 * 而这只是启动时的一次后台判断，不该拖住用户。
 */
export async function probeSources(
	sources: string[],
	opts: { timeoutMs?: number; onLog?: (level: 'info' | 'warn', msg: string) => void } = {}
): Promise<ProbeResult> {
	const list = normalizeUrls(sources);
	if (!list.length) return { ok: false, attempts: [] };

	const attempts = await Promise.all(list.map((url) => probeOne(url, opts.timeoutMs ?? PROBE_TIMEOUT_MS)));
	const hit = attempts.find((a) => a.ok);

	const log = opts.onLog || (() => {});
	for (const a of attempts) {
		log(a.ok ? 'info' : 'warn', `探测 ${hostOf(a.url)}：${a.detail}`);
	}

	return { ok: !!hit, url: hit?.url, attempts };
}
