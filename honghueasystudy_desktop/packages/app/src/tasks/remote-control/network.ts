import os from 'os';
import axios from 'axios';
import { Logger } from '../../logger';

const logger = Logger('remote-network');

export type NetworkStatus = 'public-direct' | 'nat' | 'unknown';

export interface NetworkReport {
	status: NetworkStatus;
	/** 标题 */
	title: string;
	/** 结论说明 */
	message: string;
	/** 建议操作 */
	suggestion: string;
	/** 本机可用于访问的地址（含 http:// 与端口） */
	lanUrls: string[];
	/** 公网可达地址（IPv4 或 [IPv6] 形式），为空表示无法直连 */
	publicUrls: string[];
	/** 本机公网 IPv4（若网卡直连公网） */
	publicIpv4: string[];
	/** 本机公网 IPv6（若网卡直连公网） */
	publicIpv6: string[];
	/** 查询到的出口公网 IP */
	egressIp: string;
}

/** 出口 IP 查询源，按顺序降级 */
const EGRESS_ENDPOINTS = [
	'https://api.ipify.org',
	'https://ipinfo.io/ip',
	'https://myip.ipip.net',
	'https://api-ipv4.ip.sb/ip'
];

/** 是否为私有/保留 IPv4（这些地址无法被外网直接访问） */
export function isPrivateIpv4(ip: string): boolean {
	const p = ip.split('.').map(Number);
	if (p.length !== 4 || p.some((n) => isNaN(n))) return true;
	if (p[0] === 10 || p[0] === 127 || p[0] === 0) return true;
	if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
	if (p[0] === 192 && p[1] === 168) return true;
	if (p[0] === 169 && p[1] === 254) return true;
	/** 运营商级 NAT（CGNAT） */
	if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true;
	/** 保留/测试段 */
	if (p[0] === 192 && p[1] === 0 && p[2] === 0) return true;
	if (p[0] === 198 && (p[1] === 18 || p[1] === 19)) return true;
	return false;
}

/** 是否为全局可路由 IPv6（2000::/3） */
export function isPublicIpv6(ip: string): boolean {
	const low = ip.toLowerCase();
	if (low.indexOf(':') === -1) return false;
	if (low.indexOf('::') === 0) return false;
	if (low.indexOf('fe80') === 0) return false;
	/** fc00::/7 唯一本地地址 */
	if (low.indexOf('fc') === 0 || low.indexOf('fd') === 0) return false;
	return /^[23]/.test(low);
}

/** 解析出口 IP（部分服务返回纯文本，部分返回 JSON） */
function extractIp(body: unknown): string {
	if (typeof body === 'string') {
		const text = body.trim();
		/** myip.ipip.net 返回形如：当前 IP：1.2.3.4  来自于：中国 ... */
		const cnMatch = text.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
		return cnMatch ? cnMatch[1] : '';
	}
	if (body && typeof body === 'object') {
		const obj = body as Record<string, unknown>;
		/** ipinfo.io 返回 { ip: '...' }，ip.sb 返回 { ip: '...' } */
		if (typeof obj.ip === 'string') return obj.ip;
		if (typeof obj.origin === 'string') return obj.origin.split(',')[0].trim();
	}
	return '';
}

/** 查询出口公网 IP，失败返回空字符串 */
export async function queryEgressIp(): Promise<string> {
	for (const url of EGRESS_ENDPOINTS) {
		try {
			const res = await axios.get(url, {
				timeout: 3000,
				responseType: 'text',
				transformResponse: [(data) => data],
				validateStatus: () => true
			});
			if (res.status !== 200) continue;
			const ip = extractIp(res.data);
			if (ip && !isPrivateIpv4(ip)) return ip;
		} catch (e) {
			// 换下一个源
		}
	}
	return '';
}

/**
 * 采集本机网络环境并给出三态结论。
 *
 * 注意：即便检测到公网 IP，也不代表外网一定能访问（系统防火墙、路由器 ACL 均可能拦截）。
 * 因此文案只陈述事实，并给出验证建议。
 */
export async function detectNetwork(port: number): Promise<NetworkReport> {
	const lanAddresses: string[] = [];
	const publicIpv4: string[] = [];
	const publicIpv6: string[] = [];

	try {
		const interfaces = os.networkInterfaces();
		Object.keys(interfaces).forEach((name) => {
			const list = interfaces[name] || [];
			list.forEach((item) => {
				if (item.internal) return;
				// @types/node 不同版本下 family 可能是 'IPv4' 或 4，统一转字符串判断
				const family = String(item.family);
				if (family === 'IPv4' || family === '4') {
					if (isPrivateIpv4(item.address)) {
						lanAddresses.push(item.address);
					} else {
						publicIpv4.push(item.address);
					}
				} else if (family === 'IPv6' || family === '6') {
					if (isPublicIpv6(item.address)) {
						publicIpv6.push(item.address);
					}
				}
			});
		});
	} catch (e) {
		logger.error('枚举网卡失败', e);
	}

	const lanUrls = lanAddresses.map((ip) => `http://${ip}:${port}`);
	const egressIp = await queryEgressIp();

	// IPv6 地址在 URL 中必须用方括号包裹
	const publicUrls = [
		...publicIpv4.map((ip) => `http://${ip}:${port}`),
		...publicIpv6.map((ip) => `http://[${ip}]:${port}`)
	];

	if (publicIpv4.length > 0) {
		return {
			status: 'public-direct',
			title: '可直接远程访问',
			message: `本机网卡拥有公网 IPv4：${publicIpv4.join('、')}，无需端口映射即可尝试直连。`,
			suggestion: '请确认系统防火墙已放行该端口。建议用手机 4G 网络访问下方公网地址做一次验证。',
			lanUrls,
			publicUrls,
			publicIpv4,
			publicIpv6,
			egressIp
		};
	}

	if (publicIpv6.length > 0) {
		return {
			status: 'public-direct',
			title: '可通过公网 IPv6 访问',
			message: `本机拥有公网 IPv6：${publicIpv6.join('、')}。手机在蜂窝网络下通常支持 IPv6 直连。`,
			suggestion: '请确认系统防火墙已放行该端口。若下方公网地址打不开，可改用内网穿透。',
			lanUrls,
			publicUrls,
			publicIpv4,
			publicIpv6,
			egressIp
		};
	}

	if (!egressIp) {
		return {
			status: 'unknown',
			title: '网络环境检测失败',
			message: '未能查询到出口公网 IP，可能是当前网络无法访问查询服务。',
			suggestion: '仅保证局域网内可以访问。如需外网访问，可开启内网穿透。',
			lanUrls,
			publicUrls,
			publicIpv4,
			publicIpv6,
			egressIp
		};
	}

	return {
		status: 'nat',
		title: '处于 NAT 之后，无法直连',
		message: `出口公网 IP 为 ${egressIp}，与本机网卡地址不一致，说明设备位于运营商或路由器 NAT 之后。`,
		suggestion: '可选择：① 开启下方「内网穿透」一键获得公网地址；② 在路由器上把本机端口做端口映射。',
		lanUrls,
		publicUrls,
		publicIpv4,
		publicIpv6,
		egressIp
	};
}
