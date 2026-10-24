export interface CatalogEntry {
	name: string;
	url: string;
	description?: string;
	icon?: string;
}

export interface RemoteBookmarkGroup {
	group: string;
	values: CatalogEntry[];
}

/** 无法连接云端配置时仍然可用的学习平台基线。 */
export const OFFLINE_PLATFORMS: CatalogEntry[] = [
	{
		name: '超星学习通',
		url: 'https://chaoxing.com',
		description: '课程学习、章节任务与作业考试一站式入口',
		icon: 'https://p.cldisk.com/star4/dcb106498481d321698946d8dc01ec20/origin.png'
	},
	{
		name: '知道智慧树',
		url: 'https://www.zhihuishu.com',
		description: '进入知到智慧树，继续你的共享课程',
		icon: 'https://assets.zhihuishu.com/icon/favicon.ico'
	},
	{
		name: '智慧职教',
		url: 'https://mooc.icve.com.cn/cms/index.do',
		description: '智慧职教 MOOC 学院课程学习入口',
		icon: 'https://mooc.icve.com.cn/favicon.ico'
	},
	{
		name: '职教云',
		url: 'https://zjy2.icve.com.cn/',
		description: '职业教育课程学习与课堂任务平台',
		icon: 'https://zjy2.icve.com.cn/favicon.ico'
	},
	{
		name: '中国大学MOOC',
		url: 'https://www.icourse163.org/',
		description: '汇聚优质高校课程的开放式学习平台',
		icon: 'https://edu-image.nosdn.127.net/32a8dd2a-b9aa-4ec9-abd5-66cd8751befb.png'
	},
	{
		name: '雨课堂',
		url: 'https://www.yuketang.cn/web',
		description: '连接课堂内外的智慧教学与学习工具',
		icon: 'https://www.yuketang.cn/static/images/favicon.ico'
	},
	{
		name: 'U校园',
		url: 'https://uai.unipus.cn/',
		description: '外语课程学习、练习与能力训练平台'
	}
];

/** 产品与开源入口独立维护，不参与学习平台搜索和更新。 */
export const OFFLINE_OFFICIAL_SITES: CatalogEntry[] = [
	{
		name: '鸿鹄易学官网',
		url: 'https://easystudy.honghutech.eu.org',
		description: '教程、版本动态与项目信息',
		icon: '/favicon.png'
	},
	{
		name: 'GitCode 仓库',
		url: 'https://gitcode.com/honghutech/honghueasystudy',
		description: '项目源码与国内协作入口',
		icon: '/favicon.png'
	},
	{
		name: 'GitHub 仓库',
		url: 'https://github.com/HONGHUTECHNOLOGY/honghueasystudy',
		description: '开放源代码与版本记录',
		icon: '/favicon.png'
	},
	{
		name: '鸿鹄科技官网',
		url: 'https://honghutech.eu.org',
		description: '了解鸿鹄科技与更多产品',
		icon: '/favicon.png'
	}
];

const HIDDEN_GROUPS = ['脚本托管&拓展', '资源/论坛'];
const OFFICIAL_PATTERN = /官网|官方|仓库|开源|GitCode|GitHub|社区|论坛/i;

function normalizedUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return `${parsed.hostname.replace(/^www\./i, '')}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
	} catch {
		return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
	}
}

function isOfficialGroup(group: string): boolean {
	return OFFICIAL_PATTERN.test(group);
}

function isOfficialEntry(entry: CatalogEntry): boolean {
	return OFFICIAL_PATTERN.test(`${entry.name} ${entry.url}`);
}

/** 在线条目覆盖离线字段，但绝不用空值清空可用信息。 */
function mergeEntry(target: CatalogEntry[], incoming: CatalogEntry) {
	const key = normalizedUrl(incoming.url);
	const existing = target.find((entry) => normalizedUrl(entry.url) === key || entry.name === incoming.name);
	if (!existing) {
		target.push({ ...incoming, description: incoming.description || '点击前往学习平台' });
		return;
	}
	existing.name = incoming.name || existing.name;
	existing.url = incoming.url || existing.url;
	existing.description = incoming.description || existing.description;
	existing.icon = incoming.icon || existing.icon;
}

/**
 * 以本地基线为骨架合并云端数据：
 * 离线时保持完整；在线配置存在时更新旧入口，并补充新平台。
 */
export function buildCatalog(groups: RemoteBookmarkGroup[]): { platforms: CatalogEntry[]; officialSites: CatalogEntry[] } {
	const platforms = OFFLINE_PLATFORMS.map((entry) => ({ ...entry }));
	const officialSites = OFFLINE_OFFICIAL_SITES.map((entry) => ({ ...entry }));

	for (const group of groups) {
		if (HIDDEN_GROUPS.includes(group.group)) continue;
		for (const entry of group.values || []) {
			if (!entry?.name || !entry?.url) continue;
			const target = isOfficialGroup(group.group) || isOfficialEntry(entry) ? officialSites : platforms;
			mergeEntry(target, entry);
		}
	}

	return { platforms, officialSites };
}
