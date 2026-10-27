import { ChildProcess, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getBuiltinCloudflaredBinary, hasBuiltinCloudflared } from '@honghu-desktop/common';
import { Logger } from '../../logger';

const logger = Logger('remote-tunnel');

/** 下载停滞判定时长：超过该时间没有收到数据即切换下载源 */
const STALL_TIMEOUT = 20000;

export type TunnelState = 'idle' | 'downloading' | 'starting' | 'running' | 'error';

export interface TunnelStatus {
	state: TunnelState;
	/** 公网访问地址 */
	url: string;
	/** 错误说明 */
	error: string;
	/** 下载进度 0-100 */
	progress: number;
	/** 提供者 */
	provider: string;
	/** 是否已内置可执行文件（内置时无需下载） */
	builtin: boolean;
}

/** 二进制下载地址（按平台），优先 GitHub，失败后依次尝试镜像加速 */
function buildDownloadSources(): string[] {
	const platform = process.platform;
	const arch = process.arch;
	let file = '';

	if (platform === 'win32') {
		file = arch === 'ia32' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe';
	} else if (platform === 'darwin') {
		file = arch === 'arm64' ? 'cloudflared-darwin-arm64.tgz' : 'cloudflared-darwin-amd64.tgz';
	} else {
		file = arch === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64';
	}

	const base = `https://github.com/cloudflare/cloudflared/releases/latest/download/${file}`;
	return [
		base,
		`https://ghfast.top/${base}`,
		`https://ghproxy.net/${base}`,
		`https://gh-proxy.com/${base}`,
		`https://mirror.ghproxy.com/${base}`
	];
}

/** 本地二进制路径 */
function binaryPath(dir: string): string {
	const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
	return path.join(dir, name);
}

/**
 * cloudflared 快速隧道
 *
 * 启动 `cloudflared tunnel --url http://127.0.0.1:<port>`，
 * 从进程输出中解析 `https://xxx.trycloudflare.com` 作为公网地址。
 */
export class CloudflaredTunnel {
	private proc?: ChildProcess;
	private stopping = false;
	private retrying = 0;
	private port = 0;
	/** 重连定时器：进程退出后按指数退避自动重连，直到用户关闭开关 */
	private retryTimer?: ReturnType<typeof setTimeout>;
	/** 进行中的 start()：并发调用（开关切换与恢复设置同时触发）时复用同一个 Promise，
	 *  否则会穿透 this.proc 守卫启动两个 cloudflared，产生两个互相无关的隧道地址 */
	private starting?: Promise<string>;
	/** 用于中止进行中的下载 */
	private currentAbort?: AbortController;
	private status: TunnelStatus = {
		state: 'idle',
		url: '',
		error: '',
		progress: 0,
		provider: 'cloudflared',
		builtin: false
	};

	// eslint-disable-next-line no-useless-constructor
	constructor(private baseDir: string, private onStatusChange?: (status: TunnelStatus) => void) {
		/** 安装包是否已内置二进制，决定界面是否需要提示「首次下载」 */
		this.status.builtin = hasBuiltinCloudflared();
	}

	getStatus(): TunnelStatus {
		return { ...this.status };
	}

	private setStatus(patch: Partial<TunnelStatus>): void {
		this.status = { ...this.status, ...patch };
		if (this.onStatusChange) {
			try {
				this.onStatusChange(this.getStatus());
			} catch (e) {
				logger.error('tunnel status callback error', e);
			}
		}
	}

	/** 启动隧道；已运行时直接返回当前地址 */
	async start(port: number): Promise<string> {
		this.port = port;
		this.stopping = false;

		if (this.status.state === 'running' && this.status.url) {
			return this.status.url;
		}
		if (this.proc) {
			return this.status.url;
		}
		/** 并发调用复用同一次启动，避免拉起两个 cloudflared */
		if (this.starting) {
			return this.starting;
		}

		this.starting = this.doStart(port).finally(() => {
			this.starting = undefined;
		});
		return this.starting;
	}

	private async doStart(port: number): Promise<string> {
		this.setStatus({ state: 'starting', error: '', url: '' });

		const binary = await this.ensureBinary();
		if (!binary || this.stopping) {
			return '';
		}

		return new Promise<string>((resolve) => {
			let settled = false;
			const finish = (url: string) => {
				if (settled) return;
				settled = true;
				resolve(url);
			};

			let child: ChildProcess;
			try {
				child = execFile(binary, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`], {
					windowsHide: true,
					maxBuffer: 1024 * 1024
				});
			} catch (e) {
				this.setStatus({ state: 'error', error: '无法启动 cloudflared：' + String(e) });
				finish('');
				return;
			}

			this.proc = child;
			logger.info('cloudflared 已启动，pid=' + child.pid);

			const handleChunk = (chunk: Buffer) => {
				const text = chunk.toString();
				const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com[^\s|]*/i);
				if (match && !settled) {
					const url = match[0];
					this.retrying = 0;
					this.setStatus({ state: 'running', url, error: '' });
					logger.info('隧道地址：' + url);
					finish(url);
				}
			};

			child.stdout?.on('data', handleChunk);
			child.stderr?.on('data', handleChunk);

			child.on('error', (err) => {
				logger.error('cloudflared 进程错误', err);
				this.setStatus({ state: 'error', error: '隧道进程启动失败：' + String(err) });
				finish('');
			});

			child.on('exit', (code) => {
				this.proc = undefined;
				if (this.stopping) {
					this.setStatus({ state: 'idle', url: '', error: '' });
					finish('');
					return;
				}

				logger.warn('cloudflared 已退出，code=' + code);
				this.setStatus({
					state: 'error',
					url: '',
					error: `隧道进程已退出（code ${code}），正在自动重连…`
				});
				finish('');

				// 开关开着 = 隧道应常驻：无限重连 + 指数退避（2s→60s 封顶），网络恢复后自动拉起。
				// 注意 quick tunnel 每次重连都会分配新域名，旧地址/二维码随之失效。
				this.scheduleRetry();
			});

			// 30 秒内没有解析到地址则判定本次失败：杀掉当前进程，
			// 由 exit 回调触发自动重连（原来直接 stop() 会永久放弃，休眠唤醒后网络慢就会踩中）
			setTimeout(() => {
				if (settled) return;
				this.setStatus({
					state: 'error',
					error: '隧道建立超时，正在自动重连…（持续失败请检查网络，或改用局域网访问）'
				});
				finish('');
				if (this.proc) {
					try {
						this.proc.kill();
					} catch (e) {
						logger.error('结束超时 tunnel 进程失败', e);
					}
					this.proc = undefined;
				}
			}, 30000);
		});
	}

	/** 指数退避自动重连：2s、4s、8s、16s、32s、之后 60s 封顶，成功后清零 */
	private scheduleRetry(): void {
		if (this.stopping) return;
		if (this.retryTimer) clearTimeout(this.retryTimer);

		const delay = Math.min(60 * 1000, 2000 * Math.pow(2, Math.min(this.retrying, 5)));
		this.retrying += 1;

		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined;
			if (this.stopping) return;
			logger.info(`隧道自动重连（第 ${this.retrying} 次，间隔 ${Math.round(delay / 1000)}s）`);
			this.start(this.port).catch((e) => logger.error(e));
		}, delay);
	}

	/** 停止隧道（同时中止进行中的下载） */
	stop(): void {
		this.stopping = true;

		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = undefined;
		}
		this.retrying = 0;

		if (this.currentAbort) {
			try {
				this.currentAbort.abort();
			} catch {}
			this.currentAbort = undefined;
		}

		if (this.proc) {
			try {
				this.proc.kill();
			} catch (e) {
				logger.error('结束 tunnel 进程失败', e);
			}
			this.proc = undefined;
		}
		this.setStatus({ state: 'idle', url: '', error: '', progress: 0 });
	}

	/**
	 * 确保二进制存在，返回可执行路径；失败返回空字符串。
	 *
	 * 优先级：安装包内置 → 用户目录已有副本 → 在线下载兜底。
	 * 内置版本复制到用户目录再执行，避免安装目录只读或权限不足，
	 * 也便于后续版本替换时覆盖。
	 */
	private async ensureBinary(): Promise<string> {
		const dir = path.join(this.baseDir, 'cloudflared');
		const target = binaryPath(dir);

		/** 1. 安装包内置 */
		const builtin = getBuiltinCloudflaredBinary();
		if (builtin) {
			try {
				fs.mkdirSync(dir, { recursive: true });

				let copied = false;
				const needCopy = !fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(builtin).size;
				if (needCopy) {
					fs.copyFileSync(builtin, target);
					copied = true;
					logger.info('已从安装包复制 cloudflared：' + target);
				}

				if (process.platform !== 'win32') {
					fs.chmodSync(target, 0o755);
					if (copied && process.platform === 'darwin') {
						await removeQuarantine(target);
					}
				}

				this.status.builtin = true;
				this.setStatus({ state: 'starting', progress: 100, error: '' });
				return target;
			} catch (e) {
				logger.error('使用内置 cloudflared 失败，回退在线下载', e);
			}
		}

		/** 2. 用户目录已有副本 */
		if (fs.existsSync(target)) {
			return target;
		}

		/** 3. 在线下载兜底 */
		this.status.builtin = false;
		fs.mkdirSync(dir, { recursive: true });

		const sources = buildDownloadSources();
		const isTgz = sources[0].endsWith('.tgz');

		for (let i = 0; i < sources.length; i++) {
			const url = sources[i];
			try {
				logger.info(`开始下载 cloudflared：${url}`);
				this.setStatus({ state: 'downloading', progress: 0, error: '' });

				/**
				 * 先下载到临时文件再改名：
				 * 避免下载中断留下残缺文件，导致下次启动误判为「已安装」。
				 */
				const downloadTo = path.join(dir, isTgz ? 'cloudflared.tgz.tmp' : path.basename(target) + '.tmp');

				const controller = new AbortController();
				this.currentAbort = controller;

				await downloadWithWatchdog(
					url,
					downloadTo,
					(progress) => {
						this.setStatus({ progress });
					},
					controller
				);

				this.currentAbort = undefined;

				/** 下载期间用户关闭了开关 */
				if (this.stopping) {
					fs.rmSync(downloadTo, { force: true });
					return '';
				}

				if (isTgz) {
					await extractTgz(downloadTo, dir);
					fs.rmSync(downloadTo, { force: true });
				} else {
					fs.rmSync(target, { force: true });
					fs.renameSync(downloadTo, target);
				}

				if (!fs.existsSync(target)) {
					throw new Error('解压后未找到 cloudflared 可执行文件');
				}

				if (process.platform !== 'win32') {
					fs.chmodSync(target, 0o755);
					/** macOS 需要移除隔离属性，否则 Gatekeeper 会阻止执行 */
					if (process.platform === 'darwin') {
						await removeQuarantine(target);
					}
				}

				logger.info('cloudflared 安装完成：' + target);
				this.setStatus({ state: 'starting', progress: 100 });
				return target;
			} catch (e) {
				logger.error(`下载源失败（${url}）`, e);
				/** 清理可能残留的临时文件，避免影响下一次尝试 */
				try {
					fs.rmSync(path.join(dir, isTgz ? 'cloudflared.tgz.tmp' : path.basename(target) + '.tmp'), { force: true });
				} catch {}
			}
		}

		this.setStatus({
			state: 'error',
			error: '无法下载内网穿透组件，请检查网络后重试，或改用局域网访问。'
		});
		return '';
	}
}

/** 解压 .tgz（macOS 分发格式） */
function extractTgz(file: string, dir: string): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile('tar', ['-xzf', file, '-C', dir], (err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
	});
}

/**
 * 带看门狗的下载
 *
 * 项目通用的 downloadFile 没有超时控制，在 GitHub 不可达时会无限挂起，
 * 表现为界面永远停在「下载 0%」。这里改为：
 * - 连接超时 20s
 * - 20s 内没有收到任何数据判定为卡死，主动中止并切换下一个源
 */
function downloadWithWatchdog(
	url: string,
	dest: string,
	onProgress: (percent: number) => void,
	controller: AbortController
): Promise<void> {
	return new Promise((resolve, reject) => {
		let lastDataAt = Date.now();
		let settled = false;

		const finish = (err?: Error) => {
			if (settled) return;
			settled = true;
			clearInterval(watchdog);
			if (err) reject(err);
			else resolve();
		};

		const watchdog = setInterval(() => {
			if (Date.now() - lastDataAt > STALL_TIMEOUT) {
				try {
					controller.abort();
				} catch {}
				finish(new Error('下载停滞，已切换下载源'));
			}
		}, 2000);

		axios
			.get(url, {
				responseType: 'stream',
				signal: controller.signal,
				timeout: 20000,
				maxRedirects: 5
			})
			.then((res) => {
				const total = parseInt(String(res.headers['content-length'] || '0'), 10);
				let received = 0;

				fs.mkdirSync(path.dirname(dest), { recursive: true });
				const writer = fs.createWriteStream(dest);

				res.data.on('data', (chunk: Buffer) => {
					received += chunk.length;
					lastDataAt = Date.now();
					if (total > 0) {
						onProgress(Math.min(99, Math.round((received / total) * 100)));
					}
				});

				res.data.on('error', (e: Error) => {
					writer.destroy();
					finish(e);
				});

				writer.on('error', (e) => finish(e));
				writer.on('finish', () => {
					if (total > 0 && received < total) {
						finish(new Error('下载不完整'));
						return;
					}
					onProgress(100);
					finish();
				});

				res.data.pipe(writer);
			})
			.catch((e) => finish(e instanceof Error ? e : new Error(String(e))));
	});
}

function removeQuarantine(file: string): Promise<void> {
	return new Promise((resolve) => {
		execFile('xattr', ['-d', 'com.apple.quarantine', file], () => resolve());
	});
}
