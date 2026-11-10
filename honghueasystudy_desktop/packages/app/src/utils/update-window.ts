/**
 * 安装阶段的进度窗口（Windows）。
 *
 * 为什么需要它：自动更新走 NSIS `/S` 静默安装，安装器没有任何界面；主进程退出
 * 之后到安装完成（覆盖 300MB+ 文件）通常要 1~3 分钟，期间桌面完全没有任何反馈。
 *
 * 为什么是外部进程：安装器必须替换正在运行的程序文件，所以 Electron 必须先退出；
 * 窗口不能挂在 Electron 上，只能用系统自带的 PowerShell + WinForms。
 *
 * 这一层曾经是「软件退出后什么都没发生」的最大黑盒：
 * - `stdio: 'ignore'` + 脚本内不落日志，PowerShell 一旦启动即失败、或一直等不到
 *   Electron 退出，用户和 updater.log 里都看不到任何线索；
 * - 等待阶段只按 `Get-Process -Id $WaitPid` 判断，没有超时，PID 被别的进程复用
 *   或渲染端退出流程卡住时，安装器永远不会被启动。
 *
 * 现在脚本每个阶段都写 `update-window.log`，等待有硬超时 + 进程名校验，安装器
 * 启动失败还有 ShellExecute 兜底，非零退出码会把日志入口留在窗口上。
 */

import { spawn } from 'child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

/** 进度窗口脚本落盘位置（与安装包同目录，便于一起清理） */
const SCRIPT_NAME = 'update-window.ps1';
/** 进度窗口日志（与安装包同目录，重启后由 updater 读取并写进 updater.log） */
export const PROGRESS_LOG_NAME = 'update-window.log';
/** 等待 Electron 退出的最长秒数：超时也强装，绝不无限等 */
const WAIT_TIMEOUT_SECONDS = 20;

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
 * - **全阶段落日志**：脚本运行在无控制台的 detached 进程里，不落盘等于没有诊断能力。
 */
const PS_SCRIPT_LINES = [
	'param(',
	'  [Parameter(Mandatory=$true)][string]$Installer,',
	'  [Parameter(Mandatory=$true)][string]$InstallDir,',
	'  [string]$AppExe = "",',
	'  [int]$WaitPid = 0,',
	'  [string]$WaitName = "",',
	'  [string]$Version = "",',
	'  [string]$LogPath = ""',
	')',
	'',
	'$ErrorActionPreference = "Stop"',
	'function Write-UpdateLog([string]$msg) {',
	'  if (-not $LogPath) { return }',
	'  try { Add-Content -LiteralPath $LogPath -Value ((Get-Date -Format "HH:mm:ss") + " " + $msg) -Encoding UTF8 } catch { }',
	'}',
	'Write-UpdateLog "=== 进度窗口启动 pid=$PID ==="',
	'Write-UpdateLog "installer=$Installer"',
	'Write-UpdateLog "installDir=$InstallDir"',
	'Write-UpdateLog "waitPid=$WaitPid waitName=$WaitName appExe=$AppExe version=$Version"',
	'',
	'try {',
	'  Add-Type -AssemblyName System.Windows.Forms',
	'  Add-Type -AssemblyName System.Drawing',
	'  [System.Windows.Forms.Application]::EnableVisualStyles()',
	'} catch {',
	'  Write-UpdateLog "WinForms 加载失败：$($_.Exception.Message)"',
	'  throw',
	'}',
	'Write-UpdateLog "WinForms 已就绪"',
	'',
	'$form = New-Object System.Windows.Forms.Form',
	'$form.Text = "鸿鹄易学 正在安装更新"',
	'$form.ClientSize = New-Object System.Drawing.Size(460, 156)',
	'$form.StartPosition = "CenterScreen"',
	'$form.FormBorderStyle = "FixedDialog"',
	'$form.MaximizeBox = $false',
	'$form.MinimizeBox = $false',
	'$form.TopMost = $true',
	'$form.ShowInTaskbar = $true',
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
	'$logBtn = New-Object System.Windows.Forms.Button',
	'$logBtn.Text = "打开安装日志"',
	'$logBtn.Size = New-Object System.Drawing.Size(112, 26)',
	'$logBtn.Location = New-Object System.Drawing.Point(320, 108)',
	'$logBtn.Visible = $false',
	'$logBtn.add_Click({',
	'  if ($LogPath -and (Test-Path -LiteralPath $LogPath)) {',
	'    try { Start-Process -FilePath "notepad.exe" -ArgumentList $LogPath | Out-Null } catch { }',
	'  }',
	'})',
	'$form.Controls.Add($logBtn)',
	'',
	'$script:phase = "wait"',
	'$script:proc = $null',
	'$script:started = Get-Date',
	'$script:waitStarted = Get-Date',
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
	'  try {',
	'    [void]$proc.Start()',
	'    Write-UpdateLog "安装器启动方式：ProcessStartInfo"',
	'    return $proc',
	'  } catch {',
	'    # 兜底：CreateProcess 被安全软件/权限拦下时，交给 ShellExecute（可触发 UAC）',
	'    Write-UpdateLog "ProcessStartInfo 启动失败：$($_.Exception.Message)，改用 ShellExecute 兜底"',
	'    $argList = @("/S", ("/D=" + $InstallDir))',
	'    $p2 = Start-Process -FilePath $Installer -ArgumentList $argList -PassThru',
	'    Write-UpdateLog "安装器启动方式：ShellExecute"',
	'    return $p2',
	'  }',
	'}',
	'',
	'$timer = New-Object System.Windows.Forms.Timer',
	'$timer.Interval = 500',
	'$timer.add_Tick({',
	'  try {',
	'    if ($script:phase -eq "wait") {',
	'      $ready = $false',
	'      if ($WaitPid -gt 0) {',
	'        $alive = Get-Process -Id $WaitPid -ErrorAction SilentlyContinue',
	'        if (-not $alive) {',
	'          Write-UpdateLog "等待的进程 $WaitPid 已退出"',
	'          $ready = $true',
	'        } elseif ($WaitName -and ($alive.ProcessName -ne $WaitName)) {',
	'          # PID 被别的进程复用：不能一直等一个跟本程序无关的进程',
	'          Write-UpdateLog "PID $WaitPid 已被 $($alive.ProcessName) 复用，视为旧进程已退出"',
	'          $ready = $true',
	'        } else {',
	'          $waited = [int](((Get-Date) - $script:waitStarted).TotalSeconds)',
	'          if ($waited -ge ' + String(WAIT_TIMEOUT_SECONDS) + ') {',
	'            Write-UpdateLog "等待软件退出超时（${waited}s），强制开始安装"',
	'            $ready = $true',
	'          } else {',
	'            $step.Text = "正在等待软件退出…（${waited}s）"',
	'            return',
	'          }',
	'        }',
	'      } else {',
	'        $ready = $true',
	'      }',
	'      if (-not $ready) { return }',
	'      $step.Text = "正在覆盖安装文件，请稍候…"',
	'      try {',
	'        $script:proc = Start-Installer',
	'        if (-not $script:proc) { throw "未取得安装进程" }',
	'        $script:phase = "installing"',
	'        $script:started = Get-Date',
	'        Write-UpdateLog "安装器已启动 pid=$($script:proc.Id)"',
	'      } catch {',
	'        $script:phase = "failed"',
	'        $title.Text = "安装启动失败"',
	'        $step.Text = $_.Exception.Message + "（可点右侧查看安装日志）"',
	'        $step.ForeColor = [System.Drawing.Color]::FromArgb(200, 60, 60)',
	'        $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Blocks',
	'        $bar.Value = 0',
	'        $logBtn.Visible = $true',
	'        $timer.Stop()',
	'        Write-UpdateLog "启动安装器失败：$($_.Exception.Message)"',
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
	'      Write-UpdateLog "安装器退出 code=$code"',
	'      if ($AppExe -and (Test-Path -LiteralPath $AppExe)) {',
	'        try { Write-UpdateLog ("安装后主程序版本=" + (Get-Item -LiteralPath $AppExe).VersionInfo.ProductVersion) } catch { }',
	'      } else {',
	'        Write-UpdateLog "安装后未找到主程序：$AppExe"',
	'      }',
	'      if ($code -eq 0) {',
	'        $script:phase = "restart"',
	'        $step.Text = "安装完成，正在启动新版本…"',
	'        $bar.Style = [System.Windows.Forms.ProgressBarStyle]::Blocks',
	'        $bar.Value = 100',
	'        Write-UpdateLog "安装完成，拉起新版本"',
	'        if ($AppExe -and (Test-Path -LiteralPath $AppExe)) {',
	'          try { Start-Process -FilePath $AppExe | Out-Null } catch { Write-UpdateLog "拉起新版本失败：$($_.Exception.Message)" }',
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
	'        $logBtn.Visible = $true',
	'        $timer.Stop()',
	'      }',
	'      return',
	'    }',
	'  } catch {',
	'    $script:phase = "failed"',
	'    $title.Text = "安装未完成"',
	'    $step.Text = $_.Exception.Message + "（可点右侧查看安装日志）"',
	'    $step.ForeColor = [System.Drawing.Color]::FromArgb(200, 60, 60)',
	'    $logBtn.Visible = $true',
	'    $timer.Stop()',
	'    Write-UpdateLog "定时器异常：$($_.Exception.Message)"',
	'  }',
	'})',
	'',
	'$form.add_Shown({ $timer.Start(); $form.Activate(); Write-UpdateLog "进度窗口已显示" })',
	'$form.add_FormClosed({ $timer.Stop(); Write-UpdateLog "进度窗口关闭 phase=$script:phase" })',
	'Write-UpdateLog "进入 ShowDialog"',
	'[void]$form.ShowDialog()',
	'Write-UpdateLog "=== 进度窗口退出 ==="'
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

export function progressLogPath(dir: string): string {
	return join(dir, PROGRESS_LOG_NAME);
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
	/** 主进程名（不含 .exe），用于识别 PID 复用 */
	waitName?: string;
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
export function spawnProgressWindow(
	opts: ProgressWindowOptions
): { ok: boolean; script?: string; logPath?: string; reason?: string } {
	const ps = powershellPath();
	if (!ps) {
		opts.onLog?.('warn', '未找到 powershell.exe，安装阶段无法显示进度窗口，回退静默安装');
		return { ok: false, reason: 'no-powershell' };
	}

	let script: string;
	let fd: number | undefined;
	const logPath = progressLogPath(opts.scriptDir);
	try {
		mkdirSync(opts.scriptDir, { recursive: true });
		script = writeProgressScript(opts.scriptDir);
		// 主进程先写一行：即使 PowerShell 根本没起来，日志里也能看出「调度过安装」
		appendFileSync(logPath, `[main] ${new Date().toISOString()} 调度安装，waitPid=${opts.waitPid}\r\n`, 'utf8');
		fd = openSync(logPath, 'a');
	} catch (e: any) {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch {}
		}
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
		String(opts.waitPid),
		'-LogPath',
		logPath
	];
	// 空字符串不能作为参数传给 -File 形式：PowerShell 会把 `-AppExe ""` 当成缺参直接报错退出，
	// 窗口也就起不来。可选参数一律「有值才传」，让脚本里的默认值生效。
	if (opts.appExe) args.push('-AppExe', opts.appExe);
	if (opts.version) args.push('-Version', opts.version);
	if (opts.waitName) args.push('-WaitName', opts.waitName);

	try {
		const child = spawn(ps, args, {
			detached: true,
			// 不再 ignore：PowerShell 的解析错误/未捕获异常全部落到 update-window.log
			stdio: ['ignore', fd, fd],
			windowsHide: true
		});
		child.unref();
		opts.onLog?.('info', `安装进度窗口已启动（pid=${child.pid}），脚本：${script}，日志：${logPath}`);
		return { ok: true, script, logPath };
	} catch (e: any) {
		opts.onLog?.('warn', '启动安装进度窗口失败：' + (e?.message || e));
		return { ok: false, reason: 'spawn-failed' };
	} finally {
		// 父进程手里这份句柄可以关掉，子进程已经继承了自己的副本
		try {
			closeSync(fd);
		} catch {}
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

/** 等待 Electron 退出的硬超时（秒），与脚本内常量保持一致，供测试与日志使用 */
export const WAIT_TIMEOUT = WAIT_TIMEOUT_SECONDS;
