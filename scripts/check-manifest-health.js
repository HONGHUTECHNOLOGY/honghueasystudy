#!/usr/bin/env node
// @ts-check

/**
 * 更新清单健康检查
 * ---------------------------------------------------------------
 * 校验 website/api/honghu-app-infos.json 里的 versions[]：
 *   1) 结构合法（tag 是版本号、不重复、sha256 是 64 位 hex、size > 0）
 *   2) 每个条目的每个平台，至少要有一个下载源真的能取到字节
 *
 * 为什么要单独一个脚本：写入时的 --verify 只能保证「那一刻」是好的。
 * 之后附件可能被删（Release 清理、GitCode 侧没传成功、改名），
 * 而客户端只要发现更高版本就会提示更新 —— 用户被推到死链上才发现就晚了。
 * 所以由 CI 每天跑一次，任一条目的任一平台全部源失效即失败（GitHub 会通知 owner）。
 *
 * 用法：
 *   node scripts/check-manifest-health.js              # 检查仓库里的清单
 *   node scripts/check-manifest-health.js --offline    # 只做结构校验，不联网
 *   node scripts/check-manifest-health.js --file x.json
 *   node scripts/check-manifest-health.js --url https://.../api/honghu-app-infos.json --compare
 *                                                      # 额外比对线上与仓库的 versions[]
 *
 * 只依赖 Node 18+ 的全局 fetch，不需要装依赖（CI 里可以不跑 pnpm install）。
 */

const fs = require('fs');
const path = require('path');
const { groupEntrySources } = require('./write-update-manifest.js');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILE = path.join(ROOT, 'website', 'api', 'honghu-app-infos.json');
const UA = 'honghu-easystudy-manifest-health/1.0';
const PROBE_TIMEOUT_MS = 20000;
const CONCURRENCY = 4;

function parseArgs(argv) {
	const out = { file: DEFAULT_FILE, url: null, offline: false, compare: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--file') out.file = path.resolve(argv[++i]);
		else if (a === '--url') out.url = argv[++i];
		else if (a === '--offline') out.offline = true;
		else if (a === '--compare') out.compare = true;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
}

async function loadManifest(args) {
	if (args.url) {
		const res = await fetch(args.url, {
			headers: { 'User-Agent': UA },
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
		});
		if (!res.ok) throw new Error(`拉取清单失败：HTTP ${res.status}（${args.url}）`);
		return res.json();
	}
	if (!fs.existsSync(args.file)) throw new Error(`清单不存在：${args.file}`);
	return JSON.parse(fs.readFileSync(args.file, 'utf8'));
}

/** 结构校验：这些错误会让客户端静默跳过条目或校验失败，比 404 更难察觉 */
function checkSchema(json) {
	const errors = [];
	const warnings = [];

	if (!json || typeof json !== 'object' || Array.isArray(json)) {
		errors.push('根节点必须是对象');
		return { errors, warnings };
	}
	// 客户端用 bookmark 是否为数组判断「拿到的是真 JSON 还是 CF 的错误页」
	if (!Array.isArray(json.bookmark)) errors.push('bookmark 不是数组（客户端会判定响应无效并整份丢弃）');

	const versions = json.versions;
	if (!Array.isArray(versions)) {
		errors.push('versions 不是数组');
		return { errors, warnings };
	}

	const seen = new Map();
	for (const v of versions) {
		const rawTag = v && typeof v.tag === 'string' ? v.tag : '';
		const tag = rawTag.replace(/^v/, '');
		if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(tag)) {
			errors.push(`tag 不是合法版本号：${rawTag || '(空)'}`);
			continue;
		}
		if (seen.has(tag)) errors.push(`重复条目：${tag}`);
		seen.set(tag, v);

		const groups = groupEntrySources(v);
		if (!groups.size) {
			errors.push(`${tag} 既没有 installers 也没有 url，客户端会跳过这个版本`);
		}

		const win = v.installers && v.installers.win32;
		if (win) {
			if (!win.sha256) warnings.push(`${tag} installers.win32 缺少 sha256：客户端不做完整性校验`);
			else if (!/^[0-9a-f]{64}$/i.test(win.sha256)) errors.push(`${tag} installers.win32.sha256 不是 64 位 hex`);
			if (win.size === undefined) warnings.push(`${tag} installers.win32 缺少 size：无法做磁盘预检与大小复核`);
			else if (!(win.size > 0)) errors.push(`${tag} installers.win32.size 不是正数`);
			if (win.name && !win.name.toLowerCase().endsWith('.exe')) {
				warnings.push(`${tag} installers.win32.name 不是 .exe：${win.name}`);
			}
		}
		for (const platform of ['darwin', 'linux']) {
			const list = v.installers && v.installers[platform];
			if (!list) continue;
			if (!Array.isArray(list)) {
				errors.push(`${tag} installers.${platform} 必须是数组（按 arch + 格式区分）`);
				continue;
			}
			for (const item of list) {
				if (!item || !item.arch) errors.push(`${tag} installers.${platform} 有缺 arch 的条目，客户端无法匹配`);
			}
		}
	}

	// 客户端取最大版本而不是第一条，顺序只影响可读性
	const tags = versions.map((v) => String((v && v.tag) || '').replace(/^v/, ''));
	const sorted = [...tags].sort(cmpVersionDesc);
	if (tags.join(',') !== sorted.join(',')) warnings.push('versions 不是按版本降序排列（客户端会自行取最大，不影响功能）');

	return { errors, warnings };
}

function parseVersion(v) {
	return String(v || '')
		.replace(/^v/, '')
		.split(/[-+]/)[0]
		.split('.')
		.map((n) => parseInt(n, 10) || 0);
}

function cmpVersionDesc(a, b) {
	const [x, y] = [parseVersion(a), parseVersion(b)];
	for (let i = 0; i < 3; i++) {
		if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
	}
	return 0;
}

/** Range GET 探一个地址：GitCode 的 HEAD 返 401，只能这么验 */
async function probe(url) {
	let last = '未知错误';
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch(url, {
				headers: { Range: 'bytes=0-1', 'User-Agent': UA },
				redirect: 'follow',
				signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
			});
			// 不读响应体：服务器若忽略 Range 会返回整个安装包，读进内存会撑爆 runner
			await res.body?.cancel().catch(() => {});
			if (res.status === 200 || res.status === 206) return { ok: true, detail: `HTTP ${res.status}` };
			last = `HTTP ${res.status}`;
			// 5xx / 429 视为可能是瞬时故障，重试一次；4xx 直接判死
			if (res.status < 500 && res.status !== 429) return { ok: false, detail: last };
		} catch (e) {
			last = e && e.message ? e.message : String(e);
		}
	}
	return { ok: false, detail: last };
}

async function probeGroups(jobs) {
	const urls = [...new Set(jobs.flatMap((j) => j.urls))];
	const result = new Map();
	for (let i = 0; i < urls.length; i += CONCURRENCY) {
		const batch = urls.slice(i, i + CONCURRENCY);
		const rs = await Promise.all(batch.map((u) => probe(u).then((r) => [u, r])));
		for (const [u, r] of rs) result.set(u, r);
	}
	return result;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log('用法: node scripts/check-manifest-health.js [--file <path>] [--url <url>] [--offline]');
		return;
	}

	const json = await loadManifest(args);
	const { errors, warnings } = checkSchema(json);

	console.log(`[health] 清单来源 ${args.url || path.relative(ROOT, args.file)}`);

	/*
	 * 线上与仓库比对：CF Pages 构建失败时，仓库里是好的、用户拿到的却还是旧清单。
	 * 这时客户端要么收不到更新、要么还在指向已经删掉的附件 —— 必须当成故障处理。
	 */
	if (args.compare) {
		if (!args.url) {
			warnings.push('--compare 需要配合 --url 使用，已跳过线上比对');
		} else if (!fs.existsSync(DEFAULT_FILE)) {
			warnings.push(`本地清单不存在（${path.relative(ROOT, DEFAULT_FILE)}），跳过线上比对`);
		} else {
			const local = JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8'));
			const pick = (j) => JSON.stringify(Array.isArray(j.versions) ? j.versions : []);
			if (pick(local) === pick(json)) {
				console.log('[health] ✓ 线上 versions[] 与仓库一致');
			} else {
				errors.push('线上 versions[] 与仓库不一致：CF Pages 可能部署失败或还没部署完（用户拿到的是旧清单）');
			}
		}
	}
	console.log(`[health] 版本条目 ${Array.isArray(json.versions) ? json.versions.length : 0} 条`);
	for (const w of warnings) console.warn(`[health] ⚠ ${w}`);
	for (const e of errors) console.error(`[health] ✗ ${e}`);

	if (args.offline) {
		console.log(`\n[health] 结构校验完成：${errors.length ? '失败' : '通过'}（--offline 跳过链路探测）`);
		if (errors.length) process.exitCode = 1;
		return;
	}

	const jobs = [];
	for (const v of Array.isArray(json.versions) ? json.versions : []) {
		for (const [key, urls] of groupEntrySources(v)) jobs.push({ tag: String(v.tag), key, urls });
	}
	if (!jobs.length) {
		console.log('\n[health] versions 为空：没有可探测的下载源（客户端不会提示任何更新）');
		if (errors.length) process.exitCode = 1;
		return;
	}

	console.log(`[health] 探测 ${jobs.length} 组下载源…`);
	const probed = await probeGroups(jobs);

	const dead = [];
	for (const job of jobs) {
		const up = job.urls.filter((u) => probed.get(u)?.ok).length;
		const mark = up === job.urls.length ? '✓' : up > 0 ? '!' : '✗';
		console.log(`  ${mark} [${job.tag}] ${job.key}  ${up}/${job.urls.length} 源可用`);
		for (const u of job.urls) {
			const r = probed.get(u);
			if (!r?.ok) console.warn(`      ✗ ${u}  (${r?.detail || '未探测'})`);
		}
		if (up === 0) dead.push(job);
	}

	const partial = jobs.length - dead.length - jobs.filter((j) => j.urls.every((u) => probed.get(u)?.ok)).length;
	console.log(
		`\n[health] 汇总：${jobs.length} 组中 ${dead.length} 组全源失效、${partial} 组部分源失效（客户端会自动回退）`
	);

	if (dead.length) {
		console.error(
			'\n[health] 以下平台没有可用下载源，用户会「检测到更新但下不了包」：\n' +
				dead.map((j) => `  - ${j.tag} / ${j.key}`).join('\n') +
				'\n处置：恢复 Release 附件后重跑；确认版本已下线则从 versions[] 移除该条目。'
		);
	}
	if (errors.length || dead.length) process.exitCode = 1;
	else console.log('[health] 通过');
}

if (require.main === module) {
	main().catch((e) => {
		console.error('[health] 检查失败：' + (e && e.message ? e.message : e));
		process.exit(1);
	});
}

module.exports = { checkSchema, cmpVersionDesc };
