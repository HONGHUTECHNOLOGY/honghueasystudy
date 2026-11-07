import axios from 'axios';
import zlib from 'zlib';
import type { ChaoxingCookies } from './types';

const UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface CxResponse {
	status: number;
	data: string;
	headers: Record<string, any>;
}

export interface CxRequestOptions {
	method?: 'GET' | 'POST';
	headers?: Record<string, string>;
	params?: Record<string, any>;
	/** POST 原始 body */
	data?: any;
	/** 禁止跟随跳转（用于识别 302 登录失效） */
	noRedirect?: boolean;
	timeout?: number;
}

/**
 * 序列化签到所需的 Cookie 串
 *
 * 注意 score 接口要求的是大写 `UID`，其它字段小写。
 */
export function cookieSerialize(cookies: Partial<ChaoxingCookies>): string {
	return `fid=${cookies.fid || ''}; uf=${cookies.uf || ''}; _d=${cookies._d || ''}; UID=${cookies._uid || ''}; vc3=${
		cookies.vc3 || ''
	}`;
}

/**
 * 原始请求：统一返回字符串，自动处理 gzip 与 302
 */
export async function cxRequest(url: string, options: CxRequestOptions = {}): Promise<CxResponse> {
	const response = await axios.request({
		url,
		method: options.method || 'GET',
		headers: {
			'User-Agent': UA,
			...(options.headers || {})
		},
		params: options.params,
		data: options.data,
		// 以二进制读取，避免服务端未正确声明编码时出现乱码
		responseType: 'arraybuffer',
		maxRedirects: options.noRedirect ? 0 : 5,
		validateStatus: () => true,
		decompress: true,
		timeout: options.timeout || 20000
	});

	let buffer = Buffer.from(response.data as any);
	// axios 已解压时 body 不再是 gzip 魔数，这里只做兜底
	if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
		try {
			buffer = zlib.gunzipSync(buffer);
		} catch {
			/* empty */
		}
	}

	return {
		status: response.status,
		data: buffer.toString('utf8'),
		headers: response.headers as Record<string, any>
	};
}

/** 带 Cookie 的 GET */
export function cxGet(
	url: string,
	cookies: Partial<ChaoxingCookies>,
	params?: Record<string, any>,
	extraHeaders?: Record<string, string>
): Promise<CxResponse> {
	return cxRequest(url, {
		method: 'GET',
		params,
		headers: {
			Cookie: cookieSerialize(cookies),
			...(extraHeaders || {})
		}
	});
}

/** 带 Cookie 的 POST（表单） */
export function cxPost(
	url: string,
	cookies: Partial<ChaoxingCookies>,
	data: string,
	extraHeaders?: Record<string, string>
): Promise<CxResponse> {
	return cxRequest(url, {
		method: 'POST',
		data,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			Cookie: cookieSerialize(cookies),
			...(extraHeaders || {})
		}
	});
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
