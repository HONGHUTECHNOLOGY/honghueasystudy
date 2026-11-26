import { app } from 'electron';
import fs from 'fs';
import path from 'path';

/**
 * 隔离调试模式
 *
 * 只通过 `HH_DEBUG_USER_DATA` 环境变量（或 `--hh-user-data=<dir>` 参数）开启：
 * 把 userData / sessionData / logs 全部指向独立目录，让调试实例与正式安装版在
 * 配置存档、单实例锁、Chromium 缓存、日志层面完全隔离。
 *
 * ⚠️ 本模块必须在 `store.ts` 读取 `app.getPath('userData')` 之前执行。
 * 入口 `index.ts` 的第一条业务 import 就是本模块；同时各使用方也直接 import，
 * 保证任何入口顺序下都先完成路径覆盖。
 */

const USER_DATA_ENV = 'HH_DEBUG_USER_DATA';
const SERVER_PORT_ENV = 'HH_DEBUG_SERVER_PORT';
const REMOTE_CONTROL_PORT_ENV = 'HH_DEBUG_REMOTE_CONTROL_PORT';

const DEFAULT_DEBUG_SERVER_PORT = 15419;

function readArgumentValue(prefix: string): string | null {
	const arg = process.argv.find((item) => item.startsWith(prefix));
	if (!arg) return null;
	const value = arg.slice(prefix.length).trim();
	return value || null;
}

function parsePort(value: string | undefined, fallback: number): number {
	const port = Number(value);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) return fallback;
	return port;
}

/** 正式版可能使用的数据目录：调试模式禁止指向这些目录，避免污染现有配置 */
function getProtectedUserDataPaths(): string[] {
	const appData = app.getPath('appData');
	return [path.join(appData, '鸿鹄易学'), path.join(appData, '@honghu-desktop', 'app')].map((item) =>
		path.resolve(item).toLowerCase()
	);
}

const isolatedUserData = (() => {
	const raw = (process.env[USER_DATA_ENV] || readArgumentValue('--hh-user-data=') || '').trim();
	if (!raw) return null;

	const resolved = path.resolve(raw);
	const lowered = resolved.toLowerCase();
	for (const protectedPath of getProtectedUserDataPaths()) {
		if (lowered === protectedPath || lowered.startsWith(protectedPath + path.sep)) {
			throw new Error(
				`[隔离调试] HH_DEBUG_USER_DATA 指向正式版数据目录（${resolved}），已拒绝启动。` +
					`请改用独立目录，例如 .debug/user-data`
			);
		}
	}
	return resolved;
})();

if (isolatedUserData) {
	/**
	 * setName 必须先于 setPath：
	 * 避免 Electron 在应用名切换时重算默认 userData，覆盖下面显式设置的隔离路径。
	 */
	app.setName('鸿鹄易学');

	const sessionData = path.join(isolatedUserData, 'session-data');
	const logs = path.join(isolatedUserData, 'logs');
	fs.mkdirSync(sessionData, { recursive: true });
	fs.mkdirSync(logs, { recursive: true });

	app.setPath('userData', isolatedUserData);
	app.setPath('sessionData', sessionData);
	app.setPath('logs', logs);
}

/** 当前是否运行在隔离调试模式 */
export function isIsolatedDebug(): boolean {
	return isolatedUserData !== null;
}

/** 隔离调试的数据目录（非隔离模式为 null） */
export function getIsolatedUserDataPath(): string | null {
	return isolatedUserData;
}

/**
 * 调试实例的本地服务端口
 *
 * 默认 15419：正式版固定 15319，两个实例可以同时运行，互不抢占端口。
 */
export function getDebugServerPort(): number {
	return parsePort(process.env[SERVER_PORT_ENV], DEFAULT_DEBUG_SERVER_PORT);
}

/** 调试实例的远程控制端口，默认跟随服务端口 +1，避免与正式版的 15320 冲突 */
export function getDebugRemoteControlPort(): number {
	return parsePort(process.env[REMOTE_CONTROL_PORT_ENV], getDebugServerPort() + 1);
}
