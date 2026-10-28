/**
 * Windows 安装包静默覆盖安装。
 *
 * 为什么用安装包而不是就地替换 resources/app：
 * - resources/ 下还有 Electron 运行时、内置扩展 extension/、bin/chrome、bin/cloudflared、bin/ocr，
 *   只换 app 层会让这些停在旧版本（扩展改动永远送不到已装用户）
 * - app/node_modules 里的原生模块（keytar.node）按 Electron ABI 编译，运行时升级必须整套换
 *
 * NSIS 的静默参数有几个硬性规范，写错会静默失败或装到错误目录，所以集中在这里：
 * - `/S`：跳过向导，全部用默认值
 * - `/D=<dir>`：**必须是最后一个参数，且路径不能加引号**（含空格、中文也一样）
 *   加引号会把引号当成路径的一部分，装出一个名字带引号的目录
 * - 因此启动子进程必须开 `windowsVerbatimArguments`，让 Node 不要替我们加引号
 *
 * 本模块不依赖 electron，便于直接单测参数拼接与目录校验。
 */

import { spawn, type ChildProcess } from 'child_process';

/** 打包产物目录：在这种目录里跑说明是绿色版/调试态，不能让安装器覆盖构建产物 */
const PACKAGED_DIR = /(^|[\\/])win-unpacked([\\/]|$)/i;
/** 临时目录里不可能是真实安装位置 */
const TEMP_DIR = /[\\/]Temp([\\/]|$)/i;

/**
 * 校验安装目录是否可信。不可信就抛错，由调用方转成用户可读提示。
 */
export function assertSafeInstallDir(dir: string | undefined) {
	if (!dir || !/^[a-zA-Z]:[\\/]/.test(dir)) {
		throw new Error('无法确定软件的安装目录（当前路径：' + (dir || '空') + '）');
	}
	if (PACKAGED_DIR.test(dir)) {
		throw new Error(
			'当前运行在打包目录（win-unpacked）中，为避免覆盖构建产物，已取消自动安装。\n' +
				'请手动下载安装包，或改用正式安装版。'
		);
	}
	if (TEMP_DIR.test(dir)) {
		throw new Error('安装目录异常（位于临时目录）：' + dir);
	}
}

/**
 * 构造 NSIS 静默安装参数。
 *
 * `/D=` 放最后且不加引号是 NSIS 的硬性要求；这里顺手去掉路径里可能的引号，
 * 避免调用方误传带引号的字符串后装出一个怪目录。
 */
export function buildSilentInstallArgs(installDir: string): string[] {
	return ['/S', `/D=${installDir.replace(/"/g, '')}`];
}

export interface SpawnInstallerOptions {
	/** 安装包路径（setup .exe） */
	exePath: string;
	/** 覆盖安装的目标目录，通常是当前 exe 所在目录 */
	installDir: string;
	/** 子进程启动后的回调（日志用） */
	onSpawn?: (pid: number | undefined) => void;
}

/**
 * 构造安装器的启动参数（纯函数，便于单测）。
 *
 * 两个关键点必须一起成立，缺一个就会静默失败：
 * 1. `/D=` 不加引号（NSIS 规范）
 * 2. `windowsVerbatimArguments: true`（否则 Node 会替参数加引号，破坏第 1 点）
 */
export function buildInstallerSpawn(exePath: string, installDir: string) {
	assertSafeInstallDir(installDir);
	return {
		file: exePath,
		args: buildSilentInstallArgs(installDir),
		options: {
			detached: true,
			stdio: 'ignore' as const,
			windowsHide: false,
			windowsVerbatimArguments: true
		}
	};
}

/**
 * 启动安装包（静默覆盖安装，脱离当前进程独立运行）。
 *
 * 调用方负责随后 `app.quit()`：安装器要替换本进程占用的文件，必须先退出。
 * 退出前给安装器留一点启动时间，所以这里返回的 Promise 会等一小会儿。
 */
export function spawnSilentInstaller(opts: SpawnInstallerOptions): Promise<void> {
	const spec = buildInstallerSpawn(opts.exePath, opts.installDir);

	return new Promise((resolve, reject) => {
		let child: ChildProcess;
		try {
			child = spawn(spec.file, spec.args, spec.options);
		} catch (e) {
			reject(e);
			return;
		}

		child.once('error', reject);
		child.once('spawn', () => {
			opts.onSpawn?.(child?.pid);
			// 让安装器先接管，再返回给调用方去退出应用
			setTimeout(resolve, 1200);
		});
		// 进程独立后不再持有引用，避免父进程退出时被子进程拖住
		child.unref();
	});
}
