import { BrowserWindow } from 'electron';
import { Logger } from '../../logger';

const logger = Logger('remote-command');

/** 命令超时时间（默认） */
const COMMAND_TIMEOUT = 15000;

/**
 * 按动作覆盖的超时时间
 *
 * 登录要等验证码/滑块、跳转，慢的时候一分钟以上；选课要等页面渲染。
 * 统一 15 秒会把正常流程判成超时，而命令其实还在跑，远程端只能反复点。
 */
const TIMEOUT_BY_ACTION: { [action: string]: number } = {
	'script.run': 6 * 60 * 1000,
	'course.list': 2 * 60 * 1000,
	'course.enter': 2 * 60 * 1000
};

/** 允许远程执行的命令白名单 */
export const ALLOWED_ACTIONS = [
	'browser.launch',
	'browser.close',
	'browser.bringToFront',
	'browser.batchLaunch',
	'browser.batchClose',
	'browser.getPages',
	'browser.snapshot',
	/** 运行自动化脚本（登录等），payload: { uid, name, configs } */
	'script.run',
	/** 读取课程列表，payload: { uid, refresh? } */
	'course.list',
	/** 进入课程，payload: { uid, id } */
	'course.enter'
] as const;

export type RemoteAction = (typeof ALLOWED_ACTIONS)[number];

const ALLOWED_SET: string[] = ALLOWED_ACTIONS.slice();

export function isAllowedAction(action: string): boolean {
	return ALLOWED_SET.indexOf(action) !== -1;
}

interface Pending {
	resolve: (value: any) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

export interface CommandResultPayload {
	id: string;
	ok: boolean;
	data?: any;
	error?: string;
}

/**
 * 命令桥：主进程 → 渲染进程 → ScriptWorker → 浏览器
 *
 * 渲染进程负责把命令翻译成对 Process 实例的操作，执行完成后回传结果。
 */
export class CommandBridge {
	private pending = new Map<string, Pending>();
	private seq = 0;

	// eslint-disable-next-line no-useless-constructor
	constructor(private getWindow: () => BrowserWindow | undefined) {}

	/** 渲染进程回传执行结果 */
	handleResult(payload: CommandResultPayload): void {
		if (!payload || !payload.id) return;
		const item = this.pending.get(payload.id);
		if (!item) return;

		this.pending.delete(payload.id);
		clearTimeout(item.timer);

		if (payload.ok) {
			item.resolve(payload.data);
		} else {
			item.reject(new Error(payload.error || '远程操作失败'));
		}
	}

	/** 分发命令到渲染进程并等待结果 */
	dispatch(action: string, payload: any = {}, timeoutMs?: number): Promise<any> {
		if (!isAllowedAction(action)) {
			return Promise.reject(new Error('不支持的操作：' + action));
		}

		const win = this.getWindow();
		if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
			return Promise.reject(new Error('桌面端未就绪，请确认鸿鹄易学主窗口已打开'));
		}

		const id = `${Date.now()}-${++this.seq}`;
		const timeout = timeoutMs || TIMEOUT_BY_ACTION[action] || COMMAND_TIMEOUT;

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error('操作超时，请稍后重试'));
			}, timeout);

			this.pending.set(id, { resolve, reject, timer });

			try {
				win.webContents.send('remote-ctl:command', { id, action, payload });
			} catch (e) {
				this.pending.delete(id);
				clearTimeout(timer);
				logger.error('命令下发失败', e);
				reject(new Error('命令下发失败：' + String(e)));
			}
		});
	}

	/** 关闭时清理所有等待中的命令 */
	disposeAll(): void {
		this.pending.forEach((item) => {
			clearTimeout(item.timer);
			item.reject(new Error('远程控制服务已关闭'));
		});
		this.pending.clear();
	}
}
