/* תחקיר — motion.
 *
 * The moving parts of the interface, kept apart from the screens so that none
 * of them can reach a record: an ambient glow behind every screen, screens
 * that materialize when you arrive, a ripple where a finger lands, the
 * greeting decoding like a display warming up, the flight card tilting with
 * the phone, and a jet crossing the screen when a flight is saved.
 *
 * Everything here is decoration layered on real HTML. Text is never replaced:
 * the decode draws its scramble through a pseudo-element, so what a screen
 * reader (or a test) reads is always the real text. Reduced motion turns all
 * of it off, and the calm theme keeps only what explains a change.
 *
 * Read-only: nothing here touches storage.
 */
(function (g) {
  'use strict';

  var doc = g.document, root = doc.documentElement;
  var motionQuery = g.matchMedia ? g.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /* The level chosen in הגדרות: `auto` follows the phone's reduce-motion
     setting, `full` and `off` override it, `reduced` keeps short transitions
     and drops the decoration, like the calm theme. */
  function level() { return root.getAttribute('data-motion') || 'auto'; }
  function reduced() {
    var l = level();
    if (l === 'off') return true;
    if (l === 'full') return false;
    return !!(motionQuery && motionQuery.matches);
  }
  function calm() { return root.getAttribute('data-theme') === 'calm'; }
  function still() { return reduced() || calm() || level() === 'reduced'; }

  /* ------------------------------------------------ screens materializing */

  var enterTimer = null;
  /* Only arrivals animate. A screen that redraws in place (a goal added, a
     filter changed) must not replay its entrance under the user's finger. */
  function enter(view) {
    if (!view) return;
    view.classList.add('is-entering');
    clearTimeout(enterTimer);
    enterTimer = setTimeout(function () { view.classList.remove('is-entering'); }, 2400);
  }
  function entering(view) { return !!view && view.classList.contains('is-entering') && !reduced(); }

  /* ---------------------------------------------------------- the ripple */

  var RIPPLE = '.btn, .qa__b, .frow, .item, .weekbtn, .opt, .pilot-focus, .draft-row, .waitmore__r, .flightcard__course, .key, .tab__ic, .pilot-avatar, .course';
  function ripple(e) {
    if (reduced() || (e.button && e.button !== 0)) return;
    var t = e.target && e.target.closest ? e.target.closest('.tab') : null;
    var host = t ? t.querySelector('.tab__ic') : (e.target && e.target.closest ? e.target.closest(RIPPLE) : null);
    if (!host || host.disabled) return;
    var r = host.getBoundingClientRect();
    if (!r.width) return;
    var size = Math.hypot(r.width, r.height) * 2;
    var wrap = doc.createElement('span');
    wrap.className = 'fx-ripple';
    wrap.setAttribute('aria-hidden', 'true');
    var dot = doc.createElement('i');
    dot.style.width = dot.style.height = size + 'px';
    dot.style.left = (e.clientX - r.left - size / 2) + 'px';
    dot.style.top = (e.clientY - r.top - size / 2) + 'px';
    wrap.appendChild(dot);
    host.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 700);
  }

  /* ------------------------------------------------------ decoding text */

  var decoded = false;
  var GLYPHS = { he: 'אבגדהוזחטיכלמנסעפצקרשת', la: 'ABCDEFGHJKLMNPRSTUVWXYZ', nu: '0123456789' };
  /* Once per launch: the greeting resolves out of noise, reading order first. */
  function decode(el) {
    if (!el || decoded || still()) return;
    decoded = true;
    var text = el.textContent, start = 0, dur = 950;
    function pick(c) {
      var set = /[֐-׿]/.test(c) ? GLYPHS.he : /[A-Za-z]/.test(c) ? GLYPHS.la : /\d/.test(c) ? GLYPHS.nu : null;
      return set ? set.charAt(Math.floor(Math.random() * set.length)) : c;
    }
    el.classList.add('is-decoding');
    function frame(now) {
      if (!start) start = now;
      if (!el.isConnected) return;
      var p = Math.min(1, (now - start) / dur), out = '';
      for (var i = 0; i < text.length; i++) out += i / text.length < p * 1.25 - .2 ? text.charAt(i) : pick(text.charAt(i));
      el.setAttribute('data-scramble', out);
      if (p < 1) g.requestAnimationFrame(frame);
      else { el.classList.remove('is-decoding'); el.removeAttribute('data-scramble'); }
    }
    g.requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------ tilting cards */

  var tilt = { el: null, id: null }, orient = { base: null, b: 0, gm: 0, raf: 0 };
  function setTilt(el, rx, ry) {
    el.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    el.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    el.style.setProperty('--gx', (50 + ry * 7).toFixed(1) + '%');
    el.style.setProperty('--gy', (50 - rx * 7).toFixed(1) + '%');
  }
  function pointerTilt(e) {
    if (tilt.el === null || e.pointerId !== tilt.id) return;
    var r = tilt.el.getBoundingClientRect();
    var x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    setTilt(tilt.el, Math.max(-1, Math.min(1, -y * 2)) * 6, Math.max(-1, Math.min(1, x * 2)) * 7);
  }
  function endTilt() {
    if (!tilt.el) return;
    tilt.el.classList.remove('is-tilting');
    setTilt(tilt.el, 0, 0);
    tilt.el = null; tilt.id = null;
  }
  /* The phone's own tilt moves the light across the card. Android Chrome
     reports orientation freely; iOS asks permission, so there it simply
     stays still. The resting angle drifts with the hand, so the card is flat
     however it is held. */
  function onOrient(e) {
    if (e.beta == null || e.gamma == null || still() || tilt.el) return;
    if (!orient.base) orient.base = { b: e.beta, gm: e.gamma };
    orient.base.b += (e.beta - orient.base.b) * .02;
    orient.base.gm += (e.gamma - orient.base.gm) * .02;
    orient.b = Math.max(-14, Math.min(14, e.beta - orient.base.b));
    orient.gm = Math.max(-14, Math.min(14, e.gamma - orient.base.gm));
    if (orient.raf) return;
    orient.raf = g.requestAnimationFrame(function () {
      orient.raf = 0;
      var cards = doc.querySelectorAll('[data-tilt]');
      for (var i = 0; i < cards.length; i++) setTilt(cards[i], -orient.b * .35, orient.gm * .4);
    });
  }

  /* --------------------------------------------------------- the fly-by */

  /* A flight saved gets a pass overhead: an F-35 crossing right to left with
     its contrail and a ring where it breaks the sound barrier. Purely
     visual, never in the way of a tap. */
  function flyby() {
    if (reduced() || !g.Visuals) return;
    var el = doc.createElement('div');
    el.className = 'flyby';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="flyby__trail"></span><span class="flyby__boom"></span>' +
      '<svg class="flyby__jet" viewBox="0 0 100 100" focusable="false"><path d="' + Visuals.jetPath('f35') + '"/></svg>';
    doc.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1700);
  }

  /* ------------------------------------------------------------- set-up */

  var ready = false;
  function init() {
    if (ready) return;
    ready = true;
    var amb = doc.createElement('div');
    amb.className = 'ambient';
    amb.setAttribute('aria-hidden', 'true');
    amb.innerHTML = '<i class="ambient__a"></i><span class="ambient__grid"></span>';
    doc.body.insertBefore(amb, doc.body.firstChild);

    doc.addEventListener('pointerdown', function (e) {
      ripple(e);
      var card = !still() && e.target && e.target.closest ? e.target.closest('[data-tilt]') : null;
      if (card && e.pointerType !== 'mouse') { tilt.el = card; tilt.id = e.pointerId; card.classList.add('is-tilting'); pointerTilt(e); }
    }, { passive: true });
    doc.addEventListener('pointermove', function (e) {
      if (tilt.el) { pointerTilt(e); return; }
      if (e.pointerType !== 'mouse' || still()) return;
      var card = e.target && e.target.closest ? e.target.closest('[data-tilt]') : null;
      if (!card) return;
      var r = card.getBoundingClientRect();
      setTilt(card, -((e.clientY - r.top) / r.height - .5) * 8, ((e.clientX - r.left) / r.width - .5) * 10);
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach(function (t) { doc.addEventListener(t, endTilt, { passive: true }); });
    doc.addEventListener('pointerout', function (e) {
      if (e.pointerType !== 'mouse' || !e.target.closest) return;
      var card = e.target.closest('[data-tilt]');
      if (card && !card.contains(e.relatedTarget)) setTilt(card, 0, 0);
    }, { passive: true });
    if ('DeviceOrientationEvent' in g && !(typeof DeviceOrientationEvent.requestPermission === 'function')) {
      g.addEventListener('deviceorientation', onOrient, { passive: true });
    }

    var scrollRaf = 0;
    g.addEventListener('scroll', function () {
      if (scrollRaf) return;
      scrollRaf = g.requestAnimationFrame(function () {
        scrollRaf = 0;
        doc.body.classList.toggle('is-scrolled', g.scrollY > 6);
      });
    }, { passive: true });
  }

  g.Motion = { init: init, enter: enter, entering: entering, decode: decode, flyby: flyby, reduced: reduced, still: still };
})(window);
