import path from 'path';
import { app } from 'electron';

/**
 * 内置 OCR 模块压缩包所在目录。
 *
 * - 打包模式：`resources/bin/ocr`
 *   （electron-builder 的 extraResources 把 `bin/ocr/<platform>-<arch>/` 拍平到此）
 * - 开发模式：`<projectRoot>/bin/ocr/<platform>-<arch>`
 *   （scripts/ocr.install.js 的下载输出到该平台子目录）
 *
 * 平台串 `<platform>-<arch>` 与 ocr.install.js 的 `${PLATFORM || 'win'}-${ARCH || 'x64'}` 保持一致。
 * 上游只有 win / mac 两种构建（mac 包 x64/arm64 通用），linux 无 OCR 包。
 */
export function getBuiltinOcrRoot(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, 'bin', 'ocr');
	}
	const platformName = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
	// dev 下 app.getAppPath() 为 packages/app，../.. 回到项目根目录
	return path.join(app.getAppPath(), '..', '..', 'bin', 'ocr', `${platformName}-${process.arch}`);
}
