// @ts-nocheck

import EventEmitter from 'events';

export type EventsRecord = Record<string, (...args: any[]) => void>;
export type EventName<T> = T extends string | symbol ? T : any;

export class TypedEventEmitter<E extends EventsRecord = EventsRecord> extends EventEmitter {
	override emit<T extends keyof E>(eventName: EventName<T>, ...args: Parameters<E[T]>): boolean {
		return super.emit(eventName, ...args);
	}

	override on<T extends keyof E>(eventName: EventName<T>, listener: E[T]): this {
		return super.on(eventName, listener);
	}

	override once<T extends keyof E>(eventName: EventName<T>, listener: E[T]): this {
		return super.once(eventName, listener);
	}

	override off<T extends keyof E>(eventName: EventName<T>, listener: E[T]): this {
		return super.off(eventName, listener);
	}

	override removeListener<T extends keyof E>(eventName: EventName<T>, listener: E[T]): this {
		return super.removeListener(eventName, listener);
	}

	override removeAllListeners<T extends keyof E>(event?: EventName<T> | undefined): this {
		return super.removeAllListeners(event);
	}

	override addListener<T extends keyof E>(eventName: EventName<T>, listener: E[T]): this {
		return super.addListener(eventName, listener);
	}

	override listeners<T extends keyof E>(eventName: EventName<T>): Function[] {
		return super.listeners(eventName);
	}

	override prependListener<T extends keyof E>(eventName: EventName<T>, listener: E[T]): this {
		return super.prependListener(eventName, listener);
	}

	override prependOnceListener<T extends keyof E>(eventName: EventName<T>, listener: E[T]): this {
		return super.prependOnceListener(eventName, listener);
	}
}

export type BaseAutomationEvents = {
	'script-error': (...msg: string[]) => void;
	'script-data': (...msg: string[]) => void;
};

export type ConfigType = 'text' | 'password' | 'number' | 'textarea' | 'select' | 'switch';

export interface ConfigOption {
	label: string;
	value: any;
}

/**
 * 条件显示规则
 *
 * 用于「一个下拉切两套表单」：例如讯飞账号登录选「用户名密码」时，
 * 学校/学号两项既不该出现，也不该被必填校验拦住。
 * 只认同脚本内的另一个字段，且必须可 JSON 序列化——脚本声明要过 IPC 给渲染端。
 */
export interface ConfigShowIf {
	/** 依赖的同脚本字段 key */
	key: string;
	/** 命中其中任一值时该字段才显示（单值等价于一元素数组） */
	value: any | any[];
}

export interface Config {
	label: string;
	value: any;
	hide?: boolean;
	/** 条件显示：仅当同脚本内 `showIf.key` 的当前值命中 `showIf.value` 时展示并参与必填校验 */
	showIf?: ConfigShowIf;
	/** 输入类型，默认 text */
	type?: ConfigType;
	/** 是否必填 */
	required?: boolean;
	/** 最大值/最大长度（number 类型为数值上限，text/textarea 为最大字符长度） */
	max?: number;
	/** 最小值/最小长度 */
	min?: number;
	/** 下拉选项（type=select 时生效） */
	options?: ConfigOption[];
	/** 占位提示 */
	placeholder?: string;
}

export type ConfigValueRecord<C extends Record<string, Config>> = {
	[K in keyof C]: C[K]['value'];
};
