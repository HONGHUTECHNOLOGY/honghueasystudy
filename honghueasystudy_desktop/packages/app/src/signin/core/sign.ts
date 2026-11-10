import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { API } from './api';
import { activityToSignType } from './activity';
import { clientUserAgent, cookieSerialize, cxGet, cxPost, cxRequest, isSpoofClient, sleep } from './http';
import { getPanToken } from './user';
import type {
	AddressItem,
	ChaoxingCookies,
	SigninAccountConfig,
	SigninActivity,
	SigninResult,
	SigninType
} from './types';

/**
 * 服务端「已经签过」类文案
 *
 * 重复提交、或在手机端先签过再让电脑端补签时，超星返回的是提示文案而不是 success。
 * 这类结果目标已经达成，按「已签到」处理，由调用方写进本地台账。
 */
const ALREADY_SIGNED_HINTS = ['已签到', '已经签到', '已签过', '重复签到', '请勿重复'];

function toResult(tag: string, data: string): SigninResult {
	const text = String(data || '').trim();
	if (text === 'success') return { ok: true, message: `[${tag}]签到成功` };
	if (text === 'fail-need-qrcode') return { ok: false, message: `[${tag}]需要二维码` };
	if (ALREADY_SIGNED_HINTS.some((hint) => text.includes(hint))) {
		return { ok: true, already: true, message: `[${tag}]${text}` };
	}
	return { ok: false, message: `[${tag}]${text || '签到失败'}` };
}

/** 普通 / 手势 / 签到码签到（课程） */
export async function generalSign(
	cookies: ChaoxingCookies,
	activity: SigninActivity,
	name: string
): Promise<SigninResult> {
	const result = await cxGet(API.PPT_SIGN, cookies, {
		activeId: activity.activeId,
		uid: cookies._uid,
		clientip: '',
		latitude: -1,
		longitude: -1,
		appType: 15,
		fid: cookies.fid || '',
		name
	});
	return toResult('通用', result.data);
}

/** 普通签到（无课程群聊） */
export async function generalSignGroup(cookies: ChaoxingCookies, activeId: string): Promise<SigninResult> {
	const result = await cxGet(API.CHAT_SIGN, cookies, { activeId, uid: cookies._uid, clientip: '' });
	return toResult('通用', result.data);
}

/** 经纬度保留 6 位小数，和手机定位上报的精度一致 */
function roundCoord(value: number): number {
	return Math.round(value * 1e6) / 1e6;
}

/**
 * 校验并归一化上报坐标
 *
 * 地图选点已经保证坐标就是所选位点，这里不再做任何偏移，只做合法性校验和
 * 6 位小数归一化（与手机定位上报的精度一致）。坐标非法时返回 null，交给调用方跳过。
 */
function resolveLocation(item: AddressItem): { lon: number; lat: number } | null {
	const lon = Number(item.lon);
	const lat = Number(item.lat);
	if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
	if (Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
	// 0,0 基本只会是占位值，按未配置处理
	if (lon === 0 && lat === 0) return null;
	return { lon: roundCoord(lon), lat: roundCoord(lat) };
}

function validCandidates(address?: AddressItem, presetAddress?: AddressItem[]): AddressItem[] {
	const list =
		address && String(address.address || '').trim()
			? [address]
			: (presetAddress || []).filter((item) => item && String(item.address || '').trim());
	return list;
}

/** 位置签到（课程），支持多地址逐个尝试 */
export async function locationSign(
	cookies: ChaoxingCookies,
	activity: SigninActivity,
	args: { name: string; address?: AddressItem; presetAddress?: AddressItem[] }
): Promise<SigninResult> {
	const candidates = validCandidates(args.address, args.presetAddress);

	if (candidates.length === 0) {
		return { ok: false, message: '[位置]未配置签到位置，请先在签到助手中填写坐标' };
	}

	let last: SigninResult = { ok: false, message: '[位置]签到失败' };
	for (const item of candidates) {
		const point = resolveLocation(item);
		if (!point) {
			last = { ok: false, message: '[位置]经纬度无效，请用「地图选点」重新选择位置' };
			continue;
		}
		const result = await cxGet(API.PPT_SIGN, cookies, {
			name: args.name,
			address: String(item.address).trim(),
			activeId: activity.activeId,
			uid: cookies._uid,
			clientip: '',
			latitude: point.lat,
			longitude: point.lon,
			fid: cookies.fid || '',
			appType: 15,
			ifTiJiao: 1
		});
		last = toResult('位置', result.data);
		if (last.ok) break;
		await sleep(800);
	}
	return last;
}

/** 位置签到（无课程群聊） */
export async function locationSignGroup(
	cookies: ChaoxingCookies,
	activeId: string,
	args: { address?: AddressItem; presetAddress?: AddressItem[] }
): Promise<SigninResult> {
	const candidates = validCandidates(args.address, args.presetAddress);
	if (candidates.length === 0) {
		return { ok: false, message: '[位置]未配置签到位置，请先在签到助手中填写坐标' };
	}

	let last: SigninResult = { ok: false, message: '[位置]签到失败' };
	for (const item of candidates) {
		const point = resolveLocation(item);
		if (!point) {
			last = { ok: false, message: '[位置]经纬度无效，请用「地图选点」重新选择位置' };
			continue;
		}
		const body =
			`address=${encodeURIComponent(String(item.address).trim())}&activeId=${activeId}&uid=${cookies._uid}` +
			`&clientip=&useragent=${encodeURIComponent(isSpoofClient() ? clientUserAgent() : '')}` +
			`&latitude=${point.lat}&longitude=${point.lon}&fid=&ifTiJiao=1`;
		const result = await cxPost(API.CHAT_SIGN, cookies, body);
		last = toResult('位置', result.data);
		if (last.ok) break;
		await sleep(800);
	}
	return last;
}

/** 拍照签到（已拿到 objectId） */
export async function photoSign(
	cookies: ChaoxingCookies,
	activity: SigninActivity,
	args: { name: string; objectId: string }
): Promise<SigninResult> {
	const result = await cxGet(API.PPT_SIGN, cookies, {
		activeId: activity.activeId,
		uid: cookies._uid,
		clientip: '',
		useragent: isSpoofClient() ? clientUserAgent() : '',
		latitude: -1,
		longitude: -1,
		appType: 15,
		fid: cookies.fid || '',
		objectId: args.objectId,
		name: args.name
	});
	return toResult('拍照', result.data);
}

/** 拍照签到（无课程群聊） */
export async function photoSignGroup(
	cookies: ChaoxingCookies,
	activeId: string,
	objectId: string
): Promise<SigninResult> {
	const result = await cxGet(API.CHAT_SIGN, cookies, {
		activeId,
		uid: cookies._uid,
		clientip: '',
		useragent: isSpoofClient() ? clientUserAgent() : '',
		latitude: -1,
		longitude: -1,
		fid: 0,
		objectId
	});
	return toResult('拍照', result.data);
}

/** 二维码签到 */
export async function qrcodeSign(
	cookies: ChaoxingCookies,
	activity: SigninActivity,
	args: { name: string; enc: string; address: AddressItem }
): Promise<SigninResult> {
	const location = JSON.stringify({
		result: '1',
		address: args.address.address,
		latitude: Number(args.address.lat) || 0,
		longitude: Number(args.address.lon) || 0,
		altitude: Number(args.address.altitude) || 0
	});
	const result = await cxGet(API.PPT_SIGN, cookies, {
		enc: args.enc,
		name: args.name,
		activeId: activity.activeId,
		uid: cookies._uid,
		clientip: '',
		location,
		latitude: -1,
		longitude: -1,
		fid: cookies.fid || '',
		appType: 15
	});
	return toResult('二维码', result.data);
}

function getMimeType(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase();
	if (ext === '.png') return 'image/png';
	if (ext === '.gif') return 'image/gif';
	if (ext === '.webp') return 'image/webp';
	return 'image/jpeg';
}

/**
 * 上传本地图片到超星云盘，返回 objectId
 *
 * 手工拼 multipart，避免额外引入 form-data 依赖。
 */
export async function uploadPhoto(cookies: ChaoxingCookies, filePath: string, token: string): Promise<string> {
	const buffer = fs.readFileSync(filePath);
	const boundary = `----HonghuSignin${crypto.randomBytes(8).toString('hex')}`;
	const filename = path.basename(filePath).replace(/[\r\n"]/g, '_');
	const mime = getMimeType(filePath);

	const chunks: Buffer[] = [];
	chunks.push(Buffer.from(`--${boundary}\r\n`));
	chunks.push(
		Buffer.from(
			`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` + `Content-Type: ${mime}\r\n\r\n`
		)
	);
	chunks.push(buffer);
	chunks.push(Buffer.from(`\r\n--${boundary}\r\n`));
	chunks.push(Buffer.from(`Content-Disposition: form-data; name="puid"\r\n\r\n${cookies._uid || ''}`));
	chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

	const result = await cxRequest(`${API.PAN_UPLOAD}?_from=mobilelearn&_token=${encodeURIComponent(token)}`, {
		method: 'POST',
		data: Buffer.concat(chunks),
		headers: {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
			Cookie: cookieSerialize(cookies)
		}
	});

	const parsed = JSON.parse(result.data);
	if (!parsed.objectId) throw new Error(parsed.message || '图片上传失败');
	return String(parsed.objectId);
}

/** 读取云盘 token（形如 {"_token":"xxx"}） */
export async function fetchPanToken(cookies: ChaoxingCookies): Promise<string> {
	const raw = await getPanToken(cookies);
	const parsed = JSON.parse(raw);
	if (!parsed._token) throw new Error('获取云盘 token 失败');
	return String(parsed._token);
}

export interface PerformSignOptions {
	/** 指定签到方式，auto 时按活动类型自动判断 */
	type?: SigninType | 'auto';
	enc?: string;
	name?: string;
	address?: AddressItem;
	presetAddress?: AddressItem[];
	photoPath?: string;
	config?: SigninAccountConfig;
}

/**
 * 按活动类型执行签到（课程签到 / 群聊签到自动区分）
 *
 * 注意：调用方需要先完成 preSign（课程）或 preSign2（群聊），
 * 检测到活动时已经完成预签，否则服务端可能拒绝提交。
 */
export async function performSign(
	cookies: ChaoxingCookies,
	activity: SigninActivity,
	options: PerformSignOptions = {}
): Promise<SigninResult> {
	const config = options.config;
	const info = (activity as any).info;
	const type: SigninType = options.type && options.type !== 'auto' ? options.type : activityToSignType(activity, info);
	const name = options.name || cookies.name || '';
	const isGroup = !activity.courseId;
	const address = options.address || config?.address;
	const presetAddress = options.presetAddress || config?.presetAddress;
	const photoPath = options.photoPath || config?.photoPath || '';
	const rawEnc = options.enc || config?.qrcodeEnc || '';
	// 允许直接粘贴完整二维码链接，从链接里截取 enc 参数
	let enc = rawEnc.trim();
	const matchedEnc = rawEnc.match(/[?&]enc=([^&#]+)/);
	if (matchedEnc) {
		try {
			enc = decodeURIComponent(matchedEnc[1]);
		} catch {
			enc = matchedEnc[1];
		}
	}

	switch (type) {
		case 'location':
			return isGroup
				? locationSignGroup(cookies, activity.activeId, { address, presetAddress })
				: locationSign(cookies, activity, { name, address, presetAddress });

		case 'photo': {
			if (!photoPath) {
				return { ok: false, message: '[拍照]未配置签到图片，请先在签到助手中选择图片' };
			}
			const token = await fetchPanToken(cookies);
			const objectId = await uploadPhoto(cookies, photoPath, token);
			activity.ifphoto = 1;
			return isGroup
				? photoSignGroup(cookies, activity.activeId, objectId)
				: photoSign(cookies, activity, { name, objectId });
		}

		case 'qr': {
			if (!enc) {
				return {
					ok: false,
					message: '[二维码]需要 enc：请在签到助手填写二维码内容，或扫码后粘贴 enc 参数'
				};
			}
			if (!address || !address.address) {
				return { ok: false, message: '[二维码]需要位置信息，请在签到助手中填写坐标' };
			}
			if (isGroup) {
				return { ok: false, message: '[二维码]群聊二维码签到需人工处理' };
			}
			return qrcodeSign(cookies, activity, { name, enc, address });
		}

		case 'gesture':
		case 'code':
		case 'general':
		default:
			return isGroup ? generalSignGroup(cookies, activity.activeId) : generalSign(cookies, activity, name);
	}
}
