#!/usr/bin/env node
/**
 * 从 GitHub Release 下载全部附件（供 CNB 境内 runner 拉取后同步到 GitCode）。
 *
 * 背景：跨境直传走不通（GitCode 预签名 30 分钟过期 + 海外→OBS 带宽极低），
 * 改由境内 runner 从 GitHub Release 拉附件后走近网上传。但境内拉 GitHub 也不快：
 * 实测单镜像单流 0.07~1.7 MB/s，2.6 GB 要跑近一小时。
 *
 * 因此这里做三件事，目标是「谁快用谁、还能叠加」：
 *   1. **探速选源**：开跑前对每个镜像做一次 4 MB 的 Range GET，量出真实吞吐，
 *      死链/慢源/不支持 Range 的直接淘汰 —— 不再靠写死的顺序逐个试错。
 *   2. **分片并发**：大文件按 8 MB 切片，多个分片同时下载、轮流分配给出速快的源，
 *      把「一个镜像的带宽」叠成「几个镜像之和」。
 *   3. **按速度熔断**：分片下载中持续低于阈值（默认 200 KB/s）×15 秒就掐断改换源，
 *      而不是等 120 秒空闲 —— 镜像「慢慢滴」比断开更难发现，却是主要的时间黑洞。
 *
 * 校验不打折：每个分片校验响应码与字节数（镜像会把 404 返回成 200 + HTML 错误页，
 * 也会忽略 Range 返回全量），整文件再按 assets-manifest.json 的 size + sha256 复核。
 *
 * 文件清单来自 Release 里的 assets-manifest.json，所以全程只依赖可被镜像的
 * github.com/<repo>/releases/download/<tag>/<file> 直链，不碰 api.github.com。
 *
 * 用法：
 *   node scripts/fetch-release-assets.js --tag v5.3.0 \
 *     --repo HONGHUTECHNOLOGY/honghueasystudy --out artifacts
 *   node scripts/fetch-release-assets.js ... --probe-only          # 只测速不下载
 *   node scripts/fetch-release-assets.js ... --only AppImage       # 只下匹配的文件（调试）
 *
 * 退出码：0 全部下载并校验通过；1 任一文件失败。
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createHash } = require('crypto');

const MANIFEST_NAME = 'assets-manifest.json';

/*
 * 镜像候选池：只代理 github.com 直链（不代理 api.github.com）。
 * 大文件实际用哪个由开跑前的探速决定，这里只是候选集，所以可以放心列长一点：
 * 死掉的源在探速阶段就被淘汰，不浪费一次下载的时间。
 *
 * 但顺序并非完全无意义 —— 清单抓取是「按顺序试，第一个成功即止」，
 * 且 --no-probe 应急模式下整个顺序就是全部依据。所以直连排在最前（见 mirrorList）。
 * GH_MIRROR 可指定首选镜像（换线路排查时用），仍会参与探速。
 */
const DEFAULT_MIRRORS = [
	'https://ghfast.top/',
	'https://gh-proxy.com/',
	'https://ghproxy.net/',
	'https://gh.llkk.cc/',
	'https://github.moeyy.xyz/',
	'https://ghproxy.cc/',
	'https://gh.xxooo.cf/',
	'https://ghps.cc/',
	'https://hub.gitmirror.com/',
	'https://ghproxy.1888866.xyz/',
	'https://gh.6yit.com/',
	'https://cdn.moran233.xyz/'
];
/*
 * 直连（空字符串 = 不加代理前缀）。
 * 排第一：探速通过就直接用，它是最短路径 —— 不经第三方中转、没有镜像的 429 限流，
 * 也不存在「镜像回了一份被改写/截断的字节」这类中间环节风险。
 * 不通时只多花一次超时（清单 20s / 探速 6s），比「明明直连最快却排在 13 个源后面」便宜得多。
 */
const DIRECT = '';

function parseArgs(argv) {
	const out = {
		tag: null,
		repo: null,
		out: 'artifacts',
		parallel: 6,
		chunkSize: 8 * 1024 * 1024,
		probeBytes: 4 * 1024 * 1024,
		minBps: 200 * 1024,
		only: null,
		probeOnly: false,
		noProbe: false,
		help: false
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--tag') out.tag = argv[++i];
		else if (a === '--repo') out.repo = argv[++i];
		else if (a === '--out') out.out = argv[++i];
		else if (a === '--parallel') out.parallel = Number(argv[++i]) || out.parallel;
		else if (a === '--chunk-size') out.chunkSize = Number(argv[++i]) * 1024 * 1024 || out.chunkSize;
		else if (a === '--probe-bytes') out.probeBytes = Number(argv[++i]) * 1024 * 1024 || out.probeBytes;
		else if (a === '--min-bps') out.minBps = Number(argv[++i]) * 1024 || out.minBps;
		else if (a === '--only') out.only = argv[++i];
		else if (a === '--probe-only') out.probeOnly = true;
		else if (a === '--no-probe') out.noProbe = true;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
}

function human(bytes) {
	if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function humanBps(bps) {
	if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(2)} MB/s`;
	return `${(bps / 1024).toFixed(0)} KB/s`;
}

function mirrorList() {
	const head = process.env.GH_MIRROR
		? [process.env.GH_MIRROR.endsWith('/') ? process.env.GH_MIRROR : `${process.env.GH_MIRROR}/`]
		: [];
	// 直连永远第一：清单按顺序试、应急模式按顺序下，两处都以它为首选
	return [...new Set([DIRECT, ...head, ...DEFAULT_MIRRORS])];
}

function label(mirror) {
	return mirror || '直连';
}

const relPath = (repo, tag, name) =>
	`https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;

/**
 * 单次 Range GET，边收边交给 sink。
 *
 * 只接受 206：镜像对 Range 请求返回 200 说明它忽略了 Range（把整个文件吐出来），
 * 写进分片会直接错位，必须当失败处理。
 *
 * 熔断有两条：
 *   - 空闲 stallMs 收不到数据 → 掐断；
 *   - 速率低于 minBps 持续 15 秒 → 掐断（慢速镜像不会触发空闲超时，但一样致命）。
 */
function rangeGet(url, start, end, sink, opts) {
	const { minBps, stallMs = 15000, idleMs = 25000, timeoutMs = 30000 } = opts;
	return new Promise((resolve, reject) => {
		let settled = false;
		let req = null;
		const done = (err, val) => {
			if (settled) return;
			settled = true;
			clearInterval(watchdog);
			if (err) {
				try {
					req && req.destroy();
				} catch {}
				reject(err);
			} else resolve(val);
		};

		let received = 0;
		let markBytes = 0;
		let markAt = Date.now();
		let lastDataAt = Date.now();
		const watchdog = setInterval(() => {
			const now = Date.now();
			if (now - lastDataAt > idleMs) return done(new Error(`空闲 ${Math.round((now - lastDataAt) / 1000)}s`));
			const span = now - markAt;
			if (span >= 5000) {
				const bps = ((received - markBytes) * 1000) / span;
				markBytes = received;
				markAt = now;
				if (bps < minBps && span >= stallMs) {
					return done(new Error(`速度过低 ${humanBps(bps)}（阈值 ${humanBps(minBps)}）`));
				}
			}
		}, 5000);

		const send = (u, redirects) => {
			if (settled) return;
			if (redirects > 5) return done(new Error('重定向次数过多'));
			const uo = new URL(u);
			const mod = uo.protocol === 'http:' ? http : https;
			const headers = { 'User-Agent': 'honghu-release-sync/2.0', Accept: '*/*' };
			if (start !== null) headers.Range = `bytes=${start}-${end}`;
			req = mod.request(uo, { method: 'GET', headers }, (res) => {
				if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
					res.resume();
					// 部分镜像返回相对 Location（/https:/github.com/…），必须按当前 URL 解析
					let next;
					try {
						next = new URL(res.headers.location, u).toString();
					} catch {
						return done(new Error(`重定向地址无法解析：${res.headers.location}`));
					}
					return send(next, redirects + 1);
				}
				if (res.statusCode !== 206) {
					res.resume();
					return done(new Error(`HTTP ${res.statusCode}${start !== null ? '（不支持 Range）' : ''}`));
				}
				const declared = Number(res.headers['content-length'] || 0);
				const expect = start === null ? 0 : end - start + 1;
				if (expect && declared && declared !== expect) {
					res.resume();
					return done(new Error(`Content-Length ${declared} ≠ 期望分片 ${expect}`));
				}
				res.on('data', (c) => {
					if (settled) return;
					lastDataAt = Date.now();
					received += c.length;
					try {
						sink(c);
					} catch (e) {
						return done(e);
					}
				});
				res.on('end', () => done(null, received));
				res.on('aborted', () => done(new Error('连接中断')));
				res.on('error', (e) => done(e));
			});
			req.on('socket', (s) => s.on('error', () => {}));
			req.setTimeout(timeoutMs, () => req.destroy(new Error('建立连接超时')));
			req.on('error', (e) => done(e));
			req.end();
		};
		send(url, 0);
	});
}

/** 探速：对候选源各拉一段，量真实吞吐。死链/慢源/不支持 Range 的在返回前就被剔除。 */
async function probeSources(sources, sample, opts) {
	const bytes = Math.min(opts.probeBytes, Math.max(sample.size - 1, 1));
	console.log(`[fetch] 探速：${sources.length} 个候选源，各取 ${human(bytes)} 样本`);
	const results = await Promise.all(
		sources.map(async (mirror) => {
			const url = `${mirror}${sample.rel}`;
			const started = Date.now();
			let got = 0;
			try {
				await rangeGet(url, 0, bytes - 1, (c) => (got += c.length), {
					minBps: opts.minBps,
					stallMs: 6000,
					idleMs: 15000,
					timeoutMs: 15000
				});
				const secs = Math.max((Date.now() - started) / 1000, 0.001);
				const bps = got / secs;
				const ok = got === bytes && bps >= opts.minBps;
				return { mirror, bps, ok, note: ok ? '' : got !== bytes ? `只收到 ${got}/${bytes} 字节` : '低于阈值' };
			} catch (e) {
				return { mirror, bps: 0, ok: false, note: e.message };
			}
		})
	);
	for (const r of results.sort((a, b) => b.bps - a.bps)) {
		console.log(`[fetch]   ${r.ok ? '✓' : '✗'} ${label(r.mirror).padEnd(32)} ${humanBps(r.bps)}${r.note ? `  ${r.note}` : ''}`);
	}
	const healthy = results.filter((r) => r.ok);
	if (!healthy.length) throw new Error('所有下载源在探速阶段全部失败（镜像全挂或网络不通）');
	const total = healthy.reduce((s, r) => s + r.bps, 0);
	console.log(`[fetch] 可用源 ${healthy.length} 个，合计约 ${humanBps(total)}`);
	return healthy;
}

/**
 * 分片下载单个文件。
 *
 * 分片在「可用源」之间轮流分配，权重按探速结果（快的多分），所以带宽能被叠加，
 * 而不是全部挤在最快那一个源上。任一分片失败或速度过低，换下一个源重试，
 * 连续失败的源会被降权 —— 避免整轮卡在一个已经开始抽风的镜像上。
 */
async function downloadChunked(file, dest, sources, opts) {
	const size = file.size;
	const chunks = [];
	for (let s = 0; s < size; s += opts.chunkSize) {
		chunks.push({ start: s, end: Math.min(s + opts.chunkSize, size) - 1 });
	}

	/*
	 * 权重池：按探速吞吐比例放票，快的源分到更多分片。
	 * 只有一个源时退化成「同一源多连接」—— 实测单源多连接本身就有 3~4 倍加速
	 * （1 MB/s → 3.6 MB/s），所以这条路即使镜像全挂只剩一个源也值。
	 */
	const votes = [];
	const totalBps = sources.reduce((s, r) => s + r.bps, 0);
	for (const src of sources) {
		const n = Math.max(1, Math.round((src.bps / totalBps) * 10));
		for (let i = 0; i < n; i++) votes.push(src);
	}
	const penalty = new Map();
	const cursor = { value: 0 };
	const pick = () => {
		for (let i = 0; i < votes.length; i++) {
			const cand = votes[(cursor.value + i) % votes.length];
			if ((penalty.get(cand.mirror) || 0) < 3) {
				cursor.value = (cursor.value + i + 1) % votes.length;
				return cand;
			}
		}
		penalty.clear(); // 全被惩罚就清零重来，总比卡死强
		const cand = votes[cursor.value % votes.length];
		cursor.value = (cursor.value + 1) % votes.length;
		return cand;
	};

	/*
	 * 每个分片写自己的临时文件，最后顺序拼接。
	 * 不用「共享 fd + 按 offset 写」：那依赖 fs.writeSync 精确落在指定偏移，
	 * 一旦出现部分写入（Windows 上并非不可能）或偏移算错，结果就是整文件 sha256
	 * 静默不匹配 —— 排查成本远高于多几次顺序读写的开销。
	 */
	const chunkPath = (i) => `${dest}.chunk.${i}`;
	const startedAt = Date.now();
	let index = 0;
	let doneBytes = 0;
	let failed = null;

	const ticker = setInterval(() => {
		const secs = (Date.now() - startedAt) / 1000;
		const pct = ((doneBytes / size) * 100).toFixed(1);
		console.log(
			`[fetch]   ${file.name}  ${pct}%  ${human(doneBytes)} / ${human(size)}  ${humanBps(doneBytes / Math.max(secs, 0.001))}`
		);
	}, 10000);

	async function worker() {
		while (!failed) {
			const i = index++;
			if (i >= chunks.length) return;
			const chunk = chunks[i];
			const want = chunk.end - chunk.start + 1;
			let lastErr = null;
			let finished = false;
			for (let attempt = 0; attempt < 6; attempt++) {
				const src = pick();
				const bufs = [];
				let got = 0;
				try {
					await rangeGet(
						`${src.mirror}${file.rel}`,
						chunk.start,
						chunk.end,
						(c) => {
							bufs.push(c);
							got += c.length;
							doneBytes += c.length;
						},
						{ minBps: opts.minBps, stallMs: 15000, idleMs: 25000 }
					);
					if (got !== want) throw new Error(`分片不完整 ${got}/${want}`);
					fs.writeFileSync(chunkPath(i), Buffer.concat(bufs, got));
					penalty.set(src.mirror, 0);
					finished = true;
					break; // 只跳出重试循环，继续领下一个分片（return 会让 worker 提前收工）
				} catch (e) {
					doneBytes -= got; // 这个分片作废，进度回退后换源重来
					penalty.set(src.mirror, (penalty.get(src.mirror) || 0) + 1);
					lastErr = e;
					console.warn(`[fetch]   ${file.name} 分片 #${i} 经 ${label(src.mirror)} 失败（第 ${attempt + 1} 次）：${e.message}`);
				}
			}
			if (!finished) {
				failed = new Error(`${file.name} 分片 ${chunk.start}-${chunk.end} 重试 6 次仍失败：${lastErr && lastErr.message}`);
				return;
			}
		}
	}

	try {
		await Promise.all(Array.from({ length: Math.min(opts.parallel, chunks.length) }, worker));
	} finally {
		clearInterval(ticker);
	}

	const cleanupChunks = () => {
		for (let i = 0; i < chunks.length; i++) {
			try { fs.unlinkSync(chunkPath(i)); } catch {}
		}
	};
	if (failed) {
		cleanupChunks();
		throw failed;
	}

	// 拼接（顺序读 + 顺序写，速度受限于磁盘而非网络，几十秒内完成）
	const part = `${dest}.part`;
	await concatFiles(chunks.map((_, i) => chunkPath(i)), part);
	cleanupChunks();

	const sha256 = await hashFile(part);
	if (file.sha256 && sha256 !== file.sha256) {
		try { fs.unlinkSync(part); } catch {}
		throw new Error(`${file.name} sha256 不匹配（得到 ${sha256.slice(0, 12)}…）`);
	}
	fs.renameSync(part, dest);
	const secs = (Date.now() - startedAt) / 1000;
	console.log(`[fetch] ✓ ${file.name}  ${human(size)}  ${humanBps(size / secs)}（${sources.length} 源 × ${opts.parallel} 连接）`);
	return { size, sha256 };
}

/** 顺序拼接若干文件到 dest（流式，不占内存）。 */
async function concatFiles(parts, dest) {
	const ws = fs.createWriteStream(dest);
	for (const p of parts) {
		await new Promise((resolve, reject) => {
			const rs = fs.createReadStream(p);
			rs.on('error', reject);
			rs.on('end', resolve);
			rs.pipe(ws, { end: false });
		});
	}
	await new Promise((resolve, reject) => {
		ws.on('error', reject);
		ws.end(resolve);
	});
}

function hashFile(p) {
	return new Promise((resolve, reject) => {
		const h = createHash('sha256');
		const rs = fs.createReadStream(p);
		rs.on('data', (c) => h.update(c));
		rs.on('end', () => resolve(h.digest('hex')));
		rs.on('error', reject);
	});
}

/** 单流下载（分片不可用时的兜底）：按探速顺序逐个源整文件下载。 */
async function downloadWhole(file, dest, sources, opts) {
	const errors = [];
	for (const src of sources) {
		const part = `${dest}.part`;
		const fd = fs.openSync(part, 'w');
		let written = 0;
		try {
			await rangeGet(
				`${src.mirror}${file.rel}`,
				0,
				file.size - 1,
				(c) => {
					fs.writeSync(fd, c, 0, c.length, written);
					written += c.length;
				},
				{ minBps: opts.minBps, stallMs: 20000, idleMs: 30000 }
			);
			fs.closeSync(fd);
			if (written !== file.size) throw new Error(`收到 ${written} ≠ ${file.size}`);
			const sha256 = await hashFile(part);
			if (file.sha256 && sha256 !== file.sha256) throw new Error('sha256 不匹配');
			fs.renameSync(part, dest);
			console.log(`[fetch] ✓ ${file.name}  ${human(file.size)}  (${label(src.mirror)})`);
			return { size: file.size, sha256 };
		} catch (e) {
			try { fs.closeSync(fd); } catch {}
			try { fs.unlinkSync(part); } catch {}
			errors.push(`${label(src.mirror)}: ${e.message}`);
		}
	}
	throw new Error(`${file.name} 全部下载源失败：\n    ${errors.join('\n    ')}`);
}

/** 小文件整取（清单只有 2KB）：接受 200 或 206，收完即止，失败抛错。 */
function fetchSmall(url, dest, opts) {
	return new Promise((resolve, reject) => {
		let settled = false;
		const fail = (e) => {
			if (settled) return;
			settled = true;
			clearInterval(watchdog);
			reject(e);
		};
		let lastAt = Date.now();
		const watchdog = setInterval(() => {
			if (Date.now() - lastAt > 20000) fail(new Error('空闲 20 秒'));
		}, 5000);
		const send = (u, redirects) => {
			if (settled) return;
			if (redirects > 5) return fail(new Error('重定向次数过多'));
			const uo = new URL(u);
			const req = (uo.protocol === 'http:' ? http : https).request(
				uo,
				{ method: 'GET', headers: { 'User-Agent': 'honghu-release-sync/2.0', Accept: '*/*' } },
				(res) => {
					if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
						res.resume();
						let next;
						try {
							next = new URL(res.headers.location, u).toString();
						} catch {
							return fail(new Error(`重定向地址无法解析：${res.headers.location}`));
						}
						return send(next, redirects + 1);
					}
					if (res.statusCode !== 200 && res.statusCode !== 206) {
						res.resume();
						return fail(new Error(`HTTP ${res.statusCode}`));
					}
					const chunks = [];
					res.on('data', (c) => {
						lastAt = Date.now();
						chunks.push(c);
					});
					res.on('end', () => {
						if (settled) return;
						settled = true;
						clearInterval(watchdog);
						fs.writeFileSync(dest, Buffer.concat(chunks));
						resolve();
					});
					res.on('error', fail);
				}
			);
			req.setTimeout(opts.timeoutMs || 20000, () => req.destroy(new Error('连接超时')));
			req.on('error', fail);
			req.end();
		};
		send(url, 0);
	});
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help || !args.tag || !args.repo) {
		console.log('用法: node scripts/fetch-release-assets.js --tag <tag> --repo <owner/repo> [选项]');
		console.log('  --out <dir>         输出目录（默认 artifacts）');
		console.log('  --parallel <n>      分片并发数（默认 6）');
		console.log('  --chunk-size <MB>   分片大小（默认 8）');
		console.log('  --probe-bytes <MB>  探速样本大小（默认 4）');
		console.log('  --min-bps <KB>      速率阈值，低于即熔断换源（默认 200）');
		console.log('  --only <substr>     只下载文件名包含该串的附件（调试用）');
		console.log('  --probe-only        只做探速，不下载');
		console.log('  --no-probe          跳过探速，按候选顺序直接下（应急）');
		process.exit(args.help ? 0 : 1);
	}

	fs.mkdirSync(args.out, { recursive: true });
	const mirrors = mirrorList();

	// 1) 清单本身没有哈希基准：能解析出 files[] 就算成功（各镜像内容一致）
	const manifestPath = path.join(args.out, MANIFEST_NAME);
	let manifest = null;
	for (const mirror of mirrors) {
		const dest = `${manifestPath}.part`;
		try {
			await fetchSmall(`${mirror}${relPath(args.repo, args.tag, MANIFEST_NAME)}`, dest, { timeoutMs: 20000 });
			const parsed = JSON.parse(fs.readFileSync(dest, 'utf8'));
			if (Array.isArray(parsed.files) && parsed.files.length) {
				manifest = parsed;
				fs.renameSync(dest, manifestPath);
				console.log(`[fetch] 清单取自 ${label(mirror)}`);
				break;
			}
		} catch (e) {
			try { fs.unlinkSync(dest); } catch {}
		}
	}
	if (!manifest) {
		console.error('[fetch] assets-manifest.json 下载失败（GitHub Release 缺少该附件，或镜像全部不可用）');
		process.exit(1);
	}
	console.log(`[fetch] 清单就绪：${manifest.tag || args.tag}，共 ${manifest.files.length} 个附件`);

	// 2) 已存在且哈希匹配的跳过（断点重跑）
	let files = manifest.files.map((f) => ({ ...f, rel: relPath(args.repo, args.tag, f.name) }));
	if (args.only) {
		files = files.filter((f) => f.name.includes(args.only));
		console.log(`[fetch] --only 过滤后剩 ${files.length} 个附件`);
	}
	const todo = [];
	for (const f of files) {
		const dest = path.join(args.out, f.name);
		if (fs.existsSync(dest) && f.sha256 && fs.statSync(dest).size === f.size) {
			const actual = await hashFile(dest);
			if (actual === f.sha256) {
				console.log(`[fetch] 跳过 ${f.name}（已下载且 sha256 匹配）`);
				continue;
			}
		}
		todo.push(f);
	}
	if (!todo.length) {
		console.log('[fetch] 没有需要下载的附件');
		return;
	}

	// 3) 探速（拿最大的附件当样本，最贴近真实大文件的表现）
	const sample = [...todo].sort((a, b) => b.size - a.size)[0];
	let sources;
	if (args.noProbe) {
		sources = mirrors.map((m) => ({ mirror: m, bps: 1, ok: true }));
	} else {
		sources = await probeSources(mirrors, sample, args);
	}
	if (args.probeOnly) {
		console.log('[fetch] --probe-only：结束');
		return;
	}

	// 4) 大文件优先（小文件尾部排队不影响整体时长）
	todo.sort((a, b) => b.size - a.size);
	const failures = [];
	let totalBytes = todo.reduce((s, f) => s + f.size, 0);
	console.log(`[fetch] 待下载 ${todo.length} 个，共 ${human(totalBytes)}，分片 ${args.chunkSize / 1024 / 1024}MB × ${args.parallel} 并发`);
	const startedAt = Date.now();
	for (const f of todo) {
		const dest = path.join(args.out, f.name);
		try {
			if (f.size > args.chunkSize * 1.5 && sources.length >= 1) {
				await downloadChunked(f, dest, sources, args);
			} else {
				await downloadWhole(f, dest, sources, args);
			}
		} catch (e) {
			failures.push(e.message);
		}
	}
	const secs = (Date.now() - startedAt) / 1000;
	if (failures.length) {
		console.error(`\n[fetch] ${failures.length} 个附件下载失败：`);
		for (const m of failures) console.error(`  - ${m}`);
		process.exit(1);
	}
	console.log(
		`\n[fetch] 全部 ${todo.length} 个附件下载并校验通过 → ${args.out}，用时 ${(secs / 60).toFixed(1)} 分钟，均速 ${humanBps(totalBytes / Math.max(secs, 0.001))}`
	);
}

main().catch((e) => {
	console.error(`[fetch] 未预期的错误：${e.message}`);
	process.exit(1);
});
