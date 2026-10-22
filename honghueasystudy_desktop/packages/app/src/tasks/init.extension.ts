import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Logger } from '../logger';
import { store } from '../store';
import { valid, coerce, clean, gt, SemVer } from 'semver';

const logger = Logger('extension-init');

/** 内置扩展源路径：打包态 resources/extension，开发态 packages/app/public/extension */
function getBuiltinExtensionPath(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, 'extension');
	}
	return path.resolve('./resources/extension');
}

function parseVersion(v: string) {
	return new SemVer(valid(coerce(clean(v, { loose: true }))) || '0.0.0');
}

function copyDirSync(src: string, dest: string) {
	const entries = fs.readdirSync(src, { withFileTypes: true });
	for (const entry of entries) {
		const s = path.join(src, entry.name);
		const d = path.join(dest, entry.name);
		if (entry.isDirectory()) {
			fs.mkdirSync(d, { recursive: true });
			copyDirSync(s, d);
		} else if (entry.isFile()) {
			fs.copyFileSync(s, d);
		}
	}
}

/** 递归累加目录内容哈希（跳过 .zip / .DS_Store，与 copyDir 的复制范围无关，仅用于比对） */
function collectHash(dir: string, base: string, hash: crypto.Hash) {
	const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
	for (const entry of entries) {
		if (entry.name === '.DS_Store' || entry.name.toLowerCase().endsWith('.zip')) continue;
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			collectHash(p, base, hash);
		} else if (entry.isFile()) {
			hash.update(path.relative(base, p).replace(/\\/g, '/'));
			hash.update('\0');
			hash.update(fs.readFileSync(p));
		}
	}
}

/**
 * 目录内容指纹。
 * 只比版本号是不够的：桌面版主版本没变、扩展重新构建（版本号相同）时，
 * 老逻辑会认为"已是最新"而拒绝覆盖，导致浏览器一直加载旧扩展。
 */
function fingerprint(dir: string): string {
	const hash = crypto.createHash('sha1');
	collectHash(dir, dir, hash);
	return hash.digest('hex').slice(0, 16);
}

/** 清理旧版本自动下载的脚本管理器，避免浏览器继续加载脚本猫/篡改猴等扩展 */
function removeLegacyScriptManagers(extensionsFolder: string, keepName: string) {
	const legacyPattern = /(^|[\s_-])(scriptcat|tampermonkey|violentmonkey|ocs)([\s_-]|$)|脚本猫|篡改猴/i;
	for (const entry of fs.readdirSync(extensionsFolder)) {
		if (entry === keepName) continue;
		const entryPath = path.join(extensionsFolder, entry);
		let name = entry;
		try {
			const manifestPath = path.join(entryPath, 'manifest.json');
			if (fs.existsSync(manifestPath)) {
				name = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))?.name || entry;
			}
		} catch {}
		if (!legacyPattern.test(name) && !legacyPattern.test(entry)) continue;
		try {
			fs.rmSync(entryPath, { recursive: true, force: true });
			logger.log(`已清理旧脚本管理器：${entry}`);
		} catch (e) {
			logger.error(`清理旧脚本管理器失败：${entry}`, e);
		}
	}
}

/**
 * 初始化内置鸿鹄易学扩展
 * 将打包内置的扩展释放到 extensionsFolder，供浏览器启动时 --load-extension 自动加载
 * 仅当目标不存在或内置版本更高时才覆盖，避免反复写盘
 */
export async function initExtension() {
	try {
		const src = getBuiltinExtensionPath();
		const srcManifestPath = path.join(src, 'manifest.json');
		if (!fs.existsSync(srcManifestPath)) {
			logger.log('内置扩展不存在，跳过');
			return;
		}

		const srcManifest = JSON.parse(fs.readFileSync(srcManifestPath, 'utf-8'));
		const extName: string = srcManifest.name || '鸿鹄易学';
		const extVersion: string = srcManifest.version || '0.0.0';

		const extensionsFolder = store.store.paths.extensionsFolder;
		if (!fs.existsSync(extensionsFolder)) {
			fs.mkdirSync(extensionsFolder, { recursive: true });
		}
		removeLegacyScriptManagers(extensionsFolder, extName);

		const dest = path.join(extensionsFolder, extName);
		const destManifestPath = path.join(dest, 'manifest.json');

		let needRelease = true;
		if (fs.existsSync(destManifestPath)) {
			try {
				const destManifest = JSON.parse(fs.readFileSync(destManifestPath, 'utf-8'));
				const destVersion: string = destManifest.version || '0.0.0';
				const versionNewer = gt(parseVersion(extVersion), parseVersion(destVersion));
				// 同版本号但内容不同（扩展被重新构建过）同样需要覆盖释放
				const contentChanged = fingerprint(src) !== fingerprint(dest);
				needRelease = versionNewer || contentChanged;
				if (contentChanged && !versionNewer) {
					logger.log(`内置扩展 v${extVersion} 内容已变化（同版本号重新构建），重新释放`);
				}
			} catch {
				needRelease = true;
			}
		}

		if (!needRelease) {
			logger.log(`内置扩展 ${extName} v${extVersion} 已是最新，无需释放`);
			return;
		}

		fs.rmSync(dest, { recursive: true, force: true });
		fs.mkdirSync(dest, { recursive: true });
		copyDirSync(src, dest);
		logger.log(`内置扩展 ${extName} v${extVersion} 已释放到 ${dest}`);
	} catch (e) {
		logger.error('初始化内置扩展失败', e);
	}
}
