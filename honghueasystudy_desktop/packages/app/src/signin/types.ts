import type { ChaoxingCookies, Course, SigninAccountConfig, SigninAccountView } from './core/types';

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
	/** 最近一次课程的缓存（仅内存使用） */
	courses?: Course[];
}

/** electron-store 中签到模块的数据结构 */
export interface SigninStoreState {
	accounts: StoredSigninAccount[];
	logs: import('./core/types').SigninLog[];
}

export type { SigninAccountView };
