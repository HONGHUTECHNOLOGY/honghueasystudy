import { AutomationScripts } from '../../scripts';
import {
	describeScript,
	readScriptValues,
	writeScriptValues,
	type ScriptDef,
	type ScriptField,
	type ScriptValues
} from '../../scripts/script-values';

/** 远程台表单字段（由脚本声明的 configs 序列化而来） */
export type RemoteScriptField = ScriptField;

/** 远程台可选的自动化脚本 */
export interface RemoteScriptInfo {
	name: string;
	icon: string;
	fields: RemoteScriptField[];
}

/**
 * 脚本目录（名称 + 图标 + 字段声明）
 *
 * 只暴露「名称 + 字段声明」，不暴露 run 函数：远程端只能按名称请求执行，
 * 主进程再用 isKnownScript() 二次校验，避免任意脚本被远程调用。
 *
 * 存储与表单之间的转换统一放在 `scripts/script-values.ts`，桌面端也走同一套，
 * 这里只负责把「主进程里实际的脚本目录」喂给它。
 */
const SCRIPT_DEFS: ScriptDef[] = AutomationScripts.map((script) => ({
	name: script.name,
	icon: script.icon || '',
	configs: ((script as any).configs || {}) as ScriptDef['configs']
}));

export function listRemoteScripts(): RemoteScriptInfo[] {
	return SCRIPT_DEFS.map((def) => ({
		name: def.name,
		icon: def.icon || '',
		fields: describeScript(def)
	}));
}

/** 是否是可执行的自动化脚本（远程只能执行这里列出的） */
export function isKnownScript(name: string): boolean {
	return SCRIPT_DEFS.some((script) => script.name === name);
}

/** 自动化脚本的「配置值」视图：远程台只收发值，不碰 label/hide 等展示属性 */
export type AutomationScriptValues = ScriptValues;

/**
 * 桌面端的自动化脚本 → 可下发的值视图
 *
 * 密码字段一律清空：桌面端存着用户自己的账号密码，没有理由随方案推到手机上。
 * 手机端提交时留空即表示「保持原值」，不会被空串覆盖。
 */
export function exportAutomationScripts(scripts: any[]): AutomationScriptValues[] {
	return readScriptValues(scripts, SCRIPT_DEFS, { redactPassword: true, knownOnly: true });
}

/**
 * 手机端提交的脚本列表 → 桌面端存储结构
 *
 * 未知脚本直接丢弃（远程不能加载任意模块），必填为空直接报错；
 * 用声明里的 `configs` 重建字段，保证 label/type/options 齐全。
 *
 * `baseline` 是手机打开面板时读到的那份脚本列表，用于三路合并：
 * 基线里没有、表单里也没有、但桌面端现在有的脚本，说明是打开面板之后在电脑上新增的，
 * 直接整表覆盖会把它们删掉。不传 baseline 时退回「表单即全部」的旧语义。
 */
export function buildAutomationScripts(incoming: any[], existing: any[], baseline?: any[]): any[] {
	const list = Array.isArray(incoming) ? incoming.slice() : [];
	/** 必填校验只针对手机真正提交的脚本；合并接回来的可能是没填完的半成品 */
	const submittedNames = list.filter((item) => item && item.name).map((item) => String(item.name));

	if (Array.isArray(baseline)) {
		const baseNames = new Set(baseline.filter((item) => item && item.name).map((item) => String(item.name)));
		const nextNames = new Set(list.filter((item) => item && item.name).map((item) => String(item.name)));

		(Array.isArray(existing) ? existing : []).forEach((item) => {
			const name = String((item && item.name) || '');
			if (!name || baseNames.has(name) || nextNames.has(name)) return;
			/** 用值视图接回去：密码留空，写入时保留存储里的原值 */
			const view = readScriptValues([item], SCRIPT_DEFS, { redactPassword: true, knownOnly: true })[0];
			if (!view) return;
			list.push(view);
			nextNames.add(name);
		});
	}

	return writeScriptValues(list, existing, SCRIPT_DEFS, {
		knownOnly: true,
		validate: true,
		validateNames: submittedNames
	});
}

/** 是否已配置该脚本（供方案校验用） */
export function hasAutomationScript(scripts: any[], name: string): boolean {
	return (Array.isArray(scripts) ? scripts : []).some((item) => item && item.name === name);
}
