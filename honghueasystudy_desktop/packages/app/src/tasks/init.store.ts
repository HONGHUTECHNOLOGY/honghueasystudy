// @ts-check

import { app } from 'electron';
import { existsSync, mkdirSync } from 'fs';
import { OriginalAppStore, store, getDecryptedRenderData } from '../store';
import { encryptRenderString } from '../crypto';
import { valid, coerce, clean, gt, SemVer } from 'semver';
import defaultsDeep from 'lodash/defaultsDeep';
import { Logger } from '../logger';
import path from 'path';

const logger = Logger('store-init');

/**
 * 初始化配置
 */
export function initStore() {
	/**
	 * 旧存档迁移：补齐「后台托盘运行 / 开机启动」的默认值
	 *
	 * 老版本没有 `window.tray` 字段，且 `window.autoLaunch` 旧默认是关闭。
	 * 新版本两项默认开启（用于开机后按定时任务自动执行脚本），这里一次性补写；
	 * 必须在下面的 defaultsDeep 之前判断，否则 tray 会被提前补齐、识别不出旧存档。
	 * 迁移只做一次（补完后 tray 就是 boolean），之后完全尊重用户在设置里的开关。
	 */
	try {
		const windowStore = store.store.window as (Record<string, unknown> & { tray?: unknown }) | undefined;
		if (windowStore && typeof windowStore.tray !== 'boolean') {
			store.set('window', { ...windowStore, tray: true, autoLaunch: true });
			logger.log('旧存档已启用默认：后台托盘运行、开机启动');
		}
	} catch (e) {
		logger.error('迁移托盘/开机启动默认值失败', e);
	}

	const version = store.store.version;
	logger.log('version', version);

	if (typeof version === 'string') {
		// 当前app版本
		const appVersion = parseVersion(app.getVersion());
		// 本地存储的app版本
		const originVersion = parseVersion(version);
		// 是否需要更新设置
		if (gt(appVersion, originVersion)) {
			store.store = defaultsDeep(store.store, OriginalAppStore);
		}
	}
	//  初始化
	else {
		const render = store.store.render ? JSON.parse(JSON.stringify(store.store.render)) : {};
		OriginalAppStore.render = render;
		// 初始化设置
		store.store = OriginalAppStore;

		logger.log('store', store.store);
	}

	// 迁移：旧版本配置键 render.setting.ocs → render.setting.hh（一次性，保留用户的题库配置等数据）
	try {
		const wasEncrypted = typeof store.store.render === 'string';
		const renderData = getDecryptedRenderData(store) as { setting?: Record<string, unknown> } | undefined;
		const legacySetting = renderData?.setting;
		if (legacySetting && legacySetting.ocs !== undefined) {
			if (legacySetting.hh === undefined) {
				legacySetting.hh = legacySetting.ocs;
			}
			delete legacySetting.ocs;
			// 保持原有存储格式（明文对象 / 加密字符串）
			store.set('render', wasEncrypted ? encryptRenderString(JSON.stringify(renderData)) : renderData);
			logger.log('已迁移旧配置键 setting.ocs → setting.hh');
		}
	} catch (e) {
		logger.error('迁移旧配置键失败', e);
	}

	/**
	 * 如果浏览器缓存为空，则初始化，如果不为空那就是用户自己设置了
	 */
	if (!store.store.paths.userDataDirsFolder) {
		OriginalAppStore.paths.userDataDirsFolder = path.resolve(app.getPath('userData'), './userDataDirs');
	} else {
		OriginalAppStore.paths.userDataDirsFolder = store.store.paths.userDataDirsFolder;
	}

	// 强制更新路径
	store.set('paths', OriginalAppStore.paths);

	if (!existsSync(store.store.paths.userDataDirsFolder)) {
		mkdirSync(store.store.paths.userDataDirsFolder, { recursive: true });
	}
	if (!existsSync(store.store.paths.extensionsFolder)) {
		mkdirSync(store.store.paths.extensionsFolder, { recursive: true });
	}
	if (!existsSync(store.store.paths.downloadFolder)) {
		mkdirSync(store.store.paths.downloadFolder, { recursive: true });
	}
}

/** 字符串转换成版本对象 */
function parseVersion(version: string) {
	return new SemVer(valid(coerce(clean(version, { loose: true }))) || '0.0.0');
}
