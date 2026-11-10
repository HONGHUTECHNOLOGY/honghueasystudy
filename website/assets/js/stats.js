/* ============================================================
   鸿鹄易学官网 · stats.js
   · 下载量统计：GitHub（Release 附件累计）+ GitCode，及两者合计
   · 数据口径与 README 徽章一致：
       GitHub  https://api.github.com/repos/.../releases 的 download_count 求和
       GitCode .../download_statistics 的 download_statistics_history_total
   · 优先走同源代理 /api/download-stats（Cloudflare Pages Function），
     由边缘去访问 GitHub / GitCode；代理不存在或失败时才退回浏览器直连。
   · 任一数据源不可达（被墙 / 限流 / 无 CORS）时只隐藏对应项，
     合计需要两边都拿到才显示；两边都失败则整块不出现。
   · 结果在 localStorage 缓存 10 分钟，避免每次访问都重复请求。
   ============================================================ */
(function () {
  'use strict';

  var root = document.querySelector('[data-dl-stats]');
  if (!root) return;

  /* 老浏览器没有 fetch / Promise 时直接不展示统计，不影响页面其他功能 */
  if (typeof window.fetch !== 'function' || typeof window.Promise !== 'function') return;

  var PROXY = '/api/download-stats';
  var GITHUB_RELEASES =
    'https://api.github.com/repos/HONGHUTECHNOLOGY/honghueasystudy/releases?per_page=100&page=';
  var GITCODE_STATS =
    'https://api.gitcode.com/api/v5/repos/honghutech/honghueasystudy/download_statistics';
  var CACHE_KEY = 'hhe-download-stats';
  var CACHE_TTL = 10 * 60 * 1000;
  var MAX_PAGES = 5;
  var TIMEOUT = 8000;

  var reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var nodes = {};
  ['github', 'gitcode', 'total'].forEach(function (key) {
    nodes[key] = {
      item: root.querySelector('[data-dl-stat-item="' + key + '"]'),
      value: root.querySelector('[data-dl-stat="' + key + '"]')
    };
  });

  var counts = {};   // github / gitcode / total，未拿到的键保持 undefined
  var painted = {};
  var revealed = false;

  /* Hero 区的小胶囊：拿不到完整累计数时保持隐藏 */
  var heroEl = document.querySelector('[data-dl-hero]');
  var heroValue = heroEl ? heroEl.querySelector('[data-dl-count="total"]') : null;
  var heroPainted = false;

  function format(n) {
    try {
      return Number(n).toLocaleString('en-US');
    } catch (e) {
      return String(n);
    }
  }

  function animate(el, target) {
    if (!el) return;
    if (reduceMotion) {
      el.textContent = format(target);
      return;
    }
    var duration = 1200;
    var start = null;
    var step = function (ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = format(Math.round(target * eased));
      if (p < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  function paint(key) {
    var node = nodes[key];
    if (!node || !node.item || !node.value) return;
    if (counts[key] === undefined || painted[key]) return;
    painted[key] = true;
    node.item.hidden = false;
    animate(node.value, counts[key]);
  }

  function paintHero() {
    if (!heroEl || !heroValue || heroPainted) return;
    if (counts.github === undefined || counts.gitcode === undefined) return;
    heroPainted = true;
    heroEl.hidden = false;
    animate(heroValue, counts.total);
  }

  function paintAll() {
    paint('github');
    paint('gitcode');
    /* 合计必须等两个来源都有了才显示，避免「半个总数」误导 */
    if (counts.github !== undefined && counts.gitcode !== undefined) paint('total');
    paintHero();
  }

  function show() {
    if (!revealed) {
      revealed = true;
      root.hidden = false;
      root.classList.add('is-ready');
    }
    paintAll();
  }

  function update(data, persist) {
    if (!data) return;
    if (typeof data.github === 'number' && isFinite(data.github) && data.github >= 0) {
      counts.github = data.github;
    }
    if (typeof data.gitcode === 'number' && isFinite(data.gitcode) && data.gitcode >= 0) {
      counts.gitcode = data.gitcode;
    }
    if (counts.github !== undefined && counts.gitcode !== undefined) {
      counts.total = counts.github + counts.gitcode;
    }
    if (counts.github === undefined && counts.gitcode === undefined) return;
    show();
    /* 读缓存时不要回写：否则每次访问都会把 TTL 续期，数字永远停在旧值 */
    if (persist !== false) writeCache();
  }

  function readCache() {
    try {
      var raw = window.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data.at !== 'number') return null;
      if (Date.now() - data.at > CACHE_TTL) return null;
      return data;
    } catch (e) {
      /* 隐私模式 / 禁用存储，忽略即可 */
      return null;
    }
  }

  function writeCache() {
    try {
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ at: Date.now(), github: counts.github, gitcode: counts.gitcode })
      );
    } catch (e) {
      /* 同上 */
    }
  }

  function getJSON(url) {
    var init = { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } };
    var timer = 0;
    if (typeof window.AbortController === 'function') {
      var controller = new window.AbortController();
      init.signal = controller.signal;
      timer = window.setTimeout(function () {
        controller.abort();
      }, TIMEOUT);
    }
    var done = function () {
      if (timer) window.clearTimeout(timer);
    };
    return window.fetch(url, init).then(
      function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }
    ).then(
      function (data) {
        done();
        return data;
      },
      function (err) {
        done();
        throw err;
      }
    );
  }

  function fetchGithub(page, sum) {
    page = page || 1;
    sum = sum || 0;
    return getJSON(GITHUB_RELEASES + page).then(function (list) {
      if (!Array.isArray(list)) throw new Error('bad payload');
      for (var i = 0; i < list.length; i++) {
        var assets = list[i].assets || [];
        for (var j = 0; j < assets.length; j++) {
          sum += Number(assets[j].download_count) || 0;
        }
      }
      return list.length === 100 && page < MAX_PAGES ? fetchGithub(page + 1, sum) : sum;
    });
  }

  function fetchGitcode() {
    return getJSON(GITCODE_STATS).then(function (data) {
      var n = Number(data && data.download_statistics_history_total);
      if (!isFinite(n) || n < 0) throw new Error('bad payload');
      return n;
    });
  }

  var cached = readCache();
  if (cached) update(cached, false);

  /* 缓存里缺哪个来源就补哪个 */
  function missing() {
    var list = [];
    if (counts.github === undefined) list.push('github');
    if (counts.gitcode === undefined) list.push('gitcode');
    return list;
  }

  /* 浏览器直连（本地预览没有 Functions、或代理整体挂掉时的兜底） */
  function fetchDirect(key) {
    var req = key === 'github' ? fetchGithub() : fetchGitcode();
    req.then(
      function (n) {
        var data = {};
        data[key] = n;
        update(data);
      },
      function () {
        /* 单个来源不可达时保持隐藏，静默失败 */
      }
    );
  }

  function fetchProxy() {
    return getJSON(PROXY).then(function (data) {
      var out = {};
      if (data && typeof data.github === 'number' && isFinite(data.github) && data.github >= 0) {
        out.github = data.github;
      }
      if (data && typeof data.gitcode === 'number' && isFinite(data.gitcode) && data.gitcode >= 0) {
        out.gitcode = data.gitcode;
      }
      if (out.github === undefined && out.gitcode === undefined) throw new Error('empty payload');
      return out;
    });
  }

  if (missing().length) {
    fetchProxy().then(
      function (data) {
        update(data);
        /* 代理只拿到一半时，缺的那个再试一次直连 */
        missing().forEach(fetchDirect);
      },
      function () {
        missing().forEach(fetchDirect);
      }
    );
  }
})();
