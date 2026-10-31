/* ============================================================
   鸿鹄易学官网 · downloads.js
   · 下载源切换：默认 GitCode，失败自动切到 GitHub
   · 记住用户手动选择的下载源
   · 按访客系统标记「推荐」的安装包
   ------------------------------------------------------------
   所有下载链接在 HTML 里已经写成 GitCode 直链（无 JS 也能用），
   data-github 存放对应的 GitHub 直链。本脚本只负责换 href。
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'hhe-download-source';
  var SOURCE_LABEL = { gitcode: 'GitCode', github: 'GitHub' };
  var links = Array.prototype.slice.call(document.querySelectorAll('a[data-dl]'));
  if (!links.length) return;

  var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-dl-source]'));
  var note = document.querySelector('[data-dl-source-note]');

  /* 把初始 href（GitCode）与 data-github 收进内存，后面来回切换都靠它们 */
  links.forEach(function (link) {
    link.__gitcode = link.getAttribute('href');
    link.__github = link.getAttribute('data-github') || '';
    /* 外部链接统一新标签打开，避免用户下载到一半把官网关掉 */
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener');
  });

  function readSaved() {
    try {
      var saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'gitcode' || saved === 'github') return saved;
    } catch (e) {
      /* 隐私模式下 localStorage 会抛错，忽略即可 */
    }
    return '';
  }

  function save(source) {
    try {
      window.localStorage.setItem(STORAGE_KEY, source);
    } catch (e) {
      /* 同上 */
    }
  }

  function setNote(text) {
    if (note) note.textContent = text;
  }

  function apply(source) {
    links.forEach(function (link) {
      var url = source === 'github' ? link.__github : link.__gitcode;
      if (url) link.setAttribute('href', url);
    });
    buttons.forEach(function (btn) {
      var active = btn.getAttribute('data-dl-source') === source;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function choose(source, persist) {
    apply(source);
    if (persist) {
      save(source);
      setNote('当前下载源：' + SOURCE_LABEL[source]);
    }
  }

  var saved = readSaved();
  apply(saved || 'gitcode');
  if (saved) setNote('当前下载源：' + SOURCE_LABEL[saved]);

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      choose(btn.getAttribute('data-dl-source'), true);
    });
  });

  /* ---------------------------------------------------------
     探测 GitCode 是否可达
     no-cors + HEAD 只用来判断「网络能不能到」：DNS 被污染、
     域名被墙、服务挂了都会 reject；能收到响应（哪怕是 4xx）
     都算可达。拿不到具体状态码是浏览器的限制，够用。
     --------------------------------------------------------- */
  function probeGitCode(done) {
    var sample = links[0].__gitcode;
    if (!sample || typeof window.fetch !== 'function' || typeof window.AbortController !== 'function') {
      done(true);
      return;
    }

    var controller = new window.AbortController();
    var timer = window.setTimeout(function () {
      controller.abort();
    }, 3500);

    window
      .fetch(sample, {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal
      })
      .then(function () {
        done(true);
      })
      .catch(function () {
        done(false);
      })
      .then(function () {
        window.clearTimeout(timer);
      });
  }

  /* 用户手动选过就以用户为准，不再自动改回来 */
  if (!saved) {
    probeGitCode(function (reachable) {
      if (reachable) return;
      apply('github');
      setNote('GitCode 暂时访问不畅，已自动切换 GitHub');
    });
  }

  /* ---------------------------------------------------------
     按系统标记推荐项（纯提示，不改变链接）
     --------------------------------------------------------- */
  function detectPlatform() {
    var ua = navigator.userAgent || '';
    var platform = '';
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      platform = navigator.userAgentData.platform;
    } else {
      platform = navigator.platform || '';
    }
    platform = String(platform).toLowerCase();

    var isMac = /mac/.test(platform) || /mac os x/.test(ua);
    var isWin = /win/.test(platform) || /windows/.test(ua);
    var isLinux = /linux|x11/.test(platform) || (/linux/.test(ua) && !/android/.test(ua));
    var isArm = /arm64|aarch64/.test(ua);

    if (isWin) return 'win-x64';
    /* Apple Silicon 的 Safari/Chrome UA 仍是 Intel 字样，没有额外信息时按 arm64 处理，
       下面再用 userAgentData 的真实架构纠正 Intel Mac */
    if (isMac) return 'mac-arm64';
    if (isLinux) return isArm ? 'linux-arm64' : 'linux-x64';
    return '';
  }

  var platformItems = Array.prototype.slice.call(document.querySelectorAll('[data-platform]'));

  function mark(platform) {
    if (!platform) return;
    platformItems.forEach(function (item) {
      item.classList.toggle('is-current', item.getAttribute('data-platform') === platform);
    });
  }

  mark(detectPlatform());

  /* Chromium 系可以拿到真实架构，用来纠正 Apple Silicon（UA 里看不出） */
  if (navigator.userAgentData && typeof navigator.userAgentData.getHighEntropyValues === 'function') {
    navigator.userAgentData
      .getHighEntropyValues(['architecture'])
      .then(function (values) {
        var arch = String((values && values.architecture) || '').toLowerCase();
        if (!/arm|x64|x86/.test(arch)) return;
        var isArm = arch === 'arm';
        var current = '';
        if (/mac/.test(String(navigator.userAgentData.platform || '').toLowerCase())) {
          current = isArm ? 'mac-arm64' : 'mac-x64';
        } else if (/linux/.test(String(navigator.userAgentData.platform || '').toLowerCase())) {
          current = isArm ? 'linux-arm64' : 'linux-x64';
        }
        mark(current);
      })
      .catch(function () {
        /* 拿不到就算了，保留 UA 判断结果 */
      });
  }
})();
