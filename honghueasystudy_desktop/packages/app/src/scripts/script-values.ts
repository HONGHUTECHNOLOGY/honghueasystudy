import type { Config, ConfigType } from './interface';

/**
 * 自动化脚本的「声明 / 存储 / 值」三态与转换
 *
 * 桌面端和远程台用的是**同一份**存储（`Browser.automationScripts`），
 * 但两边都不能直接拿存储结构当表单用：
 *   · 存储里是 `configs: { key: Config }`，带 label/type/options 等展示属性；
 *   · 表单只该收发 `values: { key: any }`，展示属性由脚本声明决定。
 * 这个模块就是两者之间唯一的转换层——远程保存和桌面端归一化都走这里，
 * 任何一侧改了字段规则，另一侧自动跟上，不会再出现「桌面端能填、手机端填了却不生效」。
 *
 * 注意：这里**不能** import `scripts/index.ts`（会连带 playwright 依赖拉进渲染端）。
 * 声明由调用方传入：主进程传 `AutomationScripts`，渲染进程传 `getRawScripts()` 的结果。
 */

/** 脚本声明里与存储 / 渲染相关的部分 */
export interface ScriptDef {
	name: string;
	icon?: string;
	configs?: Record<string, Config>;
}

/** 脚本配置的「值」视图：两端表单只认这一层 */
export interface ScriptValues {
	name: string;
	icon: string;
	values: Record<string, any>;
}

/** 表单字段（由脚本声明序列化而来） */
export interface ScriptField {
	key: string;
	label: string;
	type: ConfigType;
	required: boolean;
	placeholder?: string;
	options?: { label: string; value: any }[];
	/** 默认值（敏感字段为空串，不会泄露已保存的密码） */
	value?: any;
	max?: number;
	min?: number;
}

export interface ReadScriptOptions {
	/** 密码字段一律置空（远程台）：桌面端存着用户自己的密码，没有理由推到手机上 */
	redactPassword?: boolean;
	/** 丢掉目录里没有的脚本（远程台）；桌面端保留，避免升级后旧脚本凭空消失 */
	knownOnly?: boolean;
}

export interface WriteScriptOptions {
	/** 只接受目录里的脚本（远程台）；远程提交任意 name 等于让主进程加载未知模块 */
	knownOnly?: boolean;
	/** 必填为空时抛错（远程保存）；桌面端边填边存，不能因为还没填完就报错 */
	validate?: boolean;
	/**
	 * 只校验这些脚本（三路合并时传入「本次真正提交的」名字）
	 *
	 * 合并接回来的脚本是桌面端刚加的，可能还没填完；
	 * 拿它去触发必填校验，等于手机端改个时长就被别人的半成品脚本卡住。
	 */
	validateNames?: string[];
}

function findDef(defs: ScriptDef[], name: string): ScriptDef | undefined {
	return defs.find((item) => item && item.name === name);
}

function configsOf(def?: ScriptDef): Record<string, Config> {
	return (def && def.configs) || {};
}

/** 声明 → 表单字段（远程台与桌面端共用同一套展示规则） */
export function describeScript(def: ScriptDef): ScriptField[] {
	const fields: ScriptField[] = [];

	for (const key of Object.keys(configsOf(def))) {
		const field = configsOf(def)[key] || ({} as Config);
		if (field.hide) continue;
		if (field.type === 'select' && (!field.options || field.options.length === 0)) continue;

		fields.push({
			key,
			label: field.label || key,
			type: (field.type || 'text') as ConfigType,
			required: !!field.required,
			placeholder: field.placeholder || '',
			options: field.options ? field.options.map((opt) => ({ label: String(opt.label), value: opt.value })) : undefined,
			value: field.type === 'password' ? '' : field.value,
			max: field.max,
			min: field.min
		});
	}

	return fields;
}

/**
 * 存储 → 值视图
 *
 * 已存但声明里没有的字段不会被带出（声明是唯一的字段来源）；
 * 目录里没有的脚本默认原样带出值，`knownOnly` 时直接丢弃。
 */
export function readScriptValues(scripts: any, defs: ScriptDef[], opts: ReadScriptOptions = {}): ScriptValues[] {
	const list = Array.isArray(scripts) ? scripts : [];

	return list
		.filter((item) => item && typeof item === 'object' && item.name)
		.reduce<ScriptValues[]>((result, item) => {
			const name = String(item.name);
			const def = findDef(defs, name);
			if (!def && opts.knownOnly) return result;

			const configs = (item.configs || {}) as Record<string, any>;
			const values: Record<string, any> = {};

			if (def) {
				for (const key of Object.keys(configsOf(def))) {
					const field = configsOf(def)[key] || ({} as Config);
					if (field.hide) continue;
					values[key] = field.type === 'password' && opts.redactPassword ? '' : configs[key]?.value;
				}
			} else {
				/** 未知脚本：把存储值原样带出，桌面端归一化时才能原样写回 */
				for (const key of Object.keys(configs)) {
					values[key] = configs[key]?.value;
				}
			}

			result.push({ name, icon: String((def && def.icon) || item.icon || ''), values });
			return result;
		}, []);
}

/**
 * 值视图 → 存储
 *
 * 用脚本声明里的 `configs` 作为模板重建，保证 label/type/options 齐全
 * （只存 name + value 的话，桌面端列表会渲染成一片空白输入框）。
 * 以声明顺序输出字段，桌面端「添加自动程序」与远程台看到的是同一套顺序。
 */
export function writeScriptValues(values: any, existing: any, defs: ScriptDef[], opts: WriteScriptOptions = {}): any[] {
	if (!Array.isArray(values)) return [];

	const existingMap = new Map<string, any>();
	(Array.isArray(existing) ? existing : []).forEach((item) => {
		if (item && item.name) existingMap.set(String(item.name), item);
	});

	const result: any[] = [];
	const seen = new Set<string>();
	/** 这次真正提交过的脚本名：校验只针对它们，合并进来的条目不为别人的空白背锅 */
	const submitted = new Set<string>();

	values.forEach((item) => {
		const name = String((item && item.name) || '').trim();
		if (!name || seen.has(name)) return;

		const def = findDef(defs, name);
		const prev = existingMap.get(name);

		if (!def) {
			/** 远程端一律拒绝未知脚本；桌面端保留已存条目（升级换名后不该丢用户数据） */
			if (!opts.knownOnly && prev) {
				seen.add(name);
				submitted.add(name);
				result.push(prev);
			}
			return;
		}

		seen.add(name);
		submitted.add(name);
		const incoming = ((item && item.values) || {}) as Record<string, any>;
		const configs: Record<string, Config> = {};

		for (const key of Object.keys(configsOf(def))) {
			const field = configsOf(def)[key] as Config;
			const hasNew = Object.prototype.hasOwnProperty.call(incoming, key) && incoming[key] !== undefined;
			const newValue = hasNew ? incoming[key] : undefined;

			/**
			 * 密码留空 = 保持原值。
			 * 远端永远读不到已存密码（导出时清空了），不能把「没填」当成「清空」，
			 * 否则用户在手机上改一下学习时长，登录脚本的密码就被抹掉了。
			 */
			const keepExisting = field.type === 'password' && (newValue === '' || newValue === null || newValue === undefined);
			const oldValue = prev && prev.configs && prev.configs[key] ? prev.configs[key].value : field.value;
			let value = keepExisting ? oldValue : newValue !== undefined ? newValue : oldValue;

			if (field.type === 'number') {
				/** 空串不是 0：表单清空数字框时应该回到默认值，而不是悄悄变成 0 */
				const num = Number(value);
				value = value === '' || value === null || value === undefined || !Number.isFinite(num) ? field.value : num;
			} else if (field.type === 'switch') {
				value = !!value;
			} else if (value === undefined || value === null) {
				value = '';
			}

			configs[key] = { ...field, value };
		}

		result.push({ name, icon: def.icon || String((item && item.icon) || ''), configs });
	});

	/**
	 * 远程台只能看到目录里的脚本，提交的列表天然不含那些「目录里没有」的旧脚本。
	 * 不接回去的话，用户在手机上保存一次方案，桌面端升级后残留的旧脚本就被静默删掉了。
	 * 桌面端的提交是完整列表，列表里没有就是用户删掉的，不做兜底。
	 */
	if (opts.knownOnly) {
		existingMap.forEach((prev, name) => {
			if (seen.has(name) || findDef(defs, name)) return;
			result.push(prev);
		});
	}

	/** 必填校验：缺账号密码就存进去，等于把「每次启动都白跑一遍」写死 */
	if (opts.validate) {
		const scoped = Array.isArray(opts.validateNames) ? new Set(opts.validateNames.map((name) => String(name))) : null;
		for (const script of result) {
			if (!submitted.has(script.name)) continue;
			if (scoped && !scoped.has(script.name)) continue;
			const fields = configsOf(findDef(defs, script.name));
			for (const key of Object.keys(fields)) {
				const field = fields[key];
				if (field.hide || !field.required) continue;
				const value = script.configs[key] ? script.configs[key].value : undefined;
				const current = String(value === undefined || value === null ? '' : value).trim();
				if (!current) throw new Error(`「${script.name}」的「${field.label || key}」不能为空`);
			}
		}
	}

	return result;
}

/**
 * 按当前声明归一化已存储的脚本（桌面端读取 / 启动前共用）
 *
 * 旧存档和「批量创建」留下的 configs 可能只有 `{ label, value }`，
 * 缺少 type/options 会让密码框退化成明文输入框、下拉退化成文本框。
 * 这里用声明做模板重建，值保持不变；目录里没有的脚本原样保留。
 */
export function normalizeScripts(scripts: any, defs: ScriptDef[]): any[] {
	const list = Array.isArray(scripts) ? scripts : [];
	return writeScriptValues(readScriptValues(list, defs), list, defs);
}
