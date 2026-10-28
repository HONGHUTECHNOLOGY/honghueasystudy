/**
 * 非 Windows 平台的安装包挑选。
 *
 * mac / linux 不做自动安装：
 * - mac 未签名（electron.builder.json 里 `identity: null`），替换 .app 后 Gatekeeper 会拒开
 * - linux 的 deb/rpm 走包管理器，装到 /opt 需要 root
 *
 * 但「点更新后下到正确的那一个包」是可以做的：清单里按 arch + 格式列出所有产物，
 * 这里按当前平台/架构挑一个，交给系统浏览器下载，用户不用去 Release 页面
 * 自己分辨 arm64/x64、dmg/AppImage/deb/rpm。
 *
 * 本模块只依赖 fs，便于直接单测挑选优先级。
 */

import { readFileSync } from 'fs';
import type { UpdateInstaller } from '@honghu-desktop/common';

export type LinuxDistro = 'debian' | 'rhel' | 'unknown';

export interface PickPlatformInstallerOptions {
	platform: NodeJS.Platform;
	/** process.arch（x64 / arm64 / ia32 …） */
	arch: string;
	/** linux 发行版家族：没有 AppImage 时用来在 deb / rpm 之间选 */
	distro?: LinuxDistro;
}

export interface PlatformInstallerPick {
	installer: UpdateInstaller;
	/** 给用户看的安装指引（一句话） */
	guide: string;
}

/** electron 与 electron-builder 的 arch 命名一致，这里只做别名归一 */
export function normalizeArch(arch: string): string {
	const a = String(arch || '').toLowerCase();
	if (a === 'x64' || a === 'amd64' || a === 'x86_64') return 'x64';
	if (a === 'arm64' || a === 'aarch64') return 'arm64';
	return a;
}

/**
 * 读 /etc/os-release 判断包管理格式。
 *
 * 只在没有 AppImage 时才用得上（AppImage 永远优先：自包含、免 root、不依赖发行版）。
 */
export function detectLinuxDistro(readFile: (p: string) => string = (p) => readFileSync(p, 'utf8')): LinuxDistro {
	try {
		const text = readFile('/etc/os-release');
		const read = (key: string) => {
			const m = new RegExp('^' + key + '=(.*)$', 'm').exec(text);
			return (m ? m[1] : '').replace(/["']/g, '').toLowerCase();
		};
		const all = `${read('ID')} ${read('ID_LIKE')}`;
		if (/debian|ubuntu|linuxmint|deepin|kylin|uos/.test(all)) return 'debian';
		if (/rhel|fedora|centos|rocky|almalinux|openeuler|anolis|suse/.test(all)) return 'rhel';
	} catch {
		// 文件不存在或没有权限：交给调用方回退
	}
	return 'unknown';
}

/** 安装指引：不同格式差别很大，写错会让用户找不到安装包 */
export function guideForInstaller(platform: NodeJS.Platform, installer: UpdateInstaller): string {
	const name = installer.name || '安装包';
	const ext = String(installer.ext || '').toLowerCase();
	if (platform === 'darwin' || ext === 'dmg') {
		return `已开始下载 ${name}。打开后将「鸿鹄易学」拖进「应用程序」文件夹，选择替换旧版本即可。`;
	}
	if (ext === 'appimage') {
		return `已开始下载 ${name}。用下载的文件替换原来的 AppImage，并保留可执行权限即可。`;
	}
	if (ext === 'deb') {
		return `已开始下载 ${name}。双击用软件商店安装，或执行 sudo dpkg -i ${name}。`;
	}
	if (ext === 'rpm') {
		return `已开始下载 ${name}。执行 sudo rpm -Uvh ${name} 安装。`;
	}
	return `已开始下载 ${name}，安装后重新打开软件即可。`;
}

/**
 * 从清单里挑出当前平台该下的那个包。
 *
 * 硬性约束：架构必须一致。把 arm64 的 dmg 给 x64 机器，用户下载后直接打不开，
 * 比「退回 Release 页面」更糟，所以宁可返回 undefined。
 */
export function pickPlatformInstaller(
	installers: { darwin?: UpdateInstaller[]; linux?: UpdateInstaller[] } | undefined,
	opts: PickPlatformInstallerOptions
): PlatformInstallerPick | undefined {
	if (!installers || opts.platform === 'win32') return undefined;

	const list = opts.platform === 'darwin' ? installers.darwin : opts.platform === 'linux' ? installers.linux : undefined;
	if (!Array.isArray(list) || !list.length) return undefined;

	const arch = normalizeArch(opts.arch);
	// 没写 arch 的老条目按「同架构」处理，避免清单漏字段时整条链路失效
	const sameArch = list.filter((i) => i && (!i.arch || normalizeArch(i.arch) === arch));
	const usable = sameArch.filter((i) => Array.isArray(i.urls) && i.urls.length);
	if (!usable.length) return undefined;

	// 自包含格式优先：dmg / AppImage 不需要 root，也不依赖发行版
	const selfContained = usable.find((i) => /^(dmg|appimage)$/i.test(String(i.ext || '')));
	if (selfContained) return { installer: selfContained, guide: guideForInstaller(opts.platform, selfContained) };

	if (opts.platform === 'linux') {
		const wanted = opts.distro === 'rhel' ? 'rpm' : opts.distro === 'debian' ? 'deb' : null;
		const byDistro = wanted ? usable.find((i) => String(i.ext || '').toLowerCase() === wanted) : undefined;
		if (byDistro) return { installer: byDistro, guide: guideForInstaller(opts.platform, byDistro) };
	}

	const first = usable[0];
	return { installer: first, guide: guideForInstaller(opts.platform, first) };
}
