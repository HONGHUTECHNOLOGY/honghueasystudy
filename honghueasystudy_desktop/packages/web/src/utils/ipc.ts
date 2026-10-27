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
 * 就地更新要整体替换 resources/app 目录，浏览器进程会占用其中的 node_modules 原生模块，
 * 不关掉就 rename 失败（Windows 报 EBUSY/EPERM）。这里先关浏览器再交给主进程替换。
 *
 * close() 依赖 worker 的 browser-closed 回执，卡住时不能让更新无限等待，因此加超时兜底。
 */
async function closeBrowsersForUpdate() {
	const running = processes.filter((p) => p.status === 'launched' || p.status === 'launching');
	if (!running.length) return;

	notify('鸿鹄易学更新程序', '正在关闭浏览器，准备更新…', CLOSING_NOTIFY_KEY, {
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
 * 只有「已是最新」或「检测失败」需要在此反馈，避免用户点了没反应。
 */
export async function checkAppUpdate() {
	try {
		const result = await remote.methods.call('checkUpdate');
		if (!result || result.ok === false) {
			Message.error('检查更新失败，请检查网络后重试');
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
	/** 如果正在更新的话，获取更新进度 */
	ipcRenderer.on('update-download', (e, rate, totalLength, chunkLength) => {
		notify(
			'鸿鹄易学更新程序',
			`更新中: ${(chunkLength / 1024 / 1024).toFixed(2)}MB/${(totalLength / 1024 / 1024).toFixed(2)}MB`,
			'updater',
			{
				type: 'info',
				duration: 0,
				close: false
			}
		);
	});

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
				await closeBrowsersForUpdate();
				await remote.methods.call('updateApp', new_version);
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
