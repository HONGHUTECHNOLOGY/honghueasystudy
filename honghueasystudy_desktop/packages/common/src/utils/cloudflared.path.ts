import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/** cloudflared 可执行文件名（Windows 带 .exe） */
export const CLOUDFLARED_BINARY_NAME = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';

/**
 * 内置 cloudflared 目录。
 *
 * - 打包模式：`resources/bin/cloudflared`
 *   （electron-builder 的 extraResources 把 `bin/cloudflared/<platform>-<arch>/` 拍平到此）
 * - 开发模式：`<projectRoot>/bin/cloudflared/<platform>-<arch>`
 *   （scripts/cloudflared.install.js 的下载输出到该平台子目录）
 *
 * 与 OCR 的做法一致：构建期把二进制放进 bin 目录，运行时优先使用内置版本，
 * 缺失时再回退在线下载。
 */
export function getBuiltinCloudflaredRoot(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, 'bin', 'cloudflared');
	}
	const platformName = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
	// dev 下 app.getAppPath() 为 packages/app，../.. 回到项目根目录
	return path.join(app.getAppPath(), '..', '..', 'bin', 'cloudflared', `${platformName}-${process.arch}`);
}

/** 内置二进制完整路径；未内置时返回空字符串 */
export function getBuiltinCloudflaredBinary(): string {
	try {
		const binary = path.join(getBuiltinCloudflaredRoot(), CLOUDFLARED_BINARY_NAME);
		return fs.existsSync(binary) ? binary : '';
	} catch {
		return '';
	}
}

/** 是否已内置 cloudflared */
export function hasBuiltinCloudflared(): boolean {
	return !!getBuiltinCloudflaredBinary();
}
