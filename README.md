<div align="center">

<picture>
	<source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/header/grid.svg?title=%E9%B8%BF%E9%B9%84%E6%98%93%E5%AD%A6&subtitle=%E8%87%AA%E5%8A%A8%E5%88%B7%E8%AF%BE%20%C2%B7%20AI%20%E7%AD%94%E9%A2%98%20%C2%B7%20%E9%A2%98%E5%BA%93%E6%90%9C%E9%A2%98%20%C2%B7%20%E8%B6%85%E6%98%9F%E7%AD%BE%E5%88%B0&logo=https%3A%2F%2Fraw.githubusercontent.com%2FHONGHUTECHNOLOGY%2Fhonghueasystudy%2Fmain%2Ficon%2Ficon.png&theme=blue&mode=dark&radius=28">
	<img src="https://shieldcn.dev/header/grid.svg?title=%E9%B8%BF%E9%B9%84%E6%98%93%E5%AD%A6&subtitle=%E8%87%AA%E5%8A%A8%E5%88%B7%E8%AF%BE%20%C2%B7%20AI%20%E7%AD%94%E9%A2%98%20%C2%B7%20%E9%A2%98%E5%BA%93%E6%90%9C%E9%A2%98%20%C2%B7%20%E8%B6%85%E6%98%9F%E7%AD%BE%E5%88%B0&logo=https%3A%2F%2Fraw.githubusercontent.com%2FHONGHUTECHNOLOGY%2Fhonghueasystudy%2Fmain%2Ficon%2Ficon.png&theme=blue&mode=light&radius=28" alt="鸿鹄易学 · 自动刷课 / AI 答题 / 题库搜题 / 超星签到" width="750">
</picture>

<br>
<br>

[![Release](https://shieldcn.dev/github/release/HONGHUTECHNOLOGY/honghueasystudy.svg?size=xs&color=%231E6FFF)](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/releases)
[![GitHub downloads](https://shieldcn.dev/github/downloads/HONGHUTECHNOLOGY/honghueasystudy.svg?size=xs&label=GitHub&color=%2318181B)](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/releases)
[![GitCode downloads](https://shieldcn.dev/badge/dynamic/json.svg?url=https%3A%2F%2Fgitcode.com%2Fapi%2Fv5%2Frepos%2Fhonghutech%2Fhonghueasystudy%2Fdownload_statistics&query=download_statistics_history_total&label=GitCode&color=orange&size=xs&logo=ri:GoDownload)](https://gitcode.com/honghutech/honghueasystudy/releases)
[![License](https://shieldcn.dev/github/license/HONGHUTECHNOLOGY/honghueasystudy.svg?size=xs&color=%238E8E93)](LICENSE)
![Platform](https://shieldcn.dev/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-%238E8E93.svg?size=xs)

<br>
<br>

支持超星学习通、智慧树、智慧职教、职教云、中国大学 MOOC、雨课堂、U校园、实验室安全考试平台

</div>

## 简介

鸿鹄易学是一款面向网课学习场景的开源自动化工具，提供**桌面端**与**浏览器扩展**两种使用方式。两者功能同源：桌面端内置了同款扩展并自动安装、自动升级，在此之上还提供浏览器多开、定时任务、远程控制与超星签到等无人值守能力。

## 功能

### 自动学习

- 视频自动播放、静音、倍速，支持屏蔽平台倍速限制
- 章节与任务点自动切换，PPT / 文档 / 阅读任务自动完成
- 视频弹题自动作答（超星、智慧树）

### AI 答题

- 单选、多选、判断、填空四类题型全覆盖
- 兼容 OpenAI 格式接口：DeepSeek、Kimi、智谱、硅基流动、阿里百炼等随心接入

### 题库与搜题

- 自定义题库配置，兼容 TikuAdapter 第三方题库
- 划词搜题，题库缓存秒级命中，无缓存再走在线搜题


### 平台支持

超星学习通、知到智慧树、智慧职教、职教云、中国大学 MOOC、雨课堂、U校园、实验室安全考试平台。

各平台覆盖的脚本（视频、文档、作业、考试等）略有差异，以实际脚本列表为准。

## 桌面端（推荐）

### 功能对比
|  | 桌面端（推荐） | 浏览器扩展 |
| --- | --- | --- |
| 安装 | 装一次，内置扩展自动注入并跟随软件升级 | 需在扩展管理页手动加载，或从商店安装 |
| 多账号 | 多实例各自独立的缓存与登录环境，可并行 | 单浏览器，换账号要换环境 |
| 无人值守 | 定时到点自动拉起浏览器，跑完自动收尾 | 需手动打开课程页面 |
| 手机操作 | 远程控制台，手机随时看进度、选课、签到 | 无 |
| 签到 | 超星签到助手，自动检测 + 自动签到 | 无 |
| 占用 | 需要运行桌面程序 | 只要浏览器 |
| 功能 | 支持智慧树全功能操作 | 由于浏览器扩展限制，仅支持部分功能 |

### 桌面端核心功能

- **浏览器多开**：每个实例使用独立的缓存与登录环境，互不干扰，多账号可同时刷课
- **内置扩展**：首次启动自动释放内置扩展并注入每一个实例，随版本自动覆盖升级，无需手动安装
- **自动登录**：支持智慧树学校登录（学校 + 学号 + 密码）与手机密码登录，滑块验证码本地 OCR 识别
- **定时任务**：按实例配置每日定时，到点自动启动浏览器并执行「自动刷课 + 启动时脚本」；默认只在开始后 10 分钟内执行，错过就跳过当天，也可以改成当天任意时刻打开就补跑
- **远程控制台**：手机浏览器扫码接入，随时查看截图、切换标签页、选课、签到
- **超星签到助手**：自动检测签到活动并自动签到，支持手机远程签到
- **本地加密**：所有配置经 AES-256-GCM 加密落盘，密钥保存在系统密钥链，数据不离开本机

### 下载与安装

安装包随 Release 一起发布；Linux 推荐 AppImage，免安装直接运行。

- [GitCode Releases](https://gitcode.com/honghutech/honghueasystudy/releases)（国内推荐）
- [GitHub Releases](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/releases)

## 超星签到助手

桌面端内置的独立签到模块，解决「上课时人不在、签到错过就没了」的问题。

- **多账号管理**：手机号 + 密码登录超星，可保存多个账号分别监听
- **自动检测**：轮询签到活动，并额外监听超星 IM 群聊消息，老师一发签到通知就能立刻响应
- **自动签到**：默认关闭，开启后检测到活动直接签到；关闭时只提醒、不代签，手动签到不受影响
- **六种签到类型**：普通、拍照、二维码、手势、位置、签到码
- **位置签到**：内置地图选点，按 BD-09 / GCJ-02 / WGS-84 换算坐标，可配置多个备用地址，超出范围自动换点重试
- **拍照签到**：本地选择图片上传
- **远程签到**：在手机远程控制台上完成检测与签到，人在外面也能签


## 远程控制

桌面端开启「远程控制」后，可用手机扫码或访问指定链接打开一个适配移动端的控制台，把电脑上的浏览器控制台装进手机里。

- **浏览器卡片**：启动 / 关闭实例、查看实时截图、切换标签页、直接打开课程链接
- **自动执行**：编辑并触发刷课方案与定时方案，查看下一次执行时间
- **签到**：查看账号状态、检测活动、一键签到

## 浏览器扩展

如果只想在现有浏览器里用脚本，装扩展即可。

### 方式一：商店安装

- Edge 商店：[鸿鹄易学 - Microsoft Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/ocidllankdjkcieeefhgmgnkppcbdfhh)

### 方式二：手动安装

1. 在 Release 发行版中找到最新的版本并下载 `extension.zip`
2. 解压缩 zip
3. 打开浏览器扩展管理页（Chrome：`chrome://extensions`，Edge：`edge://extensions`）
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压缩的 `extension` 目录



## 开发

```bash
pnpm install        # 安装依赖
pnpm build:ext      # 构建浏览器扩展，产物在 extension/
pnpm build:desktop  # 构建桌面端（会先构建扩展再打包桌面端）
```

桌面端源码位于 `honghueasystudy_desktop/`，也可以单独开发调试：

```bash
pnpm -C honghueasystudy_desktop dev        # 主进程 + 渲染端 + 页面热更新
pnpm -C honghueasystudy_desktop dev:web    # 只调渲染端
```

## 相关链接

- 官网：https://easystudy.honghutech.eu.org
- 鸿鹄科技官网：https://honghutech.eu.org
- GitCode 仓库：https://gitcode.com/honghutech/honghueasystudy
- GitHub 仓库：https://github.com/HONGHUTECHNOLOGY/honghueasystudy

## License

MIT
