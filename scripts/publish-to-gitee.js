#!/usr/bin/env node
/**
 * 在 Gitee 上生成/更新与 GitHub 对应的 Release 页面，**不放附件，只放指向 GitCode 的下载链接**。
 *
 * 为什么不用 Gitee 存附件：平台硬限制（实测 API 直接拒绝）
 *   - 单个附件 ≤ 100 MB（GVP 项目 200 MB）
 *   - 单个仓库附件总量 ≤ 1 GB
 * 本项目安装包 325~582 MB、单次发版合计 ~2.7 GB，一个都放不进去。
 * 所以 Gitee 只承担「国内可访问的发布说明页 + 下载入口」，真正的文件仍在 GitCode
 * （国内直连）与 GitHub（源站）。
 *
 * 链接为什么必须是 GitCode：GitHub Release 直链在国内基本下不动，GitCode 是同一份产物的
 * 境内镜像，文件名/大小/sha256 都一致。发布前会逐条 Range GET 探链，**任何一个 404 就拒绝
 * 发布**（fail-closed），避免页面上出现死链。
 *
 * 用法：
 *   GITEE_TOKEN=xxx node scripts/publish-to-gitee.js \
 *     --tag v5.5.1 \
 *     --notes-file /tmp/release-notes.md
 *
 * 无 GITEE_TOKEN 时默认跳过（exit 0），便于未配置 secret 的环境直接跑；加 --require-token 则报错。
 */
const fs = require('fs');

const DEFAULT_REPO = 'honghutechnology/honghueasystudy';
const DEFAULT_GITCODE_REPO = 'honghutech/honghueasystudy';
const DEFAULT_GITHUB_REPO = 'HONGHUTECHNOLOGY/honghueasystudy';
const API_BASE = 'https://gitee.com/api/v5';

function parseArgs(argv) {
	const out = {
		tag: null,
		repo: process.env.GITEE_REPO || DEFAULT_REPO,
		gitcodeRepo: process.env.GITCODE_REPO || DEFAULT_GITCODE_REPO,
		githubRepo: process.env.GITHUB_REPO || DEFAULT_GITHUB_REPO,
		name: null,
		notes: [],
		notesFile: null,
		token: process.env.GITEE_TOKEN || null,
		apiBase: process.env.GITEE_API_BASE || API_BASE,
		target: process.env.GITHUB_SHA || null,
		verify: true,
		verifyRetries: 3,
		purgeAssets: false,
		dryRun: false,
		requireToken: false
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--tag') out.tag = argv[++i];
		else if (a === '--repo') out.repo = argv[++i];
		else if (a === '--gitcode-repo') out.gitcodeRepo = argv[++i];
		else if (a === '--github-repo') out.githubRepo = argv[++i];
		else if (a === '--name') out.name = argv[++i];
		else if (a === '--notes') out.notes.push(String(argv[++i]));
		else if (a === '--notes-file') out.notesFile = argv[++i];
		else if (a === '--token') out.token = argv[++i];
		else if (a === '--api-base') out.apiBase = argv[++i];
		else if (a === '--target') out.target = argv[++i];
		else if (a === '--no-verify') out.verify = false;
		else if (a === '--verify-retries') out.verifyRetries = Number(argv[++i]) || 3;
		else if (a === '--purge-assets') out.purgeAssets = true;
		else if (a === '--dry-run') out.dryRun = true;
		else if (a === '--require-token') out.requireToken = true;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
}

function usage() {
	console.log(`用法: node scripts/publish-to-gitee.js --tag <tag> --notes-file <md> [选项]

选项:
  --tag <tag>           目标 tag（如 v5.5.1），Gitee 上必须已存在同名 tag
  --notes-file <path>   正文来源（通常是 artifacts/release-notes.md）
  --notes <text>        额外追加正文，可重复
  --repo <owner/repo>   Gitee 仓库，默认 ${DEFAULT_REPO}
  --gitcode-repo <o/r>  下载链接指向的 GitCode 仓库，默认 ${DEFAULT_GITCODE_REPO}
  --github-repo <o/r>   仅用于识别需要替换的 GitHub 链接，默认 ${DEFAULT_GITHUB_REPO}
  --name <title>        Release 标题，默认取 tag
  --no-verify           跳过下载链接探链（不建议）
  --purge-assets        删除该 Release 上残留的附件（Gitee 放不下大包，附件一律不保留）
  --dry-run             只打印结果，不发请求
  --require-token       缺 GITEE_TOKEN 时报错退出
`);
}

/** 表格行形如：| Windows x64 | [GitCode](…) · [GitHub](…) | → | Windows x64 | [下载](GitCode 链接) | */
function toGitcodeOnly(body, opts) {
	return body
		.replace(/\[GitCode\]\((https:\/\/gitcode\.com\/[^)\s]+)\)\s*·\s*\[GitHub\]\([^)\s]+\)/g, '[下载]($1)')
		.replace(/\[GitHub\]\((https:\/\/github\.com\/[^)\s]+)\)\s*·\s*\[GitCode\]\(([^)\s]+)\)/g, '[下载]($2)')
		.replace(
			/>\s*国内网络推荐 GitCode 链接；桌面端会自动下载对应的安装包完成更新。/,
			'> 表中「下载」均指向 **GitCode**（国内直连，与 GitHub 上的产物同名同校验值）；桌面端会自动下载对应安装包完成更新。'
		)
		.replace(/\n{3,}/g, '\n\n');
}

function collectGitcodeUrls(body) {
	const re = /https:\/\/gitcode\.com\/[^\s)|]+/g;
	return [...new Set(body.match(re) || [])];
}

async function api(opts, method, p, { json, query } = {}) {
	const url = new URL(opts.apiBase + p);
	if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
	const init = { method, headers: {} };
	if (json) {
		init.headers['Content-Type'] = 'application/json';
		init.body = JSON.stringify({ ...json, access_token: opts.token });
	}
	for (let attempt = 0; attempt < 4; attempt++) {
		if (attempt) await new Promise((r) => setTimeout(r, 1200 * attempt));
		const res = await fetch(url, init);
		const text = await res.text();
		if (res.ok) {
			try {
				return { ok: true, data: text ? JSON.parse(text) : null };
			} catch {
				return { ok: true, data: text };
			}
		}
		if (res.status !== 429 && res.status < 500) {
			return { ok: false, error: `${res.status} ${text.slice(0, 300)}` };
		}
		if (attempt === 3) return { ok: false, error: `${res.status} ${text.slice(0, 300)}` };
	}
	return { ok: false, error: 'unreachable' };
}

/** GitCode 探链：只取 1 KB，能拿到 200/206 就算附件就绪（同 update-manifest 的判据） */
async function probe(url, retries) {
	for (let i = 0; i < retries; i++) {
		try {
			const res = await fetch(url, {
				method: 'GET',
				headers: { Range: 'bytes=0-1023' },
				redirect: 'follow'
			});
			if (res.ok) {
				res.body?.cancel?.();
				return { ok: true, status: res.status };
			}
			if (i === retries - 1) return { ok: false, status: res.status };
		} catch (e) {
			if (i === retries - 1) return { ok: false, status: 'ERR ' + e.message };
		}
		await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
	}
	return { ok: false, status: 'unreachable' };
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.help) return usage();
	if (!opts.tag) {
		usage();
		throw new Error('缺少 --tag');
	}
	if (!opts.token) {
		const msg = '未提供 GITEE_TOKEN，跳过 Gitee 发布页';
		if (opts.requireToken) throw new Error(msg);
		console.log(msg);
		return;
	}

	let body = opts.notes.join('\n\n');
	if (opts.notesFile) {
		if (!fs.existsSync(opts.notesFile)) throw new Error(`正文文件不存在: ${opts.notesFile}`);
		body = fs.readFileSync(opts.notesFile, 'utf8');
	}
	if (!body.trim()) throw new Error('正文为空：检查 --notes-file');

	body = toGitcodeOnly(body, opts);

	// 顶部横幅：说清「为什么这里没有附件」，避免用户以为文件丢了
	const banner = [
		'> **说明**：本页仅提供下载入口。Gitee 单附件上限 100 MB，本项目安装包 325~582 MB，',
		'> 无法在此存放，安装包统一托管在 **GitCode**（国内直连）与 GitHub（源站）。',
		'',
		'---',
		''
	].join('\n');
	const finalBody = banner + body.trim() + '\n';

	const urls = collectGitcodeUrls(finalBody);
	console.log(`正文中 GitCode 下载链接 ${urls.length} 条`);

	if (opts.verify) {
		let bad = 0;
		for (const u of urls) {
			const r = await probe(u, opts.verifyRetries);
			const name = u.split('/').pop();
			console.log(`  探链 ${r.ok ? 'OK ' : 'FAIL'}[${r.status}] ${name}`);
			if (!r.ok) bad++;
		}
		if (bad) {
			throw new Error(`${bad} 条 GitCode 链接不可下载，拒绝发布（等镜像完成或检查 CNB 构建）`);
		}
	}

	// 找同名 Release
	const list = await api(opts, 'GET', `/repos/${opts.repo}/releases`, {
		query: { page: 1, per_page: 100 }
	});
	if (!list.ok) throw new Error('列出 Gitee Release 失败: ' + list.error);
	const existing = (list.data || []).find((r) => r.tag_name === opts.tag);

	const payload = {
		tag_name: opts.tag,
		name: opts.name || opts.tag,
		body: finalBody
	};

	if (existing) {
		if (opts.dryRun) {
			console.log(`[dry-run] 将更新 Release id=${existing.id}`);
			return;
		}
		const patched = await api(opts, 'PATCH', `/repos/${opts.repo}/releases/${existing.id}`, {
			json: payload
		});
		if (!patched.ok) throw new Error('更新 Gitee Release 失败: ' + patched.error);
		console.log(`已更新 Gitee Release: id=${existing.id} tag=${opts.tag}`);

		if (opts.purgeAssets) {
			const assets = await api(opts, 'GET', `/repos/${opts.repo}/releases/${existing.id}/attach_files`);
			for (const a of assets.ok && Array.isArray(assets.data) ? assets.data : []) {
				const del = await api(opts, 'DELETE', `/repos/${opts.repo}/releases/${existing.id}/attach_files/${a.id}`);
				console.log(`  清理附件 ${a.name} -> ${del.ok ? 'ok' : del.error}`);
			}
		}
		return;
	}

	if (opts.dryRun) {
		console.log(`[dry-run] 将创建 Release tag=${opts.tag}`);
		return;
	}
	const created = await api(opts, 'POST', `/repos/${opts.repo}/releases`, {
		json: { ...payload, prerelease: false, target_commitish: opts.target || 'main' }
	});
	if (!created.ok) throw new Error('创建 Gitee Release 失败: ' + created.error);
	console.log(`已创建 Gitee Release: id=${created.data.id} tag=${opts.tag}`);
}

main().catch((e) => {
	console.error('发布到 Gitee 失败:', e.message);
	process.exit(1);
});
