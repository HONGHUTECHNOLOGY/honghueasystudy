# 桌面端配置信息（honghu-app-infos / honghu-app-langs（附旧文件名副本供旧版客户端过渡））

本目录是桌面端远程配置的**本地托管副本**，随官网（Cloudflare Pages，根目录 = website）
一起部署，访问地址：

- https://easystudy.honghutech.eu.org/api/honghu-app-infos.json
- https://easystudy.honghutech.eu.org/api/honghu-app-langs.json

桌面端已改为从上述地址读取（`packages/common/src/api.ts` 与
`packages/web/src/utils/index.ts`），不再依赖上游 CDN。

## 字段说明（honghu-app-infos.json）

- `notes`：给维护者看的字段说明。
- `banners` / `notify`：首页横幅与通知，发布时按需填写。
- `bookmark`：导航页网址（网课网站合集）。
- `resourceGroups`：
  - `extensions`：脚本管理器扩展包（scriptcat / tampermonkey），zip 仍取自上游 CDN 的静态文件。
  - `apps`：OCR 模块压缩包。**注意**：约 52MB，超出 Cloudflare Pages 单文件 25MB 限制，
    保留上游 CDN 地址。新版桌面端已在打包时内置 OCR（`scripts/ocr.install.js` 下载，
    electron-builder extraResources 带入安装包，`init.ocr.ts` 优先解压内置包），
    此条目仅供旧版客户端手动安装使用。
  - `userjs`：官方用户脚本，指向 `https://easystudy.honghutech.eu.org/honghueasystudy.user.js`。
    **发布前需把构建产物放到网站根目录**（本地执行 `pnpm build` 生成 `dist/honghu.user.js`，
    重命名为 `honghueasystudy.user.js` 放入 `website/` 即可随官网部署）。
- `versions`：软件版本列表。发布新版时在此追加：

```json
{
  "tag": "x.y.z",
  "description": { "feat": ["..."], "fix": ["..."], "other": [] },
  "url": "https://easystudy.honghutech.eu.org/app/download/x.y.z/app-x.y.z.zip",
  "app_downloads": {
    "win32": "https://easystudy.honghutech.eu.org/app/download/x.y.z/honghueasystudy-x.y.z-setup-win-x64.exe",
    "darwin": "https://easystudy.honghutech.eu.org/app/download/x.y.z/honghueasystudy-x.y.z-setup-mac-arm64.dmg",
    "linux": "https://easystudy.honghutech.eu.org/app/download/x.y.z/honghueasystudy-x.y.z-setup-linux-x64.AppImage"
  }
}
```

> 注意：`url` 指向的更新包是**桌面端主进程就地解压用的 app.zip**，仅 Windows 生效；
> mac / linux 桌面端检测到新版本后会打开 `app_downloads` 里的安装包链接手动安装。

## 维护

- 改完 JSON 后重新部署官网即可生效（桌面端每次启动带时间戳请求，无缓存问题）。
- `ocr.zip` / `ocr-darwin.zip` 若要彻底自托管，需换用支持大文件的存储（如 R2/COS），
  并同步修改 `honghueasystudy_desktop/packages/app/src/tasks/init.ocr.ts` 里的 URL。

## 其他托管文件

- `honghu-version.json`：导航页配置界面（vendor 副本）的版本检查数据，固定返回低版本号以禁用上游更新提示。
- `honghu-changelog.md`：配置界面展示的更新日志，与仓库根 CHANGELOG.md 保持同步。
- `imgs/`：设置引导教程截图（原上游 CDN 资源，已本地化）。
- `resources/font/`：雨课堂字体映射表（原上游 CDN 资源，已本地化）。
- `ocs-app-infos.json` / `ocs-app-langs.json`：旧文件名副本，内容与 honghu-* 完全一致，供尚未升级的旧版桌面端客户端使用，确认无旧版在线后可删除。
