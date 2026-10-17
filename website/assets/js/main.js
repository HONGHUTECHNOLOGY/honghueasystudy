/* ============================================================
   鸿鹄易学官网 · main.js
   Lenis 惯性平滑滚动（含降级）/ 锚点滚动 / 导航滚动态 / 移动端菜单
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nav = document.getElementById('nav');
  var navLinks = document.getElementById('navLinks');
  var burger = document.getElementById('navBurger');
  var docEl = document.documentElement;

  /* ---------- Lenis 惯性平滑滚动（未加载时静默降级为原生滚动） ---------- */
  var lenis = null;
  if (!reduceMotion && typeof window.Lenis !== 'undefined') {
    try {
      lenis = new window.Lenis({ lerp: 0.1, wheelMultiplier: 1 });
      var rafLoop = function (time) {
        lenis.raf(time);
        requestAnimationFrame(rafLoop);
      };
      requestAnimationFrame(rafLoop);
    } catch (e) {
      lenis = null;
    }
  }
  /* 与 interactions.js 共享实例（回到顶部等交互保持同一套滚动语言） */
  window.__lenis = lenis;

  /* ---------- 移动端菜单 ---------- */
  function lockPage(lock) {
    if (lenis) {
      if (lock) lenis.stop();
      else lenis.start();
    }
    docEl.classList.toggle('menu-open', lock);
  }

  function setMenuInert(inert) {
    if (inert) navLinks.setAttribute('inert', '');
    else navLinks.removeAttribute('inert');
  }

  function closeMenu() {
    navLinks.classList.remove('open');
    burger.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', '打开菜单');
    setMenuInert(window.innerWidth <= 767);
    lockPage(false);
  }

  /* ---------- 锚点平滑滚动 ---------- */
  document.querySelectorAll('a[data-scroll]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href');
      if (href && href.charAt(0) === '#') {
        var target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        if (lenis) {
          /* 落点由目标元素的 scroll-margin-top 统一控制，无需再叠加偏移 */
          lenis.scrollTo(target, { duration: 1.2 });
        } else {
          target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
        closeMenu();
      }
    });
  });

  /* ---------- 导航栏滚动态（毛玻璃） ---------- */
  function onScroll() {
    if (window.scrollY > 12) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 汉堡菜单 ---------- */
  burger.addEventListener('click', function () {
    var open = navLinks.classList.toggle('open');
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    setMenuInert(!open && window.innerWidth <= 767);
    lockPage(open);
  });

  /* 初始状态：移动端菜单关闭时移出焦点顺序 */
  setMenuInert(window.innerWidth <= 767);

  /* Esc 关闭菜单（键盘无障碍） */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) {
      closeMenu();
      burger.focus();
    }
  });

  window.addEventListener('resize', function () {
    if (window.innerWidth > 767) {
      closeMenu();
    } else if (!navLinks.classList.contains('open')) {
      setMenuInert(true);
    }
  });
})();
