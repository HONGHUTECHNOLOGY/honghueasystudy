import { $, $store, Script } from 'easy-us';
import { request } from '@honghu/core';
import { ANSWER_CONFIG_KEYS, planMerge } from './answer-config-merge';

/**
 * 答题 / AI 配置与桌面端的双向同步
 *
 * 背景：扩展的配置本来只存在本浏览器 profile 的 `chrome.storage.local` 里，
 * 换一台浏览器就得重新配一遍 AI Key。桌面端提供一个本地服务（15319）后，
 * 可以把这份配置集中存在桌面端，由扩展按开关决定用哪种作用域：
 *
 * - **shared**（开关打开，默认）：全桌面端共享一份，任何浏览器读到和改的都是同一份；
 * - **browser**（开关关闭）：按浏览器实例 uid 各存一份，互不影响。
 *
 * 两种模式的配置都存在桌面端；只有桌面端不可用时才退回本浏览器本地存储。
 *
 * 同步时机：每次页面加载（settings 脚本 oncomplete）拉一次；本地改动 400ms 防抖推上去。
 * 因此「其它浏览器改了共享配置」在本浏览器下次加载页面时生效。
 */

const SERVER = 'http://localhost:15319';
/** 推送防抖：改 AI Key 时是逐字符触发，不能每次都打一次请求 */
const PUSH_DEBOUNCE_MS = 400;

type Scope = 'shared' | 'browser';

/** 正在把远端值写进本地，此期间的变更事件不能再推回远端（否则打乒乓） */
let applying = false;
let browserUid = '';
let currentScope: Scope = 'shared';
let desktopAvailable = false;
let inited = false;

const pending: Record<string, any> = {};
let pushTimer: any = null;

/** 桌面端是否在线（顺带验证端口没被别的程序占用） */
async function probeDesktop() {
	try {
		const res = await request(`${SERVER}/state`, {
			type: 'GM_xmlhttpRequest',
			method: 'get',
			responseType: 'json'
		});
		return !!res?.project;
	} catch (e) {
		return false;
	}
}

/**
 * 取当前浏览器实例的 uid。
 *
 * 桌面端启动浏览器时会在 BrowserContext 上注册 `/hh-environment` 路由，
 * 任意域名下请求这个路径都会被本地伪造应答（不会真的发到网课服务器）。
 * 普通浏览器里没有这个路由，请求失败 → 返回空串，调用方据此降级。
 */
async function fetchBrowserUid() {
	try {
		const res = await request('/hh-environment', { type: 'fetch', method: 'get' });
		return typeof res?.browserUid === 'string' ? res.browserUid : '';
	} catch (e) {
		return '';
	}
}

async function readRemoteConfig(): Promise<Record<string, any> | null> {
	try {
		const qs = currentScope === 'browser' ? `&uid=${encodeURIComponent(browserUid)}` : '';
		const res = await request(`${SERVER}/api/answer-config?scope=${currentScope}${qs}`, {
			type: 'GM_xmlhttpRequest',
			method: 'get',
			responseType: 'json'
		});
		return res?.config && typeof res.config === 'object' ? res.config : {};
	} catch (e) {
		return null;
	}
}

async function writeRemoteConfig(patch: Record<string, any>) {
	if (!Object.keys(patch).length) return;
	try {
		await request(`${SERVER}/api/answer-config`, {
			type: 'GM_xmlhttpRequest',
			method: 'post',
			responseType: 'json',
			headers: { 'Content-Type': 'application/json' },
			data: { scope: currentScope, uid: browserUid, config: patch }
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.warn(`[鸿鹄] [配置同步] 写入桌面端失败：${msg}`);
	}
}

/** 攒 400ms 一起推，避免逐字符打请求 */
function schedulePush() {
	if (applying) return;
	clearTimeout(pushTimer);
	pushTimer = setTimeout(() => {
		const patch: Record<string, any> = {};
		for (const k of Object.keys(pending)) {
			patch[k] = pending[k];
			delete pending[k];
		}
		void writeRemoteConfig(patch);
	}, PUSH_DEBOUNCE_MS);
}

/**
 * 拉取并合并。
 *
 * 合并规则按「谁的更可信」来：
 * - 远端有值 → 用远端（共享配置以桌面端为准，多个浏览器才不会各说各话）；
 * - 远端为空、本地有值 → 把本地推上去（首次启用时的迁移，避免用户辛苦配的 Key 被清空）；
 * - 两边都空 → 什么都不做。
 */
async function pullAndMerge() {
	const remote = await readRemoteConfig();
	if (!remote) return;

	const local: Record<string, any> = {};
	for (const key of ANSWER_CONFIG_KEYS) local[key] = $store.get(key);

	const { apply, push } = planMerge(remote, local);

	for (const key of Object.keys(apply)) $store.set(key, apply[key]);

	if (Object.keys(apply).length) {
		console.log(
			`[鸿鹄] [配置同步] 已从桌面端载入 ${Object.keys(apply).length} 项配置（${currentScope === 'shared' ? '全浏览器共享' : '本浏览器独立'}）`
		);
	}
	if (Object.keys(push).length) {
		await writeRemoteConfig(push);
		console.log(`[鸿鹄] [配置同步] 已把本地 ${Object.keys(push).length} 项配置上传到桌面端`);
	}
}

/**
 * 初始化（每次页面加载调一次）
 *
 * @param isSharedMode 当前是否「使用桌面端统一配置」
 * @param watchers     需要监听的脚本与其配置键（短键名），值一变就推上去
 */
export async function initAnswerConfigSync(
	isSharedMode: () => boolean,
	watchers: { script: Script<any, any>; keys: string[] }[]
) {
	if (inited || !$.isInTopWindow()) return;
	inited = true;

	desktopAvailable = await probeDesktop();
	if (!desktopAvailable) {
		console.log('[鸿鹄] [配置同步] 未检测到鸿鹄易学桌面端，题库与 AI 配置使用本浏览器本地存储');
		return;
	}

	browserUid = await fetchBrowserUid();
	currentScope = isSharedMode() ? 'shared' : 'browser';

	if (currentScope === 'browser' && !browserUid) {
		// 没有实例标识就无法区分「本浏览器的独立配置」，退回本地，避免几个浏览器共用一份
		console.log('[鸿鹄] [配置同步] 未取到浏览器实例标识，改为仅在本浏览器本地保存');
		desktopAvailable = false;
		return;
	}

	console.log(
		currentScope === 'shared'
			? '[鸿鹄] [配置同步] 题库与 AI 配置：使用桌面端统一配置（所有浏览器共享）'
			: `[鸿鹄] [配置同步] 题库与 AI 配置：本浏览器单独保存（uid=${browserUid}）`
	);

	await pullAndMerge();

	/** 本地改动 → 推回桌面端 */
	for (const { script, keys } of watchers) {
		for (const key of keys) {
			script.onConfigChange(key as any, (curr: any) => {
				if (applying || !desktopAvailable) return;
				const fullKey = script.namespace ? `${script.namespace}.${key}` : key;
				pending[fullKey] = curr;
				schedulePush();
			});
		}
	}
}

/** 开关本身变化时重新选作用域（配置不会丢：新作用域为空就把当前值推上去） */
export async function reinitAnswerConfigSync(isSharedMode: boolean) {
	if (!desktopAvailable) return;
	const nextScope: Scope = isSharedMode ? 'shared' : 'browser';
	if (nextScope === currentScope) return;
	if (nextScope === 'browser' && !browserUid) {
		console.log('[鸿鹄] [配置同步] 未取到浏览器实例标识，无法切换为独立配置');
		return;
	}
	currentScope = nextScope;
	applying = true;
	try {
		await pullAndMerge();
		console.log(
			currentScope === 'shared'
				? '[鸿鹄] [配置同步] 已切换为桌面端统一配置'
				: `[鸿鹄] [配置同步] 已切换为本浏览器独立配置（uid=${browserUid}）`
		);
	} finally {
		applying = false;
	}
}
