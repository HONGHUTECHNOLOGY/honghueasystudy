/**
 * 答题 / AI 配置的存取逻辑（纯函数，不依赖 electron，便于单测）
 *
 * 作用域：
 * - `shared`：整个桌面端共享一份，任何浏览器读写的都是同一份
 * - `browser`：按浏览器实例 uid 各存一份
 *
 * 数据挂在 `render.setting.hh` 下：
 * - `answerStore`           → shared
 * - `browserAnswerStores`   → browser（键为 uid）
 *
 * 为什么单独存一份，而不是复用 `hh.store`：
 * `hh.store` 是「全量配置同步」的下发源，任何改动都会被推给所有浏览器；
 * 而答题配置要按开关决定「共享 / 本浏览器独立」，混在一起就没法区分了。
 */

export const ANSWER_CONFIG_SCOPES = ['shared', 'browser'] as const;
export type AnswerConfigScope = (typeof ANSWER_CONFIG_SCOPES)[number];

export function isAnswerConfigScope(v: unknown): v is AnswerConfigScope {
	return typeof v === 'string' && (ANSWER_CONFIG_SCOPES as readonly string[]).includes(v);
}

function isPlainObject(v: any) {
	return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** 从整份 render 里读出指定作用域的配置（读不到时返回空对象，不返回 undefined） */
export function readAnswerConfig(render: any, scope: AnswerConfigScope, uid: string): Record<string, any> {
	const hh = render?.setting?.hh;
	if (!hh || typeof hh !== 'object') return {};
	if (scope === 'shared') {
		return isPlainObject(hh.answerStore) ? hh.answerStore : {};
	}
	const stores = hh.browserAnswerStores;
	const hit = isPlainObject(stores) ? stores[uid] : undefined;
	return isPlainObject(hit) ? hit : {};
}

/**
 * 把 patch 合并进指定作用域，原地修改并返回 render。
 *
 * 合并而不是替换：扩展每次只推变化的那几个键，整体替换会把别的键抹掉。
 */
export function applyAnswerConfig(
	render: any,
	scope: AnswerConfigScope,
	uid: string,
	patch: Record<string, any>
): any {
	const target = isPlainObject(render) ? render : {};
	target.setting = isPlainObject(target.setting) ? target.setting : {};
	target.setting.hh = isPlainObject(target.setting.hh) ? target.setting.hh : {};
	const hh = target.setting.hh;

	if (scope === 'shared') {
		hh.answerStore = { ...(isPlainObject(hh.answerStore) ? hh.answerStore : {}), ...patch };
	} else {
		hh.browserAnswerStores = isPlainObject(hh.browserAnswerStores) ? hh.browserAnswerStores : {};
		hh.browserAnswerStores[uid] = {
			...(isPlainObject(hh.browserAnswerStores[uid]) ? hh.browserAnswerStores[uid] : {}),
			...patch
		};
	}
	return target;
}
