/**
 * 把仓库根目录 `extension/`（构建产物）同步到桌面版内置扩展目录
 *   honghueasystudy_desktop/packages/app/resources/extension/
 *
 * 目的：桌面版打包时永远带上刚构建出来的最新扩展，不再依赖手工 cp。
 * 由 `scripts/build-app.js`（gulp build）与 `packages/app` 的 dev 脚本在打包/启动前调用，
 * 也可以单独执行：
 *   node scripts/sync-extension.js      # 在 honghueasystudy_desktop 目录下
 *
 * 规则：
 * - 源目录必须存在 manifest.json，否则直接报错并提示先跑 `pnpm build:ext`
 * - 目标目录先清空再复制（避免残留旧文件），跳过 *.zip 与 .DS_Store
 *   （extension.zip 是历史遗留包，运行时并不使用，见 utils/browser.ts 的 .zip 过滤）
 * - 若 packages/scripts/src 比根扩展产物新，打印警告（说明可能忘了重新构建扩展）
 */

const fs = require('fs');
const path = require('path');

const DESKTOP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..');
const SRC = path.join(REPO_ROOT, 'extension');
const DEST = path.join(DESKTOP_ROOT, 'packages', 'app', 'resources', 'extension');
const SCRIPT_SRC = path.join(REPO_ROOT, 'packages', 'scripts', 'src');

const SKIP_FILE = (name) => name === '.DS_Store' || name.toLowerCase().endsWith('.zip');

function readManifest(dir) {
	const p = path.join(dir, 'manifest.json');
	if (!fs.existsSync(p)) return null;
	try {
		return JSON.parse(fs.readFileSync(p, 'utf-8'));
	} catch {
		return null;
	}
}

function copyTree(src, dest, stats) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		if (SKIP_FILE(entry.name)) continue;
		const s = path.join(src, entry.name);
		const d = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			copyTree(s, d, stats);
		} else if (entry.isFile()) {
			fs.copyFileSync(s, d);
			stats.files++;
			stats.bytes += fs.statSync(s).size;
		}
	}
}

function newestMtime(dir, current = 0) {
	let newest = current;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			newest = newestMtime(p, newest);
		} else if (entry.isFile()) {
			try {
				newest = Math.max(newest, fs.statSync(p).mtimeMs);
			} catch {}
		}
	}
	return newest;
}

function mb(bytes) {
	return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

async function syncExtension() {
	const srcManifest = readManifest(SRC);
	if (!srcManifest) {
		throw new Error(
			`[sync-extension] 找不到 ${path.relative(REPO_ROOT, SRC)}/manifest.json。\n` +
				`请先在仓库根目录执行：pnpm build:ext（或 node node_modules/gulp/bin/gulp.js -f ./scripts/build-extension.js）`
		);
	}

	// 关键产物缺失说明根扩展没构建完整（lib/index.js、main-world.js 都是构建产物）
	const required = ['manifest.json', 'background.js', 'lib/index.js', 'content/main-world.js'];
	const missing = required.filter((f) => !fs.existsSync(path.join(SRC, f)));
	if (missing.length) {
		throw new Error(
			`[sync-extension] ${path.relative(REPO_ROOT, SRC)} 缺少构建产物：${missing.join(', ')}\n` +
				`请先在仓库根目录执行：pnpm build:ext`
		);
	}

	// 源产物比源码旧 → 提醒可能忘记重建
	try {
		const built = fs.statSync(path.join(SRC, 'content', 'main.js')).mtimeMs;
		const srcNewest = fs.existsSync(SCRIPT_SRC) ? newestMtime(SCRIPT_SRC) : 0;
		if (srcNewest > built + 5000) {
			console.warn(
				`[sync-extension] ⚠ packages/scripts/src 的修改时间比 ${path.join('extension', 'content', 'main.js')} 更新，` +
					`内置扩展可能不是最新构建，建议先执行 pnpm build:ext`
			);
		}
	} catch {}

	const oldManifest = readManifest(DEST);
	fs.rmSync(DEST, { recursive: true, force: true });
	const stats = { files: 0, bytes: 0 };
	copyTree(SRC, DEST, stats);

	const ver = `v${srcManifest.version}`;
	const changed = oldManifest?.version !== srcManifest.version ? '（版本变化）' : '';
	console.log(
		`[sync-extension] ${ver}${changed} · ${stats.files} 个文件 · ${mb(stats.bytes)} → ${path
			.relative(DESKTOP_ROOT, DEST)
			.replace(/\\/g, '/')}`
	);
	return stats;
}

module.exports = syncExtension;
module.exports.syncExtension = syncExtension;

if (require.main === module) {
	syncExtension().catch((e) => {
		console.error(e.message || e);
		process.exit(1);
	});
}
