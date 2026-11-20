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

/** quick=随机域名（trycloudflare.com）；named=账号固定域名（Cloudflare 命名隧道） */
export type TunnelMode = 'quick' | 'named';

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
	/** 当前隧道模式 */
	mode: TunnelMode;
}

/** 命名隧道配置（两者齐备才启用，缺一退回快速隧道） */
export interface NamedTunnelConfig {
	token: string;
	hostname: string;
}

/** cloudflared 对无效 Token 的几种报错特征：这类错误重连多少次都没用，直接停下并提示 */
const TOKEN_ERROR_PATTERN = /invalid tunnel secret|provided tunnel token is not valid|failed to (parse|decode|unmarshal) token/i;

/** 规范化用户填写的固定域名：允许不带协议，统一 https */
function normalizeHostname(raw: string): string {
	let value = String(raw || '').trim();
	if (!value) return '';
	if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
	return value.replace(/\/+$/, '');
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
	/**
	 * 健康检查定时器。
	 *
	 * 隧道进程可能被外部因素静默终止（安全软件拦截、系统休眠、代理软件重置连接等），
	 * 此时 exit 回调甚至可能不触发，状态就永远停在 idle/error 而开关仍是开着的。
	 * 这里按「上层期望是否应运行」定期校正，比只依赖进程事件更可靠。
	 */
	private healthTimer?: ReturnType<typeof setInterval>;
	/** 连通性探测：抓到「进程还在但隧道已经断了」的半死状态 */
	private probeFailures = 0;
	private probeAt = 0;
	private probing = false;
	/** 用于中止进行中的下载 */
	private currentAbort?: AbortController;
	/** 本次启动使用的命名隧道配置；为空表示快速隧道 */
	private named: NamedTunnelConfig | null = null;
	/**
	 * Token 无效这类「重试无意义」的错误。
	 *
	 * 置位后健康检查不再自动拉起，直到用户修改配置或重新开关隧道，
	 * 否则无效 Token 会以指数退避无限重连，日志和 Cloudflare 请求都会被刷爆。
	 */
	private permanentError = false;
	private status: TunnelStatus = {
		state: 'idle',
		url: '',
		error: '',
		progress: 0,
		provider: 'cloudflared',
		builtin: false,
		mode: 'quick'
	};

	// eslint-disable-next-line no-useless-constructor
	constructor(
		private baseDir: string,
		private onStatusChange?: (status: TunnelStatus) => void,
		/** 上层期望隧道是否应当处于运行状态（读设置与开关）；用于静默死亡后的自愈 */
		private shouldRun?: () => boolean,
		/** 命名隧道配置；返回空 token/hostname 即用随机域名 */
		private getNamed?: () => NamedTunnelConfig
	) {
		/** 安装包是否已内置二进制，决定界面是否需要提示「首次下载」 */
		this.status.builtin = hasBuiltinCloudflared();
		this.startHealthWatch();
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

	/** 启动健康检查（每 10s 校正一次） */
	private startHealthWatch(): void {
		if (this.healthTimer) return;
		this.healthTimer = setInterval(() => this.checkHealth(), 10000);
		/** 不阻塞进程退出 */
		if (this.healthTimer.unref) this.healthTimer.unref();
	}

	/**
	 * 一次性校正：设置里要求开隧道，但本地既没有进程也没有在启动，
	 * 说明进程被静默杀掉或状态机被打断，直接重新拉起。
	 */
	private checkHealth(): void {
		if (!this.shouldRun || !this.port) return;
		/** Token 无效等永久性错误：等用户改配置或重开开关，不再自动重试 */
		if (this.permanentError) return;

		let wanted = false;
		try {
			wanted = this.shouldRun();
		} catch (e) {
			logger.error('隧道健康检查读取设置失败', e);
			return;
		}
		if (!wanted) return;

		/** 进程在：只做连通性探测，不重启，避免打断正常的隧道 */
		if (this.proc) {
			if (this.status.state === 'running') this.probe();
			return;
		}
		if (this.starting || this.retryTimer) return;

		logger.warn(`隧道健康检查：期望运行但进程不存在（状态 ${this.status.state}），重新拉起`);
		/** 清理可能残留的 stopping 标记，否则新进程退出时又会走静默分支 */
		this.stopping = false;
		this.retrying = 0;
		this.start(this.port).catch((e) => logger.error('隧道健康检查重启失败', e));
	}

	/**
	 * 隧道连通性探测。
	 *
	 * cloudflared 进程有时不会退出，但底层连接被代理软件/安全软件掐断，
	 * 界面上域名还在、实际已经打不开。这里定期请求一次 /api/ping，
	 * 连续三次不通就杀掉进程，交给退出回调走自动重连（会分配新域名）。
	 */
	private probe(): void {
		if (this.probing) return;
		if (this.status.state !== 'running' || !this.status.url) return;

		const now = Date.now();
		if (now - this.probeAt < 45000) return;
		this.probeAt = now;
		this.probing = true;

		axios
			.get(`${this.status.url}/api/ping`, {
				timeout: 8000,
				/** 忽略系统代理：本机代理软件（加速器/VPN）会拦截对隧道的访问，导致误判 */
				proxy: false,
				validateStatus: () => true
			})
			.then(() => {
				this.probeFailures = 0;
			})
			.catch((e) => {
				this.probeFailures += 1;
				logger.warn(`隧道连通性探测失败（第 ${this.probeFailures} 次）：${e instanceof Error ? e.message : String(e)}`);
				if (this.probeFailures >= 3 && this.proc) {
					logger.warn('隧道连续探测失败，终止进程以触发自动重连');
					this.probeFailures = 0;
					try {
						this.proc.kill();
					} catch (err) {
						logger.error('结束失效 tunnel 进程失败', err);
					}
				}
			})
			.finally(() => {
				this.probing = false;
			});
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

		/**
		 * 固定域名模式：Token + 域名两者齐备才走命名隧道。
		 *
		 * 命名隧道的公网地址由 Cloudflare 控制台的 Public Hostname 决定，
		 * cloudflared 不会把地址打印出来，所以域名必须由用户填写，
		 * 我们就绪判定改为「探测该域名 + /api/ping 是否返回 200」。
		 */
		const config = (this.getNamed && this.getNamed()) || { token: '', hostname: '' };
		const token = String(config.token || '').trim();
		const hostname = normalizeHostname(config.hostname);
		this.named = token && hostname ? { token, hostname } : null;
		this.setStatus({ mode: this.named ? 'named' : 'quick' });

		const args = this.named
			? ['tunnel', '--no-autoupdate', 'run', '--token', this.named.token]
			: ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`];

		return new Promise<string>((resolve) => {
			let settled = false;
			const finish = (url: string) => {
				if (settled) return;
				settled = true;
				resolve(url);
			};

			let child: ChildProcess;
			try {
				child = execFile(binary, args, {
					windowsHide: true,
					maxBuffer: 1024 * 1024
				});
			} catch (e) {
				this.setStatus({ state: 'error', error: '无法启动 cloudflared：' + String(e) });
				finish('');
				return;
			}

			this.proc = child;
			logger.info(`cloudflared 已启动（${this.named ? '命名隧道·' + this.named.hostname : '快速隧道'}），pid=` + child.pid);

			/** 两种模式共用的「就绪」收尾 */
			const markReady = (url: string) => {
				this.retrying = 0;
				this.probeFailures = 0;
				this.probeAt = Date.now();
				this.setStatus({ state: 'running', url, error: '' });
				logger.info('隧道地址：' + url);
				finish(url);
			};

			const handleChunk = (chunk: Buffer) => {
				const text = chunk.toString();

				if (this.named) {
					if (TOKEN_ERROR_PATTERN.test(text) && !this.permanentError) {
						this.permanentError = true;
						this.setStatus({
							state: 'error',
							url: '',
							error: '隧道 Token 无效或隧道已被删除，请到 Cloudflare 控制台重新复制 Token'
						});
						logger.error('命名隧道 Token 无效：' + text.trim().slice(0, 200));
						finish('');
						/** 无效 Token 下 cloudflared 有时不会自己退出，主动结束，交给 exit 回调收尾（不重连） */
						try {
							child.kill();
						} catch {}
					}
					return;
				}

				const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com[^\s|]*/i);
				if (match && !settled) markReady(match[0]);
			};

			child.stdout?.on('data', handleChunk);
			child.stderr?.on('data', handleChunk);

			if (this.named) {
				/** 命名隧道没有可解析的地址，靠反向探测判断是否真的通了 */
				this.waitNamedReady(child, () => {
					if (!settled) markReady(this.named ? this.named.hostname : '');
				});
			}

			child.on('error', (err) => {
				logger.error('cloudflared 进程错误', err);
				this.setStatus({ state: 'error', error: '隧道进程启动失败：' + String(err) });
				finish('');
			});

			child.on('exit', (code) => {
				/**
				 * 旧一代进程的退出回调不能动新一代的状态：
				 * 超时重连时会先杀旧进程再拉新进程，而 Windows 上旧进程的 exit 事件
				 * 可能晚于新进程建立隧道才到达，原来无条件 `this.proc = undefined`
				 * 会把刚拿到的域名清空，表现为「隧道明明开着，域名突然消失」。
				 */
				if (this.proc !== child) {
					logger.info(`旧 tunnel 进程退出（pid=${child.pid}，code=${code}），不影响当前隧道`);
					return;
				}

				this.proc = undefined;

				if (this.stopping) {
					logger.info(`cloudflared 已停止（pid=${child.pid}，code=${code}）`);
					this.setStatus({ state: 'idle', url: '', error: '' });
					finish('');
					return;
				}

				/** Token 无效这类错误重连没有意义，保留错误提示等用户改配置 */
				if (this.permanentError) {
					logger.warn('隧道因配置错误停止，不再自动重连');
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

			// 30 秒内没有就绪则判定本次失败：杀掉当前进程，
			// 由 exit 回调触发自动重连（原来直接 stop() 会永久放弃，休眠唤醒后网络慢就会踩中）
			setTimeout(() => {
				if (settled) return;
				this.setStatus({
					state: 'error',
					error: this.named
						? `固定域名 ${this.named.hostname} 未就绪，正在重试…请确认 Cloudflare 隧道已配置 Public Hostname 指向 http://127.0.0.1:${port}`
						: '隧道建立超时，正在自动重连…（持续失败请检查网络，或改用局域网访问）'
				});
				finish('');
				/** 只结束自己这一代进程，避免误杀后来的新进程 */
				if (this.proc === child) {
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

	/**
	 * 命名隧道就绪探测
	 *
	 * 每 2 秒请求一次固定域名的 `/api/ping`，返回 200 才算真正通了。
	 * 只看 cloudflared 输出不够：进程注册成功不代表 DNS/ingress 已经生效，
	 * 而且地址是我们自己填的，必须实测一次才能把地址交给二维码。
	 */
	private async waitNamedReady(child: ChildProcess, onReady: () => void): Promise<void> {
		const target = this.named;
		if (!target) return;

		const deadline = Date.now() + 30000;
		while (Date.now() < deadline) {
			if (this.stopping || this.permanentError || this.proc !== child) return;
			try {
				const res = await axios.get(`${target.hostname}/api/ping`, {
					timeout: 5000,
					proxy: false,
					validateStatus: () => true
				});
				if (res.status === 200) {
					onReady();
					return;
				}
			} catch {
				/* 隧道还在连接，继续等 */
			}
			await new Promise((r) => setTimeout(r, 2000));
		}
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
		this.probeFailures = 0;
		this.probing = false;
		/** 再次启动时允许重新尝试（用户可能刚换了 Token） */
		this.permanentError = false;

		/** 记录调用来源：开关关闭和内部重启都会走到这里，出问题时能直接看出是谁停的 */
		try {
			const stack = (new Error().stack || '')
				.split('\n')
				.slice(1, 6)
				.map((line) => line.trim())
				.join(' <- ');
			logger.info(`停止隧道（pid=${this.proc ? this.proc.pid : '无'}）来自：${stack}`);
		} catch {}

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
