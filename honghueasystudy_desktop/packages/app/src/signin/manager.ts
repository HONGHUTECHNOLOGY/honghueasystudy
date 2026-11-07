import crypto from 'crypto';
import { dialog, Notification } from 'electron';
import { store } from '../store';
import { Logger } from '../logger';
import { decryptRenderString, encryptRenderString } from '../crypto';
import { AUTH_FAILED, NO_COURSE, getAccountInfo, getCourses, login } from './core/user';
import {
	TOO_FREQUENT,
	getPPTActiveInfo,
	getSignTypeName,
	preSign,
	traverseCourseActivity
} from './core/activity';
import { performSign, type PerformSignOptions } from './core/sign';
import type {
	ChaoxingCookies,
	Course,
	SigninAccountConfig,
	SigninAccountView,
	SigninActivity,
	SigninLog,
	SigninResult
} from './core/types';
import type { SigninStoreState, StoredSigninAccount } from './types';
import { getRuntime, getRuntimeSnapshot } from './runtime';

const logger = Logger('signin');
const log = Logger('signin-core');

/** 课程缓存有效期（10 分钟） */
const COURSE_CACHE_TTL = 10 * 60 * 1000;
/** 日志上限 */
const MAX_LOGS = 500;

const courseCache = new Map<string, { courses: Course[]; time: number }>();
/** 同一账号的检测请求合并，避免轮询与手动检测并发打爆接口 */
const checkingPromises = new Map<string, Promise<CheckResult>>();

export type CheckResult =
	| { code: 'activity'; activity: SigninActivity; typeName: string; coursesCount: number }
	| { code: 'no-activity'; message: string; coursesCount: number }
	| { code: 'too-frequent'; message: string }
	| { code: 'auth-failed'; message: string }
	| { code: 'no-course'; message: string }
	| { code: 'error'; message: string };

export function defaultConfig(): SigninAccountConfig {
	return {
		interval: 30,
		duration: 240,
		delay: 5,
		address: { lon: '', lat: '', address: '', altitude: '0' },
		presetAddress: [],
		photoPath: '',
		qrcodeEnc: '',
		im: true,
		// 自动签到默认关闭，避免用户误触发；手动签到始终可用
		autoSign: false
	};
}

export function getState(): SigninStoreState {
	const state = store.store.signin as SigninStoreState | undefined;
	if (!state) {
		const empty: SigninStoreState = { accounts: [], logs: [] };
		store.set('signin', empty);
		return empty;
	}
	if (!Array.isArray(state.accounts)) state.accounts = [];
	if (!Array.isArray(state.logs)) state.logs = [];
	return state;
}

function persist(state: SigninStoreState): void {
	store.set('signin', state);
}

export function getAccount(id: string): StoredSigninAccount | undefined {
	return getState().accounts.find((item) => item.id === id);
}

export function toView(account: StoredSigninAccount): SigninAccountView {
	const snapshot = getRuntimeSnapshot(account.id);
	return {
		id: account.id,
		phone: account.phone,
		name: account.name,
		cookies: account.cookies,
		createTime: account.createTime,
		lastCheckTime: account.lastCheckTime || 0,
		lastSignTime: account.lastSignTime || 0,
		lastResult: account.lastResult || '',
		config: account.config,
		monitoring: snapshot.monitoring,
		checking: snapshot.checking,
		imStatus: snapshot.imStatus
	};
}

export function listViews(): SigninAccountView[] {
	return getState().accounts.map(toView);
}

export function addLog(accountId: string, level: SigninLog['level'], message: string): void {
	const state = getState();
	state.logs.push({
		id: crypto.randomBytes(8).toString('hex'),
		accountId,
		time: Date.now(),
		level,
		message
	});
	if (state.logs.length > MAX_LOGS) {
		state.logs = state.logs.slice(state.logs.length - MAX_LOGS);
	}
	persist(state);
	logger.info(`[${level}] ${message}`);
}

export function getLogs(accountId?: string, limit = 100): SigninLog[] {
	const logs = getState().logs;
	const filtered = accountId ? logs.filter((item) => item.accountId === accountId) : logs.slice();
	return filtered.slice(Math.max(0, filtered.length - limit));
}

export function clearLogs(accountId?: string): void {
	const state = getState();
	state.logs = accountId ? state.logs.filter((item) => item.accountId !== accountId) : [];
	persist(state);
}

function notify(title: string, body: string): void {
	try {
		if (!Notification.isSupported()) return;
		new Notification({ title, body }).show();
	} catch {
		/* empty */
	}
}

/**
 * 手机号密码登录并保存账号
 */
export async function loginAccount(
	phone: string,
	password: string
): Promise<{ ok: boolean; message: string; account?: SigninAccountView }> {
	phone = String(phone || '').trim();
	// 密码不做 trim：首尾空白属于密码本身
	password = String(password || '');
	if (!phone || !password) return { ok: false, message: '手机号和密码不能为空' };

	const cookies = await login(phone, password);
	if (cookies === AUTH_FAILED) {
		return { ok: false, message: '登录失败：账号或密码错误，或需要验证码' };
	}

	const name = (await getAccountInfo(cookies)) || phone;
	cookies.name = name;

	let encryptedPassword = '';
	try {
		encryptedPassword = encryptRenderString(password);
	} catch (e) {
		logger.warn('密码加密失败，将无法自动重新登录', e);
	}

	const state = getState();
	let account = state.accounts.find((item) => item.phone === phone);
	if (account) {
		account.cookies = cookies;
		account.name = name;
		if (encryptedPassword) account.password = encryptedPassword;
	} else {
		account = {
			id: crypto.randomBytes(12).toString('hex'),
			phone,
			name,
			password: encryptedPassword,
			cookies,
			config: defaultConfig(),
			createTime: Date.now(),
			lastCheckTime: 0,
			lastSignTime: 0,
			lastResult: ''
		};
		state.accounts.push(account);
	}
	courseCache.delete(account.id);
	persist(state);
	addLog(account.id, 'success', `登录成功：${name}`);

	return { ok: true, message: `登录成功：${name}`, account: toView(account) };
}

export function removeAccount(id: string): boolean {
	const state = getState();
	const index = state.accounts.findIndex((item) => item.id === id);
	if (index === -1) return false;
	state.accounts.splice(index, 1);
	state.logs = state.logs.filter((item) => item.accountId !== id);
	courseCache.delete(id);
	persist(state);
	return true;
}

export function updateConfig(id: string, patch: Partial<SigninAccountConfig>): SigninAccountView | null {
	// conf 的 store getter 每次都从磁盘重新解析，必须持有同一份 state 再 persist，
	// 否则修改只落在临时对象上，不会写回文件
	const state = getState();
	const account = state.accounts.find((item) => item.id === id);
	if (!account) return null;

	const next: SigninAccountConfig = {
		...account.config,
		...patch
	};
	if (patch.address) next.address = { ...account.config.address, ...patch.address };
	if (patch.presetAddress) next.presetAddress = patch.presetAddress.map((item) => ({ ...item }));

	next.interval = Math.min(600, Math.max(10, Number(next.interval) || 30));
	next.duration = Math.min(1440, Math.max(0, Number(next.duration) || 0));
	next.delay = Math.min(60, Math.max(0, Number(next.delay) || 0));
	next.qrcodeEnc = String(next.qrcodeEnc || '').trim();
	next.photoPath = String(next.photoPath || '').trim();
	next.im = !!next.im;
	next.autoSign = !!next.autoSign;

	account.config = next;
	persist(state);
	return toView(account);
}

async function tryRelogin(account: StoredSigninAccount): Promise<boolean> {
	if (!account.password) return false;
	let password: string;
	try {
		password = decryptRenderString(account.password);
	} catch {
		return false;
	}
	const cookies = await login(account.phone, password);
	if (cookies === AUTH_FAILED) return false;
	cookies.name = account.name;
	// 重新读取最新 state 再写入，避免覆盖登录期间 IM 等链路产生的日志
	const state = getState();
	const stored = state.accounts.find((item) => item.id === account.id);
	if (!stored) return false;
	stored.cookies = cookies;
	persist(state);
	// 同步调用方的内存对象，后续 getCourses 必须用新凭证
	account.cookies = cookies;
	courseCache.delete(account.id);
	addLog(account.id, 'info', '登录凭证过期，已自动重新登录');
	return true;
}

async function fetchCourses(account: StoredSigninAccount, force = false): Promise<Course[] | string> {
	const cached = courseCache.get(account.id);
	if (!force && cached && Date.now() - cached.time < COURSE_CACHE_TTL) return cached.courses;

	let result = await getCourses(account.cookies);
	if (result === AUTH_FAILED) {
		const relogged = await tryRelogin(account);
		if (!relogged) return AUTH_FAILED;
		result = await getCourses(account.cookies);
	}
	if (result === AUTH_FAILED) return AUTH_FAILED;
	if (result === NO_COURSE) return NO_COURSE;

	courseCache.set(account.id, { courses: result, time: Date.now() });
	return result;
}

/**
 * 检测账号当前是否有有效签到
 *
 * 命中活动时会自动完成 preSign，签到前必须先经过这一步。
 */
export async function checkAccount(id: string, forceCourses = false): Promise<CheckResult> {
	const existing = checkingPromises.get(id);
	if (existing) return existing;

	const task = (async (): Promise<CheckResult> => {
		const snapshot = getState();
		const account = snapshot.accounts.find((item) => item.id === id);
		if (!account) return { code: 'error', message: '账号不存在' };

		const runtime = getRuntime(id);
		if (runtime) runtime.checking = true;

		try {
			const courses = await fetchCourses(account, forceCourses);
			if (typeof courses === 'string') {
				if (courses === AUTH_FAILED) {
					return { code: 'auth-failed', message: '登录凭证已失效，请重新登录' };
				}
				return { code: 'no-course', message: '当前账号没有可查询的课程' };
			}

			const activity = await traverseCourseActivity(account.cookies, courses);
			// 检测期间账号可能被重新登录/删除，这里写回最新 state
			const latest = getState();
			const latestAccount = latest.accounts.find((item) => item.id === id);
			if (latestAccount) {
				latestAccount.lastCheckTime = Date.now();
				persist(latest);
			}

			if (activity === TOO_FREQUENT) {
				return { code: 'too-frequent', message: '请求过于频繁，请稍后再试' };
			}
			if (!activity) {
				return { code: 'no-activity', message: '未检测到有效签到活动', coursesCount: courses.length };
			}

			const info = await getPPTActiveInfo(account.cookies, activity.activeId);
			activity.info = info || undefined;
			activity.ifphoto = Number(info?.ifphoto) || 0;
			activity.typeName = getSignTypeName(info || activity);

			await preSign(account.cookies, activity);

			return { code: 'activity', activity, typeName: activity.typeName, coursesCount: courses.length };
		} catch (e: any) {
			logger.error('检测签到失败', e);
			return { code: 'error', message: `检测失败：${(e && e.message) || e}` };
		} finally {
			if (runtime) runtime.checking = false;
			checkingPromises.delete(id);
		}
	})();

	checkingPromises.set(id, task);
	return task;
}

/**
 * 执行签到
 *
 * 注意：活动需要先通过 checkAccount 完成预签，否则服务端可能拒绝。
 */
export async function signActivity(
	id: string,
	activity: SigninActivity,
	options: PerformSignOptions = {}
): Promise<SigninResult> {
	const account = getAccount(id);
	if (!account) return { ok: false, message: '账号不存在' };
	if (!activity || !activity.activeId) return { ok: false, message: '无效的签到活动' };

	try {
		const info = activity.info || (activity.courseId ? await getPPTActiveInfo(account.cookies, activity.activeId) : null);
		if (info) {
			activity.info = info;
			activity.ifphoto = Number(info.ifphoto) || activity.ifphoto || 0;
		}

		const name = account.name || account.cookies.name || account.cookies._uid;
		const result = await performSign(account.cookies, activity, {
			...options,
			type: options.type || 'auto',
			name: options.name || name,
			config: account.config
		});

		// 签到期间账号可能被重新登录/删除，写回最新 state，避免覆盖其他链路的数据
		const latest = getState();
		const latestAccount = latest.accounts.find((item) => item.id === id);
		if (latestAccount) {
			latestAccount.lastSignTime = Date.now();
			latestAccount.lastResult = result.message;
			persist(latest);
		}
		addLog(account.id, result.ok ? 'success' : 'warn', result.message);
		notify(`超星签到 - ${account.name}`, result.message);

		return result;
	} catch (e: any) {
		const message = `签到异常：${(e && e.message) || e}`;
		logger.error(message, e);
		addLog(account.id, 'error', message);
		return { ok: false, message };
	}
}

/** 选择拍照签到图片 */
export async function choosePhoto(): Promise<string> {
	const result = await dialog.showOpenDialog({
		title: '选择签到图片',
		properties: ['openFile'],
		filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
	});
	if (result.canceled || !result.filePaths.length) return '';
	return result.filePaths[0];
}

export { log };
