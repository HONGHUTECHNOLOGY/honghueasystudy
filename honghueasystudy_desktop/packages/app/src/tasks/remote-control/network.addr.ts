import os from 'os';
import dgram from 'dgram';

/**
 * 内网地址采集与排序。
 *
 * 背景：一台电脑通常同时存在物理网卡与若干虚拟网卡（VMware / VirtualBox / Hyper-V /
 * WSL / Docker / VPN / 代理 TUN），`os.networkInterfaces()` 的枚举顺序完全由系统决定，
 * 虚拟网卡经常排在前面。二维码如果直接用「第一个地址」，手机就会访问不通。
 *
 * 这里的做法：
 * 1. 用一次 UDP `connect` 让系统按路由表选出「默认上网网卡」的源地址（不发送任何数据包）；
 * 2. 与该地址相同的网卡排最前 —— 也就是手机连同一网络时最可能访问到的那块；
 * 3. 其余按「公网直连 > 192.168 > 10 > 172.16-31」排序，并对虚拟网卡/容器网段降权；
 * 4. 排序结果稳定（同分按地址字典序），避免二维码地址在两次刷新之间跳变。
 *
 * 本文件只依赖 Node 内置模块，便于单独测试。
 */

export interface Ipv4Interface {
	/** IPv4 地址 */
	address: string;
	/** 网卡名称（Windows 上为「以太网」「WLAN」「vEthernet (Default Switch)」等） */
	name: string;
	/** 是否私网地址 */
	private: boolean;
	/** 按网卡名判断的虚拟网卡（虚拟机 / 容器 / VPN / 代理） */
	virtual: boolean;
	/** 排序得分，越大越优先 */
	score: number;
}

/** 出口探测目标：仅用于查询路由选路结果，不会真的发包 */
const PROBE_TARGETS = ['223.5.5.5', '8.8.8.8', '1.1.1.1'];

/** 默认路由所在网卡的加分，足以压过其它所有规则 */
const PRIMARY_BONUS = 1000;

/**
 * 已知「手机确实访问成功过」的地址段加分。
 * 比默认路由网卡更高：说明这个网段真的能被外部设备连上。
 */
const CONFIRMED_BONUS = 1200;

/** 虚拟网卡名称关键字（中英文） */
const VIRTUAL_NAME_PATTERN =
	/(vmware|virtualbox|vbox|hyper-?v|vethernet|docker|wsl|br-|veth|virbr|tun\d|tap[-\d]|utun|tailscale|zerotier|wireguard|wg\d|clash|surge|sing-?box|v2ray|mihomo|openvpn|hamachi|radmin|bluetooth|蓝牙|虚拟|npcap|loopback)/i;

/** 是否为可用的 IPv4：排除链路本地（APIPA）与 TUN 代理占用的保留段 */
export function isUsableIpv4(address: string): boolean {
	const parts = address.split('.').map(Number);
	if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return false;
	const [a, b] = parts;
	/** 0.0.0.0/8、127.0.0.0/8 本机回环 */
	if (a === 0 || a === 127) return false;
	/** 169.254.0.0/16：没有 DHCP 时系统自分配的地址，同一网络内的手机访问不到 */
	if (a === 169 && b === 254) return false;
	/** 198.18.0.0/15：Clash / Surge 等 TUN 模式的 fake-ip 网段 */
	if (a === 198 && (b === 18 || b === 19)) return false;
	return true;
}

/** 网卡名是否看起来像虚拟网卡 */
export function isVirtualInterface(name: string): boolean {
	return VIRTUAL_NAME_PATTERN.test(String(name || ''));
}

/** 是否为私有地址（与 network.ts 的 isPrivateIpv4 判定口径一致） */
function isPrivate(address: string): boolean {
	const p = address.split('.').map(Number);
	const [a, b] = p;
	if (a === 10) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	/** 运营商级 NAT（CGNAT）：同运营商内网可能互通，但对外不可达 */
	if (a === 100 && b >= 64 && b <= 127) return true;
	/** 保留段 */
	if (a === 192 && b === 0) return true;
	if (a === 198 && (b === 18 || b === 19)) return true;
	return false;
}

/** 典型虚拟机 / 容器的 Host-Only 网段 */
function isVirtualSubnet(address: string): boolean {
	const p = address.split('.').map(Number);
	const [a, b, c] = p;
	if (a !== 192 || b !== 168) {
		/** docker0 默认网段 */
		return a === 172 && b === 17 && c === 0;
	}
	/** VirtualBox Host-Only 默认 56；Docker Toolbox 99；Docker Desktop 65 */
	return c === 56 || c === 99 || c === 65;
}

/** 计算单个网卡的优先级 */
export function scoreIpv4(
	item: { address: string; name: string; virtual: boolean },
	primaryAddress?: string,
	confirmedAddresses?: string[]
): number {
	let score = 0;
	if (primaryAddress && item.address === primaryAddress) score += PRIMARY_BONUS;
	if (confirmedAddresses && confirmedAddresses.some((ip) => isSameSubnet(ip, item.address))) {
		score += CONFIRMED_BONUS;
	}
	if (item.virtual) score -= 400;

	if (isPrivate(item.address)) {
		const p = item.address.split('.').map(Number);
		if (p[0] === 192 && p[1] === 168) score += 80;
		else if (p[0] === 10) score += 70;
		else if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) score += 60;
		else if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) score -= 120;
		if (isVirtualSubnet(item.address)) score -= 200;
	} else {
		/** 网卡直接持有公网 IPv4 时最通用 */
		score += 300;
	}
	return score;
}

/** 同步采集所有可用 IPv4 网卡（未排序） */
export function collectIpv4InterfacesSync(): Ipv4Interface[] {
	const result: Ipv4Interface[] = [];
	const seen: { [address: string]: true } = {};

	try {
		const interfaces = os.networkInterfaces();
		Object.keys(interfaces).forEach((name) => {
			const list = interfaces[name] || [];
			list.forEach((item) => {
				if (item.internal) return;
				/** @types/node 不同版本 family 可能是 'IPv4' 或 4 */
				const family = String(item.family);
				if (family !== 'IPv4' && family !== '4') return;
				const address = item.address;
				if (!isUsableIpv4(address) || seen[address]) return;
				seen[address] = true;
				const virtual = isVirtualInterface(name);
				result.push({
					address,
					name,
					private: isPrivate(address),
					virtual,
					score: scoreIpv4({ address, name, virtual })
				});
			});
		});
	} catch (e) {
		/** 枚举失败时返回空，由调用方回退到回环地址 */
	}

	return result;
}

/** 去掉 IPv4-mapped IPv6 前缀（`::ffff:192.168.1.5` → `192.168.1.5`） */
export function normalizeClientIp(ip: string): string {
	const value = String(ip || '').trim();
	if (!value) return '';
	const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
	return mapped ? mapped[1] : value;
}

/** 是否同一 /24 网段（家用与办公网络基本都是 /24，够用且不会误判） */
export function isSameSubnet(a: string, b: string): boolean {
	const left = normalizeClientIp(a).split('.');
	const right = normalizeClientIp(b).split('.');
	if (left.length !== 4 || right.length !== 4) return false;
	return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

/** 按优先级排序（同分按地址字典序，保证结果稳定） */
export function rankIpv4Interfaces(
	list: Ipv4Interface[],
	primaryAddress?: string,
	confirmedAddresses?: string[]
): Ipv4Interface[] {
	return list
		.map((item) =>
			Object.assign({}, item, {
				score: scoreIpv4(
					{ address: item.address, name: item.name, virtual: item.virtual },
					primaryAddress,
					confirmedAddresses
				)
			})
		)
		.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.address.localeCompare(b.address)));
}

/**
 * 探测默认上网网卡的本机地址。
 *
 * UDP `connect` 不会发送数据包，只是让内核按路由表选定源地址，
 * 因此开销极小、无网络副作用。离线（无默认路由）时返回空字符串。
 */
export function detectPrimaryAddress(timeout = 220): Promise<string> {
	return new Promise<string>((resolve) => {
		let settled = false;
		const socket = dgram.createSocket('udp4');

		const finish = (address: string) => {
			if (settled) return;
			settled = true;
			try {
				socket.close();
			} catch (e) {
				/* 关闭失败无所谓，进程内会自行回收 */
			}
			resolve(address);
		};

		const timer = setTimeout(() => finish(''), timeout);
		/** 不让探测影响进程退出 */
		if (timer.unref) timer.unref();

		socket.once('error', () => {
			clearTimeout(timer);
			finish('');
		});

		try {
			socket.connect(53, PROBE_TARGETS[0], () => {
				clearTimeout(timer);
				try {
					const info = socket.address();
					finish(info && info.address && info.address !== '0.0.0.0' ? info.address : '');
				} catch (e) {
					finish('');
				}
			});
		} catch (e) {
			clearTimeout(timer);
			finish('');
		}
	});
}

/** 同步版本：不含出口探测，但仍按物理网卡优先级排序 */
export function buildLanUrlsSync(port: number): string[] {
	return rankIpv4Interfaces(collectIpv4InterfacesSync()).map((item) => `http://${item.address}:${port}`);
}

/** 异步版本：带上默认路由网卡的判定，结果最准确 */
export async function buildLanUrls(port: number, confirmedAddresses?: string[]): Promise<string[]> {
	const list = collectIpv4InterfacesSync();
	const primary = await detectPrimaryAddress();
	return rankIpv4Interfaces(list, primary, confirmedAddresses).map((item) => `http://${item.address}:${port}`);
}
