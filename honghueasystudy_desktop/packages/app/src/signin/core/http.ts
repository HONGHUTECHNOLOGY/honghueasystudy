import axios from 'axios';
import zlib from 'zlib';
import type { ChaoxingCookies } from './types';

/** 桌面浏览器 UA（默认行为，关闭伪装时使用） */
const DESKTOP_UA =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** 手机端学习通（Android WebView）UA，与签到参数里的 appType=15 对应 */
const MOBILE_UA =
	'Mozilla/5.0 (Linux; Android 13; SM-S9010 Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.5993.111 Mobile Safari/537.36';

/**
 * 手机客户端才会访问的域名
 *
 * 只在这些域名上切换 UA：登录、课程列表属于网页端接口，换成移动端 UA 可能拿到
 * 移动版页面（课程列表会解析不出 course_ 前缀），因此保持桌面 UA。
 */
const MOBILE_HOSTS = ['mobilelearn.chaoxing.com', 'pan-yz.chaoxing.com', 'im.chaoxing.com'];

/** 客户端特征伪装开关（由设置项同步，默认关闭） */
let spoofClient = false;

/** 设置伪装开关（主进程每次签到前同步一次） */
export function setSpoofClient(enabled: boolean): void {
	spoofClient = !!enabled;
}

/** 当前是否开启了客户端伪装 */
export function isSpoofClient(): boolean {
	return spoofClient;
}

/** 伪装开启时返回移动端 UA，用于签到表单里的 useragent 参数 */
export function clientUserAgent(): string {
	return spoofClient ? MOBILE_UA : DESKTOP_UA;
}

/** 按请求地址选择 UA：伪装开启时，手机端域名使用移动端 UA */
function uaForUrl(url: string): string {
	if (!spoofClient) return DESKTOP_UA;
	try {
		const host = new URL(url).hostname;
		if (MOBILE_HOSTS.includes(host)) return MOBILE_UA;
	} catch {
		/* 地址异常时退回桌面 UA */
	}
	return DESKTOP_UA;
}

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
	const baseHeaders: Record<string, string> = {
		'User-Agent': uaForUrl(url)
	};
	// 真实浏览器/App 都会带语言头；只在伪装开启时补上，关闭时保持原有行为
	if (spoofClient) baseHeaders['Accept-Language'] = 'zh-CN,zh;q=0.9,en;q=0.8';

	const response = await axios.request({
		url,
		method: options.method || 'GET',
		headers: {
			...baseHeaders,
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
