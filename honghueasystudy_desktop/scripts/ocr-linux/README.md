# Linux OCR 构建流水线（scripts/ocr-linux）

将桌面端 OCR 能力（ddddocr 验证码识别 + 滑块缺口检测）适配到 Linux（x64 / arm64 双架构），
产出与 win / mac 包同构的 PyInstaller onedir 包。Linux 为**纯内置分发**：产物以 GitHub Release
资产交付（体积超 git 单文件 100MB 限制，不入库），打包期内嵌进安装包，供启动初始化使用
（运行时无 CDN 上传/下载、离线可用）。

## 版本对齐基准（T001，提取自现有 win 包）

基准来源：`honghueasystudy_desktop/bin/ocr/win-x64/ocr.zip`（52,321,175 字节，PyInstaller onedir 结构，
通过对包内二进制/元数据的只读解析提取版本：`python38.dll`、`cv2/version.py`、`PIL/_version`、
`numpy/_version`、onnxruntime pyd 内嵌版本串、ddddocr 模块 API 特征比对）。

| 组件                    | 版本        | 说明                                                                 |
| ----------------------- | ----------- | -------------------------------------------------------------------- |
| Python                  | 3.8         | `python38.dll`，PyInstaller CArchive `pyvers=308`                     |
| ddddocr                 | 1.4.11      | API 特征：含 `show_ad` / `beta` / `charsets_path` / `use_import_onnx` / `slide_comparison`，不含 1.5.x 才有的 `det_fp_path` / `ocr_fp_path` |
| onnxruntime             | 1.14.0      | `onnxruntime_pybind11_state.pyd` 内嵌版本串                          |
| opencv                  | 4.7.0.72    | `cv2/version.py`：`opencv_version = "4.7.0.72"`，`headless = True` → `opencv-python-headless` |
| Pillow                  | 9.4.0       | `PIL/_version`                                                        |
| numpy                   | 1.24.2      | `numpy/_version`（setuptools_scm 元数据，构建日期 2023-02-05）        |
| PyInstaller             | 5.x（onedir）| win 包布局为「可执行 + 依赖平铺在包根目录」，与 PyInstaller 5.x onedir 一致（6.x 会移入 `_internal/`）；本流水线锁定 5.13.2 |
| ONNX 模型               | common_old.onnx | ddddocr 自带模型，位于包内 `ddddocr/common_old.onnx`              |

## CLI 契约（与 win / mac 包一致，消费端 `packages/app/src/utils/ocr.ts` 不可变）

- 文本识别：`ocr --ocr <image>` → stdout 输出识别文本（消费端 `stdout.trim()`）
- 滑块检测：`ocr --det-target <piece> --det-bg <background>` → stdout 输出单引号字面量
  `{'target_y': <int>, 'target': [<x1>, <y1>, <x2>, <y2>]}`（消费端将 `'` 替换为 `"` 后 `JSON.parse`）
- 参数 / 文件错误：非 0 退出码
- 入口文件名：Linux 为 `ocr`（无扩展名），已由消费端 `process.platform === 'win32' ? './ocr.exe' : './ocr'` 覆盖

## 产物命名与分发（v2：纯内置运行时；构建产物走 GitHub Release，不入库）

Linux OCR **运行时分发为纯内置**：安装包内嵌 `ocr.zip`，运行时零网络请求，**不上传 CDN**。
构建产物体积超过 git 单文件 100MB 限制，**不入库**，以 GitHub Release 资产交付：

| 平台            | 产物                  | 分发方式                                          |
| --------------- | --------------------- | ------------------------------------------------- |
| win（x64）      | `ocr.zip`             | CDN（保持现状，与 Linux 无关）                    |
| mac（x64/arm64）| `ocr-darwin.zip`      | CDN（保持现状，与 Linux 无关）                    |
| linux x64       | `ocr-linux-x64.zip`   | GitHub Release（tag: `ocr-linux`）→ 打包期拉取内嵌 |
| linux arm64     | `ocr-linux-arm64.zip` | GitHub Release（tag: `ocr-linux`）→ 打包期拉取内嵌 |

**交付流程**：`.github/workflows/ocr-linux-build.yml`（workflow_dispatch 手动触发）产出双架构
zip，由 release job 自动上传至 GitHub Release（预发布 tag: `ocr-linux`，永久有效；Actions
Artifact 仅作 14 天短期调试，非交付通道）。`desktop-build.yml` 的 linux job 在打包前通过
`gh release download` 拉取对应架构 zip 放入 `bin/ocr/linux-<arch>/ocr.zip`，由
electron-builder extraResources（`electron.builder.json` linux 块）内嵌进 Linux 安装包；
运行时 `init.ocr.ts` 仅从内置资源解压安装（纯离线可用）。本地打包需手动从 Release 下载
放入同路径；缺失时 `scripts/build-app.js` 构建期报错拦截。

**模型对齐**：CLI 使用 `common_old.onnx`（`ocr_entry.py` 中 `DdddOcr(old=True)`），与 win 包
一致；`common.onnx`（新版字识别模型）/ `common_det.onnx`（目标检测模型）为 CLI 契约不使用的
模型，构建期剔除以控制体积（每包约减 74MB）。

## 使用

```bash
# Linux 构建机（x64 / arm64 原生环境）上执行：
python3 honghueasystudy_desktop/scripts/ocr-linux/build.py            # 自动检测架构
python3 honghueasystudy_desktop/scripts/ocr-linux/build.py --arch x64 # 显式指定架构

# 产物：honghueasystudy_desktop/scripts/ocr-linux/build/ocr-linux-<arch>.zip
```

构建脚本自包含：创建虚拟环境 → 安装 `requirements.txt` → PyInstaller onedir 打包 `ocr_entry.py`
为 `ocr` → 归档为 `ocr-linux-<arch>.zip` → CLI 契约冒烟自校验（`test/` 目录存在测试图时执行图像用例，
否则仅做 `--help` 二进制可执行性冒烟）。

## 文件清单

- `requirements.txt` — 版本锁定（与上表基准对齐，Python 3.8 兼容）
- `ocr_entry.py` — CLI 契约入口（`--ocr` / `--det-target` / `--det-bg`）
- `build.py` — 构建脚本（venv + PyInstaller onedir + zip 归档 + 冒烟自校验）
- `test/` — （可选）CLI 契约冒烟测试图：`ocr.png`、`det_target.png`、`det_bg.png`，缺失时自动跳过图像用例
