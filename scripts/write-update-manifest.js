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

function parseArgs(argv) {
	const out = {
		meta: null,
		notes: [],
		tag: null,
		repo: 'HONGHUTECHNOLOGY/honghueasystudy',
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
		else if (a === '--zip-url') out.zipUrl = argv[++i];
		else if (a === '--manifest') out.manifest = path.resolve(argv[++i]);
		else if (a === '--dry-run') out.dryRun = true;
		else if (a === '--no-legacy') out.noLegacy = true;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
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

function main() {
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
	const tag = args.tag || meta.tagHint || `desktop-v${version}`;
	const releasePage = `https://github.com/${args.repo}/releases/tag/${tag}`;
	const zipUrl = args.zipUrl || `https://github.com/${args.repo}/releases/download/${tag}/${meta.file || `app-${version}.zip`}`;

	const builder = fs.existsSync(BUILDER) ? JSON.parse(fs.readFileSync(BUILDER, 'utf8')) : {};
	const productName = builder.productName || '鸿鹄易学';
	/** 与 electron.builder.json 的 artifactName 保持一致：${productName}-${version}-setup-${os}-${arch}.${ext} */
	const installer = (os, arch, ext) =>
		`https://github.com/${args.repo}/releases/download/${tag}/${encodeURIComponent(`${productName}-${version}-setup-${os}-${arch}.${ext}`)}`;

	if (!meta.sha256) console.warn('[update-manifest] ⚠ meta 没有 sha256，客户端将跳过完整性校验');

	const entry = {
		tag: version,
		description: parseNotes(args.notes),
		url: zipUrl,
		sha256: meta.sha256,
		size: meta.size,
		app_downloads: {
			win32: installer('win', 'x64', 'exe'),
			// 单字段无法区分 mac arm64/x64 与 linux 的 deb/rpm/AppImage，统一指 Release 页面
			darwin: releasePage,
			linux: releasePage
		}
	};

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
		console.log(`\n[update-manifest] 版本     ${version}`);
		console.log(`[update-manifest] 更新包   ${zipUrl}`);
		console.log(`[update-manifest] 校验     ${meta.sha256 || '（缺失）'}`);
		console.log('\n下一步：提交 website/api/ 的改动并推送，官网（Cloudflare Pages）部署后即生效。');
		console.log('提示：客户端每次请求都带时间戳，不需要担心 CDN 缓存。');
	}
}

main();
