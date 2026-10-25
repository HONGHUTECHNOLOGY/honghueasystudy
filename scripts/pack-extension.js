// @ts-check

/**
 * 将 extension/ 目录打包为 extension/extension.zip
 *
 * 结构与既有发布包保持一致：zip 根目录直接是 manifest.json / background.js / content / lib / icon / _locales，
 * 解压后可直接「加载已解压的扩展程序」，也可直接提交商店。
 *
 * 用法：node scripts/pack-extension.js
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const extDir = path.resolve(__dirname, '../extension');
const outFile = path.join(extDir, 'extension.zip');

// yazl 由 gulp-zip 间接依赖，用 createRequire 稳定解析
const gulpZipRequire = createRequire(require.resolve('gulp-zip'));
const yazl = gulpZipRequire('yazl');

/** 不参与打包的文件 / 目录 */
const IGNORE = new Set(['extension.zip', '.DS_Store', 'Thumbs.db', 'node_modules', '.git']);

function collect(dir, rel = '') {
	/** @type {{ abs: string, relPath: string }[]} */
	const files = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (IGNORE.has(entry.name)) continue;
		const abs = path.join(dir, entry.name);
		const relPath = rel ? rel + '/' + entry.name : entry.name;
		if (entry.isDirectory()) {
			files.push(...collect(abs, relPath));
		} else {
			files.push({ abs, relPath });
		}
	}
	return files;
}

function pack() {
	if (!fs.existsSync(path.join(extDir, 'manifest.json'))) {
		throw new Error('extension/manifest.json 不存在，请先执行 pnpm build:ext');
	}

	const files = collect(extDir).sort((a, b) => a.relPath.localeCompare(b.relPath));
	if (files.length === 0) {
		throw new Error('extension 目录为空，打包中止');
	}

	const zip = new yazl.ZipFile();
	for (const file of files) {
		zip.addFile(file.abs, file.relPath, { mtime: new Date() });
	}

	const tmpFile = outFile + '.tmp';
	return new Promise((resolve, reject) => {
		zip.outputStream
			.pipe(fs.createWriteStream(tmpFile))
			.on('close', () => {
				try {
					fs.renameSync(tmpFile, outFile);
					const size = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
					console.log(`[pack-extension] 已打包 ${files.length} 个文件 -> ${outFile} (${size} MB)`);
					for (const file of files) {
						console.log('  ' + file.relPath);
					}
					resolve(undefined);
				} catch (e) {
					reject(e);
				}
			})
			.on('error', reject);
		zip.end();
	});
}

pack().catch((err) => {
	console.error('[pack-extension] 打包失败:', err);
	process.exit(1);
});
