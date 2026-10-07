<div align="center">

<img src="icon/icon.png" width="124" height="124">

# 鸿鹄易学

> 支持超星、智慧树、职教云、雨课堂等网课的学习与作业辅助，内置 AI 答题

</div>

## 简介

鸿鹄易学是一款浏览器扩展，帮助大学生高效完成网课学习与作业。支持超星、智慧树、职教云、雨课堂、中国大学MOOC 等主流网课平台，内置 AI 答题能力。

## 功能

- 支持超星、智慧树、职教云、雨课堂、中国大学MOOC 等网课平台
- 自动学习与作业辅助
- 内置 AI 答题（支持 OpenAI、DeepSeek、Anthropic 等大模型）
- 题库配置与在线搜题
- 题库缓存

## 安装

### 方式一：商店安装

- Edge 商店：[鸿鹄易学 - Microsoft Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/ocidllankdjkcieeefhgmgnkppcbdfhh)

### 方式二：手动安装

1. 在release发行版中找到最新的版本并下载`扩展.zip`
2. 解压缩zip
3. 打开浏览器扩展管理页（Chrome：`chrome://extensions`，Edge：`edge://extensions`）
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」，选择解压缩的`extension`目录

## 开发

```bash
npm install        # 安装依赖
npm run build:ext  # 构建浏览器扩展
```

构建产物位于 `extension/` 目录。

## 相关链接

- 仓库：https://gitcode.com/honghutech/honghueasystudy

## License

MIT
