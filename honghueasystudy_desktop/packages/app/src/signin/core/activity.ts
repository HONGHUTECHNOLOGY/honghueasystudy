import { API } from './api';
import { cxGet, sleep } from './http';
import type { ChaoxingCookies, Course, SigninActivity, SigninType } from './types';

export const TOO_FREQUENT = 'TooFrequent';

/**
 * 查询单个课程的最新活动，有效签到则返回活动信息
 */
export async function getActivity(
	cookies: ChaoxingCookies,
	course: Course
): Promise<SigninActivity | typeof TOO_FREQUENT> {
	const result = await cxGet(API.ACTIVE_LIST, cookies, {
		fid: 0,
		courseId: course.courseId,
		classId: course.classId,
		_: Date.now()
	});

	let parsed: any;
	try {
		parsed = JSON.parse(result.data);
	} catch {
		throw new Error('签到活动接口返回异常');
	}

	// 请求过于频繁时服务端返回 data=null
	if (parsed.data === null || parsed.data === undefined) return TOO_FREQUENT;

	const activeList: any[] = parsed.data.activeList || [];
	for (const item of activeList) {
		const otherId = Number(item.otherId);
		if (otherId < 0 || otherId > 5) continue;
		if (item.status !== 1) continue;
		// 开始超过两小时的活动视为无效
		if (item.startTime && (Date.now() - Number(item.startTime)) / 1000 >= 7200) continue;

		return {
			activeId: String(item.id || item.activeId),
			name: item.nameOne || item.name || '签到活动',
			courseId: course.courseId,
			classId: course.classId,
			otherId
		};
	}

	throw new Error('该课程暂无有效签到');
}

/**
 * 逐个课程检测签到活动
 *
 * 课程较多时按 5 个一组并发，任意一个命中即返回；全部失败返回 null。
 */
export async function traverseCourseActivity(
	cookies: ChaoxingCookies,
	courses: Course[]
): Promise<SigninActivity | typeof TOO_FREQUENT | null> {
	if (courses.length === 0) return null;

	let tooFrequent = false;
	const tasks: Promise<SigninActivity>[] = [];

	/**
	 * 单个课程检测
	 *
	 * 「请求过频」不能算命中，否则会立刻中断其它课程的检测；
	 * 这里只记录标记并当作失败，等所有批次结束后再整体返回。
	 */
	const handleOne = async (course: Course): Promise<SigninActivity> => {
		const result = await getActivity(cookies, course);
		if (result === TOO_FREQUENT) {
			tooFrequent = true;
			throw new Error(TOO_FREQUENT);
		}
		return result;
	};

	/** 任意一个 resolve 就返回，全部 reject 才失败 */
	const anySuccess = (list: Promise<SigninActivity>[]) =>
		new Promise<SigninActivity>((resolve, reject) => {
			let rejected = 0;
			let settled = false;
			for (const task of list) {
				task.then(
					(value) => {
						if (settled) return;
						settled = true;
						resolve(value);
					},
					(err) => {
						rejected += 1;
						if (!settled && rejected === list.length) {
							settled = true;
							reject(err);
						}
					}
				);
			}
		});

	for (let i = 0; i < courses.length; i++) {
		tasks.push(handleOne(courses[i]));
		// 一轮 5 个，最后不足 5 个则全部提交
		if (i % 5 === 0 || i === courses.length - 1) {
			try {
				const result = await anySuccess(tasks.slice());
				return result;
			} catch {
				/* 本轮无活动，继续下一批 */
			}
			tasks.length = 0;
		}
	}

	if (tooFrequent) return TOO_FREQUENT;
	return null;
}

/** 获取签到活动的详细信息（类型、是否拍照等） */
export async function getPPTActiveInfo(cookies: ChaoxingCookies, activeId: string): Promise<any | null> {
	const result = await cxGet(API.PPT_ACTIVE_INFO, cookies, { activeId });
	try {
		const parsed = JSON.parse(result.data);
		return parsed.data || null;
	} catch {
		return null;
	}
}

/** 预签到：向服务端登记本次签到（课程签到） */
export async function preSign(cookies: ChaoxingCookies, activity: SigninActivity): Promise<void> {
	await cxGet(API.PRE_SIGN, cookies, {
		courseId: activity.courseId,
		classId: activity.classId,
		activePrimaryId: activity.activeId,
		general: 1,
		sys: 1,
		ls: 1,
		appType: 15,
		tid: '',
		uid: cookies._uid,
		ut: 's'
	});

	// 再请求 analysis/analysis2 完成登记，失败不影响后续签到
	try {
		const analysisResult = await cxGet(API.ANALYSIS, cookies, {
			vs: 1,
			DB_STRATEGY: 'RANDOM',
			aid: activity.activeId
		});
		let code = analysisResult.data;
		const start = code.indexOf("code='+'");
		if (start >= 0) {
			code = code.substring(start + 8);
			const end = code.indexOf("'");
			code = code.substring(0, end >= 0 ? end : code.length);
		} else {
			code = '';
		}

		await cxGet(API.ANALYSIS2, cookies, { DB_STRATEGY: 'RANDOM', code });
	} catch {
		/* empty */
	}

	await sleep(500);
}

/** 预签到：无课程的群聊签到 */
export async function preSign2(
	cookies: ChaoxingCookies,
	args: { activeId: string; chatId: string; tuid: string }
): Promise<string> {
	const result = await cxGet(API.CHAT_PRE_SIGN, cookies, {
		activeId: args.activeId,
		code: '',
		uid: cookies._uid,
		courseId: 'null',
		classId: 0,
		general: 0,
		chatId: args.chatId,
		appType: 0,
		tid: args.tuid,
		atype: 'null',
		sys: 0
	});
	return result.data;
}

/** 解析签到类型的中文名称 */
export function getSignTypeName(info: any): string {
	switch (Number(info?.otherId)) {
		case 0:
			return Number(info?.ifphoto) === 1 ? '拍照签到' : '普通签到';
		case 2:
			return '二维码签到';
		case 3:
			return '手势签到';
		case 4:
			return '位置签到';
		case 5:
			return '签到码签到';
		default:
			return '未知签到';
	}
}

/** 由群聊预签页面推测签到类型 */
export function speculateType(pageHtml: string): SigninType {
	if (pageHtml.indexOf('拍照') >= 0) return 'photo';
	if (pageHtml.indexOf('位置') >= 0) return 'location';
	if (pageHtml.indexOf('二维码') >= 0) return 'qr';
	return 'general';
}

/** 活动类型 -> 签到类型 */
export function activityToSignType(activity: SigninActivity, info?: any): SigninType {
	const otherId = Number(info?.otherId ?? activity.otherId);
	if (otherId === 2) return 'qr';
	if (otherId === 3) return 'gesture';
	if (otherId === 4) return 'location';
	if (otherId === 5) return 'code';
	if (Number(info?.ifphoto ?? activity.ifphoto) === 1) return 'photo';
	return 'general';
}
