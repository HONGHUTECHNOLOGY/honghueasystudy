import { UpdateInformationResource } from '@honghu-desktop/common';
import { store } from '../store';
import { electron } from '../utils/node';
import { notify } from './notify';
import { Button, Message, Modal, Notification, Progress } from '@arco-design/web-vue';
import { defineComponent, h, reactive } from 'vue';
import { remote } from './remote';
import { processes } from './process';
import { sleep } from './index';
import UpdateNotes from '../components/UpdateNotes.vue';
const { ipcRenderer } = electron;

const CLOSING_NOTIFY_KEY = 'updater-close-browsers';

/* ------------------------------------------------------------------ *
 * 下载进度窗口
 *
 * 之前下载进度只发一条角落通知（还带 duration 0 不会自动消失），窗口被遮挡或系统
 * 屏蔽通知时，用户点完「确认更新」就等于没有任何反应。这里改成不可关闭的 Modal：
 * 百分比 + 已下载/总量 + 速度 + 剩余时间，下载完成时自动关闭并进入「立即安装」确认。
 * ------------------------------------------------------------------ */

const DOWNLOAD_RESET = { percent: 0, received: 0, total: 0, speed: 0, eta: 0, connecting: true };

const downloadState = reactive({ ...DOWNLOAD_RESET });

/** 速度采样：瞬时值抖动大，用指数滑动平均平滑一下 */
let sample = { at: 0, received: 0, speed: 0 };

let downloadModal: { close: () => void } | null = null;

function fmtSize(bytes: number): string {
	if (!bytes || bytes < 0) return '0 MB';
	const mb = bytes / 1024 / 1024;
	if (mb >= 1024) return (mb / 1024).toFixed(2) + ' GB';
	if (mb >= 1) return mb.toFixed(1) + ' MB';
	return (bytes / 1024).toFixed(0) + ' KB';
}

function fmtEta(seconds: number): string {
	if (!seconds || seconds <= 0 || !Number.isFinite(seconds)) return '';
	if (seconds < 60) return `剩余约 ${Math.ceil(seconds)} 秒`;
	const m = Math.floor(seconds / 60);
	const s = Math.round(seconds % 60);
	return `剩余约 ${m} 分${s > 0 ? ' ' + s + ' 秒' : '钟'}`;
}

function resetDownloadState() {
	Object.assign(downloadState, DOWNLOAD_RESET);
	sample = { at: 0, received: 0, speed: 0 };
}

/** 进度内容：渲染函数里读 reactive 状态，进度事件触发即重绘 */
const DownloadProgressBody = defineComponent({
	name: 'DownloadProgressBody',
	setup() {
		const labelStyle = 'font-size:12px;color:var(--color-text-3);';
		return () =>
			h('div', { style: 'padding:2px 0 4px' }, [
				h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px' }, [
					h(
						'div',
						{ style: 'font-size:13px' },
						downloadState.connecting
							? '正在连接下载服务器…'
							: `正在下载：${fmtSize(downloadState.received)} / ${fmtSize(downloadState.total)}`
					),
					h('div', { style: 'font-size:12px;color:var(--color-text-3)' }, fmtEta(downloadState.eta))
				]),
				h(Progress, {
					percent: Math.min(1, Math.max(0, downloadState.percent / 100)),
					showText: false,
					strokeWidth: 8
				}),
				h('div', { style: `display:flex;gap:14px;margin-top:10px;${labelStyle}` }, [
					h('span', `${downloadState.percent.toFixed(1)}%`),
					downloadState.speed > 0 ? h('span', `${fmtSize(downloadState.speed)}/s`) : null,
					// 速度没出来之前先别显示 0 MB/s，避免看着像卡住
					h('span', { style: 'margin-left:auto' }, '下载完成后会再确认一次才安装')
				])
			]);
	}
});

/** 打开下载进度窗口（重复调用无副作用） */
export function showDownloadProgress() {
	if (downloadModal) return;
	resetDownloadState();
	downloadModal =
		(Modal.open({
			title: '正在下载更新',
			content: () => h(DownloadProgressBody),
			footer: false,
			closable: false,
			maskClosable: false,
			escToClose: false,
			width: 460
		}) as unknown as { close: () => void }) || null;
}

/** 关闭下载进度窗口 */
export function hideDownloadProgress() {
	try {
		downloadModal?.close();
	} catch {
		// 窗口可能已被卸载，忽略
	}
	downloadModal = null;
	resetDownloadState();
}

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

	await Promise.all(running.map((p) => Promise.race([p.close().catch(() => undefined), sleep(10000)])));

	// 关不掉的实例交给主进程报错提示，这里不阻塞
	Notification.remove(CLOSING_NOTIFY_KEY);
}

/**
 * 手动检查更新（工具菜单 / 侧边栏版本号触发）。
 *
 * 有新版本时主进程会推送 detect-new-app-version 弹窗，这里不重复提示；
 * 只有「已是最新」「检测失败」需要在此反馈，避免用户点了没反应。
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
	/** 下载安装包的进度（300MB+，按实际字节走） */
	ipcRenderer.on('update-download', (e, payload: { percent: number; received: number; total: number }) => {
		if (!payload) return;
		// 远程台触发下载时没走过 onOk，这里兜底补上窗口
		if (!downloadModal) showDownloadProgress();

		downloadState.connecting = false;
		downloadState.percent = payload.percent;
		downloadState.received = payload.received;
		downloadState.total = payload.total;

		// 瞬时速度抖动大，做一次指数滑动平均；采样间隔太短会放大噪声
		const now = Date.now();
		const dt = (now - sample.at) / 1000;
		if (!sample.at) {
			sample = { at: now, received: payload.received, speed: 0 };
		} else if (dt >= 0.4) {
			const inst = (payload.received - sample.received) / dt;
			sample.speed = sample.speed > 0 && Number.isFinite(inst) ? sample.speed * 0.55 + inst * 0.45 : inst;
			sample.at = now;
			sample.received = payload.received;
			downloadState.speed = Math.max(0, sample.speed);
		}
		downloadState.eta =
			downloadState.speed > 0 && downloadState.total > 0
				? Math.max(0, (downloadState.total - payload.received) / downloadState.speed)
				: 0;
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
		(
			e,
			info: {
				tag?: string;
				size?: number;
				installDir?: string;
				runDir?: string;
				restored?: boolean;
				/** 上次已经点过安装但版本没升上去 */
				failed?: boolean;
				exePath?: string;
				logPath?: string;
				logTail?: string;
			}
		) => {
			// 下载已结束，先把进度窗口收掉，再弹「立即安装」确认
			hideDownloadProgress();
			Notification.remove('updater');
			/**
			 * 后台托盘运行时窗口可能是隐藏的：下面的「立即安装」确认框必须可见，
			 * 否则安装包一直等着，用户完全不知道。
			 */
			remote.methods.call('showMainWindow').catch(() => undefined);
			if (!info || !info.tag) return;

			// 当前跑的不是安装目录里那份（解压副本 / win-unpacked / 旧目录）时要说清楚，
			// 否则用户装完还从原来那个入口打开，会以为更新没生效
			const elsewhere =
				!!info.runDir && !!info.installDir && info.runDir.toLowerCase() !== info.installDir.toLowerCase();

			/** 打开日志 / 直接运行安装包的最后一条人工兜底 */
			const openTarget = (p?: string) => {
				if (!p) return;
				remote.methods.call('openFolder', p).catch((err) => Message.error('打开失败：' + err));
			};

			Modal.confirm({
				title: info.failed
					? '上次安装未完成'
					: info.restored
						? '已下载的更新待安装'
						: '安装包已下载完成',
				okText: info.failed ? '重试安装' : '立即安装',
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
						h(
							'div',
							info.failed
								? `上次安装 v${info.tag} 没有生效，软件仍是旧版本。可以重试，也可以直接运行已下载的安装包。`
								: info.restored
									? `新版本 ${info.tag} 的安装包上次已经下载完成，随时可以安装。`
									: `新版本 ${info.tag} 已下载完成。`
						),
						h(
							'div',
							'点击「立即安装」会直接覆盖安装到上面的目录（不会询问安装位置），软件随即自动退出；装完后在最后一页点「完成」即可启动新版本。'
						),
						info.failed && info.logTail
							? h(
									'div',
									{ style: 'margin-top:8px;opacity:.6;font-size:12px;word-break:break-all' },
									`上次安装日志：${info.logTail}`
							  )
							: null,
						info.failed
							? h('div', { style: 'margin-top:10px;display:flex;gap:8px' }, [
									info.logPath
										? h(Button, { size: 'mini', onClick: () => openTarget(info.logPath) }, () => '查看安装日志')
										: null,
									info.exePath
										? h(Button, { size: 'mini', onClick: () => openTarget(info.exePath) }, () => '手动运行安装包')
										: null
							  ])
							: null,
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

	/**
	 * GPU 连续崩溃后主进程自动关掉了硬件加速。
	 *
	 * 必须把内存里的值同步过来：渲染端不 watch window 段，但任何一次
	 * render 变化都会把整份 store 写回主进程，不同步就会把刚写下的
	 * `false` 覆盖回 `true`，用户下次启动再崩一轮。
	 */
	ipcRenderer.on('gpu-acceleration-disabled', (e, payload: { reason?: string }) => {
		store.window.gpuAcceleration = false;
		notify(
			'已关闭硬件加速',
			`显卡加速多次异常（${payload?.reason || '未知原因'}），已自动改用软件渲染，重启软件后生效。` +
				'可在「软件设置 → 图形加速」中重新开启。',
			'gpu-acceleration',
			{ type: 'warning', duration: 10000, close: true }
		);
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
			onOk() {
				/*
				 * 必须同步返回：Arco 的 onOk 返回 Promise 时会让确认框一直挂着 loading 按钮，
				 * 下载 300MB 期间用户看到的就是「一个转圈的确认框」叠在进度窗口上。
				 * 这里立即关掉确认框，下载交给进度窗口显示。
				 */
				void (async () => {
					// 先把进度窗口亮起来：建立连接、拿到首块数据之间有 1~3 秒空档，不能什么都不显示
					showDownloadProgress();
					try {
						// 只负责下载安装包：下载期间不关浏览器、也不打断正在跑的任务；
						// 下完由主进程推 update-downloaded，再弹「立即安装」由用户决定时机。
						const res = await remote.methods.call('updateApp', new_version);
						// 提前返回的分支（清单缺安装包、平台需手动下载、开发模式）不会推 update-downloaded，
						// 进度窗口必须自己收掉，否则会一直挂在 0%
						if (!res || (res as any).ok === false) hideDownloadProgress();
					} catch (e) {
						hideDownloadProgress();
						// 主进程已弹过详细的失败对话框，这里只留控制台记录，避免重复提示
						console.warn('下载更新失败', e);
					}
				})();
			},
			/*
			 * 内容只显示「面向用户」的更新日志（官网 api/changelog.json，已过滤工程条目）。
			 *
			 * 早先这里渲染的是清单里的 description，但那份字段一直只有
			 * 「桌面端与扩展同步更新，详见发布页」一句占位——对用户零信息量，
			 * 现在改成按版本分组、可滚动的真实更新内容。
			 */
			content: () =>
				h('div', [
					h(
						'div',
						{ style: 'font-size:12px;color:var(--color-text-3);margin:-4px 0 8px' },
						`新版本 v${new_version.tag}`
					),
					h(UpdateNotes, { notes: new_version.notes })
				])
		});
	});
}
