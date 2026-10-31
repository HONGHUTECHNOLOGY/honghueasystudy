#!/usr/bin/env node
/**
 * 静态站点构建 / 版本注入
 * ---------------------------------------------------------------
 * 把 website/ 复制到输出目录，并把 HTML/CSS/JS 中的占位符替换成仓库里的真实值，
 * 让 Cloudflare Pages 每次部署都显示当前版本号，无需手工改 HTML。
 *
 * 支持的占位符：
 *   {{VERSION}}          扩展 / 油猴脚本版本  <- 根 package.json 的 version
 *   {{DESKTOP_VERSION}}  桌面版版本           <- honghueasystudy_desktop/packages/app/package.json
 *                                               （release-please 与扩展版本一起升级；外层
 *                                                honghueasystudy_desktop/package.json 是旧的工作区
 *                                                版本，早已停更，不能再拿它当桌面版本）
 *   {{TAG}}              Release tag           <- v + VERSION
 *   {{GITCODE_RELEASE}}  GitCode 附件基址      <- https://gitcode.com/<owner>/<repo>/releases/download/<tag>
 *   {{GITHUB_RELEASE}}   GitHub 附件基址       <- https://github.com/<owner>/<repo>/releases/download/<tag>
 *   {{COMMIT}}           短提交号             <- CF_PAGES_COMMIT_SHA / GITHUB_SHA / git rev-parse
 *   {{BUILD_DATE}}       构建日期 (YYYY-MM-DD)
 *
 * 用法：
 *   node scripts/build-website.js                     # 输出到 dist-web/
 *   node scripts/build-website.js --out some/dir      # 自定义输出目录
 *   node scripts/build-website.js --serve             # 构建并起本地预览 http://127.0.0.1:4321
 *   node scripts/build-website.js --serve --port 8080
 *
 * Cloudflare Pages 配置：
 *   Build command    : node scripts/build-website.js
 *   Output directory : dist-web
 *
 * 零第三方依赖，只需要 Node >= 16.7。
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'website');

// 会被做占位符替换的文本文件后缀（其余文件原样复制）
const TEXT_EXT = new Set([
  '.html', '.htm', '.css', '.js', '.mjs', '.json', '.xml', '.txt', '.svg', '.webmanifest', '.map', '.woff2',
]);
// 复制时跳过的目录 / 文件
const SKIP = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'dist-web', 'build.mjs']);

function parseArgs(argv) {
  const out = { out: 'dist-web', serve: false, port: 4321 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--serve') out.serve = true;
    else if (a === '--port') out.port = Number(argv[++i]) || out.port;
    else if (a === '-h' || a === '--help') out.help = true;
  }
  return out;
}

function readVersion(relPkgPath) {
  const p = path.join(ROOT, relPkgPath);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')).version || null;
  } catch (e) {
    return null;
  }
}

function readCommit() {
  const fromEnv = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch (e) {
    return 'unknown';
  }
}

function today() {
  // 用 UTC+8 的日期，避免 Cloudflare 构建机时区导致日期偏一天
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let files = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    if (entry.name === '.DS_Store') continue;
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) {
      files += copyTree(s, d);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
      files++;
    }
  }
  return files;
}

const TOKEN_RE = /\{\{\s*([A-Z0-9_]+)\s*\}\}/g;

function inject(dir, vars) {
  const stats = { scanned: 0, changed: 0, hits: 0, unknown: new Map() };
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) { walk(p); continue; }
      if (!entry.isFile()) continue;
      if (!TEXT_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      stats.scanned++;
      const raw = fs.readFileSync(p, 'utf8');
      if (!raw.includes('{{')) continue;
      const next = raw.replace(TOKEN_RE, (whole, key) => {
        if (Object.prototype.hasOwnProperty.call(vars, key)) {
          stats.hits++;
          return vars[key];
        }
        stats.unknown.set(key, (stats.unknown.get(key) || 0) + 1);
        return whole;
      });
      if (next !== raw) {
        fs.writeFileSync(p, next);
        stats.changed++;
      }
    }
  };
  walk(dir);
  return stats;
}

function serve(dir, port) {
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8',
  };
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(dir, rel);
    if (!file.startsWith(dir)) { res.writeHead(403).end('forbidden'); return; }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('404 ' + rel);
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(buf);
    });
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  本地预览: http://127.0.0.1:${port}\n  Ctrl+C 结束\n`);
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    return;
  }
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`[web] 找不到源目录: ${SRC_DIR}`);
    process.exit(1);
  }

  const version = readVersion('package.json');
  if (!version) {
    console.error('[web] 无法从根 package.json 读取 version');
    process.exit(1);
  }
  /**
   * 桌面版本必须读 packages/app/package.json。
   *
   * release-please 的 extra-files 只同步这一份（和根版本一起升），
   * 外层 honghueasystudy_desktop/package.json 停留在 3.x 的工作区版本，仅作兜底。
   */
  const desktopVersion =
    readVersion(path.join('honghueasystudy_desktop', 'packages', 'app', 'package.json')) ||
    readVersion(path.join('honghueasystudy_desktop', 'package.json')) ||
    version;
  const tag = `v${version}`;
  const vars = {
    VERSION: version,
    DESKTOP_VERSION: desktopVersion,
    TAG: tag,
    GITCODE_RELEASE: `https://gitcode.com/honghutech/honghueasystudy/releases/download/${tag}`,
    GITHUB_RELEASE: `https://github.com/HONGHUTECHNOLOGY/honghueasystudy/releases/download/${tag}`,
    COMMIT: readCommit(),
    BUILD_DATE: today(),
  };

  const outDir = path.resolve(ROOT, args.out);
  fs.rmSync(outDir, { recursive: true, force: true });
  const copied = copyTree(SRC_DIR, outDir);
  const stats = inject(outDir, vars);

  const manifest = {
    version: vars.VERSION,
    desktopVersion: vars.DESKTOP_VERSION,
    tag: vars.TAG,
    commit: vars.COMMIT,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`[web] 源目录      ${path.relative(ROOT, SRC_DIR)}`);
  console.log(`[web] 输出目录    ${path.relative(ROOT, outDir)}  (${copied} 个文件)`);
  console.log(`[web] 版本        v${vars.VERSION}  桌面版 v${vars.DESKTOP_VERSION}  tag ${vars.TAG}  commit ${vars.COMMIT}`);
  console.log(`[web] 扫描文本    ${stats.scanned} 个，改写 ${stats.changed} 个，替换 ${stats.hits} 处`);

  if (stats.unknown.size) {
    const list = [...stats.unknown.entries()].map(([k, n]) => `{{${k}}}×${n}`).join(', ');
    console.warn(`[web] ⚠ 未识别的占位符: ${list}`);
  }

  if (args.serve) serve(outDir, args.port);
}

main();
