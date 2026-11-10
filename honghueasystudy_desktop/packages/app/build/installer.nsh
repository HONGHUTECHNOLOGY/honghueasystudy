; ==================================================================
; 自定义 NSIS 脚本
; electron-builder 默认从 build/installer.nsh 载入（见 scheme.json 的 nsis.include），
; 因此不需要在 electron.builder.json 里额外声明。
;
; 为什么需要它：
; 5.4.0 及更早客户端的自动更新走 spawnSilentInstaller，以 `/S /D=<dir>` 启动本安装包。
; 但本项目是 assisted installer（oneClick: false），「运行应用」只挂在完成页上由用户勾选；
; 静默安装时完成页不显示，installSection.nsh 的默认分支也不会自动启动。
; 于是软件退出后屏幕上什么都没有，用户以为升级失败（其实可能已经装好了）。
;
; customInstall 在「应用文件复制 + 卸载项 + 快捷方式」全部完成之后被调用，
; 这里补两件事（都不弹窗、不需要用户交互）：
;   1. 静默安装时自动拉起新版本，带 --updated 便于客户端识别更新后的首次启动
;   2. 写安装结果日志到 %TEMP%\honghu-update\nsis-install.log
;      —— 与客户端 pendingDir() 同一目录，方便重启后排查「/D= 是否指错目录」
;
; 刻意不在这里 kill 旧进程：electron-builder 的 CHECK_APP_RUNNING 在静默模式下
; 会走 MessageBox 的 /SD IDOK 自动 taskkill；重复实现反而可能误杀用户手动开着的实例。
; 也不在这里 SetSilent：手动双击安装包时仍应保留正常的安装向导与完成页。
; ==================================================================

!macro customInstall
  ; ---------- 1. 安装结果日志 ----------
  ; 放 TEMP 而不是 $INSTDIR：装在 Program Files 且 asInvoker 时安装目录可能不可写
  CreateDirectory "$TEMP\honghu-update"
  ClearErrors
  FileOpen $R8 "$TEMP\honghu-update\nsis-install.log" a
  IfErrors hh_install_log_done
    FileWrite $R8 "=== NSIS install finished ===$\r$\n"
    FileWrite $R8 "version: ${VERSION}$\r$\n"
    FileWrite $R8 "installDir: $INSTDIR$\r$\n"
    FileWrite $R8 "exe: $INSTDIR\${APP_EXECUTABLE_FILENAME}$\r$\n"
    ${If} ${Silent}
      FileWrite $R8 "mode: silent (auto update)$\r$\n"
    ${Else}
      FileWrite $R8 "mode: interactive$\r$\n"
    ${EndIf}
    FileWrite $R8 "build: ${__DATE__} ${__TIME__}$\r$\n"
    FileWrite $R8 "$\r$\n"
    FileClose $R8
  hh_install_log_done:
  ClearErrors

  ; ---------- 2. 静默安装结束自动拉起应用 ----------
  ; 只在静默模式做：手动安装仍由完成页的「运行」复选框决定，避免重复启动。
  ; 与 electron-builder 的 StartApp 一致用 StdUtils.ExecShellAsUser，
  ; 保证以当前登录用户身份启动（提权安装器不会把应用拉成管理员进程）。
  ; 客户端本身有单实例锁，即使后续又启动一次也只会把窗口唤到前台，不会真的双开。
  ${If} ${Silent}
    HideWindow
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "--updated"
  ${EndIf}
!macroend
