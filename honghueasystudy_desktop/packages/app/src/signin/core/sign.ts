import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { API } from './api';
import { activityToSignType } from './activity';
import { cookieSerialize, cxGet, cxPost, cxRequest, sleep } from './http';
import { getPanToken } from './user';
import type { AddressItem, ChaoxingCookies, SigninAccountConfig, SigninActivity, SigninResult, SigninType } from './types';

function toResult(tag: string, data: string): SigninResult {
	const text = String(data || '').trim();
	if (text === 'success') return { ok: true, message: `[${tag}]签到成功` };
	if (text === 'fail-need-qrcode') return { ok: false, message: `[${tag}]需要二维码` };
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

/** 位置签到（课程），支持多地址逐个尝试 */
export async function locationSign(
	cookies: ChaoxingCookies,
	activity: SigninActivity,
	args: { name: string; address?: AddressItem; presetAddress?: AddressItem[] }
): Promise<SigninResult> {
	const candidates =
		args.address && args.address.address
			? [args.address]
			: (args.presetAddress || []).filter((item) => item && item.address);

	if (candidates.length === 0) {
		return { ok: false, message: '[位置]未配置签到位置，请先在签到助手中填写坐标' };
	}

	let last: SigninResult = { ok: false, message: '[位置]签到失败' };
	for (const item of candidates) {
		const result = await cxGet(API.PPT_SIGN, cookies, {
			name: args.name,
			address: item.address,
			activeId: activity.activeId,
			uid: cookies._uid,
			clientip: '',
			latitude: item.lat,
			longitude: item.lon,
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
	const candidates =
		args.address && args.address.address
			? [args.address]
			: (args.presetAddress || []).filter((item) => item && item.address);
	if (candidates.length === 0) {
		return { ok: false, message: '[位置]未配置签到位置，请先在签到助手中填写坐标' };
	}

	let last: SigninResult = { ok: false, message: '[位置]签到失败' };
	for (const item of candidates) {
		const body =
			`address=${encodeURIComponent(item.address)}&activeId=${activeId}&uid=${cookies._uid}` +
			`&clientip=&useragent=&latitude=${item.lat}&longitude=${item.lon}&fid=&ifTiJiao=1`;
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
		useragent: '',
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
		useragent: '',
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
	let type: SigninType = options.type && options.type !== 'auto' ? options.type : activityToSignType(activity, info);
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
