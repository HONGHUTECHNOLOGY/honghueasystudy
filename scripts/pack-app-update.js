#!/usr/bin/env node
// @ts-check

/**
 * 生成桌面端更新元数据（默认不再打就地更新包）
 * ---------------------------------------------------------------
 * **默认只写 dist/update/update-meta.json**：桌面端从 3.3 起走「下载 setup.exe →
 * 静默覆盖安装」，清单只读 installers 字段，就地更新包（app-<version>.zip）仅
 * 供 <=3.2.0 的旧客户端使用。旧客户端已停止覆盖，发版不再生成它。
 *
 * 生成的 meta 供 write-update-manifest.js 使用：版本号、tag 推导（rootVersion/tagHint）、
 * 以及（打 zip 时的）zip 文件名/sha256/size。没有 sha256 时清单会省略老客户端字段，
 * 见 write-update-manifest.js 里的守卫。
 *
 * 需要给旧客户端补一个就地更新包时，显式加 --with-zip：
 *   输入：honghueasystudy_desktop/packages/app/dist/win-unpacked/resources/app
 *   输出：dist/update/app-<version>.zip（根目录 = resources/app 内容，不带外层目录）
 *         dist/update/app-<version>.zip.sha256
 * 这与 electron-builder 的安装包不同：安装包是给全新安装用的。
 *
 * 用法：
 *   node scripts/pack-app-update.js                     # 只写 update-meta.json
 *   node scripts/pack-app-update.js --with-zip          # 额外打就地更新包
 *   node scripts/pack-app-update.js --dir <appDir> --out <outDir> --version 3.2.0 --with-zip
 *
 * 注意：zip 约 18MB / 解压约 58MB，超过 Cloudflare Pages 单文件 25MB 限制，
 * 只能放 GitHub Release 或对象存储；官网只放指向它的 JSON 清单。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

// yazl 由 gulp-zip 间接依赖，用 createRequire 稳定解析（与 pack-extension.js 一致）。
// 惰性加载：默认只写 meta 的路径不该因为压缩库缺失而失败。
function loadYazl() {
	const gulpZipRequire = createRequire(require.resolve('gulp-zip'));
	return gulpZipRequire('yazl');
}

const ROOT = path.resolve(__dirname, '..');
const APP_PKG = path.join(ROOT, 'honghueasystudy_desktop', 'packages', 'app', 'package.json');
/** 根 package.json = 插件（油猴脚本）版本线。发布用的是它的 tag，见下方 tagHint 说明 */
const ROOT_PKG = path.join(ROOT, 'package.json');
const DEFAULT_DIR = path.join(ROOT, 'honghueasystudy_desktop', 'packages', 'app', 'dist', 'win-unpacked', 'resources', 'app');
const DEFAULT_OUT = path.join(ROOT, 'honghueasystudy_desktop', 'packages', 'app', 'dist', 'update');

function parseArgs(argv) {
	// 默认只写更新元数据；--with-zip 才额外打就地更新包（仅旧客户端需要）
	const out = { dir: DEFAULT_DIR, out: DEFAULT_OUT, version: null, withZip: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--dir') out.dir = path.resolve(argv[++i]);
		else if (a === '--out') out.out = path.resolve(argv[++i]);
		else if (a === '--version') out.version = argv[++i];
		else if (a === '--with-zip') out.withZip = true;
		else if (a === '--no-zip') out.withZip = false;
		else if (a === '-h' || a === '--help') out.help = true;
	}
	return out;
}

/**
 * 是否跳过某个文件。
 * @param {string} relPath 以 / 分隔的相对路径
 * @param {string} name 文件名
 */
function shouldSkip(relPath, name) {
	if (name === '.DS_Store' || name === 'Thumbs.db' || name.endsWith('.tmp')) return true;
	// 更新过程中的临时目录，正常情况下在 app 目录外，这里兜底
	if (relPath === 'pending-update' || relPath.startsWith('pending-update/')) return true;
	// tsc 输出目录里混入的历史打包产物（lib/dist-3.1.0、lib/dist-final …，共 4 份 248 个文件）：
	// 不参与运行（入口是 lib/index.js），留着会让每次打包把上一次的完整产物再包一遍
	if (relPath === 'lib/dist-3.1.0' || relPath === 'lib/dist-final' || relPath === 'lib/dist-release' || relPath === 'lib/dist-ship') {
		return true;
	}
	if (/^lib\/dist-[^/]+/.test(relPath)) return true;
	return false;
}

/** @returns {{ abs: string, relPath: string }[]} */
function collect(dir, rel = '', skipped = { count: 0 }) {
	/** @type {{ abs: string, relPath: string }[]} */
	const files = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const abs = path.join(dir, entry.name);
		const relPath = rel ? rel + '/' + entry.name : entry.name;
		if (shouldSkip(relPath, entry.name)) {
			skipped.count++;
			continue;
		}
		if (entry.isDirectory()) {
			files.push(...collect(abs, relPath, skipped));
		} else {
			files.push({ abs, relPath });
		}
	}
	return files;
}

function sha256File(file) {
	return new Promise((resolve, reject) => {
		const hash = crypto.createHash('sha256');
		fs.createReadStream(file)
			.on('data', (c) => hash.update(c))
			.on('end', () => resolve(hash.digest('hex')))
			.on('error', reject);
	});
}

function readVersion() {
	return JSON.parse(fs.readFileSync(APP_PKG, 'utf8')).version;
}

function readRootVersion() {
	try {
		return String(JSON.parse(fs.readFileSync(ROOT_PKG, 'utf8')).version || '').trim();
	} catch {
		return '';
	}
}

function fail(msg) {
	console.error('[pack-app-update] ' + msg);
	process.exit(1);
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	if (args.help) {
		console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
		return;
	}

	const version = args.version || readVersion();
	const rootVersion = readRootVersion();
	/**
	 * Release tag 用插件版本（根 package.json），不用桌面版本。
	 * 扩展和桌面安装包是一起发到同一个 Release 的，tag 一直是 v5.x.x 这条线；
	 * 桌面版本（3.x）只作为清单里参与 semver 比较的 tag 字段。
	 * 若桌面端要脱离插件单独发版，打包/写清单时显式传 --tag desktop-v<x.y.z>。
	 */
	const tagHint = rootVersion ? `v${rootVersion}` : `desktop-v${version}`;
	const metaPath = path.join(args.out, 'update-meta.json');
	fs.mkdirSync(args.out, { recursive: true });

	// 默认路径：只写元数据。安装包已经覆盖了更新所需的一切，
	// 不再生成只为 <=3.2.0 旧客户端服务的 zip（省一次 18MB 的打包与上传）
	if (!args.withZip) {
		const meta = {
			version,
			rootVersion: rootVersion || null,
			tagHint,
			builtAt: new Date().toISOString()
		};
		fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
		console.log('[pack-app-update] 已生成更新元数据（未打就地更新包）');
		console.log(`  桌面版本  ${version}`);
		console.log(`  插件版本  ${rootVersion || '（未读到根 package.json）'}`);
		console.log(`  文件      ${path.relative(ROOT, metaPath)}`);
		console.log('  说明      客户端走 installers.win32（setup.exe 覆盖安装），');
		console.log('            app-*.zip 只服务 <=3.2.0 旧客户端，已停止生成（需要时加 --with-zip）');
		return;
	}

	if (!fs.existsSync(args.dir)) {
		fail(
			`找不到 app 目录：${args.dir}\n` +
				'请先执行桌面端打包（npx gulp -f ./scripts/build-app.js），它会生成 dist/win-unpacked/。'
		);
	}
	// 结构校验：解压后必须能直接启动，否则更新等于把用户软件弄坏
	if (!fs.existsSync(path.join(args.dir, 'package.json'))) fail('app 目录缺少 package.json');
	if (!fs.existsSync(path.join(args.dir, 'lib', 'index.js'))) fail('app 目录缺少 lib/index.js（未编译？）');

	const skipped = { count: 0 };
	const files = collect(args.dir, '', skipped).sort((a, b) => a.relPath.localeCompare(b.relPath));
	if (files.length === 0) fail('app 目录为空，打包中止');
	if (skipped.count) console.log(`[pack-app-update] 跳过 ${skipped.count} 个历史打包残留（lib/dist-*）`);
	const outFile = path.join(args.out, `app-${version}.zip`);
	const tmpFile = outFile + '.tmp';

	const zip = new (loadYazl().ZipFile)();
	for (const f of files) {
		zip.addFile(f.abs, f.relPath, { mtime: new Date() });
	}

	await new Promise((resolve, reject) => {
		zip.outputStream
			.pipe(fs.createWriteStream(tmpFile))
			.on('close', resolve)
			.on('error', reject);
		zip.end();
	});

	fs.renameSync(tmpFile, outFile);

	const size = fs.statSync(outFile).size;
	const sha256 = await sha256File(outFile);
	fs.writeFileSync(outFile + '.sha256', `${sha256}  app-${version}.zip\n`);

	const meta = {
		version,
		rootVersion: rootVersion || null,
		file: `app-${version}.zip`,
		size,
		sha256,
		entries: files.length,
		skipped: skipped.count,
		tagHint,
		builtAt: new Date().toISOString()
	};
	fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

	console.log(`[pack-app-update] 打包完成`);
	console.log(`  桌面版本  ${version}`);
	console.log(`  插件版本  ${rootVersion || '（未读到根 package.json）'}`);
	console.log(`  文件      ${path.relative(ROOT, outFile)}  (${(size / 1024 / 1024).toFixed(2)} MB)`);
	console.log(`  条目      ${files.length} 个`);
	console.log(`  SHA256    ${sha256}`);
	console.log(`\n注意：新版客户端走「下载安装包 → 静默覆盖安装」，本 zip 只用于让 <=3.2.0 的旧客户端还能升级上来。`);
	console.log(`下一步：与安装包一起上传到同一个 Release（tag: ${tagHint}），然后执行`);
	console.log(`  node scripts/write-update-manifest.js --meta ${path.relative(ROOT, metaPath)}`);
}

main().catch((e) => {
	console.error('[pack-app-update] 打包失败:', e);
	process.exit(1);
});
