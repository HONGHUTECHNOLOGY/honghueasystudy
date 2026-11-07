/**
 * 超星签到助手主进程入口
 *
 * 渲染进程通过 remote.methods.signin* 调用，方法名需保持扁平结构。
 */
export {
	choosePhoto,
	checkAccount,
	clearLogs,
	defaultConfig,
	getAccount,
	getLogs,
	listViews,
	loginAccount,
	removeAccount,
	signActivity,
	updateConfig
} from './manager';
export { isMonitoring, startMonitor, stopMonitor } from './monitor';
export type { CheckResult } from './manager';
