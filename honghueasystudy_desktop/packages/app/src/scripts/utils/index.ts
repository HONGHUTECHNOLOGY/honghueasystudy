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

/**
 * 取图片的 base64
 *
 * 【为什么不能直接用 axios 下载】
 * 验证码图片（网易易盾 / 超星）的 URL 是**带会话的一次性地址**：
 * 服务端会校验 cookie、referer，有的还带短时效签名。
 * 由 Node 侧独立发起 `axios.get(img.src)` 时这些上下文全都没有，
 * 服务端直接回 **400 Bad Request** —— 在日志里就表现为一句
 * 「自动化程序错误：Error: Request failed with status code 400」，
 * 完全看不出是「取图被拒」，于是被误读成「登录失败」。
 *
 * 【正确顺序】
 * 1. `data:` 开头的直接截取，根本不用下载（易盾常常直接内联成 data URL）；
 * 2. 传了 page 时，在**页面上下文里 fetch**：cookie / referer / UA 全都天然带上，
 *    同源时连 CORS 都不用管；
 * 3. 页面内取不到（跨域被拦、页面已跳转）才退回 axios，并且要求是绝对地址；
 * 4. 任何一步失败都要把**图片地址和真实原因**抛出去，不能再退化成一句「400」。
 */
export async function getBase64(url: string, page?: Page): Promise<string> {
	if (!url) throw new Error('验证码图片地址为空');

	/** data URL：`, ` 之后就是 base64 本体 */
	if (url.startsWith('data:')) {
		const comma = url.indexOf(',');
		if (comma < 0) throw new Error('验证码图片 data URL 格式异常');
		return url.slice(comma + 1);
	}

	if (page) {
		try {
			return await page.evaluate((src: string) => {
				/**
				 * 【这里绝对不能写 async 函数】
				 *
				 * page.evaluate 的函数会被**序列化成字符串**丢进浏览器执行，
				 * 而本项目的 tsconfig target 是 es2016：`async` 会被编译成
				 * `__awaiter(this, void 0, void 0, function* () {...})`，
				 * 那个 helper 定义在模块顶层，浏览器里根本不存在，
				 * 于是报 `ReferenceError: __awaiter is not defined`（踩过）。
				 * 只能用 Promise 链，它编译后是纯净的箭头函数。
				 *
				 * credentials 也要按同源区分：
				 * 验证码图床是 necaptcha.nosdn.127.net，跨域请求带 cookie 时
				 * 服务端必须回 `Access-Control-Allow-Credentials: true` + 具体 origin；
				 * 实际它只回 `*`，带 credentials 会直接被浏览器拦掉。
				 */
				const sameOrigin = new URL(src, location.href).origin === location.origin;

				const toBase64 = (buffer: ArrayBuffer) => {
					const bytes = new Uint8Array(buffer);
					/** 分块拼接：一次 apply 整个大数组会爆调用栈（图片动辄几百 KB） */
					const CHUNK = 0x8000;
					let binary = '';
					for (let i = 0; i < bytes.length; i += CHUNK) {
						binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
					}
					return btoa(binary);
				};

				return fetch(src, { credentials: sameOrigin ? 'include' : 'omit' })
					.then((res) => {
						if (!res.ok) throw new Error('HTTP ' + res.status);
						return res.arrayBuffer();
					})
					.then(toBase64);
			}, url);
		} catch (err) {
			try {
				return await downloadBase64(url);
			} catch (fallbackErr) {
				throw new Error(
					`验证码图片获取失败（${briefUrl(url)}）：页面内请求 ${errorText(err)}；独立请求 ${errorText(
						fallbackErr
					)}`
				);
			}
		}
	}

	return downloadBase64(url);
}

/** 只给报错看的主机+路径，避免把整串 base64 / 长签名写进日志 */
function briefUrl(url: string) {
	try {
		const u = new URL(url);
		return `${u.host}${u.pathname}`.slice(0, 120);
	} catch {
		return url.slice(0, 80);
	}
}

function errorText(err: unknown) {
	if (err instanceof Error) return err.message;
	return String(err);
}

/** 回退通道：只接受绝对地址，相对路径在 Node 里没有 baseURL 可拼 */
async function downloadBase64(url: string) {
	if (!/^https?:\/\//i.test(url)) {
		throw new Error('不是绝对地址，无法独立下载');
	}
	const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
	return Buffer.from(response.data, 'binary').toString('base64');
}
