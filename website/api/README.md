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
  **不要手写**——链接或字段错一条，就等于那一版永远不会被检测到。

### 发版流程（一键）

正常发版只需要在 GitHub Actions 点一下 **Release PR → Run workflow**：

```
1. Actions → Release PR → Run workflow
   release-please 生成 Release PR：根 package.json（插件/扩展版本）与
   桌面端 packages/app/package.json 由 extra-files 一起 bump 到同一版本号；
   PR 创建后自动设置 auto-merge（仓库需开启 Allow auto-merge）。
2. PR 合入（自动）→ release-tag.yml 创建 Release + tag v5.x.x
   → 派发 desktop-build：三平台安装包 + extension.zip + 旧版 zip
   → 上传 GitHub Release → 同步 GitCode 镜像（需 Secrets 配置 GITCODE_TOKEN）
3. update-manifest job：从 artifacts 取 update-meta.json 与全部安装包，
   跑 write-update-manifest.js --verify（探链 fail-closed），
   把 versions[] 条目直接提交推回 main → CF Pages 自动重建 → 客户端检测到更新
```

**一次性前置条件**：仓库 Secrets 配 `GITCODE_TOKEN`（不配则 GitCode 镜像为空，
update-manifest 探链失败、本版不推更新）；Settings → General 勾选 Allow auto-merge；
main 分支保护需允许 GITHUB_TOKEN 推送。

**版本线已统一**：桌面端版本号跟随插件版本（同一 Release PR 内一起 bump），
清单 `versions[].tag` 与 Release tag 数值相同（仅差 `v` 前缀），
不再需要单独 bump 桌面版本。

### 手动兜底（CI 失败时）

```bash
# 桌面端打包会同时产出安装包（dist/*.exe）与就地更新包（dist/update/app-<ver>.zip）
# 前者是主路径（新版客户端下载安装包装），后者只留给 <=3.2.0 的旧客户端
node scripts/pack-app-update.js    # 仅重打 zip；完整打包见 pnpm build:app

# 上传到扩展那一条 Release（tag = 插件版本 v5.x.x）——
# 扩展包、安装包、旧版 zip 是同一批产物、挂在同一个 Release 下，不要另开 tag
gh release upload v5.2.0 \
  honghueasystudy_desktop/packages/app/dist/鸿鹄易学-5.2.0-setup-win-x64.exe \
  honghueasystudy_desktop/packages/app/dist/update/app-5.2.0.zip
#    若该 Release 还不存在：gh release create v5.2.0 --title "..." --notes "..."

# 同步到 GitCode（国内加速源）
GITCODE_TOKEN=xxx node scripts/publish-to-gitcode.js --tag v5.2.0 \
  --file honghueasystudy_desktop/packages/app/dist/鸿鹄易学-5.2.0-setup-win-x64.exe \
  --file honghueasystudy_desktop/packages/app/dist/update/app-5.2.0.zip

# 写入清单（同时同步 ocs-app-infos.json 旧副本）并提交推送
#    会自动在 dist 下找安装包、算 sha256/size，写进 installers.win32；
#    mac/linux 产物不在本机时，自动从该 tag 的 Release 附件列表补（只补 name/size，不下载文件）；
#    链路校验默认开启：任一源不可用就拒绝写入（--no-verify 可跳过，但会有风险警告）
node scripts/write-update-manifest.js \
  --meta honghueasystudy_desktop/packages/app/dist/update/update-meta.json \
  --notes "feat: 支持点击版本号检查更新" --notes "fix: 修复更新失败导致无法启动"
git add website/api/ && git commit -m "chore(release): 同步更新清单" && git push
```

> 跨平台产物在 CI 的 artifacts 里、而 Release 还没建时，手动跑第 3 步会拿不到 mac/linux
> 条目（日志有 `读取 Release <tag> 附件失败`）。此时先等 CI 发布完，或把各平台产物下载到
> 同一目录后用 `--artifacts <目录>` 指定；`--no-remote-assets` 可跳过联网查询。

### 防「检测到更新但下不了包」

清单一旦上线就等于对用户承诺「这个版本可下载」。带病写入的后果是客户端弹了更新、
下载却全源失败，用户没有自助修复手段。所以分三层兜：

| 层 | 机制 | 触发时机 |
| --- | --- | --- |
| 写入 | `--verify` **默认开启**，本次条目任一源 Range GET 不通即拒绝写入 | 每次跑脚本 |
| 写入 | 复查已有条目，某平台全部源失效 → 告警；`--prune-dead` 则从 `versions[]` 移除 | 每次跑脚本 |
| 运行 | `.github/workflows/manifest-health.yml` 每天验结构 + 探链 + 比对线上与仓库 | 每日 05:20（UTC+8） |
| 客户端 | 所有源都失败时弹窗给「打开下载页」，不把用户卡在「继续使用」 | 下载失败 |

注意 `versions[]` 会一直累加，而附件可能被删（Release 清理、GitCode 没传成功、改名）。
客户端只要发现比自身更高的条目就会提示更新，所以老条目死了同样要处理 —— 这就是
`--prune-dead` 与每日体检存在的理由。

`--no-verify` 只在「确要先上线清单、稍后补附件」时用：此时用户可能已经检测到更新但下载失败，
下一个版本才能覆盖。不要习惯性加它。

### 跨平台：mac / linux 只给直链，不自动安装

| | Windows | macOS | Linux |
| --- | --- | --- | --- |
| 检测新版本 | ✅ | ✅ | ✅ |
| 下载 | 客户端多源下载 + 校验 sha256 | 打开系统浏览器下载 | 打开系统浏览器下载 |
| 安装 | `setup.exe /S` 静默覆盖 | 用户拖进「应用程序」 | 替换 AppImage / dpkg / rpm |
| 清单字段 | `installers.win32`（对象） | `installers.darwin`（数组） | `installers.linux`（数组） |

不自动装的原因：

- mac 打包配置是 `"identity": null`（未签名未公证），替换 `.app` 后 Gatekeeper 会报
  「无法验证开发者」直接拒开；Electron 官方 `autoUpdater` 也要求已签名。
- linux 的 deb/rpm 走包管理器、装到 `/opt` 需要 root，无法静默；AppImage 虽然能自替换，
  但当前不做（`app.getPath('exe')` 指向 `/tmp/.mount_*` 挂载点，需改用 `process.env.APPIMAGE`）。

客户端挑选规则（`app/src/utils/platform-installer.ts`）：

- 架构必须一致（arm64 / x64），对不上就退回 Release 页面，绝不把错架构的包给用户
- linux 优先 AppImage（自包含、免 root），没有时按 `/etc/os-release` 在 deb / rpm 之间选
- 清单里没有对应条目时回退 `app_downloads[platform]`（Release 页面）

### 更新方式：下载安装包，静默覆盖安装

客户端（>= 3.2.1）在 Windows 上检测到新版本后的流程：

```
读 installers.win32 → 多源下载 setup.exe → 校验 sha256/大小
→ 弹「安装包已下载完成」→ 用户点「立即安装」→ 关闭浏览器实例
→ setup.exe /S /D=<安装目录> → 应用退出 → 安装完成后需重新打开软件
```

`/S` 静默安装不会执行 NSIS 的 `runAfterFinish`，所以装完不会自动拉起应用。
为此待安装任务会落盘到 `%TEMP%/honghu-update/pending.json`：用户点了「稍后安装」或装完没重启，
下次启动能直接恢复、提示安装，不用重下 320MB。

为什么用安装包而不是替换 `resources/app`：

| 内容 | 就地替换 app 目录 | 安装包 |
| --- | --- | --- |
| 主进程 / 渲染端 / node_modules | ✅ | ✅ |
| Electron 运行时与原生模块 ABI | ❌ 升级大版本会启动失败 | ✅ |
| 内置扩展 `resources/extension` | ❌ **扩展更新送不到** | ✅ |
| `bin/chrome`、`bin/cloudflared`、`bin/ocr` | ❌ | ✅ |
| 体积 | 22MB | 320MB |

几个实现约束（改客户端时不要破坏）：

- 安装目录优先取**注册表**卸载项的记录，`dirname(app.getPath('exe'))` 只作兜底：
  用户可能从解压副本 / `win-unpacked` / 装了新版却没重启的旧目录启动，按 exe 目录覆盖会装错位置。
  `InstallLocation` 实测为空，所以从 `DisplayIcon` / `UninstallString` 反推，并校验目录存在且内含主程序 exe。
- NSIS 的 `/D=` 必须是最后一个参数且**路径不加引号**，所以子进程要开
  `windowsVerbatimArguments: true`，否则 Node 会自动加引号、装出一个带引号的目录。
- 安装器必须以 detached 方式启动，并在启动后再 `app.quit()`；应用以管理员（High 完整性）运行时，
  没退出就装会因文件占用失败。
- 候选目录若落在打包目录（路径含 `win-unpacked`）或临时目录，一律判为不可信，回退注册表。
- 清单缺 `installers.win32`、或所有候选目录都不可用时，不要静默失败，退回「打开下载页手动安装」。

### 提示更新前会先探测下载源

清单是 `push main` 就上线的，而 Release 附件要等 CI 传完（324MB 安装包 + GitCode 镜像同步），
中间天然存在窗口期。所以客户端在弹更新窗之前，会先对该平台**实际会用的**下载地址做一次可达性探测：

```
读 installers.win32 / darwin / linux → 按平台+架构挑出真实地址
→ 并发 Range GET（每源 6s 超时）→ 任一可达才弹窗
→ 全部不可达：本次静默跳过，下次启动重新检测
```

这带来两个运维上的好处：

- **清单先上线、附件后到位不会骚扰用户**：探测不过就不弹，不会出现「检测到更新但点了下不了」。
- **不需要为了时序去压着清单不发**，也不用关 CF 的自动构建。

注意实现细节：探测必须用**带 Range 的 GET**，GitCode 附件对 `HEAD` 直接返回 401（实测），
用 `HEAD` 会把唯一可用的源误判成死链，导致永远不提示更新。
另外服务器可能忽略 Range 返回 200 + 整包，所以拿到响应头就要断开流，不能读下去。

用户手动点版本号检查更新时，探测不过会明确提示「新版本 vX 已发布，但下载服务器当前无法连接」，
而不是误报「已是最新版本」（自动检测则完全静默）。

`url` / `urls`（zip）保留的唯一原因是兼容 <= 3.2.0 的已装用户——那份代码只会走就地更新。
等这批用户升级完，可以移除。

**两个 tag 的分工**（自版本线统一后，两者数值相同，仅差 `v` 前缀）：

| 用途 | 取值 | 例子 | 参与版本比较？ |
| --- | --- | --- | --- |
| 清单 `versions[].tag` | 桌面版本 `meta.version` | `5.2.0` | ✅ 与 `app.getVersion()` 比大小 |
| Release tag | 根 `package.json` 版本 | `v5.2.0` | ❌ 只用来拼下载地址 |

历史背景：曾经桌面版本（3.x）与插件版本（5.x）是两条独立的线，混用会导致
「检测到更新 → 装完还是旧版本 → 下次启动又提示」的死循环。现在 Release PR 通过
`extra-files` 把桌面 `package.json` 与根 `package.json` bump 到同一版本，
两线合一，但「清单 tag 参与比较、Release tag 只拼地址」的分工不变。
桌面端真要脱离插件单独发版时，才显式传 `--tag desktop-v<x.y.z>`。

字段含义：

| 字段 | 作用 |
| --- | --- |
| `tag` | **桌面版本**，与 `app.getVersion()` 做 semver 比较（允许带 `v` 前缀） |
| `description` | 更新弹窗内按 新增 / 修复 / 其他 分组展示 |
| `installers.win32` | Windows 安装包：多源地址、sha256、大小、文件名 |
| `installers.darwin` | mac dmg 数组，每条含 `arch`（`arm64`/`x64`）、`ext`、`urls`、`name` |
| `installers.linux` | linux 安装包数组，`arch` + `ext`（`AppImage`/`deb`/`rpm`）区分 |
| `url` / `urls` | **旧版 zip 的就地更新地址**，仅 <=3.2.0 客户端使用 |
| `sha256` / `size` | 旧版 zip 的校验值与大小 |
| `app_downloads` | 各平台兜底下载页；清单里没有对应平台安装包时才用 |

### GitCode 镜像（国内加速）

GitHub Release 在国内经常只有几十 KB/s 甚至直接超时，所以客户端优先走 GitCode：

- 仓库 `honghutech/honghueasystudy`，附件地址格式与 GitHub 完全一致，只是域名不同：

  ```
  https://gitcode.com/honghutech/honghueasystudy/releases/download/<tag>/app-<version>.zip
  ```

  实测该地址 302 跳转到 `file-cdn.gitcode.com`，**免登录可下载、支持 Range**（用 HEAD 会返回 401，
  探测和下载都必须用带 Range 的 GET）。

- 发布时在 GitCode 的**同一个 Release**（tag 同样是 `v5.x.x`）下上传**同一个 zip**。
  两个源必须是字节一致的文件——否则 sha256 校验失败，客户端会切回 GitHub 重新下载。
  上传有两条路，二者结果一致：
  - **CI 自动**（推荐）：在仓库 Secrets 里配 `GITCODE_TOKEN`，`desktop-build.yml` 的
    `upload-release` 会用 `scripts/publish-to-gitcode.js` 把**同一批 artifacts**
    （更新包 + 扩展包）同步过去，不再二次打包。未配置 token 时该步骤整步跳过，
    GitHub 发布不受影响；配置了则失败即红，避免清单指向不存在的镜像附件。
  - **本地手动**：`GITCODE_TOKEN=xxx node scripts/publish-to-gitcode.js --tag v5.2.0 --file <zip>`
    （tag 用插件版本线；可重复 `--file`；`--dry-run` 只看计划，`--force` 覆盖同名附件）。
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
