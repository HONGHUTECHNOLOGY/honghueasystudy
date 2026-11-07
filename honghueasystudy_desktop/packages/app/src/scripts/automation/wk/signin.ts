import { AutomationScript } from '../../script';
import { getPPTActiveInfo, getSignTypeName, preSign, traverseCourseActivity } from '../../../signin/core/activity';
import { performSign } from '../../../signin/core/sign';
import { getAccountInfo, getCourses } from '../../../signin/core/user';
import type { ChaoxingCookies, SigninAccountConfig, SigninType } from '../../../signin/core/types';

const DEFAULT_CONFIG: SigninAccountConfig = {
	interval: 30,
	duration: 0,
	delay: 0,
	address: { lon: '', lat: '', address: '', altitude: '0' },
	presetAddress: [],
	photoPath: '',
	qrcodeEnc: '',
	im: false,
	// 脚本由用户显式触发，不使用自动签到开关
	autoSign: false
};

/**
 * 从浏览器上下文读取超星登录 Cookie
 *
 * 该脚本依赖「登录脚本先执行」，不负责输入账号密码。
 */
async function readCookies(page: any): Promise<ChaoxingCookies | null> {
	const cookies: { name: string; value: string }[] = await page.context().cookies();
	const map = new Map(cookies.map((item) => [item.name, item.value]));
	const uid = map.get('_uid') || map.get('UID') || '';
	const d = map.get('_d') || '';
	const vc3 = map.get('vc3') || '';
	if (!uid || !d || !vc3) return null;

	return {
		fid: map.get('fid') || '-1',
		pid: map.get('pid') || '-1',
		refer: 'http%3A%2F%2Fi.chaoxing.com',
		_blank: '1',
		t: 'true',
		vc3,
		_uid: uid,
		_d: d,
		uf: map.get('uf') || '',
		lv: map.get('lv') || '',
		name: map.get('_name') || ''
	};
}

export const SigninAutoScript = new AutomationScript(
	{
		mode: {
			label: '签到方式',
			value: 'auto',
			type: 'select',
			options: [
				{ label: '自动识别', value: 'auto' },
				{ label: '普通/手势/签到码', value: 'general' },
				{ label: '位置签到', value: 'location' },
				{ label: '拍照签到', value: 'photo' },
				{ label: '二维码签到', value: 'qr' }
			]
		},
		address: {
			label: '位置签到地址',
			value: '',
			type: 'text',
			placeholder: '例如：北京市朝阳区xx路xx号'
		},
		lon: {
			label: '经度',
			value: '',
			type: 'text',
			placeholder: '例如：116.397428'
		},
		lat: {
			label: '纬度',
			value: '',
			type: 'text',
			placeholder: '例如：39.90923'
		},
		photoPath: {
			label: '拍照签到图片路径',
			value: '',
			type: 'text',
			placeholder: '本地图片绝对路径，留空则跳过拍照签到'
		},
		enc: {
			label: '二维码 enc',
			value: '',
			type: 'text',
			placeholder: '二维码签到需要，可从二维码链接中提取 enc 参数'
		}
	},
	{
		name: '超星-检测并签到',
		icon: 'https://www.chaoxing.com/',
		async run(page, configs) {
			const emit = (msg: string) => SigninAutoScript.emit('script-data', msg);
			try {
				const cookies = await readCookies(page);
				if (!cookies) {
					SigninAutoScript.emit('script-error', '未读取到超星登录状态，请先执行超星登录脚本');
					return;
				}

				// 签到接口要求 name（拍照签到会展示在教师端），这里补一次真实姓名
				if (!cookies.name) {
					try {
						cookies.name = await getAccountInfo(cookies);
					} catch {
						/* 取不到姓名不影响签到 */
					}
				}

				emit('正在读取课程列表...');
				const courses = await getCourses(cookies);
				if (typeof courses === 'string') {
					SigninAutoScript.emit('script-error', '读取课程失败，登录状态可能已失效');
					return;
				}

				emit(`共 ${courses.length} 门课程，开始检测签到...`);
				const activity = await traverseCourseActivity(cookies, courses);
				if (activity === 'TooFrequent') {
					SigninAutoScript.emit('script-error', '请求过于频繁，请稍后再试');
					return;
				}
				if (!activity) {
					emit('未检测到有效签到活动');
					return;
				}

				const info = await getPPTActiveInfo(cookies, activity.activeId);
				activity.info = info || undefined;
				activity.ifphoto = Number(info?.ifphoto) || 0;
				activity.typeName = getSignTypeName(info || activity);
				emit(`检测到签到：${activity.name}（${activity.typeName}）`);

				await preSign(cookies, activity);

				const config: SigninAccountConfig = {
					...DEFAULT_CONFIG,
					address: {
						lon: String(configs.lon || ''),
						lat: String(configs.lat || ''),
						address: String(configs.address || ''),
						altitude: '0'
					},
					photoPath: String(configs.photoPath || ''),
					qrcodeEnc: String(configs.enc || '')
				};

				const mode = String(configs.mode || 'auto') as SigninType | 'auto';
				const result = await performSign(cookies, activity, {
					type: mode,
					config,
					name: cookies.name || ''
				});

				if (result.ok) {
					emit(result.message);
				} else {
					SigninAutoScript.emit('script-error', result.message);
				}
			} catch (err) {
				SigninAutoScript.emit('script-error', err instanceof Error ? err.message : String(err));
			}
		}
	}
);
