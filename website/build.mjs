#!/usr/bin/env node
/**
 * Cloudflare Pages 专用入口（Root directory = website 时使用）
 * ---------------------------------------------------------------
 * 把 Pages 项目的 Root directory 设为 website 后，构建命令写成：
 *     node build.mjs
 * 输出目录写成：
 *     dist-web
 *
 * 好处：website/ 下没有 package.json / lockfile，Cloudflare 会**跳过依赖安装**，
 * 官网部署不再受整仓 pnpm 版本、lockfile 格式、patchedDependencies 的影响。
 *
 * 本文件只是转调仓库根的 scripts/build-website.js，产物落在 website/dist-web。
 * 本地开发仍可用 `pnpm build:web` / `pnpm dev:web`（从仓库根执行）。
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); // 仓库/website
const root = path.resolve(here, '..');                     // 仓库根
const builder = path.join(root, 'scripts', 'build-website.js');
const out = path.join(here, 'dist-web');

// 允许透传额外参数（比如 --serve --port 8080）
const passthrough = process.argv.slice(2);
const args = passthrough.length ? passthrough : ['--out', out];
if (passthrough.length && !passthrough.includes('--out')) args.push('--out', out);

execFileSync(process.execPath, [builder, ...args], { stdio: 'inherit' });
