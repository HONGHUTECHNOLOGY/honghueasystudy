import { RawAutomationScript } from '../components/automation-scripts';
import type { BrowserAutomation } from '@honghu-desktop/app/src/scripts/plan';

export type FolderType = 'folder' | 'root';
export type BrowserType = 'browser';
export type EntityTypes = BrowserType | FolderType;

/** 实体 */
export interface EntityOptions {
	type: EntityTypes;
	/** 实体id */
	uid: string;
	/** 实体名 */
	name: string;
	/** 创建时间 */
	createTime: number;
	/** 是否重命名中 */
	renaming: boolean;
}

export interface Tag {
	/** 标签名字 */
	name: string;
	/** 颜色 */
	color: string;
}

/**
 * 浏览器操作历史记录
 */
export interface BrowserOperateHistory {
	action: '运行' | '重启' | '关闭' | '创建' | '改名' | '添加标签' | '删除标签' | '备注';
	content?: string;
	time: number;
}

/** 浏览器 */
export interface BrowserOptions extends EntityOptions {
	type: BrowserType;
	parent: string;
	/** 浏览器标签 */
	tags: Tag[];
	/** 浏览器备注 */
	notes: string;
	/** 是否选中 */
	checked: boolean;
	/** 缓存路径 */
	cachePath: string;
	renaming: boolean;
	/** 历史 */
	histories: BrowserOperateHistory[];
	/** 自动化程序列表（每次启动浏览器自动执行） */
	automationScripts: RawAutomationScript[];
	/**
	 * 自动化方案：自动刷课 + 每日定时
	 *
	 * 与 `automationScripts` 分工：脚本负责「把号登上」，方案负责
	 * 「登上去以后进哪门课、什么时间自动来一趟、到点怎么收尾」。
	 */
	automation?: BrowserAutomation;
}

/**
 * 浏览器文件夹
 */
export interface FolderOptions<T extends FolderType, ChildType> extends EntityOptions {
	type: T;
	parent: T extends 'root' ? undefined : string;
	children: Record<string, ChildType>;
}
