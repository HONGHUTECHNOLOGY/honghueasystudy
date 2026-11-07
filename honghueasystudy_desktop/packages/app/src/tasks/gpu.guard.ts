// @ts-check
import { app, BrowserWindow } from 'electron';
import { store } from '../store';
import { Logger } from '../logger';

const logger = Logger('gpu');

/**
 * 连续 GPU 崩溃多少次后自动关闭硬件加速
 *
 * 取 3 是因为单次崩溃可能只是驱动瞬时异常或驱动更新后的首帧问题，
 * 关掉会让用户在完全能用的机器上白白失去加速；而连续 3 次已经足以说明
 * 这台机器的驱动与 Chromium 合成器不兼容，再试只是让用户反复看白屏。
 */
const CRASH_THRESHOLD = 3;

let crashCount = 0;
let installed = false;

/** 当前是否启用硬件加速（命令行优先级最高） */
export function isGpuAccelerationEnabled(): boolean {
	if (process.argv.includes('--disable-gpu')) return false;
	return store.store.window?.gpuAcceleration !== false;
}

/**
 * 写入硬件加速开关
 *
 * 独立于渲染端的整份 store 保存：GPU 加速是「重启生效」的机器级设置，
 * 崩溃守卫也会写它。若跟着渲染端快照走，一次自动保存就能把刚写下的
 * `false` 冲回 `true`，用户下次启动又崩一次。
 */
export function setGpuAcceleration(enabled: boolean): { ok: boolean; restartRequired: boolean } {
	const current = store.store.window?.gpuAcceleration !== false;
	store.set('window', { ...store.store.window, gpuAcceleration: enabled });
	logger.info(`[图形] 用户设置硬件加速=${enabled ? '开' : '关'}`);
	return { ok: true, restartRequired: current !== enabled };
}

/**
 * 读取 GPU 实际状态，供设置面板显示
 *
 * `gpu_compositing` 为 `disabled_software` 之类的值时，说明即使开关是开的，
 * 实际仍在软件渲染（常见于远程桌面、虚拟机、被拉黑的驱动版本）。
 */
export function getGpuStatus() {
	const enabled = isGpuAccelerationEnabled();
	try {
		const s = app.getGPUFeatureStatus();
		return {
			enabled,
			compositing: s.gpu_compositing,
			rasterization: s.rasterization,
			webgl: s.webgl,
			/** 是否真的有硬件加速在跑：开关开着且合成器不是软件模式 */
			hardwareActive: enabled && !String(s.gpu_compositing).includes('software')
		};
	} catch (e) {
		logger.warn(`[图形] 读取 GPU 状态失败：${e}`);
		return { enabled, compositing: 'unknown', rasterization: 'unknown', webgl: 'unknown', hardwareActive: false };
	}
}

/**
 * 安装 GPU 崩溃守卫
 *
 * 必须「只安装一次」：`child-process-gone` 是 app 级事件，
 * 若初始化流程被重入（比如内置浏览器初始化触发重启），重复注册会把计数叠加，过早误判。
 */
export function initGpuGuard() {
	if (installed) return;
	installed = true;

	app.on('child-process-gone', (_event, details) => {
		// 只关心 GPU 进程：renderer / utility 崩溃属于业务侧问题，不该牵连图形设置
		if (details.type !== 'GPU') return;

		crashCount++;
		logger.error(`[图形] GPU 进程异常退出（${crashCount}/${CRASH_THRESHOLD}）：${details.reason}`);

		if (crashCount < CRASH_THRESHOLD) return;

		// 已经是关闭状态就不必重复写盘（用户可能手动关过）
		if (store.store.window?.gpuAcceleration === false) {
			logger.error('[图形] 硬件加速本就关闭，GPU 仍在崩溃，请检查是否被命令行参数强制启用');
			return;
		}

		store.set('window', { ...store.store.window, gpuAcceleration: false });
		logger.error('[图形] 连续 GPU 崩溃，已写入「关闭硬件加速」，下次启动生效');

		/**
		 * 必须通知渲染端把内存里的值也改掉。
		 *
		 * 渲染端的 store.window 是页面加载时的快照，它不 watch window 段，
		 * 但任何一次 render 变化都会把整份 store 写回主进程。若不同步，
		 * 用户随便点个设置就会把刚写下的 false 覆盖回 true。
		 */
		for (const win of BrowserWindow.getAllWindows()) {
			if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
				win.webContents.send('gpu-acceleration-disabled', { reason: details.reason });
			}
		}
	});
}

/**
 * 启动时把 GPU 实际状态写进日志
 *
 * 用户报「界面发虚 / 滚动卡 / 白屏」时，第一件事就是确认硬件加速到底有没有生效。
 * 没有这行日志，只能靠猜或让用户手动截图设置页。
 */
export function reportGpuStatus() {
	const s = getGpuStatus();
	logger.info(
		`[图形] 加速开关=${s.enabled ? '开' : '关'}；实际=${s.hardwareActive ? '硬件' : '软件'}；` +
			`合成=${s.compositing}；光栅化=${s.rasterization}；WebGL=${s.webgl}`
	);
}
