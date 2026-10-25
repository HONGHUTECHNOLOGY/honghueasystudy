/** 导航元数据：侧栏、底栏、页头共用同一份定义 */

export type TabKey = 'home' | 'logs' | 'about';

export interface NavItem {
	key: TabKey;
	label: string;
	icon: string;
	/** 桌面端页头副标题 */
	desc: string;
}

export const NAV_ITEMS: NavItem[] = [
	{ key: 'home', label: '总览', icon: 'home', desc: '查看并操作电脑端正在运行的浏览器实例' },
	{ key: 'logs', label: '日志', icon: 'logs', desc: '实时日志输出，按实例切换查看' },
	{ key: 'about', label: '设置', icon: 'sliders', desc: '设备、连接信息与界面外观' }
];

export function findNav(key: TabKey): NavItem {
	return NAV_ITEMS.filter((item) => item.key === key)[0] || NAV_ITEMS[0];
}
