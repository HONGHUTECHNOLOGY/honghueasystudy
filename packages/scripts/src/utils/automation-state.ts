/**
 * 扩展自动任务 → 桌面端流光状态桥接。
 *
 * 请求由桌面端 Playwright 的 `/hh-automation-state` 路由直接应答，不会真的发到网课服务器。
 * 纯扩展环境没有这个路由：第一次请求返回 404 / 非桥接响应后就永久关闭上报，
 * 避免刷课期间每 20 秒向平台多发一次无意义请求。
 */

/** 每个页面上下文一个随机会话；不同标签、不同任务可以同时常显，互不覆盖。 */
const SESSION_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
const HEARTBEAT_MS = 20_000;

const runningLabels = new Set<string>();
let heartbeat: ReturnType<typeof setInterval> | undefined;
let supported = true;

function stopHeartbeat() {
	if (heartbeat) clearInterval(heartbeat);
	heartbeat = undefined;
}

function disableBridge() {
	supported = false;
	stopHeartbeat();
}

async function report(label: string, active: boolean, keepalive = false) {
	if (!supported) return;
	try {
		const res = await fetch('/hh-automation-state', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				source: `${SESSION_ID}:${label}`,
				label,
				active
			}),
			cache: 'no-store',
			keepalive
		});
		const data = (await res.json()) as { environment?: string };
		if (!res.ok || data.environment !== 'playwright') {
			console.warn(`[鸿鹄] 流光桥接关闭：status=${res.status} env=${data.environment}`);
			disableBridge();
		} else if (!keepalive) {
			console.warn(`[鸿鹄] 流光${active ? '点亮' : '熄灭'}：${label}`);
		}
	} catch (e) {
		/** 纯扩展 / 页面正在销毁 / 桌面端已关闭：状态提示失败不能影响刷课。 */
		console.warn(`[鸿鹄] 流光上报失败（桥接关闭）：${label} ${(e as Error)?.message}`);
		disableBridge();
	}
}

function reportAll(active: boolean, keepalive = false) {
	for (const label of runningLabels) void report(label, active, keepalive);
}

/**
 * 设置某类扩展自动任务的运行状态。
 *
 * 相同 label 重复开启是幂等的；不同 label 独立计数，例如「课程学习」里嵌入
 * 「章节测试」时，答题结束不会把仍在运行的课程学习光效一起关掉。
 */
export function setExtensionAutomation(active: boolean, label = '扩展自动任务') {
	if (active) {
		if (runningLabels.has(label)) return;
		runningLabels.add(label);
		void report(label, true);
		if (supported && !heartbeat) {
			heartbeat = setInterval(() => reportAll(true), HEARTBEAT_MS);
		}
		return;
	}

	if (!runningLabels.delete(label)) return;
	void report(label, false);
	if (runningLabels.size === 0) stopHeartbeat();
}

/** 页面跳转/关闭来不及走 finally 时，主动清理；即使丢失，桌面端心跳租约也会兜底回收。 */
window.addEventListener('pagehide', () => reportAll(false, true));
