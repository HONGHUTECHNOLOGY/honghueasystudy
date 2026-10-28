#!/usr/bin/env node
// @ts-check

/**
 * 把一条版本记录写进官网的桌面端更新清单
 * ---------------------------------------------------------------
 * 桌面端 updater 读取 https://easystudy.honghutech.eu.org/api/honghu-app-infos.json
 * 的 versions 数组，用 semver 比较当前版本。这个脚本负责在发版时把新条目 upsert 进去，
 * 避免手工编辑 JSON 时漏字段/写错链接（链接错一条就等于这一版永远不会被检测到）。
 *
 * 用法：
 *   node scripts/write-update-manifest.js --meta dist/update/update-meta.json \
 *     --notes "feat: 支持点击版本号检查更新" --notes "fix: 修复更新失败导致软件无法启动"
 *
 *   node scripts/write-update-manifest.js --meta ... --dry-run       # 只打印，不写文件
 *   node scripts/write-update-manifest.js --meta ... --tag desktop-v3.2.0 --repo owner/repo
 *
 * 关于 tag（两个 tag 不要混用）：
 * - 清单里的 tag 字段 = **桌面版本**（meta.version，如 3.2.1），客户端用它和 app.getVersion() 比大小
 * - Release tag = **插件版本**（默认取根 package.json，如 v5.2.1），只用来拼下载地址；
 *   扩展包和桌面安装包发在同一个 Release 里，tag 走插件线
 * - 桌面端要脱离插件单独发版时才需要 --tag desktop-v<x.y.z>
 *   混用会让客户端「每次都提示更新、装完还是旧版本」
 *
 * 说明：
 * - url 必须是就地更新包（app-<version>.zip），mac/linux 不走它
 * - app_downloads 里 mac/linux 指向 Release 页面而不是具体安装包：
 *   字段只能填一个链接，而 mac 有 arm64/x64 两个 dmg，指页面让用户自己选更稳
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'website', 'api', 'honghu-app-infos.json');
/** 旧文件名的同内容副本，供旧版客户端读取 */
const LEGACY_MANIFEST = path.join(ROOT, 'website', 'api', 'ocs-app-infos.json');
const BUILDER = path.join(ROOT, 'honghueasystudy_desktop', 'packages', 'app', 'electron.builder.json');
/** 根 package.json = 插件版本线；扩展与桌面共用同一个 Release tag */
const ROOT_PKG = path.join(ROOT, 'package.json');

function readRootVersion() {
	try {
		return String(JSON.parse(fs.readFileSync(ROOT_PKG, 'utf8')).version || '').trim();
	} catch {
		return '';
	}
}

/**
 * 决定 Release tag（只用来拼下载地址，不参与版本比较）。
 *
 * 扩展包和桌面安装包是发在同一个 Release 里的，tag 一直走插件版本 `v5.x.x`；
 * 清单里的 `tag` 字段才是桌面版本（3.x），两者必须分开，混用会导致
 * 「检测到更新 → 装完还是旧版本 → 下次启动又提示」的死循环。
 *
 * 优先级：--tag 显式指定 > 根 package.json（插件线）> meta.rootVersion > meta.tagHint > 兜底。
 */
function resolveReleaseTag(args, meta) {
	if (args.tag) return { tag: args.tag, from: '--tag 显式指定' };
	const rootVersion = readRootVersion();
	if (rootVersion) return { tag: `v${rootVersion}`, from: '根 package.json（插件版本）' };
	if (meta.rootVersion) return { tag: `v${meta.rootVersion}`, from: 'meta.rootVersion' };
	if (meta.tagHint) return { tag: meta.tagHint, from: 'meta.tagHint' };
	return { tag: `desktop-v${meta.version}`, from: '桌面版本兜底' };
}

function parseArgs(argv) {
	const out = {
		meta: null,
		notes: [],
		tag: null,
		repo: 'HONGHUTECHNOLOGY/honghueasystudy',
		gitcode: 'honghutech/honghueasystudy',
		noMirror: false,
		mirrors: [],
		verify: false,
		zipUrl: null,
		manifest: MANIFEST,
		dryRun: false,
		noLegacy: false
	};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--meta') out.meta = path.resolve(argv[++i]);
		else if (a === '--notes') out.notes.push(String(argv[++i]));
		else if (a === '--tag') out.tag = argv[++i];
		else if (a === '--repo') out.repo = argv[++i];
		else if (a === '--gitcode') out.gitcode = argv[++i];
		else if (a === '--no-mirror') out.noMirror = true;
		else if (a === '--mirror') out.mirrors.push(String(argv[++i]));
		else if (a === '--verify') out.verify = true;
		else if (a === '--zip-url') out.zipUrl = argv[++i];
		else if (a === '--manifest') out.manifest = path.resolve(argv[++i]);
		else if (a === '--dry-run') out.dryRun = true;
		else if (a === '--no-legacy') out.noLegacy = true;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
}

const PROBE_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

/**
 * 探测下载源是否真的可用。
 *
 * GitCode 的附件地址会 302 到 file-cdn.gitcode.com，HEAD 请求直接 401，
 * 所以必须用带 Range 的 GET 并跟随重定向；只取 1 字节，不会把整个包拉下来。
 */
async function probeUrl(url) {
	let axios;
	try {
		// axios 装在桌面端 app 包里，脚本层面没有直接依赖
		const { createRequire } = require('module');
		const req = createRequire(path.join(ROOT, 'honghueasystudy_desktop', 'packages', 'app', 'package.json'));
		axios = req('axios');
	} catch {
		return { ok: false, detail: '未找到 axios（跳过探测）' };
	}
	try {
		const res = await axios.get(url, {
			headers: { 'User-Agent': PROBE_UA, Range: 'bytes=0-1' },
			timeout: 20000,
			maxRedirects: 5,
			validateStatus: () => true,
			responseType: 'arraybuffer'
		});
		const ok = res.status === 200 || res.status === 206;
		return { ok, detail: `HTTP ${res.status}` };
	} catch (e) {
		return { ok: false, detail: e?.message || String(e) };
	}
}

/** 把 `feat:` / `fix:` / `other:` 前缀解析成 updater 弹窗能展示的分组 */
function parseNotes(notes) {
	const desc = { feat: [], fix: [], other: [] };
	for (const raw of notes) {
		const text = String(raw).trim();
		if (!text) continue;
		const m = /^(feat|fix|other)\s*[:：]\s*(.+)$/i.exec(text);
		if (m) desc[/** @type {'feat'|'fix'|'other'} */ (m[1].toLowerCase())].push(m[2].trim());
		else desc.other.push(text);
	}
	return desc;
}

function compareVersionDesc(a, b) {
	const parse = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
	const [x, y, z] = [parse(a), parse(b)];
	for (let i = 0; i < 3; i++) {
		if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
	}
	return 0;
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
		return;
	}
	if (!args.meta) {
		console.error('[update-manifest] 缺少 --meta（先运行 node scripts/pack-app-update.js）');
		process.exit(1);
	}
	if (!fs.existsSync(args.meta)) {
		console.error('[update-manifest] 找不到 meta 文件: ' + args.meta);
		process.exit(1);
	}
	if (!fs.existsSync(args.manifest)) {
		console.error('[update-manifest] 找不到清单文件: ' + args.manifest);
		process.exit(1);
	}

	const meta = JSON.parse(fs.readFileSync(args.meta, 'utf8'));
	const version = String(meta.version || '').trim();
	if (!version) {
		console.error('[update-manifest] meta 缺少 version');
		process.exit(1);
	}
	const resolved = resolveReleaseTag(args, meta);
	const tag = resolved.tag;
	const releasePage = `https://github.com/${args.repo}/releases/tag/${tag}`;
	const zipFileName = meta.file || `app-${version}.zip`;
	const githubZipUrl = `https://github.com/${args.repo}/releases/download/${tag}/${zipFileName}`;
	const gitcodeZipUrl = args.gitcode
		? `https://gitcode.com/${args.gitcode}/releases/download/${tag}/${zipFileName}`
		: null;

	/**
	 * 多源顺序：GitCode 在前、GitHub 在后。
	 * 国内直连 GitHub Release 的下载速度常常只有几十 KB/s 甚至超时，GitCode 走 file-cdn.gitcode.com
	 * 国内 CDN；客户端逐个尝试，某个源连不上或校验不过会自动切下一个。
	 * 两个源的文件必须字节一致（同一个 sha256），否则校验会失败。
	 */
	const sources = [];
	if (args.zipUrl) {
		// 显式指定了地址（例如自建对象存储），就不再推导 GitCode 镜像
		sources.push(args.zipUrl);
	} else {
		if (!args.noMirror && gitcodeZipUrl) sources.push(gitcodeZipUrl);
		sources.push(githubZipUrl);
	}
	for (const m of args.mirrors) sources.push(m);
	const uniqueSources = [...new Set(sources.filter(Boolean))];

	const builder = fs.existsSync(BUILDER) ? JSON.parse(fs.readFileSync(BUILDER, 'utf8')) : {};
	const productName = builder.productName || '鸿鹄易学';
	/** 与 electron.builder.json 的 artifactName 保持一致：${productName}-${version}-setup-${os}-${arch}.${ext} */
	const installer = (os, arch, ext) =>
		`https://github.com/${args.repo}/releases/download/${tag}/${encodeURIComponent(`${productName}-${version}-setup-${os}-${arch}.${ext}`)}`;

	if (!meta.sha256) console.warn('[update-manifest] ⚠ meta 没有 sha256，客户端将跳过完整性校验');

	console.log(`[update-manifest] 桌面版本 ${version}（清单 tag，参与 semver 比较）`);
	console.log(`[update-manifest] 插件版本 ${tag}（Release tag，只拼下载地址，来源：${resolved.from}）`);

	const entry = {
		tag: version,
		description: parseNotes(args.notes),
		url: uniqueSources[0],
		...(uniqueSources.length > 1 ? { urls: uniqueSources } : {}),
		sha256: meta.sha256,
		size: meta.size,
		app_downloads: {
			win32: installer('win', 'x64', 'exe'),
			// 单字段无法区分 mac arm64/x64 与 linux 的 deb/rpm/AppImage，统一指 Release 页面
			darwin: releasePage,
			linux: releasePage
		}
	};

	/** 发布前自检：链接 404 或镜像没上传就写进清单，等于这一版永远不会被检测到 */
	if (args.verify) {
		console.log('[update-manifest] 探测下载源…');
		let failed = 0;
		for (const u of uniqueSources) {
			const r = await probeUrl(u);
			console.log(`  ${r.ok ? '✓' : '✗'} ${u}  (${r.detail})`);
			if (!r.ok) failed++;
		}
		if (failed > 0) {
			console.error(
				`\n[update-manifest] ${failed} 个下载源不可用，未写入清单。\n` +
					'请先在对应平台创建 tag 并上传同名更新包后再执行；确认无需校验可去掉 --verify。'
			);
			process.exitCode = 1;
			return;
		}
	}

	const write = (file, label) => {
		const json = JSON.parse(fs.readFileSync(file, 'utf8'));
		const versions = Array.isArray(json.versions) ? json.versions : [];
		const rest = versions.filter((v) => v && String(v.tag).replace(/^v/, '') !== version);
		rest.push(entry);
		// 降序：客户端虽然会自己取最大值，但有序能让清单本身一眼看懂
		rest.sort((a, b) => compareVersionDesc(a.tag, b.tag));
		json.versions = rest;

		const text = JSON.stringify(json, null, 4) + '\n';
		if (args.dryRun) {
			console.log(`[update-manifest] (dry-run) ${label} 将写入 ${rest.length} 条版本记录`);
			console.log(JSON.stringify(entry, null, 2));
		} else {
			fs.writeFileSync(file, text);
			console.log(`[update-manifest] ${label} 已更新，共 ${rest.length} 条版本记录`);
		}
	};

	write(args.manifest, path.relative(ROOT, args.manifest));
	if (!args.noLegacy && args.manifest === MANIFEST && fs.existsSync(LEGACY_MANIFEST)) {
		write(LEGACY_MANIFEST, path.relative(ROOT, LEGACY_MANIFEST));
	}

	if (!args.dryRun) {
		console.log(`\n[update-manifest] 桌面版本 ${version}   → 清单 tag（参与比较）`);
		console.log(`[update-manifest] 插件版本 ${tag}   → Release tag（只拼地址，来源：${resolved.from}）`);
		console.log(`[update-manifest] 下载源   ${uniqueSources.length} 个（客户端按顺序回退）`);
		for (const u of uniqueSources) console.log(`                    ${u}`);
		console.log(`[update-manifest] 校验     ${meta.sha256 || '（缺失）'}`);
		console.log('\n下一步：提交 website/api/ 的改动并推送，官网（Cloudflare Pages）部署后即生效。');
		console.log('提示：客户端每次请求都带时间戳，不需要担心 CDN 缓存。');
	}
}

main().catch((e) => {
	console.error('[update-manifest] 执行失败:', e);
	process.exit(1);
});
