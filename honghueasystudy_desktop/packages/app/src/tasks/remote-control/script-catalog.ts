import { AutomationScripts } from '../../scripts';
import type { Config } from '../../scripts/interface';

/** 远程台表单字段（由脚本声明的 configs 序列化而来） */
export interface RemoteScriptField {
	key: string;
	label: string;
	type: 'text' | 'password' | 'number' | 'textarea' | 'select' | 'switch';
	required: boolean;
	placeholder?: string;
	options?: { label: string; value: any }[];
	/** 默认值（敏感字段为空串，不会泄露桌面端已保存的密码） */
	value?: any;
	max?: number;
	min?: number;
}

/** 远程台可选的自动化脚本 */
export interface RemoteScriptInfo {
	name: string;
	icon: string;
	fields: RemoteScriptField[];
}

/**
 * 把桌面端的自动化脚本目录导出给远程台
 *
 * 只暴露「名称 + 字段声明」，不暴露 run 函数：远程端只能按名称请求执行，
 * 主进程再用 isKnownScript() 二次校验，避免任意脚本被远程调用。
 * 密码字段的 value 一律清空——桌面端配置里可能存着用户自己的密码，
 * 没有理由随状态快照推到手机上。
 */
export function listRemoteScripts(): RemoteScriptInfo[] {
	return AutomationScripts.map((script) => {
		const defs = ((script as any).configs || {}) as Record<string, Config>;
		const fields: RemoteScriptField[] = [];

		for (const key of Object.keys(defs)) {
			const def = defs[key] || ({} as Config);
			if (def.hide) continue;
			if (def.type === 'select' && (!def.options || def.options.length === 0)) continue;

			fields.push({
				key,
				label: def.label || key,
				type: (def.type || 'text') as RemoteScriptField['type'],
				required: !!def.required,
				placeholder: def.placeholder || '',
				options: def.options ? def.options.map((opt) => ({ label: String(opt.label), value: opt.value })) : undefined,
				value: def.type === 'password' ? '' : def.value,
				max: def.max,
				min: def.min
			});
		}

		return {
			name: script.name,
			icon: script.icon || '',
			fields
		};
	});
}

/** 是否是可执行的自动化脚本（远程只能执行这里列出的） */
export function isKnownScript(name: string): boolean {
	return AutomationScripts.some((script) => script.name === name);
}
