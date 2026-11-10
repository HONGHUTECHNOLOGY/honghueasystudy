import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { Logger } from '../logger';
import { store } from '../store';

const logger = Logger('extension-init');

/** 内置扩展源路径：打包态 resources/extension，开发态 packages/app/public/extension */
function getBuiltinExtensionPath(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, 'extension');
	}
	return path.resolve('./resources/extension');
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
 *
 * 把打包内置的扩展释放到 extensionsFolder，供浏览器 --load-extension 自动加载。
 *
 * 这里刻意不做「版本更高才释放」的判断：扩展与主程序的版本号并不总是同步变化
 * （开发期反复重建、只换扩展的热修、用户装的是更早的主程序）。一旦按版本号跳过，
 * 浏览器就会一直加载旧扩展，表现成「改了代码但怎么都不生效」——排查
 * 「必须刷新才能开始答题」时，正是旧扩展里没有新逻辑导致的。
 *
 * 扩展只有 4 MB 出头，每次启动全量同步的代价远小于「最新逻辑没被用上」。
 * 每次都先删掉目标目录再重建，避免旧版本残留的多余文件被一起加载。
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
		// 浏览器可能还加载着旧目录，个别文件会被占用；失败时退化为覆盖复制
		try {
			fs.rmSync(dest, { recursive: true, force: true });
		} catch (e) {
			logger.error('清理旧扩展目录失败，改为覆盖复制', e);
		}
		fs.mkdirSync(dest, { recursive: true });
		copyDirSync(src, dest);
		logger.log(`内置扩展 ${extName} v${extVersion} 已同步到 ${dest}`);
	} catch (e) {
		logger.error('初始化内置扩展失败', e);
	}
}
