/* ============================================================
   鸿鹄易学官网 · interactions.js
   与「精密光感」视觉语言配套的交互层：
   · 卡片指针光斑（spotlight）
   · mockup 3D 跟随倾斜 + 玻璃反光
   · 按钮磁吸
   · 导航阅读进度 / 深色区段自动换肤 / 滚动定位
   · 全站连续指针光效（固定光层，跨 section 自然衔接）
   · FAQ 互斥（旧浏览器回退）/ 回到顶部
   —— 全部遵循 prefers-reduced-motion 与精确指针检测，触屏不启用
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var canHover = finePointer && !reduceMotion;

  var docEl = document.documentElement;
  var nav = document.getElementById('nav');
  var navProgress = document.getElementById('navProgress');
  var toTop = document.getElementById('toTop');

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function closestElement(node, selector) {
    while (node && node.nodeType === 1) {
      if (node.matches && node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  /* ============================================================
     1. 卡片指针光斑
     ============================================================ */
  if (canHover) {
    var spotEls = document.querySelectorAll('.card, .wn-card, .sy-node, .faq-item');
    for (var s = 0; s < spotEls.length; s++) spotEls[s].classList.add('spot');

    var spotTarget = null;
    var spotEvent = null;
    var spotQueued = false;

    document.addEventListener(
      'pointermove',
      function (e) {
        var target = closestElement(e.target, '.spot');
        if (!target) {
          spotTarget = null;
          return;
        }
        spotTarget = target;
        spotEvent = e;
        if (spotQueued) return;
        spotQueued = true;
        requestAnimationFrame(function () {
          spotQueued = false;
          if (!spotTarget || !spotEvent) return;
          var rect = spotTarget.getBoundingClientRect();
          spotTarget.style.setProperty('--mx', (spotEvent.clientX - rect.left).toFixed(0) + 'px');
          spotTarget.style.setProperty('--my', (spotEvent.clientY - rect.top).toFixed(0) + 'px');
        });
      },
      { passive: true }
    );
  }

  /* ============================================================
     2. mockup 3D 跟随倾斜 + 反光位置
     ============================================================ */
  if (canHover) {
    var tiltEls = document.querySelectorAll('[data-tilt]');
    Array.prototype.forEach.call(tiltEls, function (el) {
      var max = parseFloat(el.getAttribute('data-tilt')) || 4;
      var queued = false;
      var latest = null;

      el.addEventListener('pointerenter', function () {
        el.classList.add('is-tilting');
      });

      el.addEventListener(
        'pointermove',
        function (e) {
          latest = e;
          if (queued) return;
          queued = true;
          requestAnimationFrame(function () {
            queued = false;
            if (!latest) return;
            var rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            var px = clamp((latest.clientX - rect.left) / rect.width, 0, 1);
            var py = clamp((latest.clientY - rect.top) / rect.height, 0, 1);
            el.style.setProperty('--tilt-x', ((0.5 - py) * max * 2).toFixed(2) + 'deg');
            el.style.setProperty('--tilt-y', ((px - 0.5) * max * 2).toFixed(2) + 'deg');
            el.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
            el.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
          });
        },
        { passive: true }
      );

      el.addEventListener('pointerleave', function () {
        el.classList.remove('is-tilting');
        latest = null;
        el.style.setProperty('--tilt-x', '0deg');
        el.style.setProperty('--tilt-y', '0deg');
      });
    });
  }

  /* ============================================================
     3. 按钮磁吸
     ============================================================ */
  if (canHover) {
    var magneticBtns = document.querySelectorAll('.btn');
    Array.prototype.forEach.call(magneticBtns, function (btn) {
      var queued = false;
      var latest = null;

      btn.addEventListener('pointerenter', function () {
        btn.classList.add('is-magnet');
      });

      btn.addEventListener(
        'pointermove',
        function (e) {
          latest = e;
          if (queued) return;
          queued = true;
          requestAnimationFrame(function () {
            queued = false;
            if (!latest) return;
            var rect = btn.getBoundingClientRect();
            var dx = latest.clientX - (rect.left + rect.width / 2);
            var dy = latest.clientY - (rect.top + rect.height / 2);
            btn.style.setProperty('--mx', clamp(dx * 0.16, -5, 5).toFixed(1) + 'px');
            btn.style.setProperty('--my', clamp(dy * 0.2, -4, 4).toFixed(1) + 'px');
          });
        },
        { passive: true }
      );

      btn.addEventListener('pointerleave', function () {
        btn.classList.remove('is-magnet');
        latest = null;
        btn.style.setProperty('--mx', '0px');
        btn.style.setProperty('--my', '0px');
      });
    });
  }

  /* ============================================================
     4. 导航：阅读进度 / 深色区段换肤 / 滚动定位
     ============================================================ */
  var darkSections = document.querySelectorAll('.section-dark');
  var navLinks = document.querySelectorAll('.nav-links a[href^="#"]:not(.nav-cta)');
  var spyTargets = [];

  Array.prototype.forEach.call(navLinks, function (link) {
    var href = link.getAttribute('href');
    if (!href || href.length < 2) return;
    var section = document.querySelector(href);
    if (section) spyTargets.push({ link: link, section: section });
  });

  var lastActive = null;
  var scrollQueued = false;

  function updateScrollUI() {
    scrollQueued = false;
    var y = window.pageYOffset || docEl.scrollTop || 0;
    var max = Math.max(1, docEl.scrollHeight - window.innerHeight);
    var progress = clamp(y / max, 0, 1);

    if (navProgress) {
      navProgress.style.setProperty('--p', progress.toFixed(4));
    }

    if (toTop) {
      toTop.style.setProperty('--p', (progress * 100).toFixed(1));
      toTop.classList.toggle('show', y > 680);
    }

    if (nav) {
      var line = 66;
      var isDark = false;
      for (var d = 0; d < darkSections.length; d++) {
        var darkRect = darkSections[d].getBoundingClientRect();
        if (darkRect.top < line && darkRect.bottom > line) {
          isDark = true;
          break;
        }
      }
      nav.classList.toggle('is-dark', isDark);
    }

    var threshold = window.innerHeight * 0.42;
    var active = null;
    var best = -Infinity;
    for (var i = 0; i < spyTargets.length; i++) {
      var rect = spyTargets[i].section.getBoundingClientRect();
      if (rect.top <= threshold && rect.bottom > threshold && rect.top > best) {
        best = rect.top;
        active = spyTargets[i].link;
      }
    }

    if (active !== lastActive) {
      Array.prototype.forEach.call(navLinks, function (link) {
        link.classList.remove('is-active');
        link.removeAttribute('aria-current');
      });
      if (active) {
        active.classList.add('is-active');
        active.setAttribute('aria-current', 'location');
      }
      lastActive = active;
    }
  }

  function queueScrollUI() {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(updateScrollUI);
  }

  window.addEventListener('scroll', queueScrollUI, { passive: true });
  window.addEventListener('resize', queueScrollUI);
  window.addEventListener('load', queueScrollUI);
  updateScrollUI();

  /* ============================================================
     5. 全站指针光效：固定光层，跨板块连续衔接
     ============================================================ */
  var cursorLight = document.querySelector('.cursor-light');
  if (!cursorLight) {
    cursorLight = document.createElement('div');
    cursorLight.className = 'cursor-light';
    cursorLight.setAttribute('aria-hidden', 'true');
    var orbBase = document.createElement('span');
    orbBase.className = 'cursor-light__orb';
    var orbDark = document.createElement('span');
    orbDark.className = 'cursor-light__orb cursor-light__orb--dark';
    cursorLight.appendChild(orbBase);
    cursorLight.appendChild(orbDark);
    document.body.appendChild(cursorLight);
  }

  if (canHover && cursorLight) {
    var glowX = window.innerWidth / 2;
    var glowY = window.innerHeight / 2;
    var glowActive = false;
    var glowQueued = false;

    var updateGlow = function () {
      glowQueued = false;
      if (!glowActive) return;
      cursorLight.style.setProperty('--gx', glowX.toFixed(1) + 'px');
      cursorLight.style.setProperty('--gy', glowY.toFixed(1) + 'px');

      var onDark = false;
      for (var d = 0; d < darkSections.length; d++) {
        var rect = darkSections[d].getBoundingClientRect();
        if (glowY >= rect.top && glowY <= rect.bottom) {
          onDark = true;
          break;
        }
      }
      cursorLight.classList.toggle('is-on-dark', onDark);
    };

    var queueGlow = function () {
      if (!glowActive || glowQueued) return;
      glowQueued = true;
      requestAnimationFrame(updateGlow);
    };

    document.addEventListener(
      'pointermove',
      function (e) {
        if (e.pointerType === 'touch') return;
        glowX = e.clientX;
        glowY = e.clientY;
        if (!glowActive) {
          glowActive = true;
          cursorLight.classList.add('is-visible');
          updateGlow();
        } else {
          queueGlow();
        }
      },
      { passive: true }
    );

    document.documentElement.addEventListener('pointerleave', function () {
      glowActive = false;
      cursorLight.classList.remove('is-visible');
    });

    window.addEventListener('blur', function () {
      glowActive = false;
      cursorLight.classList.remove('is-visible');
    });

    window.addEventListener(
      'scroll',
      function () {
        if (glowActive) queueGlow();
      },
      { passive: true }
    );
  }

  /* ============================================================
     6. FAQ 互斥：原生 name 之外的兜底
     ============================================================ */
  var faqItems = document.querySelectorAll('.faq-item');
  if (faqItems.length) {
    Array.prototype.forEach.call(faqItems, function (item) {
      item.addEventListener('toggle', function () {
        if (!item.open) return;
        Array.prototype.forEach.call(faqItems, function (other) {
          if (other !== item && other.open) other.open = false;
        });
      });
    });
  }

  /* ============================================================
     7. 回到顶部（优先走 Lenis，保持滚动语言一致）
     ============================================================ */
  if (toTop) {
    toTop.addEventListener('click', function () {
      var lenis = window.__lenis;
      if (lenis && typeof lenis.scrollTo === 'function') {
        lenis.scrollTo(0, { duration: 1.1 });
      } else {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    });
  }
})();
