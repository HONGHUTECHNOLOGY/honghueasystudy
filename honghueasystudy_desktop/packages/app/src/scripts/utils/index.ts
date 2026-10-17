import type { ElementHandle, Page } from 'playwright-core';
import axios from 'axios';

/** 缓慢输入 */
export function slowType(page: Page, selector: string, text: string) {
	return page.type(selector, text, { delay: 100 });
}

/** 验证码破解 */
export async function breakVerifyCode(
	page: Page,
	imageElement: ElementHandle<any>,
	inputElement: ElementHandle<any>,
	options: { ocrApiUrl: string; ocrApiImageKey: string }
) {
	const box = await imageElement.boundingBox();
	if (box) {
		/** 请求验证码破解接口 */
		const body = Object.create([]);
		const buffer = await page.screenshot({ clip: box });
		Reflect.set(body, options.ocrApiImageKey, buffer.toString('base64'));
		const {
			data: { code, canOCR, error }
		} = await axios.post(options.ocrApiUrl, body);
		if (canOCR) {
			/** 破解验证码 */
			if (code) {
				await inputElement.fill(code);
			} else if (error) {
				throw new Error(error);
			}
		} else {
			throw new Error('未检测到图片验证码识别模块, 请手动输入验证码，或在软件左侧应用中心安装识别模块后重启浏览器。。');
		}
	}
}

/** 滑块验证码破解 */
export async function breakSliderVerify(
	page: Page,
	/**
	 * 滑块目标元素
	 */
	det_slider_el: ElementHandle<SVGElement | HTMLElement>,
	/**
	 * 拼图元素
	 */
	det_target_base64: string,
	/**
	 * 滑块背景元素
	 */
	det_bg_base64: string,
	opts: {
		ocrApiUrl: string;
		detTargetKey: string;
		detBackgroundKey: string;
		offset?: number;
		/** OCR 坐标基于背景图原始像素，页面上可能被缩放，需要乘以该比例 */
		scale?: number;
		/** 从滑块中心开始拖动（默认沿用左上角） */
		startAtCenter?: boolean;
		/** 拼图元素，传入后使用实际位置闭环校准 */
		pieceElement?: ElementHandle<Element>;
		/** 滑块背景元素，用于换算 OCR 原始坐标到页面显示坐标 */
		backgroundElement?: ElementHandle<Element>;
	}
) {
	const body = Object.create({});
	Reflect.set(body, opts.detTargetKey, det_target_base64);
	Reflect.set(body, opts.detBackgroundKey, det_bg_base64);

	const data = await axios.post(opts.ocrApiUrl, body);
	console.log('slider ocr', JSON.stringify(data?.data));

	if (data?.data?.error) {
		console.error(data.data.error);
	} else {
		if (data?.data?.canOCR) {
			/** 破解滑块验证码 */
			const result: { target_y: number; target: number[] } = data?.data?.det;

			if (result) {
				const slider_rect = await det_slider_el.evaluate((node) => node.getBoundingClientRect());
				const x1 = opts.startAtCenter ? slider_rect.x + slider_rect.width / 2 : slider_rect.x;
				const y1 = opts.startAtCenter ? slider_rect.y + slider_rect.height / 2 : slider_rect.y;

				await page.mouse.move(x1, y1);
				await page.mouse.down();

				if (opts.pieceElement && opts.backgroundElement) {
					// 闭环校准：先按 OCR 目标拖一次，再读取拼图实际位置，根据误差微调。
					// 不同窗口尺寸/DPI 下“鼠标位移 → 拼图位移”的比例不同，固定系数会偏差。
					const bg_rect = await opts.backgroundElement.evaluate((el) => el.getBoundingClientRect());
					const bg_natural_width = await opts.backgroundElement.evaluate(
						(el) => (el as HTMLImageElement).naturalWidth || 0
					);
					const piece_rect = await opts.pieceElement.evaluate((el) => el.getBoundingClientRect());
					const display_scale = bg_natural_width ? bg_rect.width / bg_natural_width : 1;
					const desired = bg_rect.x + result.target[0] * display_scale - piece_rect.x + (opts.offset ?? 0);

					let total = Math.max(0, desired);
					let actual = 0;
					let ratio = 1;

					if (total > 0) {
						await page.mouse.move(x1 + total, y1, { steps: 20 });
						await page.waitForTimeout(150);
						actual = (await opts.pieceElement.evaluate((el) => el.getBoundingClientRect().x)) - piece_rect.x;
						ratio = actual / total;
					}

					for (let i = 0; i < 2; i++) {
						const error = desired - actual;
						if (Math.abs(error) < 1) break;
						const step = ratio > 0.2 && ratio < 2 ? error / ratio : error;
						total += step;
						await page.mouse.move(x1 + total, y1, { steps: 12 });
						await page.waitForTimeout(150);
						const next_actual =
							(await opts.pieceElement.evaluate((el) => el.getBoundingClientRect().x)) - piece_rect.x;
						const measured_ratio = step !== 0 ? (next_actual - actual) / step : ratio;
						actual = next_actual;
						if (measured_ratio > 0.2 && measured_ratio < 2) ratio = measured_ratio;
					}

					console.log('slider ocr', {
						rawTarget: result.target[0],
						displayScale: display_scale,
						desired,
						mouseDistance: total,
						pieceMoved: actual,
						pieceError: desired - actual,
						x1,
						y1
					});
				} else {
					const scale = opts.scale ?? 1;
					const distance = result.target[0] * scale + (opts.offset ?? 0);
					const x2 = x1 + distance;
					console.log('slider ocr', {
						rawTarget: result.target[0],
						scale,
						distance,
						x1,
						y1,
						x2,
						offset: opts.offset ?? 0
					});
					// 先小幅移动再走完全程，轨迹更接近真实拖动
					await page.mouse.move(x1 + Math.min(8, distance / 3), y1, { steps: 3 });
					await page.mouse.move(x2, y1, { steps: 20 });
				}

				await page.mouse.up();

				try {
					await page.waitForNavigation({ timeout: 3000, waitUntil: 'domcontentloaded' });
				} catch {}
			} else {
				console.error(`OCR_DET: `, {
					data,
					opts,
					det_target_base64: det_target_base64.length,
					det_bg_base64: det_bg_base64.length
				});
				throw new Error('滑块验证识别失败，请尝试手动登录。');
			}
		} else {
			throw new Error('未检测到图片验证码识别模块, 请手动输入验证码，或在软件左侧应用中心安装识别模块后重启浏览器。');
		}
	}
}

export function getBase64(url: string) {
	return axios
		.get(url, {
			responseType: 'arraybuffer'
		})
		.then((response) => Buffer.from(response.data, 'binary').toString('base64'));
}
