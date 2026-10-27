import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
/**
 * 获取浏览器主版本号
 * @param executablePath 浏览器可执行文件路径
 */
export function getBrowserMajorVersion(executablePath: string) {
	if (fs.existsSync(executablePath) === false) return;
	if (process.platform === 'darwin') {
		// 内置浏览器的版本查找方法
		const versionsFolder = path.join(
			path.dirname(executablePath),
			'..',
			'./Frameworks/Google Chrome for Testing Framework.framework/Versions/'
		);
		const exists = fs.existsSync(versionsFolder);
		if (exists === false) return;
		const versions = fs
			.readdirSync(versionsFolder)
			.filter((f) => f !== '.DS_Store' && fs.statSync(path.join(versionsFolder, f)).isDirectory())
			.filter((f) => f.split('.').length > 1);

		if (versions.length === 0) return;
		const version = versions
			.map((v) => {
				const major = parseInt(v.split('.')[0]);
				if (isNaN(major)) return 0;
				return major;
			})
			.sort((a, b) => b - a)[0];
		if (version === 0) return;
		return version;
	}

	// 普通浏览器的版本查找方法
	let manifest = fs.readdirSync(path.dirname(executablePath)).find((f) => {
		const file = path.join(path.dirname(executablePath), f);
		return fs.statSync(file).isDirectory() && fs.readdirSync(file).some((f) => f.endsWith('.manifest'));
	});
	if (!manifest) {
		// 内置浏览器的版本查找方法
		manifest = fs.readdirSync(path.dirname(executablePath)).find((f) => f.endsWith('.manifest'));
	}
	if (manifest && manifest.split('.').length > 1) {
		return parseInt(manifest.split('.')[0]);
	}

	// mac 上普通浏览器的 Framework 目录名与内置浏览器不同（如 Google Chrome Framework），
	// 目录查找对第三方浏览器也不可靠，兜底直接运行 --version 获取
	// （Windows 下该命令无输出且可能闪窗，仅限 mac/linux 使用）
	if (process.platform !== 'win32') {
		try {
			const versionOutput = child_process.execFileSync(executablePath, ['--version'], {
				encoding: 'utf-8'
			});
			const match = versionOutput.match(/(\d+)\./);
			if (!match) return;
			const major = parseInt(match[1]);
			if (isNaN(major)) return;
			return major;
		} catch {}
	}
}

export function getExtensionPaths(extensionsFolder: string) {
	return fs
		.readdirSync(extensionsFolder)
		.filter((f) => f !== '.DS_Store')
		.filter((f) => !f.endsWith('.zip'))
		/**
		 * 排除同步扩展时留下的备份目录（如「鸿鹄易学.bak-20261026-134537」）。
		 * 备份目录带着完整的 manifest.json，会被当成第二个同名扩展一起加载，
		 * 导致两个扩展实例重复注入 content script、争抢 chrome.userScripts 与 storage。
		 */
		.filter((f) => !/\.bak([-_.]|$)/i.test(f))
		.map((file) => path.join(extensionsFolder, file));
}

/** 只返回鸿鹄易学内置扩展，避免加载脚本猫/篡改猴等外部脚本管理器 */
export function getBuiltinExtensionPaths(extensionsFolder: string) {
	return getExtensionPaths(extensionsFolder).filter((extensionPath) => {
		try {
			const manifest = JSON.parse(fs.readFileSync(path.join(extensionPath, 'manifest.json'), 'utf-8'));
			return manifest?.name === '鸿鹄易学';
		} catch {
			return false;
		}
	});
}
