import path from 'path';
import fs from 'fs';
import { store } from '../store';
import { canOCR } from '../utils/ocr';
import { downloadFile, unzip } from '../utils';
import { getBuiltinOcrRoot } from '@honghu-desktop/common';
import { Logger } from '../logger';

const logger = Logger('ocr-init');

/** 在线下载兜底地址（安装包未内置 OCR 或解压失败时使用；mac 包 x64/arm64 通用） */
const OCR_URL =
	process.platform === 'darwin'
		? 'https://cdn.ocsjs.com/app/download/extensions/ocr-darwin.zip'
		: 'https://cdn.ocsjs.com/app/download/ocr.zip';

/**
 * 验证码识别模块是自动登录滑块的必需依赖。
 * 优先解压安装包内置的 ocr.zip（scripts/ocr.install.js 打包时放入），无需联网；
 * 内置缺失（开发模式/旧安装包）时回退在线下载。解压到 downloads/apps/ocr，不阻塞主界面启动。
 */
export async function initOcr() {
	if (process.platform !== 'win32' && process.platform !== 'darwin') return;
	if (canOCR()) return;

	const appsDir = path.join(store.store.paths.downloadFolder, 'apps');
	const ocrDir = path.join(appsDir, 'ocr');
	const zipPath = path.join(appsDir, 'ocr.zip');

	fs.mkdirSync(appsDir, { recursive: true });

	// 内置优先
	const builtinZip = path.join(getBuiltinOcrRoot(), 'ocr.zip');
	if (fs.existsSync(builtinZip)) {
		try {
			logger.log('检测到内置 OCR 模块，开始解压：' + builtinZip);
			await unzip(builtinZip, ocrDir);
			ensureOcrExecutablePermission(ocrDir);
			logger.log('OCR 模块安装完成：' + ocrDir);
			return;
		} catch (e) {
			logger.error('内置 OCR 解压失败，回退到在线下载', e);
		}
	}

	try {
		logger.log('未检测到 OCR 模块，开始下载：' + OCR_URL);
		await downloadFile(OCR_URL, zipPath, () => {});
		await unzip(zipPath, ocrDir);
		ensureOcrExecutablePermission(ocrDir);
		logger.log('OCR 模块安装完成：' + ocrDir);
	} catch (e) {
		logger.error('OCR 模块安装失败', e);
	} finally {
		if (fs.existsSync(zipPath)) {
			fs.rmSync(zipPath, { force: true });
		}
	}
}

/** JS 解压库不保留可执行权限，非 Windows 需给 ocr 主程序补 +x */
function ensureOcrExecutablePermission(ocrDir: string) {
	if (process.platform === 'win32') return;
	const binary = path.join(ocrDir, 'ocr');
	if (fs.existsSync(binary)) {
		try {
			fs.chmodSync(binary, 0o755);
		} catch (e) {
			logger.error('chmod ocr binary failed', e);
		}
	}
}
