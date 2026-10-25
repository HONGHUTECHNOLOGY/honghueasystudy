import path from 'path';
import fs from 'fs';
import child_process from 'child_process';
import { store } from '../store';
import { canOCR } from '../utils/ocr';
import { downloadFile, unzip } from '../utils';
import { getBuiltinOcrRoot } from '@honghu-desktop/common';
import { Logger } from '../logger';

const logger = Logger('ocr-init');

/** 在线下载兜底地址（仅 win / mac 使用）。mac 包 x64/arm64 通用；linux 为纯内置分发，无在线下载路径 */
function getOcrDownloadUrl() {
	if (process.platform === 'darwin') {
		return 'https://cdn.ocsjs.com/app/download/extensions/ocr-darwin.zip';
	}
	return 'https://cdn.ocsjs.com/app/download/ocr.zip';
}

/**
 * 验证码识别模块是自动登录滑块的必需依赖。
 * 优先解压安装包内置的 ocr.zip（scripts/ocr.install.js 打包时放入），无需联网。
 * - win / mac：内置缺失（开发模式/旧安装包）或解压失败时回退在线下载。
 * - linux：纯内置分发，仅从内置资源解压安装；内置缺失或解压失败时静默降级 canOCR=false，
 *   不发起任何网络请求。
 * 解压到 downloads/apps/ocr，不阻塞主界面启动；win / mac / linux 三平台均执行初始化，
 * linux 按运行架构校验产物 ELF 架构，失败静默降级。
 */
export async function initOcr() {
	if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') return;
	// 幂等：已安装且可执行（canOCR 含非 Windows 的 +x 判定）时跳过，不重复解压/下载
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
			await extractOcrZip(builtinZip, ocrDir);
			verifyOcrArchitecture(ocrDir);
			logger.log('OCR 模块安装完成：' + ocrDir);
			return;
		} catch (e) {
			logger.error('内置 OCR 解压失败', e);
			removeOcrDir(ocrDir);
			// linux 纯内置分发：解压失败直接降级，不回退在线下载
			if (process.platform === 'linux') return;
		}
	} else if (process.platform === 'linux') {
		// linux 纯内置分发：内置资源缺失（开发模式/异常安装包）时静默降级，不发起任何网络请求
		logger.warn('未检测到内置 OCR 模块，Linux 无在线下载路径，OCR 功能降级');
		return;
	}

	// win / mac 在线下载兜底（内置缺失或解压失败时）
	try {
		const ocrUrl = getOcrDownloadUrl();
		logger.log('未检测到 OCR 模块，开始下载：' + ocrUrl);
		await downloadFile(ocrUrl, zipPath, () => {});
		await extractOcrZip(zipPath, ocrDir);
		verifyOcrArchitecture(ocrDir);
		logger.log('OCR 模块安装完成：' + ocrDir);
	} catch (e) {
		logger.error('OCR 模块安装失败', e);
		removeOcrDir(ocrDir);
	} finally {
		if (fs.existsSync(zipPath)) {
			fs.rmSync(zipPath, { force: true });
		}
	}
}

/**
 * 解压 OCR 资源包。
 * linux 优先用系统 unzip：JS 解压库不保留可执行权限与符号链接（参照 init.chrome.ts 先例），
 * 系统命令缺失（部分精简发行版）时回退到 JS 解压 + ensureOcrExecutablePermission 补权限。
 */
async function extractOcrZip(zipPath: string, ocrDir: string) {
	if (process.platform === 'linux') {
		try {
			child_process.execFileSync('unzip', ['-o', zipPath, '-d', ocrDir], { stdio: 'ignore' });
			ensureOcrExecutablePermission(ocrDir);
			return;
		} catch (e) {
			logger.warn('系统 unzip 不可用，回退到内置解压', e);
		}
	}
	await unzip(zipPath, ocrDir);
	ensureOcrExecutablePermission(ocrDir);
}

/** ELF 机器类型（e_machine）与 Node process.arch 的对应关系 */
const ELF_MACHINE_TYPES: Record<string, number> = {
	x64: 0x3e, // EM_X86_64
	arm64: 0xb7 // EM_AARCH64
};

/**
 * linux 下校验安装产物架构与运行架构一致（x64 系统装到 arm64 包或反之时拒绝安装）。
 * 校验失败抛出异常，由调用方清理安装目录，canOCR() 保持 false，不产生半成品目录。
 */
function verifyOcrArchitecture(ocrDir: string) {
	if (process.platform !== 'linux') return;
	const binary = path.join(ocrDir, 'ocr');
	if (!fs.existsSync(binary)) {
		throw new Error('OCR 安装产物缺少 ocr 可执行文件');
	}
	const fd = fs.openSync(binary, 'r');
	try {
		const buf = Buffer.alloc(20);
		fs.readSync(fd, buf, 0, buf.length, 0);
		// ELF 魔数 0x7f 'E' 'L' 'F'，e_machine 为第 18-19 字节（小端）
		if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
			throw new Error('OCR 产物不是有效的 ELF 可执行文件');
		}
		const machine = buf[18] | (buf[19] << 8);
		const expected = ELF_MACHINE_TYPES[process.arch];
		if (expected === undefined || machine !== expected) {
			throw new Error(`OCR 产物架构不匹配：期望 ${process.arch}（e_machine=${expected}），实际 e_machine=${machine}`);
		}
		logger.log(`OCR 产物架构校验通过：${process.arch}`);
	} finally {
		fs.closeSync(fd);
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

/** 清理半成品安装目录（解压/下载/架构校验失败路径），保证下次启动可重试且 canOCR 不误报 */
function removeOcrDir(ocrDir: string) {
	try {
		if (fs.existsSync(ocrDir)) {
			fs.rmSync(ocrDir, { recursive: true, force: true });
		}
	} catch (e) {
		logger.error('清理 OCR 安装目录失败', e);
	}
}
