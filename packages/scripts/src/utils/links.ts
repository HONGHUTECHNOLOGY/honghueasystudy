/**
 * 官方站点与源码仓库地址
 *
 * 扩展首页、桌面端、更新提示都要展示这些入口，集中一处避免多处硬编码后漂移
 * （历史上官网地址曾在 app.ts、更新脚本、桌面端各处分别写死）。
 */

/** 官网：下载页、更新日志、使用文档 */
export const OFFICIAL_SITE = 'https://easystudy.honghutech.eu.org';

/** GitHub 主仓库：源码、Issue 反馈、版本记录 */
export const GITHUB_REPO = 'https://github.com/HONGHUTECHNOLOGY/honghueasystudy';

/** GitCode 镜像仓库：境内访问与发布包下载 */
export const GITCODE_REPO = 'https://gitcode.com/honghutech/honghueasystudy';
