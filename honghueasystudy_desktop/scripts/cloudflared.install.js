/**
 * 构建期把 cloudflared 二进制放进 bin/cloudflared/<platform>-<arch>/，
 * 由 electron-builder 的 extraResources 带进安装包，运行时无需联网下载。
 *
 * 与 ocr.install.js 的差异：cloudflared 上游只提供裸二进制（Windows/Linux）和 tgz（macOS），
 * 因此这里不打包成 zip，直接把可执行文件放进目标目录，运行时直接复制使用。
 *
 * 下载失败不阻断打包：运行时 tunnel.ts 仍保留在线下载兜底。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/** 认为文件有效的体积下限 */
const MIN_SIZE = 5 * 1024 * 1024;

/** 各平台对应的上游发布文件名 */
const FILE_NAMES = {
	'win-x64': 'cloudflared-windows-amd64.exe',
	'win-ia32': 'cloudflared-windows-386.exe',
	'mac-x64': 'cloudflared-darwin-amd64.tgz',
	'mac-arm64': 'cloudflared-darwin-arm64.tgz',
	'linux-x64': 'cloudflared-linux-amd64',
	'linux-arm64': 'cloudflared-linux-arm64'
};

const BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

/**
 * 下载源顺序：优先国内加速镜像，GitHub 直连放最后兜底。
 * （国内直连 GitHub Releases 常见「能连上但速率极低」的状态，不适合作为首选）
 */
const MIRROR_PREFIXES = [
	'https://ghfast.top/',
	'https://gh-proxy.com/',
	'https://ghproxy.net/',
	'https://mirror.ghproxy.com/',
	''
];

function platformKey() {
	return `${process.env.PLATFORM || 'win'}-${process.env.ARCH || 'x64'}`;
}

function targetDir() {
	const key = platformKey();
	if (!FILE_NAMES[key]) return null;
	// 落盘到桌面端子工作区 bin/cloudflared/<platform>-<arch>/
	return path.resolve(__dirname, '../bin/cloudflared', key);
}

function binaryName() {
	return (process.env.PLATFORM || 'win') === 'win' ? 'cloudflared.exe' : 'cloudflared';
}

/** 下载停滞判定（毫秒）：超过该时长没有收到任何数据即换源 */
const STALL_MS = 30000;
/** 最低可接受速率（字节/秒）。低于此值即使还在传也换源，否则 40MB 要下几小时 */
const MIN_RATE = 40 * 1024;
/** 速率考察窗口（毫秒），窗口结束后才做判断 */
const RATE_CHECK_MS = 45000;

/**
 * 流式下载到文件。
 *
 * 不能用整体超时：镜像速度可能只有几十 KB/s，40MB 需要好几分钟，
 * 整体超时会把仍在正常传输的源误杀。
 * 因此用两层判定：① 30 秒无任何数据即停滞；② 45 秒后平均速率过低则放弃换源。
 */
async function fetchTo(url, dest) {
	const controller = new AbortController();
	const startAt = Date.now();
	let lastDataAt = startAt;
	let stalled = false;
	let tooSlow = false;
	let lastPct = -1;

	const watchdog = setInterval(() => {
		if (Date.now() - lastDataAt > STALL_MS) {
			stalled = true;
			try {
				controller.abort();
			} catch {}
		}
	}, 2000);

	try {
		const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}

		const total = Number(res.headers.get('content-length') || 0);
		const reader = res.body.getReader();
		const chunks = [];
		let received = 0;

		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			received += value.length;
			lastDataAt = Date.now();
			chunks.push(Buffer.from(value));

			const elapsed = Date.now() - startAt;
			if (elapsed >= RATE_CHECK_MS && received / (elapsed / 1000) < MIN_RATE) {
				tooSlow = true;
				try {
					controller.abort();
				} catch {}
				break;
			}

			if (total > 0) {
				const pct = Math.min(99, Math.floor((received / total) * 100));
				if (pct !== lastPct && pct % 10 === 0) {
					lastPct = pct;
					const got = (received / 1048576).toFixed(1);
					const all = (total / 1048576).toFixed(1);
					console.log(`[cloudflared.install] 下载中 ${pct}% (${got}MB / ${all}MB)`);
				}
			}
		}

		if (stalled) {
			throw new Error('下载停滞');
		}
		if (tooSlow) {
			throw new Error(`速率过低（${(received / 1024 / ((Date.now() - startAt) / 1000)).toFixed(0)} KB/s），切换下载源`);
		}

		const buf = Buffer.concat(chunks);
		if (buf.length < MIN_SIZE) {
			throw new Error(`体积异常 ${buf.length} bytes`);
		}
		fs.writeFileSync(dest, buf);
		return buf.length;
	} finally {
		clearInterval(watchdog);
	}
}

async function downloadCloudflared() {
	const dir = targetDir();
	if (!dir) {
		console.log(`[cloudflared.install] 平台 ${platformKey()} 无 cloudflared 构建，跳过`);
		return;
	}

	fs.mkdirSync(dir, { recursive: true });

	const dest = path.join(dir, binaryName());
	if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_SIZE) {
		console.log('[cloudflared.install] 已存在，跳过下载:', dest);
		return;
	}

	const fileName = FILE_NAMES[platformKey()];
	const isTgz = fileName.endsWith('.tgz');
	const tmp = path.join(dir, 'download.tmp');

	for (const prefix of MIRROR_PREFIXES) {
		const url = prefix ? `${prefix}${BASE}/${fileName}` : `${BASE}/${fileName}`;
		try {
			console.log(`[cloudflared.install] 下载: ${url}`);
			const size = await fetchTo(url, tmp);
			console.log(`[cloudflared.install] 下载完成: ${(size / 1024 / 1024).toFixed(1)} MB`);

			if (isTgz) {
				execFileSync('tar', ['-xzf', tmp, '-C', dir], { stdio: 'inherit' });
				fs.rmSync(tmp, { force: true });
				const extracted = path.join(dir, 'cloudflared');
				if (!fs.existsSync(extracted)) {
					throw new Error('解压后未找到 cloudflared');
				}
				if (extracted !== dest) {
					fs.rmSync(dest, { force: true });
					fs.renameSync(extracted, dest);
				}
			} else {
				fs.rmSync(dest, { force: true });
				fs.renameSync(tmp, dest);
			}

			if (process.platform !== 'win32') {
				fs.chmodSync(dest, 0o755);
			}

			console.log('[cloudflared.install] ✅ 就绪:', dest);
			return;
		} catch (e) {
			console.error(`[cloudflared.install] 下载源失败（${prefix || 'github 直连'}）: ${e.message}`);
			try {
				fs.rmSync(tmp, { force: true });
			} catch {}
		}
	}

	console.warn('[cloudflared.install] ⚠️ 全部下载源失败，安装包将不含内置穿透组件（运行时回退在线下载）');
}

function verifyCloudflared() {
	const dir = targetDir();
	if (!dir) return Promise.resolve();

	/** 目录必须存在，否则 electron-builder 的 extraResources 会因源路径缺失而报错 */
	fs.mkdirSync(dir, { recursive: true });

	const dest = path.join(dir, binaryName());
	if (fs.existsSync(dest) && fs.statSync(dest).size > MIN_SIZE) {
		const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
		console.log(`[cloudflared.install] ✅ 内置 cloudflared 就绪: ${dest} (${size} MB)`);
	} else {
		console.warn('[cloudflared.install] ⚠️ 未内置 cloudflared，运行时将回退在线下载');
	}
	return Promise.resolve();
}

exports.downloadCloudflared = downloadCloudflared;
exports.verifyCloudflared = verifyCloudflared;
exports.default = { downloadCloudflared, verifyCloudflared };
