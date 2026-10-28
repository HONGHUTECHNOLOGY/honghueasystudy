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
 * 链路校验默认开启（fail-closed）：
 * - 本次新增条目的每个下载地址都会 Range GET 探一遍，任一不通就拒绝写入
 * - 已有的历史条目也会复查：某平台全部源都失效 → 告警；--prune-dead 则从清单移除
 * - 确实要先写清单再加 --no-verify，但那样用户很可能「检测到更新却下不了包」
 *
 * 关于 tag（两个 tag 不要混用）：
 * - 清单里的 tag 字段 = **桌面版本**（meta.version，如 3.2.1），客户端用它和 app.getVersion() 比大小
 * - Release tag = **插件版本**（默认取根 package.json，如 v5.2.1），只用来拼下载地址；
 *   扩展包和桌面安装包发在同一个 Release 里，tag 走插件线
 * - 桌面端要脱离插件单独发版时才需要 --tag desktop-v<x.y.z>
 *   混用会让客户端「每次都提示更新、装完还是旧版本」
 *
 * 说明：
 * - url 必须是就地更新包（app-<version>.zip），只在旧客户端上用；新版走 installers
 * - installers.win32 = setup.exe，客户端全自动安装
 * - installers.darwin / installers.linux 是数组（按 arch + 格式区分）：
 *   mac 未签名、linux 的 deb/rpm 需要 root，客户端不自动装，只把对应直链交给浏览器下载；
 *   产物不在本机时字段缺省，客户端退回 app_downloads 里的 Release 页面
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
		/*
		 * 默认开启链路校验：清单一旦被客户端读到，就等于对用户承诺「这个版本可下载」。
		 * 带病写入的后果是用户弹了更新却下不了包，比发版晚几分钟严重得多，
		 * 所以这里 fail-closed —— 要跳过必须显式 --no-verify。
		 */
		verify: true,
		/** 历史条目里所有源都失效的，写入时清掉（默认只告警） */
		pruneDead: false,
		zipUrl: null,
		installer: null,
		artifacts: [],
		noRemoteAssets: false,
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
		else if (a === '--no-verify') out.verify = false;
		else if (a === '--prune-dead') out.pruneDead = true;
		else if (a === '--zip-url') out.zipUrl = argv[++i];
		else if (a === '--installer') out.installer = path.resolve(argv[++i]);
		else if (a === '--artifacts') out.artifacts.push(path.resolve(argv[++i]));
		else if (a === '--no-remote-assets') out.noRemoteAssets = true;
		else if (a === '--manifest') out.manifest = path.resolve(argv[++i]);
		else if (a === '--dry-run') out.dryRun = true;
		else if (a === '--no-legacy') out.noLegacy = true;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
}

const PROBE_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

/** axios 装在桌面端 app 包里，脚本层面没有直接依赖；加载失败时相关能力自动跳过 */
let axiosRef;
function getAxios() {
	if (axiosRef !== undefined) return axiosRef;
	try {
		const { createRequire } = require('module');
		const req = createRequire(path.join(ROOT, 'honghueasystudy_desktop', 'packages', 'app', 'package.json'));
		axiosRef = req('axios');
	} catch {
		axiosRef = null;
	}
	return axiosRef;
}

/**
 * 探测下载源是否真的可用。
 *
 * GitCode 的附件地址会 302 到 file-cdn.gitcode.com，HEAD 请求直接 401，
 * 所以必须用带 Range 的 GET 并跟随重定向；只取 1 字节，不会把整个包拉下来。
 */
async function probeUrl(url) {
	const axios = getAxios();
	if (!axios) return { ok: false, detail: '未找到 axios（跳过探测）' };

	let host = '';
	try {
		host = new URL(url).hostname.toLowerCase();
	} catch {
		// 非法 URL 交给 axios 报错
	}
	// GitCode 走国内 CDN，经代理反而可能拿到错误页；GitHub 在部分网络下必须走代理
	const directOnly = /(^|\.)gitcode\.com$/.test(host);
	const configs = directOnly ? [{ proxy: false }] : [{}, { proxy: false }];

	let last = '未知错误';
	for (const extra of configs) {
		try {
			const res = await axios.get(url, {
				headers: { 'User-Agent': PROBE_UA, Range: 'bytes=0-1' },
				timeout: 20000,
				maxRedirects: 5,
				validateStatus: () => true,
				responseType: 'arraybuffer',
				...extra
			});
			if (res.status === 200 || res.status === 206) return { ok: true, detail: `HTTP ${res.status}` };
			last = `HTTP ${res.status}`;
		} catch (e) {
			last = e?.message || String(e);
		}
	}
	return { ok: false, detail: last };
}

/**
 * 把一个清单条目里所有「可能被下载」的地址按平台/格式分组。
 *
 * 分组的目的是判断粒度：多源设计下单个源挂掉是正常的（客户端会回退），
 * 只有某一平台的**全部**源都失效，才真的会让该平台用户「下不了包」。
 */
function groupEntrySources(entry) {
	const groups = new Map();
	const add = (key, urls) => {
		const list = (Array.isArray(urls) ? urls : [urls]).filter(
			(u) => typeof u === 'string' && /^https?:\/\//i.test(u)
		);
		if (!list.length) return;
		groups.set(key, [...new Set([...(groups.get(key) || []), ...list])]);
	};

	const installers = entry && entry.installers;
	if (installers && typeof installers === 'object') {
		for (const platform of Object.keys(installers)) {
			const value = installers[platform];
			const list = Array.isArray(value) ? value : [value];
			for (const item of list) {
				if (!item || typeof item !== 'object') continue;
				const suffix = [item.arch, item.ext].filter(Boolean).join('/');
				add(`installers.${platform}${suffix ? ':' + suffix : ''}`, item.urls || item.url);
			}
		}
	}
	// 旧版客户端（<= 3.2.0）走的 zip 通道
	add('zip', entry && entry.urls && entry.urls.length ? entry.urls : entry && entry.url);
	return groups;
}

/** 条目里所有下载地址（去重） */
function collectDownloadSources(entry) {
	return [...new Set([...groupEntrySources(entry).values()].flat())];
}

/** 限并发的探链：单个坏链接要等满 20s 超时，串行跑历史条目会让人等到放弃 */
async function probeAll(urls, concurrency = 4) {
	const result = new Map();
	for (let i = 0; i < urls.length; i += concurrency) {
		const batch = urls.slice(i, i + concurrency);
		const rs = await Promise.all(batch.map((u) => probeUrl(u).then((r) => [u, r])));
		for (const [u, r] of rs) result.set(u, r);
	}
	return result;
}

/**
 * 复查清单里已有的条目。
 *
 * 为什么必须复查：`versions[]` 会一直累加，而附件可能被删（Release 被清理、
 * GitCode 侧没传、改名）。客户端只要在自己的版本之上找到更高的条目就会提示更新，
 * 于是老用户被推到一条死链上。发布前顺手体检一遍，比出事后再回滚便宜。
 */
async function auditHistory(args, newVersion) {
	const file = args.manifest;
	if (!file || !fs.existsSync(file)) return [];

	let json;
	try {
		json = JSON.parse(fs.readFileSync(file, 'utf8'));
	} catch {
		return [];
	}
	const versions = (Array.isArray(json.versions) ? json.versions : []).filter(
		(v) => v && String(v.tag).replace(/^v/, '') !== newVersion
	);
	if (!versions.length) return [];

	console.log(`[update-manifest] 复查已有条目 ${versions.length} 条（老版本用户升级时命中的就是这些）…`);
	const probed = await probeAll([...new Set(versions.flatMap((v) => collectDownloadSources(v)))]);

	const dead = [];
	for (const v of versions) {
		const groups = groupEntrySources(v);
		const broken = [];
		let usable = 0;
		for (const [key, urls] of groups) {
			const up = urls.filter((u) => probed.get(u)?.ok).length;
			usable += up;
			console.log(`  ${up === urls.length ? '✓' : up > 0 ? '!' : '✗'} [${v.tag}] ${key}  ${up}/${urls.length} 源可用`);
			if (up === 0) broken.push(key);
		}
		if (!groups.size) continue;
		if (broken.length === groups.size) {
			dead.push({ tag: v.tag, groups: broken });
		} else if (broken.length) {
			console.warn(`  ⚠ ${v.tag} 的 ${broken.join('、')} 全部不可用：该平台用户升级会失败，其他平台不受影响`);
		}
	}

	if (dead.length) {
		console.error(
			'\n[update-manifest] 以下历史条目的所有下载源都失效了，老版本用户会「检测到更新但下不了包」：\n' +
				dead.map((d) => `  - ${d.tag}（${d.groups.join('、')}）`).join('\n') +
				(args.pruneDead
					? '\n已按 --prune-dead 从清单中移除。'
					: '\n恢复对应 Release 附件后重试，或加 --prune-dead 重新执行以移除这些条目。')
		);
	}
	return args.pruneDead ? dead : [];
}

/**
 * 读 Release 的附件列表。
 *
 * mac / linux 产物是 CI 在各自 runner 上构建的，本地跑这个脚本时通常只有 Windows 安装包。
 * 只靠本机扫描会让 installers.darwin / linux 永远为空（等于这个功能没生效），
 * 所以缺失的从 Release 附件列表补：官方 API 直接给 name / size，公开仓库无需 token。
 * 注意这些包客户端不自动安装，只是把直链交给浏览器，因此没有 sha256 也能接受。
 */
async function fetchReleaseAssets(repo, tag) {
	const axios = getAxios();
	if (!axios) return [];
	const headers = { 'User-Agent': PROBE_UA, Accept: 'application/vnd.github+json' };
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;
	const url = `https://api.github.com/repos/${repo}/releases/tags/${tag}`;

	// axios 0.25 对「https 目标 + http 代理」的处理不可靠（表现为 socket hang up），
	// 所以先直连，失败再退回环境代理；两者都失败才放弃（字段留空，客户端回退 Release 页）
	for (const extra of [{ proxy: false }, {}]) {
		try {
			const res = await axios.get(url, { headers, timeout: 20000, validateStatus: () => true, ...extra });
			if (res.status === 200) {
				return (res.data?.assets || []).map((a) => ({
					name: String(a.name || ''),
					size: Number(a.size) || 0,
					/** GitHub 自 2024 起提供 "sha256:<hex>" */
					digest: String(a.digest || '')
				}));
			}
			// 明确的 HTTP 状态（404 表示 Release 还没建）不需要再换通道重试
			console.warn(`[update-manifest] ⚠ 读取 Release ${tag} 附件失败（HTTP ${res.status}），跨平台字段可能留空`);
			return [];
		} catch (e) {
			if (extra.proxy !== false) console.warn('[update-manifest] ⚠ 读取 Release 附件出错：' + (e?.message || e));
		}
	}
	return [];
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

/** 流式算 SHA256（安装包 260MB，不能整读进内存） */
function sha256File(file) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		fs.createReadStream(file)
			.on('data', (c) => hash.update(c))
			.on('end', () => resolve(hash.digest('hex')))
			.on('error', reject);
	});
}

/**
 * 找 Windows 安装包（NSIS setup exe）。
 *
 * 客户端现在走「下载安装包 → 静默覆盖安装」，所以必须给出安装包的多源地址与校验值。
 * 文件名按 electron.builder.json 的 artifactName 生成：
 *   `${productName}-${version}-setup-${os}-${arch}.${ext}`，例如 鸿鹄易学-3.2.1-setup-win-x64.exe
 */
function findWinInstaller(productName, version) {
	const distDir = path.join(ROOT, 'honghueasystudy_desktop', 'packages', 'app', 'dist');
	if (!fs.existsSync(distDir)) return null;

	const expected = `${productName}-${version}-setup-win-x64.exe`;
	const exact = path.join(distDir, expected);
	if (fs.existsSync(exact)) return { file: exact, name: expected };

	// artifactName 改过名字时兜底：同版本、win、setup、exe
	const candidates = fs
		.readdirSync(distDir)
		.filter((f) => /-setup-win-.*\.exe$/i.test(f) && f.includes(version));
	if (candidates.length === 1) return { file: path.join(distDir, candidates[0]), name: candidates[0] };
	if (candidates.length > 1) {
		console.warn(`[update-manifest] ⚠ 找到多个候选安装包，请用 --installer 指定：${candidates.join(', ')}`);
	}
	return null;
}


/**
 * 扫出 mac / linux 安装包。
 *
 * 客户端在非 Windows 上不做自动安装（mac 未签名，替换 .app 会被 Gatekeeper 拒开；
 * linux 的 deb/rpm 需要 root），但仍要「点一下就下到对应架构的正确包」，
 * 否则用户会被丢到 Release 页面自己分辨 arm64/x64、dmg/AppImage。
 *
 * 文件名本身就是信息源：electron-builder 的 artifactName 是
 * `${productName}-${version}-setup-${os}-${arch}.${ext}`，os 在 mac 上是 mac。
 * 产物不在本机时（只打了 Windows）返回空数组，客户端会退回 Release 页面。
 */
/**
 * 从产物文件名解析平台 / 架构 / 格式。
 *
 * 文件名来自 electron.builder.json 的 artifactName：
 * `${productName}-${version}-setup-${os}-${arch}.${ext}`，os 在 mac 上是 mac。
 * 例：鸿鹄易学-3.2.1-setup-mac-arm64.dmg → darwin / arm64 / dmg
 */
function parseArtifactName(name, version) {
	const m = /-setup-(mac|linux|win)-(x64|arm64)\.([A-Za-z0-9]+)$/i.exec(String(name || ''));
	if (!m) return null;
	if (version && !String(name).includes(version)) return null;
	const os = m[1].toLowerCase();
	return {
		platform: os === 'mac' ? 'darwin' : os,
		arch: m[2].toLowerCase(),
		ext: m[3]
	};
}

function findPlatformInstallers(version, extraDirs = []) {
	const distDir = path.join(ROOT, 'honghueasystudy_desktop', 'packages', 'app', 'dist');
	const dirs = [distDir, ...extraDirs].filter((d) => d && fs.existsSync(d));
	const found = new Map();

	for (const dir of dirs) {
		let files = [];
		try {
			files = fs.readdirSync(dir);
		} catch {
			continue;
		}
		for (const name of files) {
			const parsed = parseArtifactName(name, version);
			if (!parsed || parsed.platform === 'win') continue;
			const key = `${parsed.platform}-${parsed.arch}-${parsed.ext.toLowerCase()}`;
			// 多个目录里出现同名产物时，先扫到的（dist 优先）为准
			if (found.has(key)) continue;
			found.set(key, { ...parsed, file: path.join(dir, name), name });
		}
	}

	// 稳定顺序：自包含格式（dmg / AppImage）排在包管理器格式前面
	const rank = (e) => (/^(dmg|appimage)$/i.test(e.ext) ? 0 : 1);
	return [...found.values()].sort(
		(a, b) =>
			a.platform.localeCompare(b.platform) ||
			a.arch.localeCompare(b.arch) ||
			rank(a) - rank(b) ||
			a.ext.localeCompare(b.ext)
	);
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
	const githubBase = `https://github.com/${args.repo}`;
	const gitcodeBase = args.gitcode ? `https://gitcode.com/${args.gitcode}` : null;
	/** 与 electron.builder.json 的 artifactName 保持一致：${productName}-${version}-setup-${os}-${arch}.${ext} */
	const installerName = (os, arch, ext) => `${productName}-${version}-setup-${os}-${arch}.${ext}`;
	const downloadUrl = (base, name) => `${base}/releases/download/${tag}/${encodeURIComponent(name)}`;

	/*
	 * Windows 安装包：新版客户端只走这条（下载 setup.exe → 静默覆盖安装）。
	 * 用安装包而不是替换 resources/app，是为了把 Electron 运行时、内置扩展 extension/、
	 * bin/chrome、bin/cloudflared、bin/ocr 一起对齐。
	 */
	const winName = installerName('win', 'x64', 'exe');
	const foundInstaller = args.installer
		? { file: args.installer, name: path.basename(args.installer) }
		: findWinInstaller(productName, version);

	/** @type {{urls: string[], sha256: string, size: number, name: string} | null} */
	let winInstaller = null;
	if (foundInstaller) {
		if (!fs.existsSync(foundInstaller.file)) {
			console.error('[update-manifest] 找不到安装包：' + foundInstaller.file);
			process.exit(1);
		}
		const size = fs.statSync(foundInstaller.file).size;
		const sha256 = await sha256File(foundInstaller.file);
		const urls = [];
		// 顺序与 zip 一致：GitCode 在前（国内 CDN），GitHub 兜底
		if (gitcodeBase && !args.noMirror) urls.push(downloadUrl(gitcodeBase, foundInstaller.name));
		urls.push(downloadUrl(githubBase, foundInstaller.name));
		for (const m of args.mirrors) urls.push(m);
		winInstaller = { urls: [...new Set(urls)], sha256, size, name: foundInstaller.name };
	} else {
		console.warn(
			`[update-manifest] ⚠ 没找到 Windows 安装包（${winName}）\n` +
				'  客户端会退回「打开下载页手动安装」。请先执行桌面端打包，或用 --installer 指定文件。'
		);
	}

	/*
	 * mac / linux 安装包：本地有产物时算 sha256，没有的从 Release 附件列表补
	 * （CI 在各自 runner 上构建，本地发版只有 Windows 安装包）。
	 * 客户端对这两类只做「挑一个直链交给浏览器」，不校验也不自动安装，缺 sha256 可接受。
	 */
	const platformItems = [];
	const platformSeen = new Set();
	for (const item of findPlatformInstallers(version, args.artifacts)) {
		platformSeen.add(`${item.platform}-${item.arch}-${item.ext.toLowerCase()}`);
		platformItems.push({
			platform: item.platform,
			arch: item.arch,
			ext: item.ext,
			name: item.name,
			size: fs.statSync(item.file).size,
			sha256: await sha256File(item.file)
		});
	}

	if (!args.noRemoteAssets) {
		for (const asset of await fetchReleaseAssets(args.repo, tag)) {
			const parsed = parseArtifactName(asset.name, version);
			if (!parsed || parsed.platform === 'win') continue;
			const key = `${parsed.platform}-${parsed.arch}-${parsed.ext.toLowerCase()}`;
			if (platformSeen.has(key)) continue;
			platformSeen.add(key);
			platformItems.push({
				...parsed,
				name: asset.name,
				size: asset.size,
				sha256: /^sha256:/i.test(asset.digest) ? asset.digest.slice(7).toLowerCase() : ''
			});
		}
	}

	const darwinInstallers = [];
	const linuxInstallers = [];
	for (const item of platformItems) {
		const urls = [];
		if (gitcodeBase && !args.noMirror) urls.push(downloadUrl(gitcodeBase, item.name));
		urls.push(downloadUrl(githubBase, item.name));
		for (const m of args.mirrors) urls.push(m);
		const entryInstaller = {
			arch: item.arch,
			ext: item.ext,
			name: item.name,
			urls: [...new Set(urls)],
			...(item.sha256 ? { sha256: item.sha256 } : {}),
			...(item.size ? { size: item.size } : {})
		};
		(item.platform === 'darwin' ? darwinInstallers : linuxInstallers).push(entryInstaller);
	}
	// 本地扫描与远程补充会混在一起，统一按「架构 → 自包含格式优先」排一次，客户端拿到的顺序才稳定
	const rankExt = (i) => (/^(dmg|appimage)$/i.test(String(i.ext)) ? 0 : 1);
	for (const list of [darwinInstallers, linuxInstallers]) {
		list.sort((a, b) => a.arch.localeCompare(b.arch) || rankExt(a) - rankExt(b) || a.ext.localeCompare(b.ext));
	}
	if (platformItems.length === 0) {
		console.warn(
			'[update-manifest] ⚠ 没找到 mac / linux 安装包（本机 dist 与 Release 附件都没有）\n' +
				'  mac/linux 客户端会退回「打开 Release 页面」。跨平台产物不在默认位置时用 --artifacts <目录> 指定。'
		);
	}

	if (!meta.sha256) console.warn('[update-manifest] ⚠ meta 没有 sha256，旧版客户端将跳过完整性校验');

	console.log(`[update-manifest] 桌面版本 ${version}（清单 tag，参与 semver 比较）`);
	console.log(`[update-manifest] 插件版本 ${tag}（Release tag，只拼下载地址，来源：${resolved.from}）`);
	if (winInstaller) {
		console.log(`[update-manifest] 安装包   ${winInstaller.name}  ${(winInstaller.size / 1024 / 1024).toFixed(1)}MB`);
		console.log(`[update-manifest] 校验     ${winInstaller.sha256}`);
	}
	for (const i of [...darwinInstallers, ...linuxInstallers]) {
		console.log(
			`[update-manifest] 跨平台   ${i.name}  ${i.arch}/${i.ext}  ${(i.size / 1024 / 1024).toFixed(1)}MB`
		);
	}

	const hasAnyInstaller = winInstaller || darwinInstallers.length || linuxInstallers.length;
	const entry = {
		tag: version,
		description: parseNotes(args.notes),
		...(hasAnyInstaller
			? {
					installers: {
						...(winInstaller ? { win32: winInstaller } : {}),
						...(darwinInstallers.length ? { darwin: darwinInstallers } : {}),
						...(linuxInstallers.length ? { linux: linuxInstallers } : {})
					}
			  }
			: {}),
		/*
		 * 旧版客户端（<= 3.2.0）只会读 url/urls 走 zip 就地更新。
		 * 保留这几个字段，它们才能升级到本版；新客户端会忽略。
		 */
		...(meta.sha256 && uniqueSources.length
			? { url: uniqueSources[0], ...(uniqueSources.length > 1 ? { urls: uniqueSources } : {}), sha256: meta.sha256, size: meta.size }
			: {}),
		app_downloads: {
			win32: downloadUrl(githubBase, foundInstaller?.name || winName),
			// 兜底链接：清单里没有对应平台安装包时（只发了 Windows）才用得上
			darwin: releasePage,
			linux: releasePage
		}
	};

	/**
	 * 发布前自检（默认开启，--no-verify 才跳过）。
	 *
	 * 清单一旦被客户端读到，就等于对用户承诺「这个版本可下载」。带病写入的后果是
	 * 用户弹了更新却下不了包 —— 比晚发版几分钟严重得多，所以这里 fail-closed。
	 *
	 * 分两层判断：
	 *  1) 本次新增条目：任一源不可用就终止。此刻 CI 可能还在传附件，也是唯一能当场修好的时机。
	 *  2) 历史条目：按「平台/格式」分组，某组所有源都失效才算坏。多源设计本来就允许
	 *     单源失败（客户端会自动回退），按单条 URL 判死会误伤。
	 */
	let deadEntries = [];
	if (args.verify) {
		console.log('[update-manifest] 探测本次新增条目的下载源…');
		const failed = [];
		for (const u of collectDownloadSources(entry)) {
			const r = await probeUrl(u);
			console.log(`  ${r.ok ? '✓' : '✗'} ${u}  (${r.detail})`);
			if (!r.ok) failed.push(u);
		}
		if (failed.length) {
			console.error(
				`\n[update-manifest] ${failed.length} 个下载源不可用，未写入清单。\n` +
					'通常是 CI 还没把附件传完（GitHub Release 或 GitCode 镜像），等上传结束再执行；\n' +
					'确实要先写清单可以加 --no-verify，但那样用户很可能检测到更新却下不了包。'
			);
			process.exitCode = 1;
			return;
		}
		deadEntries = await auditHistory(args, version);
	} else {
		console.warn(
			'\n[update-manifest] ⚠ 已跳过链路校验（--no-verify）。\n' +
				'  写进去的地址如果不存在，客户端会「检测到更新但下载失败」，只能等下一个版本覆盖。'
		);
	}

	const write = (file, label) => {
		const json = JSON.parse(fs.readFileSync(file, 'utf8'));
		const versions = Array.isArray(json.versions) ? json.versions : [];
		const deadTags = new Set(deadEntries.map((d) => String(d.tag)));
		const rest = versions.filter(
			(v) => v && String(v.tag).replace(/^v/, '') !== version && !deadTags.has(String(v.tag))
		);
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
		if (winInstaller) {
			console.log(`[update-manifest] 安装包   ${winInstaller.name}（${(winInstaller.size / 1024 / 1024).toFixed(1)}MB）`);
			for (const u of winInstaller.urls) console.log(`                    ${u}`);
		}
		if (uniqueSources.length) {
			console.log(`[update-manifest] 旧版 zip  ${uniqueSources.length} 个源（仅 <=3.2.0 客户端使用）`);
		}
		console.log(`[update-manifest] 校验     ${winInstaller?.sha256 || meta.sha256 || '（缺失）'}`);
		console.log('\n下一步：提交 website/api/ 的改动并推送，官网（Cloudflare Pages）部署后即生效。');
		console.log('提示：客户端每次请求都带时间戳，不需要担心 CDN 缓存。');
	}
}

if (require.main === module) {
	main().catch((e) => {
		console.error('[update-manifest] 执行失败:', e);
		process.exit(1);
	});
}

// 供测试直接引用纯函数（扫描文件名、解析参数），不重复实现一套
module.exports = {
	findPlatformInstallers,
	parseArtifactName,
	parseArgs,
	parseNotes,
	fetchReleaseAssets,
	// 纯函数，供健康检查脚本与测试复用，避免各写一套判断
	groupEntrySources,
	collectDownloadSources
};
