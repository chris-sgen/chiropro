/* =============================================================================
 * ChiroPro — shared site behaviour
 * Loaded by every page. Each block is a no-op when its markup is absent, so one
 * file serves the homepage and every inner page without per-page branching.
 * Motion picks per verticals/chiropro.md §4.bundles.C.motion.
 * ========================================================================== */
(function () {
  'use strict';

  /* ── MOTION #24 Split-text reveal — hero headline only, per-word rise ──── */
  var headline = document.querySelector('[data-split-text]');
  if (headline) {
    var out = [];
    (function walk(node, sink) {
      Array.prototype.forEach.call(node.childNodes, function (n) {
        if (n.nodeType === 3) {
          n.textContent.split(/(\s+)/).forEach(function (t) {
            if (!t.trim()) { sink.push(document.createTextNode(t)); return; }
            var mask = document.createElement('span'); mask.className = 'split-mask';
            var word = document.createElement('span'); word.className = 'split-word'; word.textContent = t;
            mask.appendChild(word); sink.push(mask);
          });
        } else if (n.nodeType === 1) {
          var clone = n.cloneNode(false), inner = [];
          walk(n, inner);
          inner.forEach(function (c) { clone.appendChild(c); });
          sink.push(clone);
        }
      });
    })(headline, out);
    headline.textContent = '';
    out.forEach(function (n) { headline.appendChild(n); });
    headline.querySelectorAll('.split-word').forEach(function (w, i) { w.style.setProperty('--w', i); });
  }

  /* ── Drawer · NAV-PATTERNS #3 ─────────────────────────────────────────── */
  var burger = document.querySelector('[data-hamburger]');
  var drawer = document.querySelector('[data-drawer]');
  var backdrop = document.querySelector('[data-drawer-backdrop]');
  var closeBtn = document.querySelector('[data-drawer-close]');
  if (burger && drawer) {
    var setDrawer = function (open) {
      burger.setAttribute('aria-expanded', String(open));
      drawer.setAttribute('aria-hidden', String(!open));
      if (backdrop) backdrop.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (open) { var first = drawer.querySelector('a'); if (first) first.focus(); }
      else { burger.focus(); }
    };
    burger.addEventListener('click', function () {
      setDrawer(burger.getAttribute('aria-expanded') !== 'true');
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { setDrawer(false); });
    if (backdrop) backdrop.addEventListener('click', function () { setDrawer(false); });
    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setDrawer(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') setDrawer(false);
    });
    // Crossing up past the drawer breakpoint while it is open removes the
    // hamburger from the layout, so nothing can close it: the drawer stays over
    // the desktop nav and body stays scroll-locked. Close it on the transition.
    var wide = matchMedia('(min-width: 961px)');
    var onWide = function (e) {
      if (e.matches && burger.getAttribute('aria-expanded') === 'true') setDrawer(false);
    };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  /* ── Sticky header shadow ─────────────────────────────────────────────── */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('is-stuck', window.scrollY > 12); };
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });
  }

  /* ── MOTION #29 Stagger-grid — index children, IO only as fallback ────── */
  document.querySelectorAll('.stagger').forEach(function (grid) {
    Array.prototype.forEach.call(grid.children, function (child, i) {
      if (!child.style.getPropertyValue('--i')) child.style.setProperty('--i', i);
    });
  });
  if (!CSS.supports('animation-timeline: view()')) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  } else {
    // Safety net for the scroll-driven path. A scroll timeline only reaches its
    // final keyframe if the element's animation-range actually resolves; when it
    // does not, the element is left faded or fully invisible FOREVER, including
    // after the user scrolls past. That shipped: card 4 of the first-visit grid
    // was invisible at 375 and cards 3+4 at 768. Captures never showed it because
    // they run with prefers-reduced-motion, which force-shows .reveal.
    // Once an element is genuinely on screen, hand it the finished state.
    var lock = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && e.intersectionRatio >= 0.2) {
          e.target.classList.add('is-revealed');
          lock.unobserve(e.target);
        }
      });
    }, { threshold: [0.2, 0.5], rootMargin: '0px 0px -5% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { lock.observe(el); });
  }

  /* ── Slider — arrows + progress over a native scroll-snap track ───────── */
  /* The track scrolls on its own; everything here is enhancement. The buttons
     live up in .slider-head beside the heading rather than inside .slider, so
     they are resolved through the closest section instead of by descent. */
  document.querySelectorAll('[data-slider]').forEach(function (slider) {
    var track = slider.querySelector('.slider-track');
    if (!track) return;
    var scope = slider.closest('section') || document;
    var prev = scope.querySelector('[data-slider-prev]');
    var next = scope.querySelector('[data-slider-next]');
    var rail = slider.querySelector('[data-slider-rail]');

    // Measure the step from the first two children rather than assuming the gap
    // token: grid-auto-columns changes at two breakpoints and the gap changes at
    // three, so any hard-coded number is wrong on some viewport.
    var step = function () {
      var kids = track.children;
      if (kids.length > 1) return Math.round(kids[1].getBoundingClientRect().left - kids[0].getBoundingClientRect().left);
      return kids.length ? Math.round(kids[0].getBoundingClientRect().width) : track.clientWidth;
    };
    var maxScroll = function () { return track.scrollWidth - track.clientWidth; };

    var sync = function () {
      var max = maxScroll();
      var x = track.scrollLeft;
      // 1px of slack: fractional layout widths mean scrollLeft rarely lands
      // exactly on 0 or on max, which would leave a button permanently enabled.
      if (prev) prev.disabled = x <= 1;
      if (next) next.disabled = x >= max - 1;
      if (rail) {
        var seen = max > 0 ? (x + track.clientWidth) / track.scrollWidth : 1;
        rail.style.width = Math.min(100, Math.round(seen * 100)) + '%';
      }
    };

    if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step() }); });
    if (next) next.addEventListener('click', function () { track.scrollBy({ left: step() }); });
    // `behavior` is deliberately omitted so the scroll inherits the CSS
    // scroll-behavior, which the reduced-motion block already flips to auto.

    track.addEventListener('scroll', function () {
      if (sync.pending) return;
      sync.pending = requestAnimationFrame(function () { sync.pending = 0; sync(); });
    }, { passive: true });
    addEventListener('resize', sync, { passive: true });
    sync();
  });

  /* ── MOTION #35 Inverted-cursor — image frames only, pointer devices ──── */
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('.img-frame').forEach(function (frame) {
      frame.addEventListener('mousemove', function (e) {
        var r = frame.getBoundingClientRect();
        frame.style.setProperty('--cx', (e.clientX - r.left) + 'px');
        frame.style.setProperty('--cy', (e.clientY - r.top) + 'px');
      });
    });
  }

  /* ── MOTION #39 Accordion — grid-template-rows 0fr → 1fr ──────────────── */
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var trigger = item.querySelector('.faq-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', function () {
      var open = item.getAttribute('data-open') === 'true';
      item.setAttribute('data-open', String(!open));
      trigger.setAttribute('aria-expanded', String(!open));
    });
  });

  /* ── Booking widget — slot selection + submit confirmation ────────────── */
  var slots = document.querySelectorAll('.slot');
  slots.forEach(function (s) {
    s.addEventListener('click', function () {
      slots.forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
      s.setAttribute('aria-pressed', 'true');
    });
  });

  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    var btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    // Capture the label ONCE at bind time. Reading it per-submit meant a second
    // submit inside the 3.2s window snapshotted the already-mutated text, and the
    // stale timer then restored that mutated text permanently — the button ended
    // up stuck reading "Pick a time above to continue".
    var originalLabel = btn.textContent;
    var resetTimer = null;

    // Button text alone is not an accessible status message. A polite live region
    // announces both the validation error and the confirmation to screen readers.
    var status = document.createElement('p');
    status.className = 'form-note';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    btn.insertAdjacentElement('afterend', status);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var picked = form.querySelector('.slot[aria-pressed="true"]');
      var needsSlot = form.querySelector('.slots');
      var message;
      if (needsSlot && !picked) {
        message = 'Pick a time above to continue';
        btn.style.background = '';
      } else {
        message = picked
          ? 'Requested for ' + picked.textContent.trim() + ' ✓'
          : form.getAttribute('data-confirm');
        btn.style.background = 'var(--ds-success)';
      }
      btn.textContent = message;
      status.textContent = message;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () {
        btn.textContent = originalLabel;
        btn.style.background = '';
        status.textContent = '';
      }, 3200);
    });
  });
})();
