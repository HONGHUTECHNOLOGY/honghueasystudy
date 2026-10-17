<div align="center">

<img src="icon/icon.png" width="124" height="124">

# 鸿鹄易学

> 支持超星学习通、智慧树、职教云、雨课堂等主流网课的自动学习与作业辅助，内置 AI 答题

</div>

## 简介

鸿鹄易学提供浏览器扩展与桌面端两种使用方式，帮助大学生高效完成网课学习与作业。支持超星学习通、智慧树、职教云、雨课堂、中国大学MOOC 等主流网课平台，内置 AI 答题能力。

## 功能

- 支持超星学习通、智慧树、职教云、雨课堂、中国大学MOOC 等网课平台
- 自动学习与作业辅助
- 内置 AI 答题（支持 OpenAI、DeepSeek、Anthropic 等大模型）
- 题库配置与在线搜题
- 题库缓存

## 浏览器扩展安装

### 方式一：商店安装

- Edge 商店：[鸿鹄易学 - Microsoft Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/ocidllankdjkcieeefhgmgnkppcbdfhh)

### 方式二：手动安装

1. 在 Release 发行版中找到最新的版本并下载 `extension.zip`
2. 解压缩 zip
3. 打开浏览器扩展管理页（Chrome：`chrome://extensions`，Edge：`edge://extensions`）
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压缩的`extension`目录

## 桌面端

鸿鹄易学桌面端是一款面向网课学习场景的浏览器自动化工具，适合需要多开浏览器、自动登录和集中管理任务的用户。

- **浏览器多开**：每个浏览器实例使用独立的缓存与登录环境，互不干扰
- **内置扩展**：启动浏览器时自动加载鸿鹄易学扩展，无需手动安装
- **自动登录**：支持智慧树学校登录和手机密码登录，并支持滑块验证码识别
- **自动化程序**：在桌面端统一配置自动学习、作业等任务
- **集中管理**：统一管理浏览器配置、缓存、书签和任务记录

> 桌面端安装包会随 Release 一起发布。下载后运行安装程序即可使用，安装过程中可以选择安装目录。Windows 安装包文件名为 `鸿鹄易学-<版本>-setup-win-x64.exe`。

- [GitCode Releases](https://gitcode.com/honghutech/honghueasystudy/releases)
- [GitHub Releases](https://github.com/HONGHUTECHNOLOGY/honghueasystudy/releases)

## 开发

```bash
npm install        # 安装依赖
npm run build:ext  # 构建浏览器扩展
```

构建产物位于 `extension/` 目录。

## 相关链接

- GitCode 仓库：https://gitcode.com/honghutech/honghueasystudy
- GitHub 仓库：https://github.com/HONGHUTECHNOLOGY/honghueasystudy

## License

MIT
