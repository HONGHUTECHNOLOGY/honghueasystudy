import { BrowserWindow, app, ipcMain } from 'electron';
import path from 'path';
import { runtimes, type MonitorRuntime } from './runtime';
import {
	addLog,
	checkAccount,
	findSignRecord,
	formatSignTime,
	getAccount,
	signActivity,
	syncSpoofSetting
} from './manager';
import { getPPTActiveInfo, getSignTypeName, preSign, preSign2, speculateType } from './core/activity';
import { getIMParams } from './core/user';
import { sleep } from './core/http';
import type { SigninActivity, SigninType } from './core/types';

const imWindows = new Map<string, BrowserWindow>();

/**
 * 群聊消息 -> 活动
 */
interface IMGroupActivity {
	activeId: string;
	courseId: string;
	classId: string;
	chatId: string;
}

/**
 * IM 事件统一入口（只注册一次）
 */
ipcMain.on('signin-im:event', (event, payload: { accountId: string; type: string; data?: any }) => {
	if (!payload || !payload.accountId) return;
	const runtime = runtimes.get(payload.accountId);
	if (!runtime || !runtime.monitoring) return;

	// 只接受来自本账号 IM 窗口的消息，避免被其它渲染进程伪造
	const win = imWindows.get(payload.accountId);
	if (!win || event.sender !== win.webContents) return;

	if (payload.type === 'opened') {
		runtime.imStatus = 'opened';
		addLog(payload.accountId, 'info', 'IM 实时监听已连接');
		return;
	}
	if (payload.type === 'closed' || payload.type === 'error') {
		runtime.imStatus = 'failed';
		addLog(
			payload.accountId,
			'warn',
			`IM 实时监听已断开${payload.data && payload.data.message ? `：${payload.data.message}` : ''}，将继续轮询`
		);
		if (win && !win.isDestroyed()) win.destroy();
		imWindows.delete(payload.accountId);
		return;
	}
	if (payload.type === 'message') {
		void handleImMessage(payload.accountId, runtime, payload.data);
	}
});

/** 从群聊消息中提取签到活动 */
function parseImSignActivity(message: any): IMGroupActivity | null {
	if (!message || !message.ext) return null;
	const attachment = message.ext.attachment;
	if (!attachment || !attachment.att_chat_course) return null;
	const courseInfo = attachment.att_chat_course;
	const url = String(courseInfo.url || '');
	if (url.indexOf('sign') === -1) return null;
	if (!courseInfo.aid) return null;

	return {
		activeId: String(courseInfo.aid),
		courseId: String(courseInfo.courseInfo?.courseid || ''),
		classId: String(courseInfo.courseInfo?.classid || ''),
		chatId: String(message.to || '')
	};
}

async function handleImMessage(accountId: string, runtime: MonitorRuntime, message: any): Promise<void> {
	const parsed = parseImSignActivity(message);
	if (!parsed) return;
	// 同一活动只处理一次（add 是同步的，不存在并发重复）
	if (runtime.signedActivities.has(parsed.activeId)) return;

	const account = getAccount(accountId);
	if (!account) return;

	// 本地台账里已有该活动的成功签到：不再重复提交，只提示一次
	const record = findSignRecord(accountId, parsed.activeId);
	if (record) {
		if (!runtime.reportedActivities.has(parsed.activeId)) {
			runtime.reportedActivities.add(parsed.activeId);
			addLog(accountId, 'info', `IM 检测到签到消息，该活动已签到（${formatSignTime(record.time)}），跳过重复签到`);
		}
		return;
	}

	// 自动签到关闭时只提示，不落任何签到请求；收到消息也不占用 signedActivities，
	// 这样用户中途打开开关后，后续轮询还能正常签到
	if (!account.config.autoSign) {
		if (!runtime.reportedActivities.has(parsed.activeId)) {
			runtime.reportedActivities.add(parsed.activeId);
			addLog(accountId, 'info', `IM 检测到签到消息，但自动签到已关闭，请手动签到（${parsed.activeId}）`);
		}
		return;
	}

	account.config.delay = Math.max(0, Number(account.config.delay) || 0);
	const delayMs = account.config.delay * 1000;

	runtime.signedActivities.add(parsed.activeId);
	addLog(accountId, 'info', `IM 检测到签到消息：${parsed.activeId}`);
	if (delayMs > 0) await sleep(delayMs);

	try {
		if (!runtime.monitoring) return;

		let activity: SigninActivity;
		let signType: SigninType | undefined;

		if (parsed.courseId) {
			const info = await getPPTActiveInfo(account.cookies, parsed.activeId);
			activity = {
				activeId: parsed.activeId,
				name: getSignTypeName(info),
				courseId: parsed.courseId,
				classId: parsed.classId,
				chatId: parsed.chatId,
				otherId: Number(info?.otherId) || 0,
				ifphoto: Number(info?.ifphoto) || 0,
				info: info || undefined
			};
			await preSign(account.cookies, activity);
		} else {
			// 无课程的群聊签到：先预签并推测类型
			const page = await preSign2(account.cookies, {
				activeId: parsed.activeId,
				chatId: parsed.chatId,
				tuid: runtime.imTuid || ''
			});
			signType = speculateType(page);
			const otherMap: Record<string, number> = { general: 0, photo: 0, location: 4, qr: 2 };
			activity = {
				activeId: parsed.activeId,
				name: runtime.imName ? `${runtime.imName}的签到` : '群聊签到',
				courseId: '',
				classId: '',
				chatId: parsed.chatId,
				otherId: otherMap[signType] ?? 0,
				ifphoto: signType === 'photo' ? 1 : 0
			};
		}

		await signActivity(accountId, activity, { type: signType || 'auto' });
	} catch (e: any) {
		addLog(accountId, 'error', `IM 自动签到异常：${(e && e.message) || e}`);
	}
}

/** 启动隐藏窗口承载 IM SDK（比在主进程里塞 jsdom 更稳定） */
async function startImWindow(accountId: string, runtime: MonitorRuntime): Promise<void> {
	const account = getAccount(accountId);
	if (!account) {
		runtime.imStatus = 'failed';
		return;
	}

	runtime.imStatus = 'connecting';
	// IM 参数接口同样属于手机端域名，先同步伪装开关再请求
	syncSpoofSetting();
	const params = await getIMParams(account.cookies);
	if (typeof params === 'string') {
		runtime.imStatus = 'failed';
		addLog(accountId, 'warn', 'IM 参数获取失败（登录状态可能已失效），仅使用轮询监听');
		return;
	}

	runtime.imName = params.myName;
	runtime.imTuid = params.myTuid;

	const win = new BrowserWindow({
		show: false,
		width: 200,
		height: 150,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
			sandbox: false
		}
	});
	win.on('closed', () => {
		imWindows.delete(accountId);
		if (runtime.imStatus === 'opened') runtime.imStatus = 'off';
	});

	imWindows.set(accountId, win);

	// 打包态的 resources/ 目录不会被打进 app（与 extension 一样要放到 extraResources），
	// 因此这里按 isPackaged 区分；也不要用 __dirname，tsc 会把 src 带进 lib/src
	const htmlPath = app.isPackaged
		? path.join(process.resourcesPath, 'signin', 'im.html')
		: path.join(app.getAppPath(), 'resources', 'signin', 'im.html');
	try {
		await win.loadFile(htmlPath);
	} catch (e) {
		if (!win.isDestroyed()) win.destroy();
		imWindows.delete(accountId);
		throw e;
	}
	if (win.isDestroyed()) return;

	win.webContents.send('signin-im:start', {
		accountId,
		user: params.myTuid,
		// 环信登录必须带 accessToken，缺失时 conn.open 会直接失败
		token: params.myToken,
		name: params.myName,
		appKey: 'cx-dev#cxstudy'
	});
}

/**
 * 开始监听
 *
 * 轮询为主链路，IM 为兜底实时链路；IM 失败不影响轮询。
 */
export function startMonitor(accountId: string): { ok: boolean; message: string } {
	const account = getAccount(accountId);
	if (!account) return { ok: false, message: '账号不存在' };

	const existing = runtimes.get(accountId);
	if (existing && existing.monitoring) return { ok: true, message: '监听已在运行' };

	const runtime: MonitorRuntime = {
		accountId,
		monitoring: true,
		checking: false,
		imStatus: 'off',
		signedActivities: new Set<string>(),
		reportedActivities: new Set<string>(),
		startedAt: Date.now()
	};
	runtimes.set(accountId, runtime);

	addLog(
		accountId,
		'info',
		`开始监听：每 ${account.config.interval} 秒检测一次，时长 ${
			account.config.duration > 0 ? `${account.config.duration} 分钟` : '不限'
		}`
	);

	if (account.config.im) {
		// 先复用一次账号检测（与 pollLoop 的调用会合并），确保 cookies 已被自动刷新，
		// 否则凭证过期时 getIMParams 失败会让实时链路整场缺失
		void (async () => {
			try {
				await checkAccount(accountId);
			} catch {
				/* 异常由轮询链路记录，这里只关心凭证是否已刷新 */
			}
			if (!runtime.monitoring) return;
			try {
				await startImWindow(accountId, runtime);
			} catch (e: any) {
				runtime.imStatus = 'failed';
				addLog(accountId, 'warn', `IM 监听启动失败：${(e && e.message) || e}，仅使用轮询`);
			}
		})();
	}

	void pollLoop(runtime);
	return { ok: true, message: '已开始监听' };
}

async function pollLoop(runtime: MonitorRuntime): Promise<void> {
	const accountId = runtime.accountId;

	while (runtime.monitoring) {
		const account = getAccount(accountId);
		if (!account) {
			stopMonitor(accountId, '账号已删除');
			return;
		}

		const config = account.config;
		if (config.duration > 0 && Date.now() - runtime.startedAt >= config.duration * 60 * 1000) {
			stopMonitor(accountId, `监听时长（${config.duration} 分钟）已到`);
			return;
		}

		try {
			const result = await checkAccount(accountId);

			if (!runtime.monitoring) return;

			if (result.code === 'activity') {
				const activeId = result.activity.activeId;
				const activityName = result.activity.name || activeId;
				runtime.lastCode = 'activity';
				if (result.activity.signed) {
					// 台账里已经签过：不再重复提交，只在首次发现时记一条，避免刷屏
					if (!runtime.reportedActivities.has(activeId)) {
						runtime.reportedActivities.add(activeId);
						const signTime = result.activity.signedTime ? `（${formatSignTime(result.activity.signedTime)}）` : '';
						addLog(accountId, 'info', `签到活动「${activityName}」已签到${signTime}，跳过重复签到`);
					}
				} else if (!config.autoSign) {
					// 自动签到关闭：只记录一次，不调用签到接口
					if (!runtime.reportedActivities.has(activeId)) {
						runtime.reportedActivities.add(activeId);
						addLog(accountId, 'info', `检测到签到活动「${activityName}」，自动签到已关闭，请手动签到`);
					}
				} else if (!runtime.signedActivities.has(activeId)) {
					runtime.signedActivities.add(activeId);
					if (config.delay > 0) await sleep(config.delay * 1000);
					if (!runtime.monitoring) return;
					await signActivity(accountId, result.activity, { type: 'auto' });
				}
			} else if (result.code !== runtime.lastCode) {
				runtime.lastCode = result.code;
				if (result.code === 'too-frequent') {
					addLog(accountId, 'warn', result.message);
				} else if (result.code === 'auth-failed') {
					addLog(accountId, 'error', result.message);
					stopMonitor(accountId, '登录状态失效，监听已停止');
					return;
				} else if (result.code === 'no-course') {
					addLog(accountId, 'warn', result.message);
				} else if (result.code === 'error') {
					addLog(accountId, 'error', result.message);
				}
			}
		} catch (e: any) {
			addLog(accountId, 'error', `监听异常：${(e && e.message) || e}`);
		}

		if (!runtime.monitoring) return;
		const nextAccount = getAccount(accountId);
		const interval = nextAccount?.config.interval || 30;
		await sleep(interval * 1000);
	}
}

/** 停止监听 */
export function stopMonitor(accountId: string, reason?: string): boolean {
	const runtime = runtimes.get(accountId);
	if (!runtime) return false;

	runtime.monitoring = false;
	if (runtime.timer) {
		clearTimeout(runtime.timer);
		runtime.timer = undefined;
	}

	const win = imWindows.get(accountId);
	if (win && !win.isDestroyed()) win.destroy();
	imWindows.delete(accountId);
	runtimes.delete(accountId);

	addLog(accountId, 'info', `停止监听${reason ? `：${reason}` : ''}`);
	return true;
}

export function isMonitoring(accountId: string): boolean {
	return !!runtimes.get(accountId)?.monitoring;
}

/** 应用退出时清理所有监听与隐藏窗口 */
app.on('will-quit', () => {
	for (const accountId of Array.from(runtimes.keys())) {
		stopMonitor(accountId, '应用退出');
	}
});
