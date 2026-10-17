import path from 'path';
import fs from 'fs';
import { store } from '../store';
import { canOCR } from '../utils/ocr';
import { downloadFile, unzip } from '../utils';
import { Logger } from '../logger';

const logger = Logger('ocr-init');

const OCR_URL =
	process.platform === 'darwin'
		? 'https://cdn.ocsjs.com/app/download/extensions/ocr-darwin.zip'
		: 'https://cdn.ocsjs.com/app/download/ocr.zip';

/**
 * 验证码识别模块是自动登录滑块的必需依赖。
 * 首次启动时如果缺失则后台下载并解压到 downloads/apps/ocr，不阻塞主界面启动。
 */
export async function initOcr() {
	if (process.platform !== 'win32' && process.platform !== 'darwin') return;
	if (canOCR()) return;

	const appsDir = path.join(store.store.paths.downloadFolder, 'apps');
	const ocrDir = path.join(appsDir, 'ocr');
	const zipPath = path.join(appsDir, 'ocr.zip');

	try {
		fs.mkdirSync(appsDir, { recursive: true });
		logger.log('未检测到 OCR 模块，开始下载：' + OCR_URL);
		await downloadFile(OCR_URL, zipPath, () => {});
		await unzip(zipPath, ocrDir);
		fs.rmSync(zipPath, { force: true });
		logger.log('OCR 模块安装完成：' + ocrDir);
	} catch (e) {
		logger.error('OCR 模块安装失败', e);
	} finally {
		if (fs.existsSync(zipPath)) {
			fs.rmSync(zipPath, { force: true });
		}
	}
}
