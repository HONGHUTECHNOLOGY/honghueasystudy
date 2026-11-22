/**
 * 答题 / AI 配置的合并规则（纯函数，零依赖）
 *
 * 与 `answer-config-sync.ts`（负责网络与存储）分开，是为了能脱离浏览器环境单测。
 * 改动这里的规则请同步跑 `.workbuddy/tmp/answer-config-merge-test.js`。
 */

/** 由「桌面端统一配置」托管的键（easy-us 的全限定键），题库与 AI */
export const ANSWER_CONFIG_KEYS = [
	'common.settings.answererWrappers',
	'common.settings.disabledAnswererWrapperNames',
	'common.ai-settings.aiEndpoint',
	'common.ai-settings.aiApiKey',
	'common.ai-settings.aiModel',
	'common.ai-settings.referenceDocs'
] as const;

/** 空值判定：空串 / 空数组 / 空对象 / null 都算没配过 */
export function isBlank(v: any) {
	if (v === undefined || v === null) return true;
	if (typeof v === 'string') return v.trim() === '';
	if (Array.isArray(v)) return v.length === 0;
	if (typeof v === 'object') return Object.keys(v).length === 0;
	return false;
}

/**
 * 决定「哪些用远端的、哪些推给远端」
 *
 * 规则按「谁的更可信」来：
 * - 远端有值 → 用远端（共享配置以桌面端为准，多个浏览器才不会各说各话）；
 * - 远端为空、本地有值 → 把本地推上去（首次启用时的迁移，避免配好的 Key 被清空）；
 * - 两边都空 / 两边相同 → 都不动。
 */
export function planMerge(remote: Record<string, any>, local: Record<string, any>) {
	const apply: Record<string, any> = {};
	const push: Record<string, any> = {};
	for (const key of ANSWER_CONFIG_KEYS) {
		const r = remote?.[key];
		const l = local?.[key];
		if (!isBlank(r)) {
			if (JSON.stringify(r) !== JSON.stringify(l)) apply[key] = r;
		} else if (!isBlank(l)) {
			push[key] = l;
		}
	}
	return { apply, push };
}
