/**
 * 超星签到核心类型
 *
 * 与渲染进程、主进程解耦，可被自动化脚本（worker）直接复用。
 */

/** 登录后获得的基础 Cookie（mobilelearn 接口只认这几项） */
export interface ChaoxingCookies {
	fid?: string;
	pid?: string;
	refer?: string;
	_blank?: string | boolean;
	t?: string | boolean;
	/** 登录凭证 */
	vc3: string;
	/** 用户 id */
	_uid: string;
	/** 设备标识 */
	_d: string;
	uf: string;
	lv?: string;
	/** 真实姓名（登录后补充，不参与 Cookie 序列化） */
	name?: string;
}

export interface Course {
	courseId: string;
	classId: string;
}

/** 检测到的有效签到活动 */
export interface SigninActivity {
	activeId: string;
	name: string;
	courseId: string;
	classId: string;
	/** 0 普通/拍照 2 二维码 3 手势 4 位置 5 签到码 */
	otherId: number;
	/** 是否拍照签到（otherId=0 时有效） */
	ifphoto?: number;
	/** 群聊消息来源（无课程的群聊签到） */
	chatId?: string;
	/** getPPTActiveInfo 的原始返回 */
	info?: any;
	/** 签到类型中文名 */
	typeName?: string;
	/** 本地台账里已有该活动的成功签到记录 */
	signed?: boolean;
	/** 已签到时间（毫秒时间戳） */
	signedTime?: number;
	/** 已签到的结果文案 */
	signedMessage?: string;
}

export type SigninType = 'general' | 'gesture' | 'photo' | 'location' | 'qr' | 'code';

export interface AddressItem {
	lon: string;
	lat: string;
	address: string;
	altitude?: string;
}

export interface SigninResult {
	ok: boolean;
	/** 面向用户的结果文案 */
	message: string;
	/**
	 * 服务端认为此前已经签过
	 *
	 * 这种情况不会重复计入签到，但目标已达成，调用方应按「已签到」处理。
	 */
	already?: boolean;
}

/** 自动监听配置（持久化到账号） */
export interface SigninAccountConfig {
	/** 轮询间隔（秒） */
	interval: number;
	/** 监听时长（分钟），0 表示不限 */
	duration: number;
	/** 位置签到坐标 */
	address: AddressItem;
	/** 位置签到多地址尝试 */
	presetAddress: AddressItem[];
	/** 拍照签到图片路径 */
	photoPath: string;
	/** 二维码签到 enc（手动填写） */
	qrcodeEnc: string;
	/** 检测到签到活动后延迟多少秒再签 */
	delay: number;
	/** 是否启用 IM 实时监听 */
	im: boolean;
	/** 自动签到开关，关闭时只检测不签到，手动签到不受影响 */
	autoSign: boolean;
}

/** 签到日志 */
export interface SigninLog {
	id: string;
	accountId: string;
	time: number;
	/** info / success / warn / error */
	level: 'info' | 'success' | 'warn' | 'error';
	message: string;
}

/** 账号视图（渲染进程可见，不含密码） */
export interface SigninAccountView {
	id: string;
	phone: string;
	name: string;
	cookies: ChaoxingCookies;
	createTime: number;
	lastCheckTime: number;
	lastSignTime: number;
	lastResult: string;
	config: SigninAccountConfig;
	/** 运行时状态：是否监听中 */
	monitoring: boolean;
	/** 运行时状态：是否正在检测 */
	checking: boolean;
	/** IM 连接状态 */
	imStatus: 'off' | 'connecting' | 'opened' | 'failed';
}
