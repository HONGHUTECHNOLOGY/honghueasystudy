/* ============================================================
   鸿鹄易学官网 · counters.js
   数字滚动计数 + Hero 视差（rAF 节流，仅桌面端）
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 数字滚动（easeOutExpo） ---------- */
  var counters = document.querySelectorAll('.counter[data-count]');

  var animateCounter = function (el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (isNaN(target)) return;
    var duration = 1200;
    var start = null;
    var step = function (ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if (counters.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      counters.forEach(function (el) {
        el.textContent = el.getAttribute('data-count');
      });
    } else {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            cio.unobserve(entry.target);
          }
        });
      }, { threshold: 0.6 });
      counters.forEach(function (el) { cio.observe(el); });
    }
  }

  /* ---------- Hero / 桌面端视差（rAF 节流，移动端与减弱动态关闭） ----------
     以所在 section 为参照计算位移，避免跨区段累积出巨大的偏移；
     位移写入 --parallax-y，与 mockup 的 3D transform 合成，不引起重排。 */
  var parallaxEls = document.querySelectorAll('[data-parallax]');
  var isDesktop = function () { return window.innerWidth > 900; };

  if (parallaxEls.length && !reduceMotion) {
    var ticking = false;
    var applyParallax = function () {
      ticking = false;
      if (!isDesktop()) {
        parallaxEls.forEach(function (el) { el.style.setProperty('--parallax-y', '0px'); });
        return;
      }
      parallaxEls.forEach(function (el) {
        var factor = parseFloat(el.getAttribute('data-parallax')) || 0.1;
        var section = el.closest('.hero, .section');
        var top = section ? section.getBoundingClientRect().top : 0;
        var shift = Math.max(-36, Math.min(36, top * factor * 0.35));
        el.style.setProperty('--parallax-y', shift.toFixed(1) + 'px');
      });
    };
    window.addEventListener('scroll', function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(applyParallax);
      }
    }, { passive: true });
    window.addEventListener('resize', applyParallax);
    applyParallax();
  }
})();
