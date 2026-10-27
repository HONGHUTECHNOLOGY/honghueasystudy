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

/** 版本更新信息 */
export interface UpdateInformationResource {
	tag: string;
	description: Record<'feat' | 'fix' | 'other', string[]>;
	/** Windows 就地更新包（zip，根目录即 resources/app 的内容） */
	url: string;
	/**
	 * 更新包 SHA256（小写 hex）。
	 * 存在时主进程会在覆盖前校验，不匹配立即中止，绝不改动当前安装。
	 * 由 scripts/pack-app-update.js 生成，写入清单时一并带上。
	 */
	sha256?: string;
	/** 更新包字节大小，用于下载前磁盘预检与进度兜底 */
	size?: number;
	/** 各平台安装包（mac / linux 检测到新版本后打开对应下载页手动安装） */
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
}
