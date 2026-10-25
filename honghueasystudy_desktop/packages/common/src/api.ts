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
	url: string;
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
	static async getInfos(): Promise<Infos> {
		// 站点对未知路径会回退返回 index.html（状态码 200），必须校验响应形状
		for (const url of [APP_INFOS_URL, LEGACY_APP_INFOS_URL]) {
			try {
				const { data } = await axios.get(url + '?t=' + Date.now());
				if (data && typeof data === 'object' && Array.isArray((data as Infos).bookmark)) {
					return data as Infos;
				}
			} catch {}
		}
		return { userjs: {}, resourceGroups: [], bookmark: [], notify: [], banners: [], versions: [] } as unknown as Infos;
	}
}
