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

import { spawn, execFile, type ChildProcess } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';

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

/* ------------------------------------------------------------------ *
 * 安装目录定位
 *
 * 为什么不能只看 `dirname(app.getPath('exe'))`：
 * 用户可能在 win-unpacked / 临时目录里跑着一份旧副本，也可能装了新版但没重启
 * （NSIS 静默安装完成后不会拉起应用），此时正在运行的 exe 所在目录并不是
 * 真正的安装位置。装错目录 = 用户重启后还是旧版，白下 260MB。
 *
 * 所以按「可信的 exe 目录 → 注册表记录的安装位置」依次尝试，
 * 每个候选都要过一遍目录存在 + 内有主程序 exe 的校验（注册表残留很常见）。
 * ------------------------------------------------------------------ */

/** 卸载注册表键：electron-builder 由 appId 派生的固定 GUID，perUser 在 HKCU、perMachine 在 HKLM */
export const UNINSTALL_GUID = '64082d16-5325-5875-8aa5-449a32c87353';
/** 兜底搜索时用的显示名关键词（安装项的 DisplayName 形如「鸿鹄易学 3.0.4」） */
const APP_DISPLAY_KEYWORD = '鸿鹄易学';
const UNINSTALL_ROOTS = [
	'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
	'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
	'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
];

export type InstallDirSource = 'registry' | 'exe';
export type CandidateOrigin =
	| 'registry-install-location'
	| 'registry-display-icon'
	| 'registry-uninstall-string'
	| 'exe';

export interface InstallDirCandidate {
	dir: string;
	source: InstallDirSource;
	origin: CandidateOrigin;
	/** 诊断信息：来自哪个注册表键、哪个字段 */
	detail?: string;
	ok?: boolean;
	reason?: string;
	exe?: string;
}

export interface InstallDirResolution {
	/** 可用的安装目录；解析失败时为空 */
	dir?: string;
	source?: InstallDirSource;
	/** 目录里的主程序 exe 名 */
	exeName?: string;
	/** 注册表读到的首个候选（可能不可用），仅用于日志与提示 */
	registryDir?: string;
	candidates: InstallDirCandidate[];
	/** 解析失败时给用户看的说明 */
	error?: string;
}

export interface RegEntry {
	key: string;
	values: Record<string, string>;
}

/**
 * 解析 `reg query` 的输出。
 *
 * 输出形如：
 * ```
 * HKEY_CURRENT_USER\Software\...\Uninstall\{guid}
 *     DisplayName    REG_SZ    鸿鹄易学 3.0.4
 *     InstallLocation    REG_SZ
 * ```
 * 键行顶格、值行缩进，值与类型之间固定 4 个空格；空值行没有数据段。
 */
export function parseRegQueryOutput(text: string): RegEntry[] {
	const entries: RegEntry[] = [];
	let current: RegEntry | undefined;
	for (const raw of String(text || '').split(/\r?\n/)) {
		const line = raw.replace(/\s+$/, '');
		if (!line.trim()) continue;
		if (/^HKEY_[A-Z0-9_]+\\/i.test(line)) {
			current = { key: line.trim(), values: {} };
			entries.push(current);
			continue;
		}
		if (!current) continue;
		const m = /^\s+(.+?)\s{2,}(REG_[A-Z_]+)(?:\s{2,}(.*))?$/i.exec(line);
		if (!m) continue;
		current.values[m[1].trim()] = (m[3] || '').trim();
	}
	return entries;
}

/** reg.exe 的输出是本地代码页（简中 GBK），不是 UTF-8，直接按 utf8 解会把中文路径解成乱码 */
export function decodeRegOutput(buf: Buffer): string {
	if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
		return buf.toString('utf16le').slice(1);
	}
	try {
		const Decoder = (globalThis as any).TextDecoder;
		if (Decoder) return new Decoder('gbk').decode(buf);
	} catch {
		// 精简版 ICU 里没有 gbk，只能退回 utf8（中文路径会失真，后面会被目录校验挡掉）
	}
	return buf.toString('utf8');
}

/** 从 DisplayIcon / UninstallString 这类命令行里取出 exe 路径 */
export function exePathFromCommand(raw?: string): string | undefined {
	const s = String(raw || '').trim();
	if (!s) return undefined;

	let exe: string;
	if (s.startsWith('"')) {
		const end = s.indexOf('"', 1);
		exe = end > 1 ? s.slice(1, end) : s.slice(1);
	} else {
		// 无引号：取到第一个 .exe 为止（路径里可能含空格，所以不能简单按空格切）
		const m = /^(.+?\.exe)(\s|$)/i.exec(s);
		exe = m ? m[1] : s.split(/\s+/)[0];
	}

	// DisplayIcon 会带图标索引，如 "C:\a\b.exe",0
	exe = exe.replace(/,-?\d+$/, '').trim();
	return /\.exe$/i.test(exe) ? exe : undefined;
}

export function isWinAbsPath(p?: string): boolean {
	return !!p && /^[a-zA-Z]:[\\/]/.test(p);
}

/** 把注册表条目摊平成候选目录（InstallLocation 优先，其次从命令行反推） */
export function extractInstallCandidates(entries: RegEntry[]): InstallDirCandidate[] {
	const out: InstallDirCandidate[] = [];
	for (const entry of entries || []) {
		const loc = String(entry.values.InstallLocation || '')
			.replace(/^"|"$/g, '')
			.replace(/[\\/]+$/, '')
			.trim();
		if (loc) {
			out.push({ dir: loc, source: 'registry', origin: 'registry-install-location', detail: entry.key });
		}

		const fromIcon = exePathFromCommand(entry.values.DisplayIcon);
		if (fromIcon) {
			out.push({
				dir: dirname(fromIcon),
				source: 'registry',
				origin: 'registry-display-icon',
				detail: entry.key + ' DisplayIcon',
				exe: basename(fromIcon)
			});
		}

		for (const field of ['UninstallString', 'QuietUninstallString']) {
			const fromCmd = exePathFromCommand(entry.values[field]);
			// 卸载程序名本身不是主程序，只用来反推目录
			if (fromCmd) {
				out.push({
					dir: dirname(fromCmd),
					source: 'registry',
					origin: 'registry-uninstall-string',
					detail: entry.key + ' ' + field,
					exe: basename(fromCmd)
				});
			}
		}
	}

	// 去重（多个字段常常指向同一目录），保留优先级靠前的来源
	const seen = new Set<string>();
	return out.filter((c) => {
		const k = c.dir.toLowerCase();
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

/**
 * 检查一个目录能不能作为覆盖安装目标。
 *
 * 这里不抛错而是返回原因：候选可能来自注册表残留，需要逐个试。
 */
export function inspectInstallDir(dir: string, exeNames: string[] = []): { ok: boolean; reason?: string; exe?: string } {
	if (!isWinAbsPath(dir)) return { ok: false, reason: '不是有效的绝对路径' };
	if (PACKAGED_DIR.test(dir)) return { ok: false, reason: '位于打包产物目录 win-unpacked' };
	if (TEMP_DIR.test(dir)) return { ok: false, reason: '位于临时目录' };

	let isDir = false;
	try {
		isDir = statSync(dir).isDirectory();
	} catch {
		isDir = false;
	}
	if (!isDir) return { ok: false, reason: '目录不存在' };

	let files: string[] = [];
	try {
		files = readdirSync(dir);
	} catch {
		return { ok: false, reason: '目录不可读' };
	}

	const exes = files.filter((f) => /\.exe$/i.test(f));
	// 主程序名优先：当前运行的 exe 名 > 已知商品名
	for (const name of exeNames) {
		const hit = exes.find((f) => f.toLowerCase() === name.toLowerCase());
		if (hit) return { ok: true, exe: hit };
	}
	// 退而求其次：目录里任意非卸载程序的 exe
	const fallback = exes.find((f) => !/^uninstall/i.test(f) && !/^卸载/i.test(f));
	if (fallback) return { ok: true, exe: fallback };
	return { ok: false, reason: '目录内没有主程序 exe' };
}

type RegRunner = (args: string[]) => Promise<string>;

/**
 * reg.exe 的绝对路径。
 *
 * 主进程的 PATH 在部分环境（精简系统 / 被安全软件改写）里不含 System32，
 * 直接用 'reg.exe' 会 ENOENT，白丢一条回退路径。
 */
function regExePath(): string {
	try {
		const p = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
		if (existsSync(p)) return p;
	} catch {
		// 忽略，退回 PATH 查找
	}
	return 'reg.exe';
}

const defaultRegRunner: RegRunner = (args) =>
	new Promise((resolve, reject) => {
		execFile(
			regExePath(),
			args,
			{ windowsHide: true, timeout: 8000, maxBuffer: 8 * 1024 * 1024, encoding: 'buffer' as any },
			(err, stdout) => {
				const buf = Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout || ''), 'utf8');
				// 键不存在时 reg.exe 返回 1 且没有输出，这里按「无结果」处理
				if (!buf.length) {
					reject(err || new Error('reg.exe 无输出'));
					return;
				}
				resolve(decodeRegOutput(buf));
			}
		);
	});

/** 注册表查询缓存：updateApp 预检与 installUpdate 会连续调用，避免重复跑 /s 全量搜索 */
let regCache: { at: number; entries: RegEntry[] } | null = null;
const REG_CACHE_TTL = 60 * 1000;

async function readUninstallEntries(runReg: RegRunner, force = false): Promise<RegEntry[]> {
	if (!force && regCache && Date.now() - regCache.at < REG_CACHE_TTL) return regCache.entries;

	const entries: RegEntry[] = [];
	// 1) 精确键最快（约 30ms），新版本 appId 不变，正常都命中这里
	for (const root of UNINSTALL_ROOTS) {
		try {
			entries.push(...parseRegQueryOutput(await runReg(['query', `${root}\\${UNINSTALL_GUID}`])));
		} catch {
			// 该根下没有这个键，继续试下一个
		}
	}

	// 2) 精确键不中（改过 appId / 别的打包方式装的旧版）才做全量搜索，慢但只在兜底时跑。
	//    /f 搜索只返回命中值，拿不到完整字段，所以先搜出键名再逐键精确查一次。
	if (!entries.length) {
		const keys = new Set<string>();
		for (const root of UNINSTALL_ROOTS) {
			try {
				const out = await runReg(['query', root, '/s', '/f', APP_DISPLAY_KEYWORD, '/d']);
				for (const e of parseRegQueryOutput(out)) keys.add(e.key);
			} catch {
				// 忽略：没有该项或超时
			}
		}
		for (const key of keys) {
			try {
				entries.push(...parseRegQueryOutput(await runReg(['query', key])));
			} catch {
				// 键在搜索后消失，忽略
			}
		}
	}

	regCache = { at: Date.now(), entries };
	return entries;
}

export interface ResolveInstallDirOptions {
	/** 当前运行的 exe 完整路径（app.getPath('exe')） */
	exePath: string;
	/** 备选主程序名，用于在候选目录里确认确实是本程序 */
	exeNames?: string[];
	/** 测试注入：替换 reg.exe 调用 */
	runReg?: RegRunner;
	/** 跳过缓存 */
	force?: boolean;
}

/**
 * 解析覆盖安装的目标目录。
 *
 * 顺序：注册表记录的安装位置 → 当前 exe 目录。
 *
 * 为什么注册表优先：`dirname(app.getPath('exe'))` 只说明「这份程序放在哪」，
 * 不说明「系统认可的安装位置在哪」。用户可能从解压出来的副本、win-unpacked、
 * 或者装了新版却没重启的旧目录里启动，此时按 exe 目录覆盖会装错地方，
 * 桌面快捷方式指向的那份还是旧版。注册表项存在且目录内有主程序时才是权威的。
 *
 * 注册表不可用（无记录 / 残留指向已删目录 / reg.exe 被安全软件拦）时
 * 才回到 exe 目录 —— 绿色版用户就靠这条。
 */
export async function resolveInstallDir(opts: ResolveInstallDirOptions): Promise<InstallDirResolution> {
	const exePath = opts.exePath;
	const selfName = basename(exePath || '');
	const exeNames = [
		// electron.exe 是开发态的运行体，不能当作主程序名
		...(selfName && !/^electron\.exe$/i.test(selfName) ? [selfName] : []),
		...((opts.exeNames || []).filter(Boolean) as string[])
	];
	const candidates: InstallDirCandidate[] = [];

	// 1) 注册表
	let entries: RegEntry[] = [];
	try {
		entries = await readUninstallEntries(opts.runReg || defaultRegRunner, opts.force);
	} catch {
		entries = [];
	}
	const registryCandidates = extractInstallCandidates(entries);
	for (const c of registryCandidates) {
		const r = inspectInstallDir(c.dir, exeNames);
		candidates.push({ ...c, ...r });
	}

	// 2) 当前 exe 所在目录
	const exeDir = exePath ? dirname(exePath) : '';
	if (exeDir && !candidates.some((c) => c.dir.toLowerCase() === exeDir.toLowerCase())) {
		const r = inspectInstallDir(exeDir, exeNames);
		candidates.push({ dir: exeDir, source: 'exe', origin: 'exe', ...r });
	}

	const registryDir = registryCandidates[0]?.dir;
	const hit = candidates.find((c) => c.ok);
	if (hit) {
		return { dir: hit.dir, source: hit.source, exeName: hit.exe, registryDir, candidates };
	}

	const reasons = candidates.map((c) => `· ${c.dir || '(空)'}（${c.source === 'exe' ? '当前运行目录' : '注册表'}）：${c.reason}`).join('\n');
	return {
		dir: undefined,
		registryDir,
		candidates,
		error:
			'无法确定软件的安装目录，已取消自动安装。\n' +
			(reasons ? reasons + '\n' : '') +
			'请从官网下载安装包手动安装。'
	};
}
