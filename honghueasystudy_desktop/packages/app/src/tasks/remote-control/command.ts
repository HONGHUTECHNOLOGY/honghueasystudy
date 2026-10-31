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
	'course.enter': 2 * 60 * 1000,
	/** 读方案要遍历配置树，很快；但浏览器卡住时别把请求挂死 */
	'automation.get': 30 * 1000,
	'automation.save': 30 * 1000,
	'automation.courses': 2 * 60 * 1000,
	'automation.run': 30 * 1000,
	'automation.stop': 2 * 60 * 1000,
	/** 读目录要点菜单 + 等 iframe，最快也要几秒；考试列表偶发慢一档 */
	'catalog.list': 90 * 1000,
	/** 进条目要等页面跳转（新标签 + 首屏），别再给 15s 那种会把登录判超时的值 */
	'catalog.open': 90 * 1000,
	/** 先读一遍目录再进第一节，两个动作叠起来 */
	'catalog.next': 3 * 60 * 1000,
	/** 只比一次 URL，不碰页面；给 20s 是为了等子进程从别的长任务里腾出手 */
	'catalog.ready': 20 * 1000
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
	'course.enter',
	/** 读取自动化方案（每次启动自动执行的那一份），payload: { uid } */
	'automation.get',
	/** 保存自动化方案，payload: { uid, plan, scripts } */
	'automation.save',
	/** 读取当前平台课程列表（选课用），payload: { uid, refresh? } */
	'automation.courses',
	/** 立即执行一次自动刷课，payload: { uid } */
	'automation.run',
	/** 暂停刷课（可顺便关浏览器），payload: { uid, keepTab?, closeBrowser? } */
	'automation.stop',
	/** 读课程内部目录（章节/作业/考试），payload: { uid, kind } */
	'catalog.list',
	/** 进入目录里的某一条（章节刷课 / 作业 / 考试），payload: { uid, kind, id } */
	'catalog.open',
	/** 从当前进度继续：进入第一个未完成章节，payload: { uid, skipIds? } */
	'catalog.next',
	/** 现在在不在课程页上（决定三个目录能不能点），payload: { uid } */
	'catalog.ready'
] as const;

export type RemoteAction = (typeof ALLOWED_ACTIONS)[number];

const ALLOWED_SET: string[] = ALLOWED_ACTIONS.slice();

export function isAllowedAction(action: string): boolean {
	return ALLOWED_SET.indexOf(action) !== -1;
}

/**
 * 仅主进程内部使用、远程客户端不可直接调用的动作
 *
 * `automation.get` 读的是**原始存储**的 configs（里面有用户已保存的明文密码），
 * `automation.save` 会绕过 buildAutomationScripts 的未知脚本过滤与必填校验。
 * 远程端读写方案统一走 `/api/plan/*`：脱敏、密码留空保持原值、字段重建都在那里。
 */
export const INTERNAL_ACTIONS = ['automation.get', 'automation.save'];

/** 远程客户端可调用的动作（白名单去掉内部动作） */
export function isClientAction(action: string): boolean {
	return isAllowedAction(action) && INTERNAL_ACTIONS.indexOf(action) === -1;
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
