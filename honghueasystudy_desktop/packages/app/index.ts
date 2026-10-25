import { app } from 'electron';
import { remoteRegister } from './src/tasks/remote.register';
import { initStore } from './src/tasks/init.store';
import { autoLaunch } from './src/tasks/auto.launch';
import { createWindow } from './src/window';
import { globalListenerRegister } from './src/tasks/global.listener';
import { task } from './src/utils';
import { handleError } from './src/tasks/error.handler';
import { updater } from './src/tasks/updater';
import { startupServer } from './src/tasks/startup.server';
import { initChrome } from './src/tasks/init.chrome';
import { initExtension } from './src/tasks/init.extension';
import { initOcr } from './src/tasks/init.ocr';
import { store } from './src/store';
import { initAesKey } from './src/crypto';
import { initRemoteControl, remoteControl } from './src/tasks/remote-control';

app.setName('鸿鹄易学');

// 防止软件崩溃以及兼容
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-rasterization');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('--no-sandbox');
app.disableHardwareAcceleration();

/** 获取单进程锁 */
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
	app.quit();
} else {
	bootstrap();
}

/** 启动渲染进程 */
function bootstrap() {
	task('鸿鹄易学启动程序', () =>
		Promise.all([
			task('初始化错误处理', () => handleError()),
			// 密钥初始化必须在 initStore 之前完成（initStore 同步调用 getDecryptedRenderData）
			task('初始化加密密钥', () => initAesKey()).then(() =>
				task('初始化本地设置', async () => {
					initStore();
					await task('初始化内置扩展', () => initExtension());
					await task('启动接口服务', () => startupServer());
					// OCR 是滑块验证码的必需依赖：缺失时后台下载，不阻塞软件启动
					task('初始化OCR模块', () => initOcr()).catch((e) => console.error('OCR 初始化失败', e));
				})
			),
			task('初始化自动启动', () => autoLaunch()),
			task('启动渲染进程', async () => {
				// 设置 webrtc 的影像帧率比例，最高100，太高会造成卡顿，参数默认50
				app.commandLine.appendSwitch(
					'webrtc-max-cpu-consumption-percentage',
					(store.store.app?.video_frame_rate ?? 1).toString()
				);

				await app.whenReady();
				const window = createWindow();
				const relaunched = await task('初始化谷歌浏览器', () => initChrome(window));
				if (relaunched) {
					return;
				}

				app.on('quit', (e) => {
					e.preventDefault();
					// 交给渲染层去关闭浏览器
					if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
						window.webContents.send('close');
					}
				});

				window.on('close', (e) => {
					e.preventDefault();
					if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
						window.webContents.send('close');
					}
				});

				window.webContents.once('did-finish-load', () => {
					setTimeout(() => {
						// 因为需要对渲染进程发送信息，所以要在显示完成后开始监听
						if (app.isPackaged) {
							task('软件更新', () => updater());
						}
					}, 1000);
				});

				task('初始化远程通信模块', () => remoteRegister(window));
				task('初始化远程控制服务', () =>
					initRemoteControl(window).catch((e) => console.error('远程控制服务初始化失败', e))
				);
				task('注册app事件监听器', () => globalListenerRegister(window));

				if (app.isPackaged) {
					await window.loadFile('./public/index.html');
				} else {
					await window.loadURL('http://localhost:3000');
					window.webContents.openDevTools();
				}

				// 加载完成显示，解决一系列的显示/黑屏问题
				window.show();
			})
		])
	);
}

/**
 * 进程真正退出时清理远程控制服务与隧道子进程。
 *
 * 注意：不能放在 app 的 before-quit / quit 中。
 * 主进程的 quit 事件会 preventDefault 并交由渲染层处理（可能因浏览器拒绝关闭而取消退出），
 * 一旦在 before-quit 里停掉服务，用户取消退出后远程控制将无法恢复。
 * process 的 exit 事件只在确定退出时同步触发，是唯一安全的位置。
 */
process.on('exit', () => {
	try {
		remoteControl.dispose();
	} catch (e) {
		console.error('清理远程控制服务失败', e);
	}
});
