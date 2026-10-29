import { ipcMain, app, dialog, BrowserWindow, desktopCapturer, safeStorage, shell } from 'electron';
import { Logger } from '../logger';
import { autoLaunch } from './auto.launch';
import axios, { AxiosRequestConfig } from 'axios';
import { downloadFile, moveWindowToTop, unzip, zip } from '../utils';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import child_process from 'child_process';
import { HonghuApi, getValidBrowsers } from '@honghu-desktop/common';
import si from 'systeminformation';
import { store } from '../store';
import { exportExcel } from '../utils/index';
import { readdir, stat } from 'fs/promises';
import { updateApp, checkUpdate, installUpdate } from './updater';
import { AutomationScripts } from '../scripts';
import { AutomationScript } from '../scripts/script';
import { getBrowserMajorVersion, getBuiltinExtensionPaths, getExtensionPaths } from '../utils/browser';
import { AppStore } from '../../types';
import { encryptRenderString, decryptRenderString } from '../crypto';
import { remoteControl } from './remote-control';

export type RawAutomationScript = Pick<AutomationScript, 'configs' | 'name'>;

/**
 * 由主进程独占维护、渲染端无权覆盖的顶层配置。
 * 渲染进程保存设置时必须沿用主进程的当前值，否则会把主进程侧的修改回滚掉。
 */
const MAIN_OWNED_KEYS: (keyof AppStore)[] = ['remoteControl', 'paths', 'server'];
/**
 * 注册主进程远程通信事件
 * @param name 事件前缀名称
 * @param target 事件目标
 */
function registerRemoteEvent(name: string, target: any) {
	const logger = Logger('remote');
	try {
		ipcMain
			.on(name + '-get', (event, [property]) => {
				try {
					// logger.info({ event: name + '-get', args: [property] });
					event.returnValue = target[property];
				} catch (e) {
					event.returnValue = { error: e };
				}
			})
			.on(name + '-set', (event, [property, value]) => {
				try {
					// logger.info({ event: name + '-set', args: [property, value] });
					event.returnValue = target[property] = value;
				} catch (e) {
					event.returnValue = { error: e };
				}
			})

			/** 异步调用 */
			.on(
				name + '-call',
				async (
					event,
					[
						/** 回调id */
						respondChannel,
						property,
						...args
					]
				) => {
					// logger.info({ event: name + '-call', args });
					const safeReply = (payload: { data?: any; error?: any }) => {
						try {
							if (!event.sender.isDestroyed()) {
								event.sender.send(respondChannel, payload);
							}
						} catch {}
					};
					try {
						const result = await target[property](...args);
						safeReply({ data: result });
					} catch (e) {
						safeReply({ error: e });
					}
				}
			)

			/** 同步调用 */
			.on(name + '-call-sync', (event, [property, ...args]) => {
				// logger.info({ event: name + '-call-sync', args: [property] });
				try {
					const result = target[property](...args);
					event.returnValue = { data: result };
				} catch (e) {
					event.returnValue = { error: e };
				}
			});
	} catch (err) {
		logger.error(err);
	}
}

let win: BrowserWindow | undefined;

const unzipLogger = Logger('remote-unzip');

/**
 * 应用中心资源解压（web 端 resourceLoader.unzip 远程调用入口）。
 * linux 优先用系统 unzip：JS 解压库不保留可执行权限与符号链接（参照 init.chrome.ts / init.ocr.ts 先例）；
 * 系统命令缺失时回退 JS 解压，并对解压产物中的 ocr 二进制补 chmod 0o755 兜底
 * （顺带修复 darwin 下应用中心安装 OCR 后因 +x 丢失导致 canOCR=false 的潜在问题）。
 * win32 保持原有行为（直接 JS 解压）。
 */
async function unzipResource(input: string, output: string) {
	if (process.platform === 'linux') {
		try {
			child_process.execFileSync('unzip', ['-o', input, '-d', output], { stdio: 'ignore' });
			return;
		} catch (e) {
			unzipLogger.warn('系统 unzip 不可用，回退到内置解压', e);
		}
	}
	await unzip(input, output);
	if (process.platform !== 'win32') {
		// JS 解压丢执行权限兜底：解压产物中存在 ocr 二进制时补 +x
		const binary = path.join(output, 'ocr');
		if (fs.existsSync(binary)) {
			try {
				fs.chmodSync(binary, 0o755);
			} catch (e) {
				unzipLogger.warn('补 OCR 可执行权限失败', e);
			}
		}
	}
}

/** 需远程共享的方法 */
const methods = {
	autoLaunch,
	get: (url: string, config?: AxiosRequestConfig<any> | undefined) => axios.get(url, config).then((res) => res.data),
	getWithStatus: (url: string, config?: AxiosRequestConfig<any> | undefined) =>
		axios.get(url, { ...config, validateStatus: () => true }).then((res) => ({ status: res.status, data: res.data })),
	post: (url: string, config?: AxiosRequestConfig<any> | undefined) => axios.post(url, config).then((res) => res.data),
	download: (channel: string, url: string, dest: string) => {
		/** 下载文件 */
		return downloadFile(url, dest, (rate: any, totalLength: any, chunkLength: any) => {
			win?.webContents?.send('download', channel, rate, totalLength, chunkLength);
		});
	},
	zip: zip,
	unzip: unzipResource,
	getValidBrowsers: getValidBrowsers,
	getBrowserMajorVersion: getBrowserMajorVersion,
	getExtensionPaths: getExtensionPaths,
	getBuiltinExtensionPaths: getBuiltinExtensionPaths,
	systemProcesses: () => si.processes(),
	exportExcel: exportExcel,
	statisticFolderSize: statisticFolderSize,
	getPlatform: () => process.platform,
	getArch: () => process.arch,
	/** 打开文件夹/文件（开发者调试导出目录等） */
	openFolder: (target: string) => {
		if (typeof target !== 'string' || !target) throw new Error('路径为空');
		return shell.openPath(target);
	},
	updateApp: updateApp,
	installUpdate: installUpdate,
	/** 手动检测更新（设置页/侧边栏版本号触发）：返回结构化的检测结果供 UI 展示 */
	checkUpdate: () => checkUpdate(true),
	moveWindowToTop: moveWindowToTop,
	isEncryptionAvailable: () => {
		return safeStorage.isEncryptionAvailable();
	},
	isDirectory: (path: string) => fs.statSync(path).isDirectory(),
	getRawScripts: () => JSON.parse(JSON.stringify(AutomationScripts)) as RawAutomationScript[],
	captureDesktopScreen: () => {
		return desktopCapturer.getSources({ types: ['window'] });
	},
	encryptRenderString,
	decryptRenderString,
	/** 一次性完成加密和存储，避免二次 IPC 调用 */
	saveStore: (plainStoreJson: string, shouldEncrypt: boolean): void => {
		const storeData: AppStore = JSON.parse(plainStoreJson);
		if (shouldEncrypt && safeStorage.isEncryptionAvailable()) {
			// @ts-ignore
			storeData.render = encryptRenderString(JSON.stringify(storeData.render));
		}

		/**
		 * 主进程独占的配置不能被渲染端的整份快照覆盖。
		 *
		 * 渲染端的 store 只是页面加载时的一份拷贝，之后主进程对 remoteControl 的修改
		 * （开隧道、改端口、改验证方式）它并不知道。整份写回会把 remoteControl 退回旧值，
		 * 表现为：点「启动浏览器」触发了自动保存 → 内网穿透开关自己关掉、隧道消失。
		 */
		const current = store.store as Partial<AppStore> | undefined;
		for (const key of MAIN_OWNED_KEYS) {
			const value = current ? (current as any)[key] : undefined;
			if (value !== undefined) {
				(storeData as any)[key] = value;
			}
		}

		store.store = storeData;
	},

	// ------------------------------------------------------------ 远程控制
	// 注意：remote 通道只支持一层方法名，因此这里全部扁平化为 rc* 前缀。
	rcStatus: () => remoteControl.getStatus(),
	rcSetEnabled: (enabled: boolean) => remoteControl.setEnabled(enabled),
	rcStart: () => remoteControl.start(),
	rcStop: () => remoteControl.stop(),
	rcDetectNetwork: (force?: boolean) => remoteControl.detectNetwork(force),
	rcGetQRCode: (url?: string) => remoteControl.getQRCode(url),
	rcRefreshPairCode: () => remoteControl.refreshPairCode(),
	rcSetAuthMode: (mode: 'pair' | 'password' | 'none') => remoteControl.setAuthMode(mode),
	rcSetPassword: (password: string) => remoteControl.setPassword(password),
	rcClearPassword: () => remoteControl.clearPassword(),
	rcListSessions: () => remoteControl.listSessions(),
	rcRevokeSession: (id: string) => remoteControl.revokeSession(id),
	rcSetTunnel: (enabled: boolean) => remoteControl.setTunnel(enabled),
	rcSetPort: (port: number) => remoteControl.setPort(port),
	rcSetAllowLan: (allowLan: boolean) => remoteControl.setAllowLan(allowLan),
	rcGetExternalTestUrl: () => remoteControl.getExternalTestUrl()
};

export type RemoteMethods = typeof methods;

/**
 * 初始化远程通信
 */
export function remoteRegister(_win: BrowserWindow) {
	win = _win;
	registerRemoteEvent('electron-store', store);
	registerRemoteEvent('fs', fs);
	registerRemoteEvent('os', os);
	registerRemoteEvent('path', path);
	registerRemoteEvent('crypto', crypto);
	registerRemoteEvent('HonghuApi', HonghuApi);

	registerRemoteEvent('win', _win);
	registerRemoteEvent('webContents', _win.webContents);
	registerRemoteEvent('app', app);
	registerRemoteEvent('dialog', dialog);
	registerRemoteEvent('methods', methods);
	registerRemoteEvent('logger', Logger('render'));
	registerRemoteEvent('desktopCapturer', desktopCapturer);

	/** 远程控制：渲染进程上报状态 / 回传命令结果 */
	ipcMain.on('remote-ctl:state', (_event, snapshot) => {
		try {
			remoteControl.handleState(snapshot);
		} catch (e) {
			Logger('remote-ctl').error('state 处理失败', e);
		}
	});

	ipcMain.on('remote-ctl:result', (_event, payload) => {
		try {
			remoteControl.handleCommandResult(payload);
		} catch (e) {
			Logger('remote-ctl').error('result 处理失败', e);
		}
	});
}

const _registerRemoteEvent = registerRemoteEvent;
export { _registerRemoteEvent as registerRemoteEvent };

async function statisticFolderSize(dir: string) {
	const files = await readdir(dir, { withFileTypes: true });

	const paths: Promise<number>[] = files.map(async (file) => {
		const _path = path.join(dir, file.name);
		if (file.isDirectory()) return await statisticFolderSize(_path);

		if (file.isFile()) {
			const { size } = await stat(_path);
			return size;
		}
		return 0;
	});

	return (await Promise.all(paths)).flat().reduce((i, size) => i + size, 0);
}
