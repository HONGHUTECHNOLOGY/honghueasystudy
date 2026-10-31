import { remote } from './remote';
import { normalizeScripts, writeScriptValues, type ScriptDef } from '@honghu-desktop/app/src/scripts/script-values';
import type { RawAutomationScript } from '../components/automation-scripts';

/**
 * 自动化脚本的声明目录（主进程里的真实目录）
 *
 * 渲染进程不能直接 import `AutomationScripts`：那会把 playwright 依赖整包拉进界面。
 * 目录只含名称/图标/字段声明，进程内取一次缓存即可（运行时不会变）。
 */
let defsCache: ScriptDef[] | null = null;

export function scriptDefs(): ScriptDef[] {
	if (!defsCache) {
		/** 失败就让错误冒出去，别把空目录缓存下来——那会让「添加脚本」永远加不上 */
		const raw = remote.methods.callSync('getRawScripts') as ScriptDef[];
		defsCache = Array.isArray(raw) ? raw : [];
	}
	return defsCache;
}

/**
 * 值视图 → 存储
 *
 * 与远程台共用 `script-values` 里同一套转换：字段声明以主进程目录为准，
 * 桌面端只提交值，不再自己拼 configs（以前「批量创建」只存了 label/value，
 * 密码框会因为缺 type 退化成明文输入框）。
 */
export function writeBrowserScripts(
	values: { name: string; icon?: string; values: Record<string, any> }[],
	existing?: any[]
): RawAutomationScript[] {
	return writeScriptValues(values, existing || [], scriptDefs());
}

/**
 * 按当前声明归一化已存储的脚本
 *
 * 旧存档 / 远程台缺字段的脚本在读出来时补全，保证桌面端渲染与
 * 「脚本实际执行时拿到的 configs」是同一份。
 */
export function normalizeBrowserScripts(scripts: any): RawAutomationScript[] {
	return normalizeScripts(scripts, scriptDefs());
}
