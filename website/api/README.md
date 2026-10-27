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

# 2.5) 同步到 GitCode（国内加速源；CI 配了 GITCODE_TOKEN 时这一步已自动完成，可跳过）
GITCODE_TOKEN=xxx node scripts/publish-to-gitcode.js --tag desktop-v3.2.0 \
  --file honghueasystudy_desktop/packages/app/dist/update/app-3.2.0.zip

# 3) 写入清单（同时同步 ocs-app-infos.json 旧副本）
#    默认生成 GitCode 优先、GitHub 兜底的双源；--verify 会在写之前逐个探测链接是否可用
node scripts/write-update-manifest.js \
  --meta honghueasystudy_desktop/packages/app/dist/update/update-meta.json \
  --notes "feat: 支持点击版本号检查更新" --notes "fix: 修复更新失败导致无法启动" \
  --verify
```

字段含义：

| 字段 | 作用 |
| --- | --- |
| `tag` | 版本号，与 `app.getVersion()` 做 semver 比较（允许带 `v` 前缀） |
| `description` | 更新弹窗内按 新增 / 修复 / 其他 分组展示 |
| `url` | 首选下载地址，同时也是没有 `urls` 时唯一可用的地址 |
| `urls` | 多源地址，按优先级排列；客户端逐个尝试，失败自动切下一个 |
| `sha256` | 更新包校验值，下载后不一致立即中止，不改动现有安装 |
| `size` | 字节数，下载后做完整性复核 |
| `app_downloads` | mac / linux 打开对应链接手动安装（单字段无法区分 mac 双架构，一般指 Release 页面） |

### GitCode 镜像（国内加速）

GitHub Release 在国内经常只有几十 KB/s 甚至直接超时，所以客户端优先走 GitCode：

- 仓库 `honghutech/honghueasystudy`，附件地址格式与 GitHub 完全一致，只是域名不同：

  ```
  https://gitcode.com/honghutech/honghueasystudy/releases/download/<tag>/app-<version>.zip
  ```

  实测该地址 302 跳转到 `file-cdn.gitcode.com`，**免登录可下载、支持 Range**（用 HEAD 会返回 401，
  探测和下载都必须用带 Range 的 GET）。

- 发布时在 GitCode 建**同名 tag**（如 `desktop-v3.2.1`）并上传**同一个 zip**。
  两个源必须是字节一致的文件——否则 sha256 校验失败，客户端会切回 GitHub 重新下载。
  上传有两条路，二者结果一致：
  - **CI 自动**（推荐）：在仓库 Secrets 里配 `GITCODE_TOKEN`，`desktop-build.yml` 的
    `upload-release` 会用 `scripts/publish-to-gitcode.js` 把**同一批 artifacts**
    （更新包 + 扩展包）同步过去，不再二次打包。未配置 token 时该步骤整步跳过，
    GitHub 发布不受影响；配置了则失败即红，避免清单指向不存在的镜像附件。
  - **本地手动**：`GITCODE_TOKEN=xxx node scripts/publish-to-gitcode.js --tag desktop-v3.2.1 --file <zip>`
    （可重复 `--file`；`--dry-run` 只看计划，`--force` 覆盖同名附件）。
  - 机制与 GitHub 不同：先 `GET .../releases/{tag}/upload_url` 拿华为 OBS 预签名地址，
    再 `PUT` 原始字节并原样透传返回的 `x-obs-*` 头；上传完自动用 Range GET 校验可下载。
- 客户端行为：按 `urls` 顺序尝试，任一源连不上、20 秒收不到数据、大小或 sha256 不符都会立刻切下一个；
  全部失败才报错，并在错误信息里列出每个源失败的原因。
- 代理策略：`gitcode.com` 系列**强制直连**（走代理反而绕远/被拦），GitHub 沿用环境代理设置。
- 想跳过镜像只用 GitHub：`--no-mirror`；想追加自建源：`--mirror <url>`（可多次）。

> 更新包约 22MB（解压后 58MB），**超过 Cloudflare Pages 单文件 25MB 限制**，
> 只能放 GitHub Release / GitCode Release / 对象存储；官网只托管这份 JSON 清单。
>
> `url` / `urls` 指向的 zip 由 `scripts/pack-app-update.js` 生成，根目录必须是
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
