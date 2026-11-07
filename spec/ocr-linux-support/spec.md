# Feature Specification: 桌面端 OCR 功能 Linux 适配（v2：纯内置分发）

**Created**: 2026-10-24（v2 修订：Linux OCR 改为纯内置分发，移除 CDN 上传/下载链路）  
**Status**: Draft  
**Input**: User description: "将桌面端OCR功能适配Linux，现在Linux没有OCR包"；范围变更："linux ocr换成内置的，不要上传了"

## Overview

桌面端应用（honghueasystudy_desktop，Electron 35）目前在 Windows/macOS 上通过 PyInstaller 打包的 ddddocr CLI 二进制提供验证码文本识别（`--ocr`）与滑块缺口检测（`--det`）能力，经由 Express `POST /ocr` 端点供自动化脚本消费。本特性为 Linux（x64 + arm64）补齐 OCR 能力，**分发方式为纯内置**：OCR 资源包由构建流水线产出、随安装包（extraResources）内嵌分发，运行时仅从内置资源解压安装，**不涉及 CDN 上传，也不做在线下载兜底**。应用中心不为 Linux 提供 OCR 安装入口；Windows/macOS 现有行为保持零改动。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Linux 启动自动初始化 OCR 模块（纯内置） (Priority: P1)

Linux 用户（x64 或 arm64）安装并启动桌面端应用后，应用在启动阶段自动从安装包内嵌的 OCR 资源（`resources/bin/ocr/ocr.zip`，构建期已按目标架构选定对应包）解压至用户数据目录，并确保二进制具备可执行权限。初始化完成后 `POST /ocr` 端点可用，`canOCR()` 返回 true。**Linux 无任何在线下载路径**：内置资源缺失或损坏时静默降级（`canOCR=false`），不阻塞启动、不尝试联网。

**Why this priority**: OCR 模块可用是 Linux 端全部 OCR 能力的前提。

**Independent Test**: 在 Linux 环境（x64）启动应用，观察启动任务"初始化OCR模块"日志与 `userData/downloads/apps/ocr/` 目录产物，调用 `POST /ocr` 验证响应；断网环境下行为一致（纯离线可用）。

**Acceptance Scenarios**:

1. **Given** Linux x64 环境、安装包内嵌 linux-x64 OCR 资源包，**When** 用户首次启动应用（含断网环境），**Then** OCR 模块被解压至用户数据目录，二进制具有可执行权限，`POST /ocr` 返回 `canOCR: true` 且能识别测试验证码图片
2. **Given** Linux arm64 环境，**When** 用户首次启动应用，**Then** 应用解压的内置资源为 arm64 包（构建期已按架构选定），初始化结果与 x64 一致
3. **Given** 安装包未内嵌 OCR 资源（如开发模式未放置 zip），**When** 应用启动，**Then** OCR 初始化静默失败，不发起任何网络请求，`canOCR()` 返回 false，应用其余功能正常
4. **Given** OCR 模块已初始化，**When** 用户再次启动应用，**Then** 初始化幂等跳过，不重复解压

---

### User Story 2 - Linux 验证码识别与滑块检测行为一致 (Priority: P1)

Linux 用户使用超星/智慧树等自动登录自动化功能时，自动化脚本截图验证码元素并以 base64 提交至 `POST /ocr`：文本验证码请求（`image` 键）返回识别文本；滑块验证请求（`det_target` + `det_bg` 键）返回目标坐标。请求/响应结构与 win/mac 完全一致，自动化脚本无需任何修改即可在 Linux 上完成验证码自动填入与滑块校准拖拽。

**Why this priority**: OCR 的最终业务价值在于支撑自动化脚本；接口行为一致意味着现有全部自动化资产在 Linux 零改动可用。

**Independent Test**: 在 Linux 环境用固定测试图片（文本验证码样本、滑块前景/背景样本）调用 `POST /ocr` 的两类接口，比对响应结构与识别结果。

**Acceptance Scenarios**:

1. **Given** Linux 环境 OCR 模块已初始化，**When** 以 `image` 键 POST 一张文本验证码 base64 图片，**Then** 返回 `canOCR: true` 及识别出的文本字符串，与 win/mac 对同一图片的结果一致
2. **Given** Linux 环境 OCR 模块已初始化，**When** 以 `det_target` + `det_bg` 键 POST 滑块前景与背景图，**Then** 返回 `canOCR: true` 及 `target_y` 与 `target` 坐标，坐标与 win/mac 结果偏差不影响滑块拖拽成功率
3. **Given** OCR 模块不可用（未内嵌/执行失败），**When** 自动化脚本请求 `POST /ocr`，**Then** 返回 `canOCR: false`，脚本走降级路径，不崩溃

---

### User Story 3 - Linux ddddocr 二进制构建流水线与 CI Artifact 入库 (Priority: P2)

维护者通过构建流水线产出 Linux OCR 资源包：构建脚本基于与 win/mac 包相同的 ddddocr 版本与 ONNX 模型，用 PyInstaller 产出可独立运行的 `ocr` CLI 二进制并归档为 `ocr-linux-<arch>.zip`；CI（GitHub Actions）以 Artifact 形式产出双架构（x64/arm64）构建产物，**不上传任何 CDN**。维护者下载 Artifact 后将 zip 放入仓库 `bin/ocr/linux-<arch>/` 目录提交（与现有 `bin/ocr/win-x64/ocr.zip` 入库模式一致），作为打包内嵌的唯一来源。

**Why this priority**: "Linux 没有 OCR 包"是本次适配的根因；构建流水线产出内置包，是分发链路的源头。

**Independent Test**: 在 Linux x64 环境运行构建脚本，对产物 zip 解压后直接执行 `ocr --ocr <测试图>` 与 `ocr --det-target ... --det-bg ...`，校验 stdout 契约；CI 触发后可下载到双架构 Artifact。

**Acceptance Scenarios**:

1. **Given** Linux x64 构建环境（Python 3.8 + 依赖可用），**When** 运行 Linux OCR 构建脚本，**Then** 产出 `ocr` 二进制与 `ocr-linux-x64.zip`，解压后无需额外安装依赖即可运行
2. **Given** Linux arm64 构建环境（或 CI arm 原生/QEMU 环境），**When** 运行同一构建脚本，**Then** 产出 `ocr-linux-arm64.zip`，行为与 x64 一致
3. **Given** 构建产物二进制，**When** 执行 `--ocr` 与 `--det` 两类调用，**Then** stdout 输出格式与 win/mac 包契约一致（文本字符串 / `{'target_y': n, 'target': [...]}`）
4. **Given** 维护者下载 CI Artifact（`ocr-linux-x64.zip` / `ocr-linux-arm64.zip`），**When** 将 zip 放入 `bin/ocr/linux-<arch>/` 并提交，**Then** 后续 Linux 打包构建可将其内嵌，全程无 CDN 参与

---

### User Story 4 - Linux 安装包内嵌 OCR 资源与构建期校验 (Priority: P3)

维护者执行 Linux 打包（AppImage/deb/rpm）时，electron-builder 将 `bin/ocr/linux-<arch>/ocr.zip` 内嵌至安装包 extraResources；打包前置流程对 Linux 目标执行**本地存在性校验**（不下载）：`bin/ocr/linux-<arch>/ocr.zip` 缺失时构建期给出明确错误提示（提示从 CI Artifact 获取），防止产出无 OCR 能力的安装包。应用侧安装逻辑能在打包产物（含 AppImage 只读挂载场景）中定位内嵌资源并解压到用户数据目录。

**Why this priority**: 内置分发链路的最后一环，含构建期防呆；依赖 US3 的构建产物。

**Independent Test**: 在 Linux 环境执行 electron-builder linux 打包，检查产物内 `resources/bin/ocr/` 包含对应 zip；删除 `bin/ocr/linux-x64/ocr.zip` 后打包应报明确错误。

**Acceptance Scenarios**:

1. **Given** `bin/ocr/linux-x64/ocr.zip` 已入库，**When** 执行 linux-x64 打包，**Then** 产物安装包内含该 OCR 资源包，安装后断网首启 OCR 初始化成功
2. **Given** `bin/ocr/linux-<arch>/ocr.zip` 缺失，**When** 执行 Linux 打包，**Then** 构建期报错并提示"从 CI Artifact 获取并入库"，不产出缺 OCR 的安装包
3. **Given** AppImage 格式安装包（挂载目录只读），**When** 应用启动初始化 OCR，**Then** 资源被解压到可写的用户数据目录，不向只读挂载目录写入

---

### Edge Cases

- **架构不匹配**：解压前校验内置包二进制 ELF 架构与运行架构一致（防手工放置错误架构包），不一致时降级 `canOCR=false`
- **重复初始化**：OCR 模块已存在且可执行时再次启动，不得重复解压（幂等）
- **解压丢失执行权限**：JS 解压库在 Linux 上不保留 `+x` 权限时，通过优先调用系统 `unzip`（参照 `init.chrome.ts` 先例）或事后 `chmod 0o755` 兜底
- **运行时缺库**：目标机 glibc/onnxruntime 依赖缺失导致二进制执行失败时，`canOCR()` 返回 false，`POST /ocr` 返回 `canOCR: false`，自动化脚本降级
- **内置资源缺失**（开发模式/异常安装包）：静默降级，**不发起网络请求**，不产生错误弹窗
- **应用中心回退防护**：Linux 上远程清单无 OCR 平台条目时，应用中心不得将 win 默认包（`ocr.zip`）兜底展示/安装给 Linux 用户——无匹配平台条目则该资源在 Linux 不可安装
- **win/mac 回归**：所有平台分支与清单改动不得影响 win/mac 现有安装（含 CDN 下载）、调用与打包路径；win/mac 的 CDN 分发模式保持不变

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 应用在 Linux 平台启动时必须从安装包内嵌资源（`resources/bin/ocr/ocr.zip`）执行 OCR 模块初始化，不得因平台跳过
- **FR-002**: Linux 初始化必须**仅依赖内置资源，无任何在线下载路径**；内置资源缺失时静默降级 `canOCR=false`，不发起网络请求
- **FR-003**: Linux 下 OCR 二进制安装后必须具备可执行权限：优先使用系统 `unzip` 保留权限，不可用时以 `chmod 0o755` 兜底
- **FR-004**: `POST /ocr` 在 Linux 上必须提供与 win/mac 一致的接口契约：`image` → `{canOCR, code}`；`det_target`+`det_bg` → `{canOCR, det}`；不可用 → `{canOCR: false}`
- **FR-005**: 远程资源清单**不得包含** linux 平台的 OCR 条目；应用中心在 Linux 上不提供 OCR 模块安装入口，且不得回退到 win 默认包；win/mac 应用中心行为不变
- **FR-006**: 必须提供 Linux ddddocr PyInstaller 构建脚本，基于与 win/mac 包一致的 ddddocr 版本与 ONNX 模型产出 Linux `ocr` CLI 二进制，并归档为 `ocr-linux-<arch>.zip`
- **FR-007**: 构建流水线必须覆盖 linux-x64 与 linux-arm64 两种架构，CI 以 Artifact 形式产出双架构构建产物，**不包含任何 CDN 上传/发布环节**
- **FR-008**: electron-builder linux 打包配置必须将 `bin/ocr/linux-<arch>` 资源包内嵌至 extraResources；Linux 打包前置流程必须本地校验该 zip 存在，缺失时构建期报错并提示从 CI Artifact 获取（不下载）
- **FR-009**: OCR 功能在任何环节不可用（资源缺失、解压失败、执行失败）时，应用与自动化脚本必须优雅降级：不崩溃、不阻塞启动、返回明确的不可用状态
- **FR-010**: 初始化流程必须幂等：模块已存在且可用时不重复安装
- **FR-011**: 构建期下载脚本（ocr.install.js）**不得包含** linux CDN 下载地址；win/mac 下载逻辑保持不变

### Key Entities *(include if feature involves data)*

- **OCR 资源包（`bin/ocr/linux-<arch>/ocr.zip`，仓库入库文件）**: PyInstaller 打包的 ddddocr 自包含运行时（Python 解释器、onnxruntime、OpenCV、ONNX 模型），解压后含可执行 `ocr` CLI；由 CI Artifact 下载后入库，是 Linux 内置分发的唯一来源
- **OCR CLI 契约**: `ocr --ocr <img>` → stdout 文本；`ocr --det-target <img> --det-bg <img>` → stdout `{'target_y': n, 'target': [x1,y1,x2,y2]}`（现有契约，Linux 产物必须遵守）
- **OCR 安装目录**: `<userData>/downloads/apps/ocr/`（跨平台一致）
- **OCR HTTP 接口**: `POST /ocr`，请求键 `image` / `det_target` / `det_bg`（base64），响应含 `canOCR` 及 `code` 或 `det`
- **远程资源清单**: ocr 资源保持 win 默认 URL + darwin 平台条目；**无 linux 条目**（资源加载器的可选 `arch` 匹配能力保留，向后兼容，当前无使用方）

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Linux（x64 与 arm64）上应用启动后 `canOCR()` 为 true，`POST /ocr` 对测试验证码样本返回正确识别文本；断网环境行为一致
- **SC-002**: 同一滑块测试样本在 Linux 与 Windows 上的 `det` 坐标偏差不导致滑块拖拽失败（校准后拖拽成功）
- **SC-003**: 维护者在干净 Linux 构建环境执行构建脚本，一次产出双架构 zip；CI 触发可下载双架构 Artifact；产物解压后无需额外依赖即可通过 CLI 契约测试
- **SC-004**: Linux 打包产物内嵌 OCR 资源且断网首启可用；`bin/ocr/linux-<arch>/ocr.zip` 缺失时打包构建期明确报错
- **SC-005**: OCR 不可用时，应用启动、网课自动化等其他功能 100% 不受影响；Linux 初始化全程零网络请求
- **SC-006**: win/mac 平台的 OCR 安装（含 CDN 下载）、应用中心、调用、打包行为在改动后回归通过（零回归）
- **SC-007**: 全链路无 CDN 上传/下载 Linux OCR 包环节；应用中心在 Linux 不展示/不可安装 OCR 资源

## Assumptions

- Linux OCR 资源包以仓库文件形式入库（`bin/ocr/linux-<arch>/ocr.zip`），与现有 `bin/ocr/win-x64/ocr.zip` 模式一致；包体积对仓库的影响可接受（维护者认可）
- Linux 目标环境为 glibc 主流发行版（Ubuntu 20.04+ 等）；musl（Alpine）不在本次范围
- Linux OCR 包与 win/mac 包使用相同 ddddocr 版本与相同 ONNX 模型文件（common_old.onnx），Python 版本对齐（3.8）
- CI 平台为 GitHub Actions：x64 使用原生 Linux runner，arm64 优先原生 arm runner（`ubuntu-24.04-arm` 类标签），不可用时 QEMU 容器回退
- 现有 Express `POST /ocr` 接口契约与自动化脚本消费方式保持不变，脚本层零改动
- win/mac 的 CDN 分发模式（默认 URL + darwin 平台条目 + 应用中心安装）保持不变，仅 Linux 走纯内置路线

## Open Questions

- 入库的 linux zip 是否需要 LFS 或压缩优化（当前 win zip 约 60+ 项、数十 MB 级）？（默认：普通文件入库，与 win-x64 现状一致）
- arm64 构建采用原生 arm runner 还是 QEMU？（默认：优先原生 arm runner，QEMU 回退，与 v1 方案一致）
