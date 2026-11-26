#!/usr/bin/env node
'use strict';

/**
 * 隔离调试启动器
 *
 * 目标：在不触碰正式版（%APPDATA%\鸿鹄易学）任何配置的前提下，启动一个
 * 「数据全新、端口独立、不写注册表、不写系统密钥链正式条目」的桌面端实例。
 *
 * 用法（在 honghueasystudy_desktop 目录）：
 *   node scripts/debug-isolated.js                 保留上次调试数据启动
 *   node scripts/debug-isolated.js --reset         清空调试数据，模拟第一次使用
 *   node scripts/debug-isolated.js --prepare-only  只准备数据并启动 Web（供 VS Code 调试使用）
 *   node scripts/debug-isolated.js --stop-web      停止由本脚本启动的 Web 开发服务器
 *   node scripts/debug-isolated.js --inspect       以 --inspect=9229 启动，等待调试器附加
 *   node scripts/debug-isolated.js --remote-debugging  开启渲染进程 CDP（9223），可调试前端
 *
 * 可选参数：
 *   --data-dir <dir>       调试数据目录（默认 .debug/user-data）
 *   --server-port <port>   本地服务端口（默认从 15419 起找一对空闲端口）
 *   --web-port <port>      Vite 端口（默认 3000）
 *   --no-reuse             不复用正式版已解压的 Chrome（首次会重新解压并自动重启）
 *   --keep-web             Electron 退出后保留 Web 开发服务器
 *   --skip-build           跳过 tsc 编译（源码未变时可加速启动）
 *   --force                允许 --reset 删除 .debug 之外的目录
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const DESKTOP_ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(DESKTOP_ROOT, 'packages', 'app');
const WEB_DIR = path.join(DESKTOP_ROOT, 'packages', 'web');
const COMMON_DIR = path.join(DESKTOP_ROOT, 'packages', 'common');
const TSC_JS = path.join(DESKTOP_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const VITE_JS = path.join(WEB_DIR, 'node_modules', 'vite', 'bin', 'vite.js');

const DEBUG_ROOT = path.join(DESKTOP_ROOT, '.debug');
const DEFAULT_USER_DATA = path.join(DEBUG_ROOT, 'user-data');
const WEB_PID_FILE = path.join(DEBUG_ROOT, 'web-dev.pid');
const WEB_LOG_FILE = path.join(DEBUG_ROOT, 'web-dev.log');

const DEFAULT_SERVER_PORT = 15419;
const DEFAULT_WEB_PORT = 3000;
const INSPECT_PORT = 9229;

const argv = process.argv.slice(2);

function hasFlag(name) {
	return argv.includes(name);
}

function getValue(name, fallback) {
	const index = argv.indexOf(name);
	if (index === -1) return fallback;
	const value = argv[index + 1];
	return value && !value.startsWith('--') ? value : fallback;
}

const options = {
	reset: hasFlag('--reset'),
	prepareOnly: hasFlag('--prepare-only'),
	stopWeb: hasFlag('--stop-web'),
	noReuse: hasFlag('--no-reuse'),
	keepWeb: hasFlag('--keep-web'),
	skipBuild: hasFlag('--skip-build'),
	force: hasFlag('--force'),
	inspect: hasFlag('--inspect'),
	remoteDebugging: hasFlag('--remote-debugging'),
	dataDir: path.resolve(getValue('--data-dir', DEFAULT_USER_DATA)),
	serverPort: Number(getValue('--server-port', DEFAULT_SERVER_PORT)),
	webPort: Number(getValue('--web-port', DEFAULT_WEB_PORT)),
	remoteDebuggingPort: Number(getValue('--remote-debugging-port', '9223'))
};

function log(...args) {
	console.log('[隔离调试]', ...args);
}

function fail(message) {
	console.error('[隔离调试] 失败：' + message);
	cleanup();
	process.exit(1);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ *
 * 安全删除：只允许删除 .debug 下的调试目录
 * ------------------------------------------------------------------ */

function assertSafeResetDir(target) {
	const resolved = path.resolve(target);
	const lowered = resolved.toLowerCase();
	const debugLowered = DEBUG_ROOT.toLowerCase();
	const parsed = path.parse(resolved);

	if (resolved === parsed.root) fail('拒绝删除磁盘根目录：' + resolved);

	if (lowered === DEBUG_ROOT.toLowerCase() || lowered === DESKTOP_ROOT.toLowerCase()) {
		fail('拒绝删除仓库/调试根目录：' + resolved);
	}

	/* 最高优先级护栏：正式版数据目录绝不能被当作调试目录删除 */
	for (const protectedDir of installedUserDataCandidates()) {
		const protectedLowered = path.resolve(protectedDir).toLowerCase();
		if (lowered === protectedLowered || lowered.startsWith(protectedLowered + path.sep)) {
			fail('拒绝删除正式版数据目录（或其子目录）：' + resolved);
		}
	}

	if (!lowered.startsWith(debugLowered + path.sep) && !options.force) {
		fail(`--reset 只允许删除 ${DEBUG_ROOT} 下的目录。自定义目录请显式加 --force：${resolved}`);
	}
}

/**
 * 删除目录链接（junction / symlink）本身，绝不会递归进入目标目录。
 * Windows 上 junction 是目录形式，unlink 可能 EPERM，用 rmdir。
 */
function removeDirectoryLink(linkPath) {
	try {
		const stat = fs.lstatSync(linkPath);
		if (!stat.isSymbolicLink()) return;
	} catch (e) {
		if (e.code === 'ENOENT') return;
		throw e;
	}

	try {
		fs.unlinkSync(linkPath);
	} catch (e) {
		try {
			fs.rmdirSync(linkPath);
		} catch (e2) {
			console.error('[隔离调试] 清理目录链接失败（跳过）：' + linkPath, e.message);
		}
	}
}

function resetDataDir() {
	assertSafeResetDir(options.dataDir);

	log('清理调试数据：' + options.dataDir);

	/* 先把可能存在的资源链接摘掉，避免递归删除时进入正式版资源目录 */
	removeDirectoryLink(path.join(options.dataDir, 'bin', 'chrome', 'chrome'));
	removeDirectoryLink(path.join(options.dataDir, 'downloads', 'apps', 'ocr'));

	try {
		fs.rmSync(options.dataDir, { recursive: true, force: true });
	} catch (e) {
		fail(`删除失败（可能还有调试实例在运行，请先退出）：${e.message}`);
	}
}

/* ------------------------------------------------------------------ *
 * 复用正式版已解压的 Chrome，跳过首次 370MB 解压 + 自动重启
 * ------------------------------------------------------------------ */

function installedUserDataCandidates() {
	const candidates = [];
	if (process.env.HH_INSTALLED_USER_DATA) candidates.push(process.env.HH_INSTALLED_USER_DATA);

	if (process.platform === 'win32') {
		const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
		candidates.push(path.join(appData, '鸿鹄易学'));
		candidates.push(path.join(appData, '@honghu-desktop', 'app'));
	} else if (process.platform === 'darwin') {
		const appData = path.join(os.homedir(), 'Library', 'Application Support');
		candidates.push(path.join(appData, '鸿鹄易学'));
		candidates.push(path.join(appData, '@honghu-desktop', 'app'));
	} else {
		const appData = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
		candidates.push(path.join(appData, '鸿鹄易学'));
		candidates.push(path.join(appData, '@honghu-desktop', 'app'));
	}
	return candidates;
}

function getChromeExecutable(userDataDir) {
	const base = path.join(userDataDir, 'bin', 'chrome', 'chrome');
	const relative =
		process.platform === 'win32'
			? 'chrome.exe'
			: process.platform === 'darwin'
			? path.join('Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
			: 'chrome';
	return path.join(base, relative);
}

function hasChrome(userDataDir) {
	return fs.existsSync(getChromeExecutable(userDataDir));
}

function reuseInstalledChrome() {
	if (options.noReuse) return false;
	if (hasChrome(options.dataDir)) return true;

	const sourceUserData = installedUserDataCandidates().find((candidate) => hasChrome(candidate));
	if (!sourceUserData) return false;

	const source = path.join(sourceUserData, 'bin', 'chrome', 'chrome');
	const destParent = path.join(options.dataDir, 'bin', 'chrome');
	const dest = path.join(destParent, 'chrome');

	try {
		fs.mkdirSync(destParent, { recursive: true });
		removeDirectoryLink(dest);
		fs.symlinkSync(source, dest, 'junction');
		log('已复用正式版内置浏览器（只读目录链接）：' + source);
		return true;
	} catch (e) {
		console.warn('[隔离调试] 复用内置浏览器失败，将走首次解压流程：' + e.message);
		return false;
	}
}

/* ------------------------------------------------------------------ *
 * 编译
 * ------------------------------------------------------------------ */

function runNodeScript(scriptPath, args, cwd, label) {
	return new Promise((resolve, reject) => {
		log(label);
		const child = spawn(process.execPath, [scriptPath, ...args], { cwd, stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${label} 失败，退出码 ${code}`));
		});
	});
}

async function build() {
	if (!fs.existsSync(TSC_JS)) fail('找不到 TypeScript：' + TSC_JS + '，请先 pnpm install');

	await runNodeScript(TSC_JS, ['-p', path.join(COMMON_DIR, 'tsconfig.json')], DESKTOP_ROOT, '编译 common');
	await runNodeScript(TSC_JS, ['-p', path.join(APP_DIR, 'tsconfig.json')], DESKTOP_ROOT, '编译 app');

	try {
		const syncExtension = require(path.join(DESKTOP_ROOT, 'scripts', 'sync-extension.js'));
		await syncExtension();
	} catch (e) {
		console.warn('[隔离调试] 同步内置扩展失败（继续启动，使用现有 resources/extension）：' + e.message);
	}
}

/* ------------------------------------------------------------------ *
 * 端口与 Web 开发服务器
 * ------------------------------------------------------------------ */

function isPortFree(port, host = '0.0.0.0') {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once('error', () => resolve(false));
		server.once('listening', () => server.close(() => resolve(true)));
		server.listen(port, host);
	});
}

async function findServerPort(startPort) {
	for (let port = startPort; port < startPort + 50; port++) {
		/* 服务端口 +1 留给远程控制端口：主进程调试模式默认 remote = server + 1 */
		if ((await isPortFree(port)) && (await isPortFree(port + 1))) return port;
	}
	throw new Error(`从 ${startPort} 起找不到连续两个空闲端口，请用 --server-port 指定`);
}

function httpGet(url, timeout = 1500) {
	return new Promise((resolve, reject) => {
		const request = http.get(url, { timeout }, (response) => {
			/**
			 * 只关心状态码与 content-type，拿到响应头就完成。
			 * 不能累计/限制 body 后再 resolve：/@vite/client 超过 2KB，
			 * 中途 destroy 会让 promise 一直悬着，表现为「Vite 明明启动成功却检测不到」。
			 */
			resolve({ statusCode: response.statusCode, headers: response.headers });
			response.resume();
			response.on('error', () => {});
		});
		request.on('timeout', () => request.destroy(new Error('timeout')));
		request.on('error', reject);
	});
}

async function isViteReady(port) {
	/**
	 * Vite 默认监听 localhost，Windows 上可能只绑定 ::1；
	 * 只探测 127.0.0.1 会误判「没启动」，所以三个地址都试。
	 */
	for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
		try {
			const response = await httpGet(`http://${host}:${port}/@vite/client`);
			if (response.statusCode === 200 && /javascript/i.test(String(response.headers['content-type'] || ''))) {
				return true;
			}
		} catch {}
	}
	return false;
}

function readWebPid() {
	try {
		const pid = Number(fs.readFileSync(WEB_PID_FILE, 'utf-8').trim());
		return Number.isInteger(pid) && pid > 0 ? pid : null;
	} catch {
		return null;
	}
}

function killTree(pid) {
	if (!pid) return;
	if (process.platform === 'win32') {
		spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
		return;
	}
	try {
		process.kill(pid, 'SIGTERM');
	} catch {}
}

function stopWeb() {
	const pid = readWebPid();
	if (!pid) {
		log('没有记录到本脚本启动的 Web 开发服务器');
		return;
	}
	killTree(pid);
	try {
		fs.rmSync(WEB_PID_FILE, { force: true });
	} catch {}
	log('已停止 Web 开发服务器（PID ' + pid + '）');
}

/** 由本脚本启动的 Vite 进程，退出时清理（复用用户已有 Vite 时保持 null） */
let webProcess = null;
/** 由本脚本启动的 Electron 进程，退出时清理（复用/外部启动时保持 null） */
let electronProcess = null;
let keepWeb = options.keepWeb;

async function ensureWeb() {
	if (await isViteReady(options.webPort)) {
		log(`检测到 ${options.webPort} 端口已有 Vite（复用，不会在退出时关闭）`);
		return;
	}

	if (!(await isPortFree(options.webPort))) {
		fail(`端口 ${options.webPort} 已被其他程序占用，且不是本项目的 Vite。请先释放该端口或使用 --web-port`);
	}

	fs.mkdirSync(DEBUG_ROOT, { recursive: true });
	const logFd = fs.openSync(WEB_LOG_FILE, 'a');
	log(`启动 Web 开发服务器（端口 ${options.webPort}，日志 ${WEB_LOG_FILE}）`);

	const stdio = options.prepareOnly ? ['ignore', logFd, logFd] : 'inherit';
	webProcess = spawn(
		process.execPath,
		[VITE_JS, '--port', String(options.webPort), '--strictPort', '--host', '127.0.0.1'],
		{
			cwd: WEB_DIR,
			stdio,
			detached: options.prepareOnly,
			env: { ...process.env, FORCE_COLOR: '1' }
		}
	);

	if (options.prepareOnly) {
		webProcess.unref();
		fs.writeFileSync(WEB_PID_FILE, String(webProcess.pid));
	} else {
		webProcess.once('exit', (code) => {
			log(`Web 开发服务器已退出（code=${code}）`);
		});
	}

	fs.closeSync(logFd);

	const deadline = Date.now() + 180000;
	while (Date.now() < deadline) {
		if (await isViteReady(options.webPort)) {
			log('Web 开发服务器已就绪');
			return;
		}
		await sleep(500);
	}
	fail(`Web 开发服务器 180 秒内未就绪，查看日志：${WEB_LOG_FILE}`);
}

/* ------------------------------------------------------------------ *
 * Electron
 * ------------------------------------------------------------------ */

function resolveElectronExecutable() {
	const candidates = [
		path.join(DESKTOP_ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
		path.join(APP_DIR, 'node_modules', 'electron', 'dist', 'electron.exe'),
		path.join(DESKTOP_ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
		path.join(DESKTOP_ROOT, 'node_modules', 'electron', 'dist', 'electron')
	];
	const found = candidates.find((candidate) => fs.existsSync(candidate));
	if (found) return found;

	try {
		const fromPackage = require(path.join(DESKTOP_ROOT, 'node_modules', 'electron'));
		if (typeof fromPackage === 'string' && fs.existsSync(fromPackage)) return fromPackage;
	} catch {}

	fail('找不到 Electron 可执行文件，请先在 honghueasystudy_desktop 执行 pnpm install');
}

function startElectron() {
	const executable = resolveElectronExecutable();
	const args = [];
	if (options.inspect) args.push(`--inspect=${INSPECT_PORT}`);
	if (options.remoteDebugging) args.push(`--remote-debugging-port=${options.remoteDebuggingPort}`);
	args.push('.');

	const env = {
		...process.env,
		HH_DEBUG_USER_DATA: options.dataDir,
		HH_DEBUG_SERVER_PORT: String(options.serverPort),
		HH_DEBUG_WEB_URL: `http://localhost:${options.webPort}`
	};
	/** 避免父进程环境（例如某些 IDE/终端）把它设成纯 Node 模式 */
	delete env.ELECTRON_RUN_AS_NODE;

	log('启动 Electron：' + executable);
	log('数据目录：' + options.dataDir);
	log('本地服务端口：' + options.serverPort);

	const electron = spawn(executable, args, { cwd: APP_DIR, env, stdio: 'inherit' });
	electronProcess = electron;

	electron.once('error', (error) => {
		console.error('[隔离调试] Electron 启动失败：' + error.message);
		electronProcess = null;
		cleanup();
		process.exit(1);
	});

	electron.once('exit', (code) => {
		electronProcess = null;
		/**
		 * 未复用 Chrome 时，首次启动会解压资源后 app.relaunch()。
		 * 这种退出不是用户关闭：必须保留 Web，否则重启后的窗口加载不到 3000。
		 */
		if (!chromeAvailableBeforeStart && hasChrome(options.dataDir)) {
			keepWeb = true;
			log('检测到内置浏览器初始化完成，Electron 将自动重启；保留 Web 开发服务器');
			log('如需停止 Web：node scripts/debug-isolated.js --stop-web');
		}
		cleanup();
		process.exit(code === null ? 0 : code);
	});

	return electron;
}

/* ------------------------------------------------------------------ *
 * 清理
 * ------------------------------------------------------------------ */

function cleanup() {
	if (electronProcess) {
		log('停止 Electron 调试实例');
		const pid = electronProcess.pid;
		electronProcess = null;
		killTree(pid);
	}
	if (webProcess) {
		if (!keepWeb) {
			const pid = webProcess.pid;
			webProcess = null;
			log('停止 Web 开发服务器');
			killTree(pid);
			try {
				fs.rmSync(WEB_PID_FILE, { force: true });
			} catch {}
		}
	}
}

process.once('SIGINT', () => {
	cleanup();
	process.exit(130);
});
process.once('SIGTERM', () => {
	cleanup();
	process.exit(143);
});

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

let chromeAvailableBeforeStart = false;

async function main() {
	if (options.stopWeb) {
		stopWeb();
		return;
	}

	for (const protectedDir of installedUserDataCandidates()) {
		const protectedLowered = path.resolve(protectedDir).toLowerCase();
		const dataLowered = options.dataDir.toLowerCase();
		if (dataLowered === protectedLowered || dataLowered.startsWith(protectedLowered + path.sep)) {
			fail('调试数据目录不能指向正式版数据目录（或其子目录）：' + options.dataDir);
		}
	}

	if (!Number.isInteger(options.serverPort) || options.serverPort <= 0 || options.serverPort > 65535) {
		fail('--server-port 必须是 1-65535 的整数');
	}
	if (!Number.isInteger(options.webPort) || options.webPort <= 0 || options.webPort > 65535) {
		fail('--web-port 必须是 1-65535 的整数');
	}
	if (
		!Number.isInteger(options.remoteDebuggingPort) ||
		options.remoteDebuggingPort <= 0 ||
		options.remoteDebuggingPort > 65535
	) {
		fail('--remote-debugging-port 必须是 1-65535 的整数');
	}

	if (options.reset) resetDataDir();

	fs.mkdirSync(options.dataDir, { recursive: true });
	log('调试数据目录：' + options.dataDir);

	if (!options.reset && !fs.existsSync(path.join(options.dataDir, 'config.json'))) {
		log('当前调试目录没有存档，本次是「首次使用」流程');
	}

	reuseInstalledChrome();
	chromeAvailableBeforeStart = hasChrome(options.dataDir);

	if (!options.skipBuild) {
		await build();
	} else {
		log('跳过编译（--skip-build）');
	}

	if (!options.prepareOnly) {
		options.serverPort = await findServerPort(options.serverPort);
	} else {
		/* prepare-only 时 Electron 由 VS Code 启动，端口写死在 launch.json 的 env 里 */
		if (!(await isPortFree(options.serverPort))) {
			log(`警告：端口 ${options.serverPort} 已有实例占用；主进程会自动顺延，建议同步修改 launch.json`);
		}
	}

	await ensureWeb();

	if (options.prepareOnly) {
		log('准备完成，Web 已就绪；Electron 将由调试器启动');
		log('数据目录：' + options.dataDir + '；服务端口：' + options.serverPort);
		return;
	}

	/* 让 Electron 子进程拥有主流程生命周期 */
	const electron = startElectron();
	/* 保持进程存活，等 Electron 退出 */
	await new Promise((resolve) => electron.once('close', resolve));
}

main().catch((error) => {
	console.error('[隔离调试] ' + error.message);
	cleanup();
	process.exit(1);
});
