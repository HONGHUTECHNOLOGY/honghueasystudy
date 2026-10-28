import { UpdateInformationResource } from '@honghu-desktop/common';
import { store } from '../store';
import { electron } from '../utils/node';
import { notify } from './notify';
import { Message, Modal, Notification } from '@arco-design/web-vue';
import { h } from 'vue';
import { remote } from './remote';
import { processes } from './process';
import { sleep } from './index';
const { ipcRenderer } = electron;

const CLOSING_NOTIFY_KEY = 'updater-close-browsers';

/**
 * 安装包静默覆盖安装前必须关掉浏览器实例。
 *
 * 安装器要改写 resources/ 下的文件（含 node_modules 里的原生模块），
 * 这些文件正被浏览器进程占用时安装会失败或留下半装状态。
 *
 * close() 依赖 worker 的 browser-closed 回执，卡住时不能让更新无限等待，因此加超时兜底。
 */
async function closeBrowsersForUpdate() {
	const running = processes.filter((p) => p.status === 'launched' || p.status === 'launching');
	if (!running.length) return;

	notify('鸿鹄易学更新程序', '正在关闭浏览器，准备安装…', CLOSING_NOTIFY_KEY, {
		type: 'info',
		duration: 0,
		close: false
	});

	await Promise.all(
		running.map((p) =>
			Promise.race([p.close().catch(() => undefined), sleep(10000)])
		)
	);

	// 关不掉的实例交给主进程报错提示，这里不阻塞
	Notification.remove(CLOSING_NOTIFY_KEY);
}

/**
 * 手动检查更新（侧边栏版本号点击触发）。
 *
 * 有新版本时主进程会推送 detect-new-app-version 弹窗，这里不重复提示；
 * 只有「已是最新」「检测失败」「有新版本但下载源不可达」需要在此反馈，避免用户点了没反应。
 */
export async function checkAppUpdate() {
	try {
		const result = await remote.methods.call('checkUpdate');
		if (!result || result.ok === false) {
			Message.error('检查更新失败，请检查网络后重试');
			return;
		}
		// 有新版但该平台的下载地址全部连不上：主进程刻意不弹更新窗，这里必须说明原因
		if (result.blocked === 'unreachable') {
			Message.warning(`新版本 v${result.latest} 已发布，但下载服务器当前无法连接，请稍后再试`);
			return;
		}
		if (!result.hasUpdate) {
			Message.success(`当前已是最新版本 v${result.current}`);
		}
	} catch (e) {
		Message.error('检查更新失败：' + e);
	}
}

export function activeIpcRenderListener() {
	/** 下载安装包的进度（261MB，进度按实际字节走） */
	ipcRenderer.on('update-download', (e, rate, totalLength, chunkLength) => {
		const total = totalLength > 0 ? (totalLength / 1024 / 1024).toFixed(0) : '?';
		notify(
			'鸿鹄易学更新程序',
			`正在下载安装包: ${(chunkLength / 1024 / 1024).toFixed(1)}MB/${total}MB`,
			'updater',
			{
				type: 'info',
				duration: 0,
				close: false
			}
		);
	});

	/**
	 * 安装包下载并校验完成。
	 * 此时还不退出应用 —— 用户可能正在做题，让他自己决定什么时候装。
	 *
	 * restored = true 表示这是上次就已经下好的安装包（软件重启后恢复），
	 * 不再重复下载，直接提示安装。
	 */
	ipcRenderer.on(
		'update-downloaded',
		(e, info: { tag?: string; size?: number; installDir?: string; runDir?: string; restored?: boolean }) => {
			Notification.remove('updater');
			if (!info || !info.tag) return;

			// 当前跑的不是安装目录里那份（解压副本 / win-unpacked / 旧目录）时要说清楚，
			// 否则用户装完还从原来那个入口打开，会以为更新没生效
			const elsewhere =
				!!info.runDir && !!info.installDir && info.runDir.toLowerCase() !== info.installDir.toLowerCase();

			Modal.confirm({
				title: info.restored ? '已下载的更新待安装' : '安装包已下载完成',
				okText: '立即安装',
				cancelText: '稍后安装',
				maskClosable: false,
				width: 480,
				async onOk() {
					await closeBrowsersForUpdate();
					try {
						await remote.methods.call('installUpdate');
					} catch (err) {
						Message.error('启动安装失败：' + err);
					}
				},
				content: () =>
					h('div', [
						h('div', info.restored ? `新版本 ${info.tag} 的安装包上次已经下载完成，随时可以安装。` : `新版本 ${info.tag} 已下载完成。`),
						h('div', '点击「立即安装」会关闭本软件并开始安装，安装完成后请重新打开软件。'),
						info.installDir
							? h('div', { style: 'margin-top:8px;opacity:.6;font-size:12px' }, `安装目录：${info.installDir}`)
							: null,
						elsewhere
							? h(
									'div',
									{ style: 'margin-top:8px;font-size:12px;color:#ff7d00' },
									`当前运行的程序不在安装目录内（${info.runDir}），更新会安装到上面的安装目录。安装完成后请从该目录或桌面快捷方式启动。`
							  )
							: null
					])
			});
		}
	);

	// 显示浏览器
	ipcRenderer.on('show-browser-in-app', (e, uid) => {
		store.render.browser.currentBrowserUid = uid;
	});

	// 检测到新版本
	ipcRenderer.on('detect-new-app-version', (e, new_version: UpdateInformationResource) => {
		console.log('detect-new-app-version', new_version);
		if (!new_version) {
			return;
		}

		Modal.confirm({
			title: '🎉检测到版本更新🎉',
			okText: '确认更新',
			cancelText: '下次一定',
			maskClosable: false,
			width: 500,
			async onOk() {
				try {
					// 只负责下载安装包（261MB）：下载期间不打扰用户，也不关浏览器；
					// 下完由主进程推 update-downloaded，再弹「立即安装」由用户决定时机。
					await remote.methods.call('updateApp', new_version);
				} catch (e) {
					// 主进程已弹过详细的失败对话框，这里只留控制台记录，避免重复提示
					console.warn('下载更新失败', e);
				}
			},
			content: () =>
				h('div', [
					h('div', '新版本 : ✨' + new_version.tag),
					h('div', '版本更新内容如下: '),
					h('div', [
						...(new_version.description.feat?.length
							? [
									h('div', '新增：'),
									h(
										'ul',
										new_version.description.feat.map((feature) => h('li', feature))
									)
							  ]
							: []),
						...(new_version.description.fix?.length
							? [
									h('div', '修复：'),
									h(
										'ul',
										new_version.description.fix.map((feature) => h('li', feature))
									)
							  ]
							: []),
						...(new_version.description.other?.length
							? [
									h('div', '其他：'),
									h(
										'ul',
										new_version.description.other.map((feature) => h('li', feature))
									)
							  ]
							: [])
					])
				])
		});
	});
}
