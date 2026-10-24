# easy-us（鸿鹄易学本地化副本）

本目录是 npm 包 `easy-us@0.0.66` 的本地固定副本，作为 pnpm workspace 包被
`packages/core`、`packages/scripts`（`workspace:*`）和桌面端
`honghueasystudy_desktop/packages/web`（`file:` 链接，仅类型）引用，
不再从 npm registry 安装，也不再需要 `pnpm patch`。

## 来源与改动

- 上游：https://github.com/enncy/easy-us （MIT License），npm `easy-us@0.0.66`
- 本副本 = 上游发布产物（lib/dist/assets）+ 原 `patches/easy-us@0.0.66.patch` 的品牌改动已固化：
  - `lib/elements/modal.js`、`dist/index.min.js`：弹窗署名改为 `弹窗来自: 鸿鹄易学`（替换上游的旧署名）
- 仅改可见文案；导出 API、模块结构、CDN 接口等内部标识保持与上游一致。

## 维护约定

- 升级上游版本时，重新拷贝 `lib/dist/assets` 并重放品牌改动，同时更新本说明。
- 运行时外部依赖仅 `lodash`（debounce）与 `events`，`semver`/`string-similarity` 保留以与上游元数据一致。
- 固化日期：2026-10-24
