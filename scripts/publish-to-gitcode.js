#!/usr/bin/env node
/**
 * 把桌面端更新包 / 扩展包同步到 GitCode Release。
 *
 * 为什么需要单独一个脚本：GitCode 与 GitHub 的附件上传协议不同，
 * 不能像普通 Release 那样直接 POST 表单。
 *  1) GET  /api/v5/repos/:owner/:repo/releases/:tag/upload_url?file_name=xxx
 *     返回 { url, headers }，url 是华为 OBS 预签名地址
 *  2) PUT  {url}，请求头必须原样带上返回的 headers（x-obs-meta-project-id 等）
 * 参考：https://docs.gitcode.com/docs/apis/get-api-v-5-repos-owner-repo-releases-tag-upload-url/
 *
 * 用法：
 *   GITCODE_TOKEN=xxx node scripts/publish-to-gitcode.js \
 *     --tag desktop-v3.2.1 \
 *     --file honghueasystudy_desktop/packages/app/dist/update/app-3.2.1.zip \
 *     --file extension/extension.zip \
 *     --notes-file /tmp/notes.md
 *
 * 无 GITCODE_TOKEN 时默认跳过（exit 0），便于在未配置 secret 的仓库里直接跑 CI。
 * 加 --require-token 则缺少 token 视为失败。
 */
const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const DEFAULT_REPO = 'honghutech/honghueasystudy';
const API_BASE = 'https://api.gitcode.com/api/v5';
const DOWNLOAD_BASE = 'https://gitcode.com';

function parseArgs(argv) {
	const out = {
		tag: null,
		files: [],
		repo: DEFAULT_REPO,
		name: null,
		notes: [],
		notesFile: null,
		target: process.env.GITHUB_SHA || null,
		token: process.env.GITCODE_TOKEN || null,
		apiBase: process.env.GITCODE_API_BASE || API_BASE,
		downloadBase: process.env.GITCODE_DOWNLOAD_BASE || DOWNLOAD_BASE,
		dryRun: false,
		force: false,
		requireToken: false,
		skipDownloadCheck: false
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--tag') out.tag = argv[++i];
		else if (a === '--file') out.files.push(path.resolve(argv[++i]));
		else if (a === '--repo') out.repo = argv[++i];
		else if (a === '--name') out.name = argv[++i];
		else if (a === '--notes') out.notes.push(String(argv[++i]));
		else if (a === '--notes-file') out.notesFile = path.resolve(argv[++i]);
		else if (a === '--target') out.target = argv[++i];
		else if (a === '--token') out.token = argv[++i];
		else if (a === '--api-base') out.apiBase = argv[++i];
		else if (a === '--download-base') out.downloadBase = argv[++i];
		else if (a === '--dry-run') out.dryRun = true;
		else if (a === '--force') out.force = true;
		else if (a === '--require-token') out.requireToken = true;
		else if (a === '--no-download-check') out.skipDownloadCheck = true;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
}

function usage() {
	console.log(`用法: node scripts/publish-to-gitcode.js --tag <tag> --file <zip> [--file <zip2>] [选项]

选项:
  --tag <tag>            目标 Release 的 tag（如 desktop-v3.2.1）；不存在会自动创建
  --file <path>          要上传的附件，可重复
  --repo <owner/repo>    默认 ${DEFAULT_REPO}
  --name <title>         Release 标题（默认取 tag）
  --notes <text>         更新说明，可重复
  --notes-file <path>    从文件读更新说明
  --target <sha/branch>  创建 Release 时用于建 tag 的目标，默认 $GITHUB_SHA
  --token <token>        默认取环境变量 GITCODE_TOKEN
  --dry-run              只打印将要做什么
  --force                附件已存在时仍然重传
  --require-token        缺少 token 时报错退出（默认跳过）
  --no-download-check    跳过上传后的下载校验
  --api-base <url>       便于测试，默认 ${API_BASE}
  --download-base <url>  便于测试，默认 ${DOWNLOAD_BASE}`);
}

function sha256(file) {
	return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function human(bytes) {
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

class ApiError extends Error {
	constructor(status, body, label) {
		super(`${label} 失败（HTTP ${status}）${body ? `：${String(body).slice(0, 300)}` : ''}`);
		this.status = status;
		this.body = body;
	}
}

/**
 * GitCode 三种认证方式并存：Authorization: Bearer、PRIVATE-TOKEN、query access_token。
 * 上传地址接口的文档把 access_token 标为必需，因此 401 时回退到 query 形式。
 */
async function rawFetch(url, { token, withTokenInQuery = false, ...init } = {}) {
	const headers = { Accept: 'application/json', ...(init.headers || {}) };
	if (token && !withTokenInQuery) headers['PRIVATE-TOKEN'] = token;
	let finalUrl = url;
	if (token && withTokenInQuery) {
		const u = new URL(url);
		u.searchParams.set('access_token', token);
		finalUrl = u.toString();
	}
	return fetch(finalUrl, { ...init, headers, signal: AbortSignal.timeout(60000) });
}

/**
 * GitCode 各接口对令牌的接受方式并不统一（多数认 PRIVATE-TOKEN 头，
 * upload_url 文档则把 access_token 标为 query 必填），因此 401/403 时
 * 自动换一种方式重试一次。请求体是字符串，可安全重放。
 */
async function apiFetch(url, opts = {}) {
	const first = await rawFetch(url, opts);
	if (first.status !== 401 && first.status !== 403) return first;
	// 消费掉首个响应，避免句柄泄漏；只用于判断认证失败，内容不需要
	await first.text().catch(() => '');
	return rawFetch(url, { ...opts, withTokenInQuery: true });
}

async function getRelease({ apiBase, repo, tag, token }) {
	const url = `${apiBase}/repos/${repo}/releases/${encodeURIComponent(tag)}`;
	const res = await apiFetch(url, { token });
	if (res.status === 404) return null;
	if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''), '查询 Release');
	return res.json();
}

async function createRelease({ apiBase, repo, tag, token, name, body, target }) {
	const payload = {
		tag_name: tag,
		name: name || tag,
		body: body || '',
		prerelease: false
	};
	// target_commitish 在 GitCode 上同样用于「tag 不存在时按该分支/提交创建 tag」
	if (target) payload.target_commitish = target;
	const res = await apiFetch(`${apiBase}/repos/${repo}/releases`, {
		token,
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
	if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''), '创建 Release');
	return res.json().catch(() => ({}));
}

async function getUploadUrl({ apiBase, repo, tag, token, fileName }) {
	const url = `${apiBase}/repos/${repo}/releases/${encodeURIComponent(tag)}/upload_url?file_name=${encodeURIComponent(fileName)}`;
	const res = await apiFetch(url, { token });
	if (!res.ok) throw new ApiError(res.status, await res.text().catch(() => ''), '获取上传地址');
	const json = await res.json();
	if (!json || !json.url) throw new Error('上传地址响应缺少 url 字段');
	return json;
}

/** 上传是 PUT 到预签名地址，返回的 headers 必须原样透传（OBS 用它校验策略） */
/*
 * 为什么不用 fetch：Node 内置 fetch（undici）有 headersTimeout=300s 的硬限制，
 * 指「请求发出 → 收到响应头」的时长，AbortSignal.timeout 盖不住它。OBS 要收完
 * 整个 body 才回响应头，300MB+ 附件在 CI 带宽下必然超过 5 分钟 → 大文件全部
 * fetch failed（实测每个都恰好在 ~5min 挂掉）。https.request 没有这个限制，
 * 只有空闲超时（socket 连续无数据才计时），慢上传不受影响。
 */
function putOnce(uploadUrl, headers, buffer) {
	return new Promise((resolve, reject) => {
		const u = new URL(uploadUrl);
		const mod = u.protocol === 'http:' ? require('http') : require('https');
		const req = mod.request(
			u,
			{ method: 'PUT', headers: { ...headers, 'Content-Length': buffer.length } },
			(res) => {
				const chunks = [];
				res.on('data', (c) => chunks.push(c));
				res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
			}
		);
		// 空闲超时：连续 30 分钟无数据才判死（不是总时长），512KB/s 传 582MB 也够
		req.setTimeout(30 * 60 * 1000, () => req.destroy(new Error('连接空闲超过 30 分钟')));
		req.on('error', reject);
		req.end(buffer);
	});
}

async function putToStorage({ uploadUrl, headers, buffer, fileName }) {
	let lastErr;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const res = await putOnce(uploadUrl, headers, buffer);
			if (res.status >= 200 && res.status < 300) return;
			throw new ApiError(res.status, res.body, `上传 ${fileName}`);
		} catch (e) {
			lastErr = e;
			if (attempt < 3) {
				console.warn(`[gitcode] 上传 ${fileName} 第 ${attempt} 次失败（${e.message}），60 秒后重试`);
				await new Promise((r) => setTimeout(r, 60000));
			}
		}
	}
	throw lastErr;
}

/** 用 Range GET 探测：GitCode 的附件 HEAD 请求会返回 401，只能这么验 */
async function verifyDownload({ downloadBase, repo, tag, fileName }) {
	const url = `${downloadBase}/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(fileName)}`;
	const res = await fetch(url, {
		headers: { Range: 'bytes=0-1023', 'User-Agent': 'honghu-easystudy-updater/1.0' },
		redirect: 'follow',
		signal: AbortSignal.timeout(60000)
	});
	if (res.status !== 200 && res.status !== 206) {
		throw new Error(`下载校验失败（HTTP ${res.status}）：${url}`);
	}
	// 不消费完响应体，读 1KB 足够确认不是错误页
	const buf = Buffer.from(await res.arrayBuffer());
	return { url, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) return usage();

	if (!args.tag) {
		console.error('缺少 --tag');
		usage();
		process.exit(1);
	}
	if (!args.files.length) {
		console.error('缺少 --file');
		process.exit(1);
	}

	for (const f of args.files) {
		if (!fs.existsSync(f)) {
			console.error(`附件不存在：${f}`);
			process.exit(1);
		}
	}

	if (!args.token) {
		const msg = '[gitcode] 未提供 GITCODE_TOKEN，跳过 GitCode 同步（GitHub 侧不受影响）';
		if (args.requireToken) {
			console.error(msg);
			process.exit(1);
		}
		console.log(msg);
		return;
	}

	let body = args.notes.join('\n');
	if (args.notesFile) {
		if (fs.existsSync(args.notesFile)) body = fs.readFileSync(args.notesFile, 'utf8');
		else console.warn(`[gitcode] 说明文件不存在，忽略：${args.notesFile}`);
	}

	const files = args.files.map((f) => ({ path: f, name: path.basename(f), size: fs.statSync(f).size }));

	console.log(`[gitcode] 仓库   ${args.repo}`);
	console.log(`[gitcode] tag    ${args.tag}`);
	for (const f of files) console.log(`[gitcode] 附件   ${f.name}  ${human(f.size)}`);

	if (args.dryRun) {
		console.log('[gitcode] --dry-run：不做任何请求');
		for (const f of files) console.log(`          将上传 ${f.name}  sha256=${sha256(f.path)}`);
		return;
	}

	let release = await getRelease({ apiBase: args.apiBase, repo: args.repo, tag: args.tag, token: args.token });
	if (!release) {
		console.log('[gitcode] Release 不存在，尝试创建');
		// GitCode 与 GitHub 是两个独立仓库：GITHUB_SHA（尤其是 CI 里经 API 创建的提交）
		// 在 GitCode 上并不存在，直接当 target_commitish 会 400「<sha> is not exist」。
		// 依次尝试：显式 target → main → master，任一成功即止。
		const targets = [];
		for (const t of [args.target, 'main', 'master']) {
			if (t && !targets.includes(t)) targets.push(t);
		}
		let lastErr = null;
		for (const target of targets) {
			try {
				release = await createRelease({
					apiBase: args.apiBase,
					repo: args.repo,
					tag: args.tag,
					token: args.token,
					name: args.name || args.tag,
					body,
					target
				});
				console.log(`[gitcode] Release 已创建（target=${target}）`);
				break;
			} catch (e) {
				lastErr = e;
				console.warn(`[gitcode] 用 target=${target} 创建失败，换下一个：${e.message}`);
			}
		}
		if (!release) throw lastErr || new Error('创建 GitCode Release 失败');
	} else {
		console.log('[gitcode] Release 已存在，复用');
	}

	const existing = new Map(((release && release.assets) || []).map((a) => [a.name, a]));
	let uploaded = 0;
	let skipped = 0;
	const failures = [];

	for (const f of files) {
		if (existing.has(f.name) && !args.force) {
			console.log(`[gitcode] 跳过 ${f.name}：Release 中已存在同名附件（--force 可重传）`);
			skipped++;
			continue;
		}
		try {
			const { url, headers } = await getUploadUrl({
				apiBase: args.apiBase,
				repo: args.repo,
				tag: args.tag,
				token: args.token,
				fileName: f.name
			});
			const buffer = fs.readFileSync(f.path);
			await putToStorage({ uploadUrl: url, headers: headers || {}, buffer, fileName: f.name });
			uploaded++;
			console.log(`[gitcode] 已上传 ${f.name}`);

			if (!args.skipDownloadCheck) {
				const probe = await verifyDownload({
					downloadBase: args.downloadBase,
					repo: args.repo,
					tag: args.tag,
					fileName: f.name
				});
				console.log(`[gitcode] 下载校验通过（HTTP Range 前 ${probe.bytes} 字节）`);
			}
		} catch (e) {
			failures.push(`${f.name}: ${e.message}`);
			console.error(`[gitcode] 上传失败 ${f.name}：${e.message}`);
		}
	}

	console.log(`\n[gitcode] 结果：上传 ${uploaded} / 跳过 ${skipped} / 失败 ${failures.length}`);
	if (failures.length) {
		console.error('[gitcode] 失败明细：');
		for (const f of failures) console.error(`  - ${f}`);
		console.error(
			'[gitcode] 注意：写清单时若仍把 GitCode 放在 urls[0]，客户端会先试这个源再回退 GitHub；' +
				'请确认附件可用，或改用 --no-mirror 只保留 GitHub。'
		);
		process.exit(1);
	}
}

main().catch((e) => {
	console.error(`[gitcode] 未预期的错误：${e && e.message ? e.message : e}`);
	process.exit(1);
});
