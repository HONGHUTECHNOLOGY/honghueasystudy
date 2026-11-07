/**
 * 监听运行时状态
 *
 * 独立成模块，避免 manager 与 monitor 互相 import 形成循环依赖。
 */
export interface MonitorRuntime {
	accountId: string;
	monitoring: boolean;
	checking: boolean;
	/** IM 实时监听状态 */
	imStatus: 'off' | 'connecting' | 'opened' | 'failed';
	/** IM 用户信息（群聊预签需要） */
	imName?: string;
	imTuid?: string;
	/** 上一次轮询结果，用于避免重复刷日志 */
	lastCode?: string;
	/** 已处理过的活动 id，避免重复签到 */
	signedActivities: Set<string>;
	/** 已提示过的活动 id（自动签到关闭时只提示一次） */
	reportedActivities: Set<string>;
	startedAt: number;
	timer?: ReturnType<typeof setTimeout>;
}

export const runtimes = new Map<string, MonitorRuntime>();

export function getRuntime(accountId: string): MonitorRuntime | undefined {
	return runtimes.get(accountId);
}

export function getRuntimeSnapshot(accountId: string) {
	const rt = runtimes.get(accountId);
	return {
		monitoring: !!rt?.monitoring,
		checking: !!rt?.checking,
		imStatus: rt?.imStatus || ('off' as const)
	};
}
