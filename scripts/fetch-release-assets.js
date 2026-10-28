#!/usr/bin/env node
/**
 * 从 GitHub Release 下载全部附件（供 GitCode 原生工作流在国内 runner 上执行）。
 *
 * 背景：跨岸上传走不通（GitCode 预签名 30 分钟过期 + 海外→OBS 带宽极低），
 * 改由 GitCode 自己的 runner（国内）从 GitHub Release 拉取附件后走近网上传。
 * GitHub 直连在国内不稳定，因此按镜像优先、直连兜底的顺序逐源尝试；
 * 镜像经常对 404/超限返回 200 + HTML 错误页，所以必须校验字节数与 sha256。
 *
 * 文件清单来自 Release 里的 assets-manifest.json（desktop-build.yml 生成上传），
 * 这样不需要访问 api.github.com —— 整个流程只依赖可镜像的
 * github.com/<repo>/releases/download/<tag>/<file> 直链。
 *
 * 用法：
 *   node scripts/fetch-release-assets.js --tag v5.2.0 \
 *     --repo HONGHUTECHNOLOGY/honghueasystudy --out artifacts
 *
 * 退出码：0 全部下载并校验通过；1 任一文件失败。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createHash } = require('crypto');

const MANIFEST_NAME = 'assets-manifest.json';
// 镜像只代理 github.com 直链（不代理 api.github.com）；速度不稳，逐个回退
const MIRRORS = ['', 'https://ghfast.top/', 'https://gh-proxy.com/', 'https://ghproxy.net/'];

function parseArgs(argv) {
	const out = { tag: null, repo: null, out: 'artifacts', concurrency: 3 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--tag') out.tag = argv[++i];
		else if (a === '--repo') out.repo = argv[++i];
		else if (a === '--out') out.out = argv[++i];
		else if (a === '--concurrency') out.concurrency = Number(argv[++i]) || 3;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
}

function human(bytes) {
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 单源下载：GET 直链，跟随重定向，边收边算 sha256，落盘前先校验。
 * 空闲超时 120s（镜像偶发卡住），总时长不设上限（2.7GB 慢源也要下完）。
 * 返回 { size, sha256 }；任何失败 throw。
 */
function downloadOnce(url, dest, expectSize, expectSha) {
	return new Promise((resolve, reject) => {
		const get = (u, redirects) => {
			if (redirects > 5) return reject(new Error('重定向次数过多'));
			const uo = new URL(u);
			const mod = uo.protocol === 'http:' ? http : https;
			const req = mod.request(
				uo,
				{
					method: 'GET',
					headers: { 'User-Agent': 'honghu-release-sync/1.0', Accept: '*/*' }
				},
				(res) => {
					if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
						res.resume();
						return get(res.headers.location, redirects + 1);
					}
					if (res.statusCode !== 200) {
						res.resume();
						return reject(new Error(`HTTP ${res.statusCode}`));
					}
					const declared = Number(res.headers['content-length'] || 0);
					if (expectSize && declared && declared !== expectSize) {
						res.resume();
						return reject(new Error(`Content-Length ${declared} ≠ 期望 ${expectSize}（多为镜像错误页）`));
					}
					const hash = createHash('sha256');
					const tmp = `${dest}.part`;
					const ws = fs.createWriteStream(tmp);
					let received = 0;
					res.on('data', (c) => {
						received += c.length;
						hash.update(c);
						if (!ws.write(c)) res.pause(), ws.once('drain', () => res.resume());
					});
					res.on('end', () => {
						ws.end(() => {
							try {
								const size = fs.statSync(tmp).size;
								if (expectSize && size !== expectSize) {
									fs.unlinkSync(tmp);
									return reject(new Error(`收到 ${size} 字节 ≠ 期望 ${expectSize}`));
								}
								const sha256 = hash.digest('hex');
								if (expectSha && sha256 !== expectSha) {
									fs.unlinkSync(tmp);
									return reject(new Error(`sha256 不匹配（${sha256.slice(0, 12)}…）`));
								}
								fs.renameSync(tmp, dest);
								resolve({ size, sha256 });
							} catch (e) {
								reject(e);
							}
						});
					});
					res.on('error', (e) => {
						ws.destroy();
						try { fs.unlinkSync(tmp); } catch {}
						reject(e);
					});
				}
			);
			req.on('socket', (socket) => socket.on('error', () => {}));
			// 空闲超时：120 秒收不到任何数据才判死，慢速镜像不误杀
			req.setTimeout(120 * 1000, () => req.destroy(new Error('连接空闲超过 120 秒')));
			req.on('error', (e) => {
				try { fs.unlinkSync(`${dest}.part`); } catch {}
				reject(e);
			});
			req.end();
		};
		get(url, 0);
	});
}

/** 多源回退下载一个文件：镜像 → 直连，逐个试，全部失败才 throw */
async function fetchFile(repo, tag, name, dest, expectSize, expectSha) {
	const relPath = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
	const errors = [];
	for (const mirror of MIRRORS) {
		const url = `${mirror}${relPath}`;
		const label = mirror || '直连';
		try {
			const r = await downloadOnce(url, dest, expectSize, expectSha);
			console.log(`[fetch] ✓ ${name}  ${human(r.size)}  (${label})`);
			return r;
		} catch (e) {
			errors.push(`${label}: ${e.message}`);
			console.warn(`[fetch] ${name} 经 ${label} 失败：${e.message}`);
		}
	}
	throw new Error(`${name} 全部下载源失败：\n  ${errors.join('\n  ')}`);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help || !args.tag || !args.repo) {
		console.log('用法: node scripts/fetch-release-assets.js --tag <tag> --repo <owner/repo> [--out artifacts]');
		process.exit(args.help ? 0 : 1);
	}

	fs.mkdirSync(args.out, { recursive: true });

	// 1) 清单本身没有哈希基准：只要能解析出 files[] 就算成功（各镜像内容一致）
	const manifestPath = path.join(args.out, MANIFEST_NAME);
	let manifest = null;
	for (const mirror of MIRRORS) {
		try {
			await downloadOnce(
				`${mirror}https://github.com/${args.repo}/releases/download/${encodeURIComponent(args.tag)}/${MANIFEST_NAME}`,
				manifestPath,
				0,
				''
			);
			manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
			if (Array.isArray(manifest.files) && manifest.files.length) break;
			manifest = null;
		} catch (e) {
			console.warn(`[fetch] 清单经 ${mirror || '直连'} 失败：${e.message}`);
		}
	}
	if (!manifest) {
		console.error('[fetch] assets-manifest.json 下载失败（GitHub Release 缺少该附件？）');
		process.exit(1);
	}
	console.log(`[fetch] 清单就绪：${manifest.tag || args.tag}，共 ${manifest.files.length} 个附件`);

	// 2) 已存在且哈希匹配的文件跳过（断点重跑）
	const files = manifest.files.filter((f) => {
		const dest = path.join(args.out, f.name);
		if (fs.existsSync(dest) && f.sha256) {
			const actual = createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
			if (actual === f.sha256) {
				console.log(`[fetch] 跳过 ${f.name}（已下载且 sha256 匹配）`);
				return false;
			}
		}
		return true;
	});

	// 3) 并发下载（3 路：镜像带宽是瓶颈，更多并发收益有限还容易触发限流）
	let cursor = 0;
	const failures = [];
	async function worker() {
		while (cursor < files.length) {
			const f = files[cursor++];
			const dest = path.join(args.out, f.name);
			try {
				await fetchFile(args.repo, args.tag, f.name, dest, f.size, f.sha256);
			} catch (e) {
				failures.push(e.message);
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(args.concurrency, files.length || 1) }, worker));

	if (failures.length) {
		console.error(`\n[fetch] ${failures.length} 个附件下载失败：`);
		for (const m of failures) console.error(`  - ${m}`);
		process.exit(1);
	}
	console.log(`\n[fetch] 全部 ${manifest.files.length} 个附件下载并校验通过 → ${args.out}`);
}

main().catch((e) => {
	console.error(`[fetch] 未预期的错误：${e.message}`);
	process.exit(1);
});
