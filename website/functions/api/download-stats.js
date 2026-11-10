/**
 * GET /api/download-stats —— 官网下载量同源代理（Cloudflare Pages Function）
 * ---------------------------------------------------------------
 * 为什么需要它：
 *   api.github.com 在国内经常不可达 / 被限流，浏览器直连必然失败；
 *   改成由 Cloudflare 边缘去取，访客只访问自己站点的域名，不再依赖本地网络。
 *
 * 返回（只包含成功取到的字段，JSON.stringify 会自动丢掉取不到的）：
 *   { "github": 802, "gitcode": 2257, "total": 3059, "updatedAt": "2026-11-10T03:00:00.000Z" }
 *
 * 缓存：
 *   · 边缘 Cache API 保留 30 分钟，其中 10 分钟内直接复用，超过则重取；
 *   · 上游全挂时若有旧值就返回旧值（响应头 X-Download-Stats: stale）；
 *   · 连旧值都没有才返回 502，前端会自动退回浏览器直连。
 *
 * 可选环境变量（Pages 项目 → Settings → Environment variables）：
 *   GITHUB_TOKEN  —— 配了就用鉴权请求，限额从 60 次/小时提升到 5000 次/小时。
 *                    不配也能用（本函数已做 10 分钟级缓存，正常远低于限额）。
 */

const GITHUB_REPO = 'HONGHUTECHNOLOGY/honghueasystudy';
const GITCODE_REPO = 'honghutech/honghueasystudy';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const GITCODE_API = `https://api.gitcode.com/api/v5/repos/${GITCODE_REPO}/download_statistics`;

/* 合成出来的 Cache API 键，不需要真实存在 */
const CACHE_KEY = 'https://download-stats.honghutech.internal/v1';
const CACHE_TTL = 30 * 60;          // 边缘最多保留 30 分钟（秒）
const FRESH_TTL = 10 * 60 * 1000;   // 10 分钟内视为新鲜，直接复用
const MAX_PAGES = 5;
const TIMEOUT = 7000;

const UA = 'honghueasystudy-website (+https://easystudy.honghutech.eu.org)';

export async function onRequestGet(context) {
  const env = (context && context.env) || {};

  const cached = await readCache();
  if (cached && Date.now() - Number(cached.cachedAt || 0) < FRESH_TTL) {
    return reply(cached, 200, 60, 'hit');
  }

  /* 两个来源并行取，各自失败互不影响 */
  const [github, gitcode] = await Promise.all([
    fetchGithub(env).catch(() => undefined),
    fetchGitcode().catch(() => undefined),
  ]);

  const gotSomething = typeof github === 'number' || typeof gitcode === 'number';
  if (!gotSomething) {
    if (cached) return reply(cached, 200, 60, 'stale');
    return json({ error: 'upstream unavailable' }, 502, 0, 'error');
  }

  const data = {
    /* 这一轮没取到的来源沿用旧值，避免已显示的数字突然消失 */
    github: typeof github === 'number' ? github : cached && cached.github,
    gitcode: typeof gitcode === 'number' ? gitcode : cached && cached.gitcode,
    cachedAt: Date.now(),
    updatedAt: new Date().toISOString(),
  };
  if (typeof data.github === 'number' && typeof data.gitcode === 'number') {
    data.total = data.github + data.gitcode;
  }

  await writeCache(data);
  return reply(data, 200, 60, 'fresh');
}

/* ---------------- 数据源 ---------------- */

function githubHeaders(env) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': UA,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = (env && env.GITHUB_TOKEN) || '';
  if (token) headers.Authorization = 'Bearer ' + token;
  return headers;
}

async function fetchGithub(env) {
  const headers = githubHeaders(env);
  let sum = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const list = await getJson(`${GITHUB_API}?per_page=100&page=${page}`, headers);
    if (!Array.isArray(list)) throw new Error('github: bad payload');
    for (const release of list) {
      const assets = (release && release.assets) || [];
      for (const asset of assets) {
        sum += Number(asset && asset.download_count) || 0;
      }
    }
    /* 不足一页说明已经到底；超过 MAX_PAGES 的极少见，忽略可接受 */
    if (list.length < 100) break;
  }
  return sum;
}

async function fetchGitcode() {
  const data = await getJson(GITCODE_API, { Accept: 'application/json', 'User-Agent': UA });
  const n = Number(data && data.download_statistics_history_total);
  if (!Number.isFinite(n) || n < 0) throw new Error('gitcode: bad payload');
  return n;
}

async function getJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- 缓存 ---------------- */

async function readCache() {
  /*
   * 本地 `wrangler pages dev` 没有 caches.default，这里兜一层，
   * 拿不到缓存就当没有，不影响功能，只是每次都会回源。
   */
  if (typeof caches === 'undefined' || !caches.default) return null;
  try {
    const res = await caches.default.match(new Request(CACHE_KEY));
    if (!res) return null;
    const data = await res.json();
    return data && typeof data === 'object' ? data : null;
  } catch (e) {
    return null;
  }
}

async function writeCache(data) {
  if (typeof caches === 'undefined' || !caches.default) return;
  try {
    await caches.default.put(
      new Request(CACHE_KEY),
      new Response(JSON.stringify(data), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          /* 缓存时长以这里为准，与返回给浏览器的 max-age 无关 */
          'cache-control': `public, max-age=${CACHE_TTL}`,
        },
      })
    );
  } catch (e) {
    /* 缓存写失败不影响本次返回 */
  }
}

/* ---------------- 响应 ---------------- */

function reply(data, status, maxAge, state) {
  return json(
    {
      github: data.github,
      gitcode: data.gitcode,
      total: data.total,
      updatedAt: data.updatedAt,
    },
    status,
    maxAge,
    state
  );
}

function json(body, status, maxAge, state) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': maxAge > 0 ? `public, max-age=${maxAge}` : 'no-store',
      'x-download-stats': state || 'miss',
      'access-control-allow-origin': '*',
    },
  });
}
