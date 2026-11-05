import axios from 'axios';

/** 资源文件 */
export interface ResourceFile {
	/** 唯一ID */
	id: string;
	name: string;
	url: string;
	description?: string;
	icon?: string;
	homepage?: string;
	platforms?: {
		// eslint-disable-next-line no-undef
		platform: NodeJS.Platform;
		/** 可选架构标识（process.arch，如 x64/arm64）：同平台多架构资源（linux x64/arm64）区分用；缺省视为平台默认资源 */
		arch?: string;
		url: string;
	}[];
}

/** 资源组 */
export interface ResourceGroup {
	/** 资源分组名，全英文，用于本地下载时文件夹分组 */
	name: string;
	/** 资源组描述 */
	description: string;
	/** 是否显示在应用中心页面 */
	showInResourcePage: boolean;
	/**  文件列表 */
	files: ResourceFile[];
}

export interface ResourceLoaderOptions {
	/** 本地资源下载根目录 */
	resourceRootPath: string;
}

/** 通知信息 */
export interface NotifyResource {
	id: string;
	content: string[];
}

/** Banner 通知 */
export interface BannerResource {
	title: string;
	content: string;
	type?: 'info' | 'warning' | 'success' | 'error';
}

/** 单个平台安装包的下载信息 */
export interface UpdateInstaller {
	/** 多源地址，按优先级排列（如 [GitCode, GitHub]）；各源必须是字节一致的同一个文件 */
	urls: string[];
	/** 安装包 SHA256（小写 hex），下载后校验，不匹配立即中止 */
	sha256?: string;
	/** 字节大小，用于完整性复核与进度兜底 */
	size?: number;
	/** 文件名，仅用于日志与本地临时文件名 */
	name?: string;
	/** CPU 架构：mac/linux 有 arm64 与 x64 两套产物，必须按架构挑选，下错架构装不上 */
	arch?: string;
	/** 安装包格式：dmg / AppImage / deb / rpm */
	ext?: string;
}

/** 更新日志：一个版本对应若干组「面向用户」的条目 */
export interface ChangelogVersion {
	version: string;
	/** YYYY-MM-DD，可能为空（旧版本段落没记日期） */
	date?: string;
	sections: {
		/** 已归一化的小节名：新功能 / 问题修复 / 性能优化 */
		title: string;
		items: string[];
	}[];
}

/** 官网 /api/changelog.json 的形状（由 scripts/gen-changelog-json.js 生成，已过滤掉工程条目） */
export interface ChangelogFile {
	generatedAt?: string;
	latest?: string;
	versions: ChangelogVersion[];
}

/** 版本更新信息 */
export interface UpdateInformationResource {
	tag: string;
	description: Record<'feat' | 'fix' | 'other', string[]>;
	/**
	 * 本次更新涉及的更新日志（新 → 旧，只包含比当前版本新的那些）。
	 *
	 * 主进程在推送「发现新版本」前拉好塞进来：渲染端拿不到更新日志时也要能弹窗，
	 * 所以它是可选的，缺了就不显示日志区域。
	 */
	notes?: ChangelogVersion[];
	/**
	 * 各平台安装包的下载信息。
	 *
	 * Windows 走「下载 → 校验 → setup.exe /S 静默覆盖安装」，这里只需要一个 x64 包；
	 * mac / linux 目前只做「按平台+架构给出直链，由系统浏览器下载后手动安装」，
	 * 因为 mac 未签名（替换 .app 会被 Gatekeeper 拒开）、linux 的 deb/rpm 需要 root。
	 * 所以后两者是数组：同一平台可能有 arm64 / x64，linux 还分 AppImage / deb / rpm。
	 */
	installers?: {
		win32?: UpdateInstaller;
		darwin?: UpdateInstaller[];
		linux?: UpdateInstaller[];
	};
	/**
	 * 旧版就地更新包（zip，根目录即 resources/app 的内容）。
	 * @deprecated 仅为了让已装的旧版本客户端（<= 3.2.0）还能升级上来而保留；
	 * 新版客户端优先走 installers，不再使用它。
	 */
	url?: string;
	/** @deprecated 见 url */
	urls?: string[];
	/** @deprecated 旧 zip 的校验值 */
	sha256?: string;
	/** @deprecated 旧 zip 的字节大小 */
	size?: number;
	/** 各平台安装包下载页（mac / linux 打开对应链接手动安装） */
	app_downloads?: {
		win32?: string;
		darwin?: string;
		linux?: string;
	};
}

/** 官方书签信息 */
export interface BookmarkResource {
	values: {
		name: string;
		url: string;
		description?: string;
		icon?: string;
	}[];
	group: string;
}

export interface Infos {
	userjs: {
		honghu: string;
	};
	resourceGroups: ResourceGroup[];
	bookmark: BookmarkResource[];
	notify: NotifyResource[];
	banners: BannerResource[];
	versions: UpdateInformationResource[];
}

/** 桌面端远程配置：由官网（website/api/，Cloudflare Pages）托管，不再依赖上游 CDN */
export const APP_INFOS_URL = 'https://easystudy.honghutech.eu.org/api/honghu-app-infos.json';
/** 旧文件名（内容与新文件一致）：官网尚未部署新文件名或旧版客户端在线时的回退 */
export const LEGACY_APP_INFOS_URL = 'https://easystudy.honghutech.eu.org/api/ocs-app-infos.json';
/** 面向用户的更新日志（已过滤工程条目），与清单同源同站 */
export const CHANGELOG_URL = 'https://easystudy.honghutech.eu.org/api/changelog.json';

export class HonghuApi {
	/**
	 * 拉取远程配置，失败返回 null。
	 *
	 * 与 getInfos 的区别：这里能区分「拉取失败」和「拉到了但没有内容」。
	 * 更新检测必须用这个版本 —— 否则网络故障会被当成「已是最新版本」，
	 * 用户在设置页点「检查更新」会得到错误结论。
	 */
	static async getInfosSafe(): Promise<Infos | null> {
		// 站点对未知路径会回退返回 index.html（状态码 200），必须校验响应形状
		for (const url of [APP_INFOS_URL, LEGACY_APP_INFOS_URL]) {
			try {
				const { data } = await axios.get(url + '?t=' + Date.now(), { timeout: 15000 });
				if (data && typeof data === 'object' && Array.isArray((data as Infos).bookmark)) {
					return data as Infos;
				}
			} catch {}
		}
		return null;
	}

	static async getInfos(): Promise<Infos> {
		return (
			(await HonghuApi.getInfosSafe()) ||
			({ userjs: {}, resourceGroups: [], bookmark: [], notify: [], banners: [], versions: [] } as unknown as Infos)
		);
	}

	/**
	 * 拉取面向用户的更新日志（已过滤掉工程条目）。
	 *
	 * 失败返回 null 而不是抛错：更新日志只是弹窗里的「顺带看看」，取不到不该
	 * 影响更新本身；调用方按「没有日志区域」处理即可。
	 */
	static async getChangelogSafe(): Promise<ChangelogFile | null> {
		try {
			// 超时给短一点：它挡在更新弹窗前面，网络不好时不该让用户干等
			const { data } = await axios.get(CHANGELOG_URL + '?t=' + Date.now(), { timeout: 5000 });
			// 站点对未知路径会回退 index.html（200），形状不对即视为没拿到
			if (data && typeof data === 'object' && Array.isArray((data as ChangelogFile).versions)) {
				return data as ChangelogFile;
			}
		} catch {}
		return null;
	}
}
