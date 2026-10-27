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
- `versions`：软件版本列表，桌面端 `packages/app/src/tasks/updater.ts` 读取它做版本比较。
  **不要手写**——链接或字段错一条，就等于那一版永远不会被检测到。用脚本生成：

```bash
# 1) 打就地更新包：产出 dist/update/app-<ver>.zip + .sha256 + update-meta.json
node scripts/pack-app-update.js

# 2) 上传到 GitHub Release（建议单独开一条桌面端版本线 tag: desktop-v<ver>，
#    不要和扩展的 release-please tag 混用；CI 也会自动产出同名 zip 并附在 Release 里）
gh release create desktop-v3.2.0 --title "桌面端 3.2.0" --notes "..." \
  honghueasystudy_desktop/packages/app/dist/update/app-3.2.0.zip

# 3) 写入清单（同时同步 ocs-app-infos.json 旧副本）
node scripts/write-update-manifest.js \
  --meta honghueasystudy_desktop/packages/app/dist/update/update-meta.json \
  --notes "feat: 支持点击版本号检查更新" --notes "fix: 修复更新失败导致无法启动"
```

字段含义：

| 字段 | 作用 |
| --- | --- |
| `tag` | 版本号，与 `app.getVersion()` 做 semver 比较（允许带 `v` 前缀） |
| `description` | 更新弹窗内按 新增 / 修复 / 其他 分组展示 |
| `url` | Windows 就地更新包（zip 根目录 = `resources/app` 的内容），**必须能直接下载** |
| `sha256` | 更新包校验值，下载后不一致立即中止，不改动现有安装 |
| `size` | 字节数，下载后做完整性复核 |
| `app_downloads` | mac / linux 打开对应链接手动安装（单字段无法区分 mac 双架构，一般指 Release 页面） |

> 更新包约 22MB（解压后 58MB），**超过 Cloudflare Pages 单文件 25MB 限制**，
> 只能放 GitHub Release 或对象存储；官网只托管这份 JSON 清单。
>
> `url` 指向的 zip 由 `scripts/pack-app-update.js` 生成，根目录必须是
> `package.json` / `lib/` / `node_modules/` / `public/` 这些 `resources/app` 里的内容，
> 外面不能再套一层目录——客户端是把整个 app 目录换掉。

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
