import forge from 'node-forge';
import { API } from './api';
import { cxGet, cxPost, cxRequest } from './http';
import type { ChaoxingCookies, Course } from './types';

/** 超星登录使用的固定 DES 密钥（服务端约定） */
const DES_KEY = 'u2oh6Vu^HWe40fj';

/** 登录失败 / 凭证失效统一返回值 */
export const AUTH_FAILED = 'AuthFailed';
export const NO_COURSE = 'NoCourse';

/**
 * 超星密码加密：DES-ECB + PKCS7
 *
 * Node 22 的 OpenSSL 已移除单 DES（des-ecb 报 unsupported），这里用 node-forge 实现。
 * 服务端只取前 8 字节作为 DES key。
 */
export function encryptPassword(password: string): string {
	const cipher = forge.cipher.createCipher('DES-ECB', forge.util.createBuffer(DES_KEY.slice(0, 8)));
	cipher.start();
	cipher.update(forge.util.createBuffer(forge.util.encodeUtf8(password)));
	cipher.finish();
	// 与 crypto-js 的 ciphertext.toString() 一致：小写 hex
	return cipher.output.toHex();
}

function parseSetCookie(setCookie: string | string[] | undefined): Record<string, string> {
	const result: Record<string, string> = {};
	if (!setCookie) return result;
	// 兼容 axios 不同版本：可能是数组，也可能被合并成单个字符串
	const list = Array.isArray(setCookie)
		? setCookie
		: setCookie.split(/,(?=\s*[A-Za-z0-9_-]+=)/);
	for (const item of list) {
		const equalIndex = item.indexOf('=');
		const semiIndex = item.indexOf(';');
		if (equalIndex < 0) continue;
		const name = item.substring(0, equalIndex).trim();
		const value = item.substring(equalIndex + 1, semiIndex < 0 ? item.length : semiIndex);
		if (name) result[name] = value;
	}
	return result;
}

/**
 * 手机号密码登录
 */
export async function login(phone: string, password: string): Promise<ChaoxingCookies | typeof AUTH_FAILED> {
	const encrypted = encryptPassword(password);
	const formdata =
		`uname=${encodeURIComponent(phone)}&password=${encrypted}&fid=-1&t=true` +
		`&refer=https%253A%252F%252Fi.chaoxing.com&forbidotherlogin=0&validate=`;

	const result = await cxRequest(API.LOGIN, {
		method: 'POST',
		data: formdata,
		// 不跟随跳转，确保能拿到响应头里的 Set-Cookie
		noRedirect: true,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'X-Requested-With': 'XMLHttpRequest'
		}
	});

	let parsed: any;
	try {
		parsed = JSON.parse(result.data);
	} catch {
		return AUTH_FAILED;
	}
	if (!parsed || !parsed.status) return AUTH_FAILED;

	const cookies = parseSetCookie(result.headers['set-cookie']);
	if (!cookies._uid || !cookies._d) return AUTH_FAILED;

	return {
		fid: cookies.fid || '-1',
		pid: cookies.pid || '-1',
		refer: 'http%3A%2F%2Fi.chaoxing.com',
		_blank: '1',
		t: 'true',
		vc3: cookies.vc3 || '',
		_uid: cookies._uid || '',
		_d: cookies._d || '',
		uf: cookies.uf || '',
		lv: cookies.lv || ''
	};
}

/**
 * 读取全部课程（courseId + classId）
 */
export async function getCourses(
	cookies: Pick<ChaoxingCookies, '_uid' | '_d' | 'vc3'>
): Promise<Course[] | typeof AUTH_FAILED | typeof NO_COURSE> {
	const result = await cxRequest(API.COURSE_LIST, {
		method: 'POST',
		data: 'courseType=1&courseFolderId=0&courseFolderSize=0',
		noRedirect: true,
		headers: {
			Accept: 'text/html, */*; q=0.01',
			'Accept-Encoding': 'gzip, deflate',
			'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			Cookie: `_uid=${cookies._uid}; _d=${cookies._d}; vc3=${cookies.vc3}`
		}
	});

	if (result.status === 302) return AUTH_FAILED;

	const courses: Course[] = [];
	const seen = new Set<string>();
	const regexp = /course_(\d+)_(\d+)/g;
	let match: RegExpExecArray | null;
	while ((match = regexp.exec(result.data)) !== null) {
		const key = `${match[1]}_${match[2]}`;
		if (seen.has(key)) continue;
		seen.add(key);
		courses.push({ courseId: match[1], classId: match[2] });
	}

	if (courses.length === 0) return NO_COURSE;
	return courses;
}

/**
 * 获取账号真实姓名
 */
export async function getAccountInfo(cookies: ChaoxingCookies): Promise<string> {
	const result = await cxGet(API.ACCOUNT_MANAGE, cookies);
	const html = result.data;
	// 优先抓 value（真实页面是 <input id="messageName" value="姓名">），
	// 再看元素文本；必须跳过空白匹配，否则会提前返回空字符串
	const patterns = [
		/id=["']?messageName["']?[^>]*value=["']([^"']+)["']/,
		/value=["']([^"']+)["'][^>]*id=["']?messageName["']?/,
		/id=["']?messageName["']?[^>]*>([^<]*)</
	];
	for (const pattern of patterns) {
		const match = html.match(pattern);
		const value = match && match[1] ? match[1].trim() : '';
		if (value) return value;
	}
	return '';
}

/** 获取云盘上传 token（返回的是一段 JSON 字符串） */
export async function getPanToken(cookies: ChaoxingCookies): Promise<string> {
	const result = await cxGet(API.PAN_TOKEN, cookies);
	return result.data;
}

export interface IMParams {
	myName: string;
	myToken: string;
	myTuid: string;
	myPuid: string;
}

function extractImField(html: string, id: string): string {
	// 页面结构不稳定：value 可能带引号/不带引号，也可能出现在 id 之前，
	// 兜底再看元素文本内容（myName 有时是文本节点而不是 input）
	const patterns = [
		new RegExp(`id=["']?${id}["']?[^>]*value=["']([^"']*)["']`),
		new RegExp(`value=["']([^"']*)["'][^>]*id=["']?${id}["']?`),
		new RegExp(`id=["']?${id}["']?[^>]*value=([^"'>\\s]+)`),
		new RegExp(`id=["']?${id}["']?[^>]*>([^<]*)<`)
	];
	for (const pattern of patterns) {
		const matched = html.match(pattern);
		if (matched && matched[1].trim()) return matched[1].trim();
	}
	return '';
}

/**
 * 获取 IM 登录参数（群聊实时监听的兜底链路）
 */
export async function getIMParams(cookies: ChaoxingCookies): Promise<IMParams | typeof AUTH_FAILED> {
	const result = await cxGet(API.WEBIM, cookies);
	if (!result.data) return AUTH_FAILED;

	const myName = extractImField(result.data, 'myName');
	const myToken = extractImField(result.data, 'myToken');
	const myTuid = extractImField(result.data, 'myTuid');
	if (!myToken || !myTuid) return AUTH_FAILED;

	return { myName, myToken, myTuid, myPuid: cookies._uid };
}
