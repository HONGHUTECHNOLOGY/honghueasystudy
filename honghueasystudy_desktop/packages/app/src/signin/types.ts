import type { ChaoxingCookies, Course, SigninAccountConfig, SigninAccountView } from './core/types';

/**
 * 一条已签到记录
 *
 * 超星的签到活动结束后仍会在活动列表里保留一段时间（两小时内都算有效），
 * 只靠服务端活动状态没法区分「能签」和「已经签过」，所以本地按活动 id 台账。
 */
export interface SigninRecord {
	/** 活动 id */
	activeId: string;
	/** 活动名称 */
	name: string;
	/** 签到时间 */
	time: number;
	/** 签到结果文案 */
	message: string;
}

/** 持久化的签到账号 */
export interface StoredSigninAccount {
	id: string;
	phone: string;
	/** 真实姓名 */
	name: string;
	/** DES 加密后的登录密码（已用本机密钥再次 AES 加密） */
	password: string;
	cookies: ChaoxingCookies;
	config: SigninAccountConfig;
	createTime: number;
	lastCheckTime: number;
	lastSignTime: number;
	lastResult: string;
	/** 已签到台账：活动 id -> 记录（主进程维护，用于标注「已签到」） */
	signRecords?: Record<string, SigninRecord>;
	/** 最近一次课程的缓存（仅内存使用） */
	courses?: Course[];
}

/** electron-store 中签到模块的数据结构 */
export interface SigninStoreState {
	accounts: StoredSigninAccount[];
	logs: import('./core/types').SigninLog[];
}

export type { SigninAccountView };
