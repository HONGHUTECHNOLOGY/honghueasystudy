import { writeFile, mkdirSync, existsSync, rmSync, writeFileSync, accessSync, constants } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import child_process from 'child_process';
import { Logger } from '../logger';
import { store } from '../store';

const getOcrFolder = () => path.join(store.store.paths.downloadFolder, './apps/ocr');

const logger = Logger('ocr');

/**
 * 使用 ddddocr 进行验证码识别
 * @param base64 图片 base64
 */
export function ocr(base64: string) {
	return new Promise<string>((resolve, reject) => {
		const uuid = randomUUID();
		const img_cache = path.join(getOcrFolder(), './img_cache');
		if (!existsSync(img_cache)) {
			mkdirSync(img_cache, { recursive: true });
		}
		const img = path.join(img_cache, uuid + '.png');
		writeFile(img, base64, 'base64', () => {
			// 要使用 "" 去包裹路径，防止出现空格
			// （与下方 det() 拼接保持一致；此前多拼的前置 "." 会导致 ".<绝对路径>" 无法被 shell 解析，二进制无法执行）
			const cmd = [`"${path.join(getOcrFolder(), getOCRFileName())}"`, '--ocr', `"${img}"`].join(' ');
			logger.log('cmd', cmd);

			child_process.exec(cmd, (err, stdout, stderr) => {
				if (err || stderr) {
					reject(err || stderr);
				} else {
					resolve(stdout.trim());
				}
				// 删除图片
				if (existsSync(img)) {
					rmSync(img);
				}
			});
		});
	});
}

/**
 * 使用 ddddocr 进行滑块识别
 *
 * @param det_target_base64 滑块图片
 * @param det_bg_base64 滑块背景图片
 *
 * target_y: 滑块高度
 * target: [x1,y1,x2,y2]
 */
export function det(det_target_base64: string, det_bg_base64: string) {
	return new Promise<{
		target_y: number;
		target: [number, number, number, number];
	}>((resolve, reject) => {
		const img_cache = path.join(getOcrFolder(), './img_cache');
		if (!existsSync(img_cache)) {
			mkdirSync(img_cache, { recursive: true });
		}
		const img1 = path.join(img_cache, randomUUID() + '.png');
		const img2 = path.join(img_cache, randomUUID() + '.png');
		writeFileSync(img1, det_target_base64, 'base64');
		writeFileSync(img2, det_bg_base64, 'base64');

		const cmd = [
			`"${path.join(getOcrFolder(), getOCRFileName())}"`,
			'--det-target',
			`"${img1}"`,
			'--det-bg',
			`"${img2}"`
		].join(' ');

		child_process.exec(cmd, (err, stdout, stderr) => {
			if (err || stderr) {
				reject(err || stderr);
			} else {
				resolve(JSON.parse(stdout.trim().replace(/'/g, '"')));
			}
			// 删除图片
			if (existsSync(img1)) {
				rmSync(img1);
			}
			if (existsSync(img2)) {
				rmSync(img2);
			}
		});
	});
}

/**
 * 判断是否能够进行验证码识别
 *
 * 非 Windows 平台需同时校验二进制具备可执行权限（access X_OK）：
 * JS 解压库丢 +x、安装损坏、架构不符等场景下返回 false，不抛出未捕获异常。
 */
export function canOCR() {
	const binary = path.join(getOcrFolder(), getOCRFileName());
	if (!existsSync(binary)) return false;
	if (process.platform !== 'win32') {
		try {
			accessSync(binary, constants.X_OK);
		} catch {
			return false;
		}
	}
	return true;
}

function getOCRFileName() {
	return process.platform === 'win32' ? './ocr.exe' : './ocr';
}
