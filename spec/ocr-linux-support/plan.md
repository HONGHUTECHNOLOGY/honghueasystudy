# Implementation Plan: 桌面端 OCR 功能 Linux 适配（v2：纯内置分发）

**Input**: Feature specification from `spec/ocr-linux-support/spec.md` (v2)

## Summary

为 honghueasystudy_desktop（Electron 35 桌面端）补齐 Linux（x64 + arm64）OCR 能力，**分发方式为纯内置**：构建流水线（Python 入口 + PyInstaller + CI）产出双架构 `ocr-linux-<arch>.zip`，以 GitHub Actions Artifact 形式交付，维护者下载后入库 `bin/ocr/linux-<arch>/`（与现有 win-x64/ocr.zip 模式一致）；electron-builder 打包时内嵌为 extraResources；运行时 Linux 仅从内置资源解压安装（系统 unzip/chmod 保障权限、ELF 架构校验、幂等），**零网络请求、无 CDN 上传/下载**；应用中心不为 Linux 提供 OCR 入口（清单无 linux 条目、无 win 默认包回退）；`POST /ocr` 契约与自动化脚本零改动；win/mac 全链路（含 CDN 分发）零回归。

**相对 v1 的设计变更**：移除 Linux CDN 分发链路（init.ocr.ts 在线下载兜底、清单 linux 条目、ocr.install.js linux 下载 URL）；应用中心 Linux OCR 安装故事移除；新增构建期本地存在性校验（防呆）；CI Artifact 入库流程取代 CDN 上传流程。

## Technical Context

**Language/Version**: TypeScript 5.x（应用侧）；Python 3.8（OCR 构建流水线，与 win/mac 包对齐）；Electron 35 + electron-builder 23  
**Primary Dependencies**: ddddocr（含 ONNX 模型）、PyInstaller、onnxruntime、OpenCV、Pillow、numpy（构建侧）；express、adm-zip、axios（应用侧，均为现有依赖）  
**State Management**: N/A（应用侧为 Electron 主进程任务模型，不引入新状态框架）  
**Storage**: 文件系统——仓库入库文件 `bin/ocr/linux-<arch>/ocr.zip`（内置分发唯一来源）；安装目录 `<userData>/downloads/apps/ocr/`；打包内嵌 `resources/bin/ocr/`  
**Testing**: 应用侧 TypeScript 编译/构建 + Linux 环境手工验收（CLI 契约测试 + `/ocr` 接口测试）；CI 产物自校验（build.py 冒烟）  
**Target Platform**: Linux x64/arm64（glibc 发行版，Ubuntu 20.04+ 基线）；win/mac 回归  
**Project Type**: desktop-app（Electron monorepo 子工作区）+ Python 构建流水线  
**Performance Goals**: 单张验证码识别 ≤ 2s；OCR 初始化非阻塞启动  
**Constraints**: Linux 全程离线可用（零网络请求）；AppImage 只读挂载不得写入；`POST /ocr` 契约不可变；win/mac CDN 分发模式不可变  
**Scale/Scope**: 应用侧修改约 7 个文件（多数为 v1 实现的回撤/调整）；构建流水线 3 个文件 + 1 个 CI workflow 沿用并微调

## Project Structure

### Documentation (this feature)

```text
spec/ocr-linux-support/
├── spec.md              # 需求规格（v2 纯内置分发）
├── plan.md              # 本文件（v2）
└── tasks.md             # 任务分解（v2，Phase 3 生成）
```

### Source Code (repository root)

```text
# ===== honghueasystudy_desktop 工作区（应用侧改动，相对 v1 实现的增量） =====
honghueasystudy_desktop/
├── packages/app/src/tasks/init.ocr.ts               # [修改] 移除 linux 在线下载兜底与 linux CDN URL：Linux 仅从内置资源解压安装，缺失静默降级、零网络请求；保留系统 unzip/chmod、ELF 架构校验、幂等
├── packages/app/src/utils/ocr.ts                    # [保持] canOCR X_OK 判定与降级逻辑不变（v1 实现沿用）
├── packages/app/src/tasks/startup.server.ts         # [保持] isBinaryExecError 降级逻辑不变（v1 实现沿用）
├── packages/common/src/utils/ocr.path.ts            # [微调] 注释更新：说明 linux 走内置入库模式
├── packages/web/src/utils/resources.loader.ts       # [修改] 应用中心回退防护：平台无匹配条目时该资源不可安装（不得回退 win 默认包）；arch 匹配能力保留（无使用方，向后兼容）
├── packages/app/electron.builder.json               # [保持] linux 块 extraResources 映射不变（v1 实现沿用）
├── scripts/build-app.js                             # [修改] Linux 打包前置校验：bin/ocr/linux-<arch>/ocr.zip 本地存在性检查（仅校验不下载），缺失时构建期报错提示从 CI Artifact 获取
└── scripts/ocr-linux/                                # [保持] v1 构建流水线沿用（README 版本基准 / requirements.txt / ocr_entry.py / build.py），不涉及 CDN
    ├── README.md
    ├── requirements.txt
    ├── ocr_entry.py
    └── build.py

# ===== 根工作区（分发与清单改动，相对 v1 实现的增量） =====
scripts/ocr.install.js                                # [修改] 移除 linux-x64/linux-arm64 CDN 下载 URL；win/mac 下载逻辑不变；linux 仅保留本地校验能力（配合 build-app.js 防呆）
website/api/honghu-app-infos.json                    # [修改] 移除 v1 添加的 linux 平台条目（ocr 资源恢复为 win 默认 + darwin 条目）
.github/workflows/ocr-linux-build.yml                # [微调] 确认仅产 Artifact、无任何 CDN 上传/发布步骤；补充 Artifact 下载→bin/ 入库的操作说明（workflow 注释或 README）
```

**Structure Decision**: 遵循现有项目架构，不引入新分层（与 v1 一致）。应用侧沿用"packages/app 主进程任务 + packages/common 路径解析 + packages/web 资源加载"既有职责划分；构建流水线保持独立 `scripts/ocr-linux/` 目录。v2 变更集中在"分发策略收窄"：对 v1 已实现文件做回撤/调整，不新增结构。此为渐进式修订，无新页面、无新状态管理需求，不适用 MVVM 结构选择。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 应用中心"无匹配平台条目即不可安装"回退防护（loader 行为变更） | 移除清单 linux 条目后，若 loader 对无匹配平台条目的资源回退 win 默认 URL，Linux 用户会下载到 win 包（不可用且浪费流量）；必须显式阻断 | 保留 linux 清单条目（与"不上传 CDN"冲突，条目 URL 将 404）；或允许回退（错误行为） |
| Linux 打包前置本地存在性校验（构建期防呆） | 内置 zip 依赖维护者手工入库，漏放会产出无 OCR 能力的安装包且无任何提示；构建期显式报错是唯一防呆点 | 运行期静默降级（用户已安装才发现 OCR 不可用，问题后置且难排查） |

## Research & Decisions

- **Decision 1 — 分发策略（v2 核心变更）**：Linux OCR 纯内置分发——`bin/ocr/linux-<arch>/ocr.zip` 仓库入库 → electron-builder extraResources 内嵌 → 运行时仅从内置资源解压安装。**移除 Linux 的全部 CDN 上传/下载环节**。
  - **Rationale**：用户明确要求"换成内置的，不要上传了"；去掉外部 CDN 依赖后分发链路自包含，离线可用性最强。
  - **Alternatives considered**：内置 + CDN 兜底（违背"不上传"要求）；仅 CDN（v1 方案，被否决）。
- **Decision 2 — 目标架构**：linux-x64 + linux-arm64 双架构，各自独立入库 zip，沿用 v1。
  - **Rationale**：双架构包互不兼容；extraResources 按目标架构在构建期选择，运行时内嵌资源架构必然正确。
  - **Alternatives considered**：仅 x64（覆盖不足）。
- **Decision 3 — 构建产物交付流**：CI（GitHub Actions）产出双架构 Artifact → 维护者下载 → 放入 `bin/ocr/linux-<arch>/` 提交仓库（与现有 `bin/ocr/win-x64/ocr.zip` 入库模式一致）。**CI 不含任何上传/发布步骤。**
  - **Rationale**：与仓库现有 win 包入库模式完全一致，维护者流程熟悉；仓库即分发源，无外部托管依赖。
  - **Alternatives considered**：CI 自动提交回仓库（需仓库写权限与提交风暴，收益低）；维护者本地 Linux 构建入库（无 CI 时回退可行，但重复劳动）。
- **Decision 4 — Linux 解压与执行权限**：沿用 v1——Linux 下优先系统 `unzip`（保留 +x 与符号链接，`init.chrome.ts` 已验证模式），回退 JS 解压 + `chmod 0o755` 兜底。
  - **Rationale**：v1 已实现并验证；JS 解压在 Linux 丢执行权限是已知问题。
  - **Alternatives considered**：仅 JS 解压 + chmod（对目录内其他可执行文件/链接不稳健）。
- **Decision 5 — 打包内嵌路径**：沿用 v1——electron-builder linux 块 `bin/ocr/linux-${arch}` → `resources/bin/ocr` 映射，运行时打包态内置资源路径 `resources/bin/ocr/ocr.zip` 不变，`getBuiltinOcrRoot()` 无需 arch 感知。
  - **Rationale**：v1 已实现并通过验证；构建期隔离架构差异，运行时零判断。
  - **Alternatives considered**：运行时按 arch 拼路径（多余）。
- **Decision 6 — Linux CLI 入口**：沿用 v1——按现有 CLI 契约编写的 Python 入口（`ocr_entry.py`），推理调用 ddddocr API（classification / slide_match），模型使用 ddddocr 自带 ONNX 模型。
  - **Rationale**：v1 已实现（py_compile 通过）；win/mac 包上游无源码，CLI 契约在消费端可逆向。
  - **Alternatives considered**：其他 OCR 库（行为不一致）。
- **Decision 7 — PyInstaller 打包模式**：沿用 v1——onedir 模式，zip 归档整个目录，与 win/mac 包结构一致。
  - **Rationale**：v1 已实现；onefile 启动开销大且对 /tmp 权限敏感。
  - **Alternatives considered**：onefile（性能差、故障面大）。
- **Decision 8 — CI 双架构构建**：沿用 v1——x64 用 ubuntu 原生 runner；arm64 优先原生 arm runner（`ubuntu-24.04-arm` 类标签），`qemu` 输入回退 QEMU + arm64 容器（20.04 自带 Python 3.8）。产物以 Artifact 上传，**无 CDN 发布环节**。
  - **Rationale**：v1 已实现；原生 runner 速度远优于 QEMU。
  - **Alternatives considered**：仅 QEMU（慢）；删除 CI（维护者本地构建，重复劳动且质量不稳定）。
- **Decision 9 — Python/依赖版本对齐**：沿用 v1——Python 3.8 + ddddocr 1.4.11 / onnxruntime 1.14.0 等锁定版本（requirements.txt）。
  - **Rationale**：识别行为跨平台一致的前提；v1 已实现。
  - **Alternatives considered**：升级 Python（兼容性风险）。
- **Decision 10 — 幂等、架构校验与降级**：沿用 v1——初始化前检测安装目录二进制存在且可执行则跳过；解压前 ELF 架构校验防手工放置错误架构包；任何失败静默降级 `canOCR=false`，不阻塞启动。
  - **Rationale**：v1 已实现；内置模式下架构校验仍必要（维护者可能放错包）。
  - **Alternatives considered**：无。
- **Decision 11 — 应用中心回退防护**：远程清单移除 linux OCR 条目后，资源加载器对"平台无匹配条目"的资源**不得回退默认 URL**（win 包），该资源在 Linux 不可安装/不展示。
  - **Rationale**：移除 linux 条目后若 loader 回退 win 默认 URL，Linux 用户会下载不可用的 win 包；必须显式阻断。
  - **Alternatives considered**：保留 linux 清单条目（URL 404，与"不上传"冲突）。
- **Decision 12 — 构建期防呆校验**：Linux 打包前置流程对 `bin/ocr/linux-<arch>/ocr.zip` 执行**仅本地存在性校验**（不下载）：缺失时构建期报错并提示"从 CI Artifact 获取并入库"。`ocr.install.js` 移除 linux CDN 下载 URL，win/mac 下载逻辑不变。
  - **Rationale**：内置 zip 依赖手工入库，漏放必须在构建期暴露而非运行期后置。
  - **Alternatives considered**：运行期静默降级（问题后置、难排查）。
- **Decision 13 — 资源加载器 arch 能力保留**：v1 为清单 linux 条目实现的 `arch` 可选字段匹配能力**保留**（向后兼容、零风险），当前无使用方。
  - **Rationale**：回撤已验证通过的代码徒增改动面与回归风险；能力为纯增量。
  - **Alternatives considered**：回撤 arch 匹配代码（churn 无收益）。
- **Decision 14 — 验证环境与验证边界**：沿用 v1 Decision 11——Windows 主机可验证 TypeScript 编译、工作区构建、打包配置校验、win/mac 回归；Linux 二进制构建、CLI 契约、运行时初始化、AppImage 需 Linux 环境或 CI 验收，tasks.md 逐任务标注。

## Data Model

**应用侧数据（v2 修订，无新持久化存储）**：

- **OCR 资源包（仓库入库文件 `bin/ocr/linux-<arch>/ocr.zip`）**
  - 内容：PyInstaller onedir 目录（`ocr` 入口、Python 3.8 运行时 so、onnxruntime、OpenCV、numpy、Pillow、ddddocr ONNX 模型）
  - 来源：CI Artifact 下载后入库（唯一来源，无 CDN）
  - 消费方：electron-builder extraResources（打包内嵌）
  - 解压目标：`<userData>/downloads/apps/ocr/`（跨平台一致）
- **OCR 安装状态（隐式，由文件系统表达）**
  - 已安装：`<userData>/downloads/apps/ocr/ocr` 存在且具备执行权限
  - 未安装/损坏：上述任一条件不成立 → `canOCR() === false`
- **远程资源清单（`honghu-app-infos.json` 中 ocr 资源，v2 恢复 v1 前状态）**
  - 字段：`id: 'ocr'`、默认 `url`（win）、`platforms: [{platform: 'darwin', url}]`
  - **无 linux 条目**；资源加载器可选 `arch` 匹配能力保留但无使用方
- **v1 的 Linux CDN URL 配置（`ocr-linux.zip` / `ocr-linux-arm64.zip`）**
  - **整体移除**：init.ocr.ts 在线下载分支、清单条目、ocr.install.js URL 均不保留

**构建流水线数据**：

- **构建输入**：目标架构（x64/arm64）、Python 3.8 环境、requirements.txt 锁定依赖
- **构建输出**：CI Artifact `ocr-linux-x64.zip` / `ocr-linux-arm64.zip` → 入库 `bin/ocr/linux-<arch>/ocr.zip`
- **版本对齐基准**：win/mac 包内 ddddocr 模型与库版本（Python 3.8 / ddddocr 1.4.11 / onnxruntime 1.14.0）

## Contracts & Interfaces

**1. OCR CLI 契约（Linux 产物必须遵守，与 win/mac 一致，不可变，沿用 v1）**

- 文本识别：`ocr --ocr <image.png 绝对路径>` → stdout：识别文本字符串
- 滑块检测：`ocr --det-target <piece.png> --det-bg <background.png>` → stdout：`{'target_y': <int>, 'target': [<x1>, <y1>, <x2>, <y2>]}`（单引号对象字面量）
- 退出码：成功 0；参数/文件错误非 0
- 文件名：Linux 下入口为 `ocr`（无扩展名）

**2. OCR HTTP 接口（现有，不可变，沿用 v1）**

- `POST /ocr`，请求键 `image` / `det_target`+`det_bg`（base64），响应 `{canOCR: true, code}` / `{canOCR: true, det}` / `{canOCR: false}`

**3. 远程资源清单接口（v2 收窄）**

- ocr 资源：默认 `url`（win）+ `platforms: [{platform: 'darwin', url}]`，**无 linux 条目**
- 匹配规则（回退防护）：按 `process.platform` 匹配平台条目；**平台无匹配条目时资源不可安装（不得回退默认 URL）**；条目可选 `arch` 字段能力保留（优先 `arch === process.arch`，无 `arch` 视为平台默认）
- 消费方：应用中心 ResourceLoader（win/mac）；Linux 上 OCR 资源不可安装

**4. 构建脚本接口（`scripts/ocr-linux/build.py`，沿用 v1）**

- 输入：目标架构（或由构建环境决定）、可选输出目录
- 行为：venv → requirements 安装 → PyInstaller onedir 打包 `ocr_entry.py` 为 `ocr` → 归档 `ocr-linux-<arch>.zip` → CLI 契约冒烟自校验
- **不含任何上传/发布步骤**

**5. CI workflow 契约（`.github/workflows/ocr-linux-build.yml`，v2 微调）**

- 触发：workflow_dispatch
- Matrix：x64（ubuntu 原生）+ arm64（原生 arm runner 优先，`arm64-mode=qemu` 回退）
- 产物：Actions Artifact `ocr-linux-x64.zip` / `ocr-linux-arm64.zip`
- **无 CDN 上传/发布步骤**；补充"Artifact 下载 → `bin/ocr/linux-<arch>/` 入库"操作说明（注释或 README）

**6. 构建期校验契约（v2 新增）**

- Linux 打包前置（`build-app.js` / `ocr.install.js` 协同）：校验 `bin/ocr/linux-<arch>/ocr.zip` 本地存在——**仅校验、不下载**；缺失时构建期报错，错误信息提示从 CI Artifact 获取并入库
- win/mac 打包前置下载逻辑（CDN 下载）保持不变

**7. 打包配置契约（`electron.builder.json`，沿用 v1）**

- linux 块 extraResources：`bin/ocr/linux-${arch}` → `resources/bin/ocr`（与 win/mac 同构）
- 目标格式：AppImage / deb / rpm

## Changelog

- 2026-10-24 v2：按用户范围变更"linux ocr 换成内置的，不要上传了"修订——移除 Linux CDN 分发链路（Decision 1/3/11/12），应用中心 Linux OCR 入口移除，新增构建期防呆校验与回退防护；沿用 v1 已实现并验证的构建流水线、解压权限、CLI 入口、打包映射（Decision 2/4–10/14）。
- 2026-10-24 v1 初版：依据 spec/ocr-linux-support/spec.md 生成。
