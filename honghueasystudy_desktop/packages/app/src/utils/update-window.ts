/**
 * 安装阶段的进度窗口（Windows）。
 *
 * 为什么需要它：自动更新走 NSIS `/S` 静默安装，安装器没有任何界面；主进程 `app.quit()`
 * 之后到安装完成（覆盖 300MB+ 文件）通常要 1~3 分钟，期间桌面完全没有任何反馈，
 * 用户会以为软件崩了，甚至重复双击图标启动旧版去抢文件。
 *
 * 为什么是外部进程：安装器必须替换正在运行的程序文件，所以 Electron 必须先退出；
 * 窗口不能挂在 Electron 上，只能由一个独立的常驻进程来显示 —— 用系统自带的
 * PowerShell + WinForms，零额外体积、零安装依赖。
 *
 * 脚本职责：显示窗口 → 等 Electron 退出 → 原样传 `/S /D=` 启动安装器（不阻塞 UI 线程）
 * → 安装结束后自动拉起新版本 → 关窗。任何一步失败都留在窗口上说明，不再是"点了没反应"。
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

/** 进度窗口脚本落盘位置（与安装包同目录，便于一起清理） */
const SCRIPT_NAME = 'update-window.ps1';

/**
 * 解析 powershell.exe 的绝对路径。
 *
 * 主进程 PATH 在部分环境（精简系统 / 安全软件改写）里不含 System32，
 * 直接 spawn('powershell.exe') 会 ENOENT —— 那会导致「点更新没反应」，必须提前判定。
 */
export function powershellPath(): string | undefined {
	const candidates = [
		join(process.env.SystemRoot || 'C:\\Windows', 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'),
		'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
	];
	for (const p of candidates) {
		try {
			if (existsSync(p)) return p;
		} catch {
			// 继续试下一个候选
		}
	}
	return undefined;
}

/**
 * 进度窗口脚本。
 *
 * 几个必须遵守的点：
 * - **UTF-8 BOM**：PowerShell 5.1 读无 BOM 的 UTF-8 会按 GBK 解，中文全变乱码。
 * - **不用 WaitForExit**：同步等待会阻塞 UI 线程，进度条停摆、窗口变"未响应"；
 *   改为 `HasExited` 轮询，靠 WinForms 定时器驱动。
 * - **`/D=` 原样传递**：NSIS 要求 `/D=` 后面整串当路径，不能加引号，
 *   所以用 `ProcessStartInfo.Arguments` 直接给字符串，而不是让 PowerShell 拼参数。
 */
const PS_SCRIPT_LINES = [
	'param(',
	'  [Parameter(Mandatory=$true)][string]$Installer,',
	'  [Parameter(Mandatory=$true)][string]$InstallDir,',
	'  [string]$AppExe = "",',
	'  [int]$WaitPid = 0,',
	'  [string]$Version = ""',
	')',
	'',
	'$ErrorActionPreference = "Stop"',
	'Add-Type -AssemblyName System.Windows.Forms',
	'Add-Type -AssemblyName System.Drawing',
	'[System.Windows.Forms.Application]::EnableVisualStyles()',
	'',
	'$form = New-Object System.Windows.Forms.Form',
	'$form.Text = "鸿鹄易学 正在安装更新"',
	'$form.ClientSize = New-Object System.Drawing.Size(460, 156)',
	'$form.StartPosition = "CenterScreen"',
	'$form.FormBorderStyle = "FixedDialog"',
	'$form.MaximizeBox = $false',
	'$form.MinimizeBox = $false',
	'$form.TopMost = $true',
	'$form.BackColor = [System.Drawing.Color]::White',
	'$form.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 9)',
	'',
	'$title = New-Object System.Windows.Forms.Label',
	'$title.Text = if ($Version) { "正在安装 v" + $Version } else { "正在安装新版本" }',
	'$title.Font = New-Object System.Drawing.Font("Microsoft YaHei UI", 12, [System.Drawing.FontStyle]::Bold)',
	'$title.AutoSize = $true',
	'$title.Location = New-Object System.Drawing.Point(26, 22)',
	'$form.Controls.Add($title)',
	'',
	'$sub = New-Object System.Windows.Forms.Label',
	'$sub.Text = "安装完成后会自动重新打开软件，通常需要 1 ~ 3 分钟。"',
	'$sub.ForeColor = [System.Drawing.Color]::FromArgb(120, 126, 138)',
	'$sub.AutoSize = $true',
	'$sub.Location = New-Object System.Drawing.Point(27, 56)',
	'$form.Controls.Add($sub)',
	'',
	'$bar = New-Object System.Windows.Forms.ProgressBar',
	'$bar.Style = [System.Windows.Forms.ProgressBarStyle]::Marquee',
	'$bar.MarqueeAnimationSpeed = 28',
	'$bar.Location = New-Object System.Drawing.Point(29, 90)',
	'$bar.Size = New-Object System.Drawing.Size(400, 10)',
	'$form.Controls.Add($bar)',
	'',
	'$step = New-Object System.Windows.Forms.Label',
	'$step.Text = "正在等待软件退出…"',
	'$step.ForeColor = [System.Drawing.Color]::FromArgb(150, 155, 165)',
	'$step.AutoSize = $true',
	'$step.Location = New-Object System.Drawing.Point(27, 114)',
	'$form.Controls.Add($step)',
	'',
	'$script:phase = "wait"',
	'$script:proc = $null',
	'$script:started = Get-Date',
	'',
	'function Start-Installer {',
	'  $psi = New-Object System.Diagnostics.ProcessStartInfo',
	'  $psi.FileName = $Installer',
	'  # 原样传：/D= 必须是最后一段且不加引号（NSIS 规范）',
	'  $psi.Arguments = "/S /D=" + $InstallDir',
	'  $psi.UseShellExecute = $false',
	'  $psi.CreateNoWindow = $true',
	'  $proc = New-Object System.Diagnostics.Process',
	'  $proc.StartInfo = $psi',
	'  [void]$proc.Start()',
	'  return $proc',
	'}',
	'',
	'$timer = New-Object System.Windows.Forms.Timer',
	'$timer.Interval = 500',
	'$timer.add_Tick({',
	'  try {',
	'    if ($script:phase -eq "wait") {',
	'      if ($WaitPid -gt 0) {',
	'        $alive = Get-Process -Id $WaitPid -ErrorAction SilentlyContinue',
	'        if ($alive) { return }',
	'      }',
	'      $step.Text = "正在覆盖安装文件，请稍候…"',
	'      try {',
	'        $script:proc = Start-Installer',
	'        $script:phase = "installing"',
	'      } catch {',
	'        $script:phase = "failed"',
	'        $title.Text = "安装启动失败"',
	'        $step.Text = $_.Exception.Message',
	'        $step.ForeColor = [System.Drawing.Color]::FromArgb(200, 60, 60)',
	'        $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Blocks',
	'        $bar.Value = 0',
	'      }',
	'      return',
	'    }',
	'    if ($script:phase -eq "installing") {',
	'      if (-not $script:proc.HasExited) {',
	'        $mins = [int](((Get-Date) - $script:started).TotalMinutes)',
	'        if ($mins -ge 3) { $step.Text = "正在覆盖安装文件（已用时 " + $mins + " 分钟），请继续等待…" }',
	'        return',
	'      }',
	'      $code = $script:proc.ExitCode',
	'      if ($code -eq 0) {',
	'        $script:phase = "restart"',
	'        $step.Text = "安装完成，正在启动新版本…"',
	'        $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Blocks',
	'        $bar.Value = 100',
	'        if ($AppExe -and (Test-Path -LiteralPath $AppExe)) {',
	'          try { Start-Process -FilePath $AppExe | Out-Null } catch { }',
	'        }',
	'        $script:phase = "closed"',
	'        $form.Close()',
	'      } else {',
	'        $script:phase = "failed"',
	'        $title.Text = "安装未完成"',
	'        $step.Text = "安装程序退出码 " + $code + "，可从官网下载安装包手动覆盖安装。"',
	'        $step.ForeColor = [System.Drawing.Color]::FromArgb(200, 60, 60)',
	'        $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Blocks',
	'        $bar.Value = 0',
	'        $timer.Stop()',
	'      }',
	'      return',
	'    }',
	'  } catch {',
	'    $script:phase = "failed"',
	'    $title.Text = "安装未完成"',
	'    $step.Text = $_.Exception.Message',
	'    $step.ForeColor = [System.Drawing.Color]::FromArgb(200, 60, 60)',
	'    $timer.Stop()',
	'  }',
	'})',
	'',
	'$form.add_Shown({ $timer.Start() })',
	'$form.add_FormClosed({ $timer.Stop() })',
	'[void]$form.ShowDialog()'
];

const PS_SCRIPT = PS_SCRIPT_LINES.join('\r\n') + '\r\n';

/** 把脚本写到安装包同目录（带 BOM），返回脚本路径 */
export function writeProgressScript(dir: string): string {
	mkdirSync(dir, { recursive: true });
	const file = join(dir, SCRIPT_NAME);
	// BOM：PowerShell 5.1 用系统代码页读无 BOM 文件，中文会乱码
	writeFileSync(file, '\ufeff' + PS_SCRIPT, 'utf8');
	return file;
}

export interface ProgressWindowOptions {
	/** 已下载完成的安装包 */
	installerPath: string;
	/** 覆盖安装的目标目录 */
	installDir: string;
	/** 安装完成后要启动的主程序 exe */
	appExe: string;
	/** 需要等待退出的当前进程 pid（Electron 主进程） */
	waitPid: number;
	/** 新版本号，仅用于窗口文案 */
	version?: string;
	/** 脚本落盘目录 */
	scriptDir: string;
	onLog?: (level: 'info' | 'warn', message: string) => void;
}

/**
 * 启动进度窗口（独立进程，本进程随后可以安全退出）。
 *
 * 返回 false 表示环境不支持（找不到 powershell.exe 或启动失败），
 * 调用方必须回退到「静默安装 + 无窗口」的老路径，不能直接放弃更新。
 */
export function spawnProgressWindow(opts: ProgressWindowOptions): { ok: boolean; script?: string; reason?: string } {
	const ps = powershellPath();
	if (!ps) {
		opts.onLog?.('warn', '未找到 powershell.exe，安装阶段无法显示进度窗口，回退静默安装');
		return { ok: false, reason: 'no-powershell' };
	}

	let script: string;
	try {
		script = writeProgressScript(opts.scriptDir);
	} catch (e: any) {
		opts.onLog?.('warn', '写入安装进度窗口脚本失败：' + (e?.message || e));
		return { ok: false, reason: 'write-failed' };
	}

	const args = [
		'-NoProfile',
		'-NonInteractive',
		'-ExecutionPolicy',
		'Bypass',
		// 控制台程序必须隐藏，否则会先闪一个黑窗
		'-WindowStyle',
		'Hidden',
		'-STA',
		'-File',
		script,
		'-Installer',
		opts.installerPath,
		'-InstallDir',
		opts.installDir,
		'-WaitPid',
		String(opts.waitPid)
	];
	// 空字符串不能作为参数传给 -File 形式：PowerShell 会把 `-AppExe ""` 当成缺参直接报错退出，
	// 窗口也就起不来。可选参数一律「有值才传」，让脚本里的默认值生效。
	if (opts.appExe) args.push('-AppExe', opts.appExe);
	if (opts.version) args.push('-Version', opts.version);

	try {
		const child = spawn(ps, args, {
			detached: true,
			stdio: 'ignore',
			windowsHide: true
		});
		child.unref();
		opts.onLog?.('info', `安装进度窗口已启动（pid=${child.pid}），脚本：${script}`);
		return { ok: true, script };
	} catch (e: any) {
		opts.onLog?.('warn', '启动安装进度窗口失败：' + (e?.message || e));
		return { ok: false, reason: 'spawn-failed' };
	}
}

/** 诊断用：脚本内容（单测/日志查看） */
export function progressScriptContent(): string {
	return PS_SCRIPT;
}

/** 判断某个目录里是否已有进度窗口脚本（清理残留时用） */
export function progressScriptPath(dir: string): string {
	return join(dir, SCRIPT_NAME);
}

/** 取脚本所在目录（与安装包同目录） */
export function scriptDirFor(installerPath: string): string {
	return dirname(installerPath);
}
