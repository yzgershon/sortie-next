/* תחקיר — the guided tour.
 *
 * A spotlight that moves from one new thing to the next: the rest of the
 * screen dims, the part being explained is lit and framed, and a card beside
 * it says what it is. Buttons, Esc and the arrow keys drive it. The app is
 * inert underneath while it runs and focus goes back where it was afterwards.
 * Steps whose element is not on screen (a section hidden in הגדרות, say) are
 * skipped rather than pointing at nothing.
 *
 * Read-only: nothing here touches storage.
 */
(function (g) {
  'use strict';

  var doc = g.document, current = null;

  function motionOff() { return g.Motion ? g.Motion.reduced() : false; }
  function visible(el) {
    if (!el || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function fixed(el) {
    for (var n = el; n && n !== doc.body; n = n.parentElement) if (g.getComputedStyle(n).position === 'fixed') return true;
    return false;
  }

  /* Bring the element to rest in view, leaving room for the card. */
  function bring(el, cb) {
    var r = el.getBoundingClientRect(), vh = g.innerHeight;
    if (fixed(el) || (r.top >= 72 && r.bottom <= vh - 220)) return cb();
    var y = g.scrollY + r.top - Math.max(76, Math.min(160, (vh - r.height) / 2 - 110));
    g.scrollTo({ top: Math.max(0, y), behavior: motionOff() ? 'auto' : 'smooth' });
    var last = -1, calm = 0, begun = Date.now();
    (function tick() {
      var now = g.scrollY;
      calm = now === last ? calm + 1 : 0;
      last = now;
      if (calm >= 4 || Date.now() - begun > 1300) return cb();
      g.requestAnimationFrame(tick);
    })();
  }

  /* Wait out the element's own entrance, so the light lands where it rests. */
  function settle(el, cb) {
    var list = [], done = false;
    function finish() { if (!done) { done = true; cb(); } }
    try {
      for (var n = el; n && n !== doc.body; n = n.parentElement) {
        if (!n.getAnimations) break;
        n.getAnimations().forEach(function (a) {
          var t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
          if (t && t.iterations !== Infinity && a.playState === 'running') list.push(a.finished.catch(function () {}));
        });
      }
    } catch (e) {}
    if (!list.length) return finish();
    Promise.all(list).then(finish);
    setTimeout(finish, 1500);
  }

  function start(steps, o) {
    o = o || {};
    if (current) current.end();
    var list = (steps || []).filter(function (s) { return visible(doc.querySelector(s.sel)); });
    if (!list.length) return null;

    var prev = doc.activeElement, idx = -1, ended = false;
    var root = doc.createElement('div');
    root.className = 'tour';
    root.innerHTML =
      '<div class="tour__spot" aria-hidden="true"><i class="tour__scan"></i></div>' +
      '<section class="tour__card" role="dialog" aria-modal="true" aria-labelledby="tourTitle" aria-describedby="tourBody">' +
        '<div class="tour__head"><span class="tour__count mono"></span>' +
          '<button type="button" class="tour__skip" data-t="skip"></button></div>' +
        '<h2 class="tour__title" id="tourTitle"></h2><p class="tour__body" id="tourBody"></p>' +
        '<div class="tour__foot"><span class="tour__dots" aria-hidden="true">' +
          list.map(function () { return '<i></i>'; }).join('') + '</span>' +
          '<span class="tour__btns"><button type="button" class="btn btn--quiet" data-t="back"></button>' +
          '<button type="button" class="btn btn--lit" data-t="next"></button></span></div>' +
        '<i class="tour__arrow" aria-hidden="true"></i>' +
        '<span class="sr" aria-live="polite"></span>' +
      '</section>';
    root.setAttribute('aria-label', o.label || '');
    doc.body.appendChild(root);
    if (o.inert) o.inert.inert = true;
    doc.documentElement.classList.add('is-touring');

    var spot = root.querySelector('.tour__spot'), card = root.querySelector('.tour__card');
    var count = root.querySelector('.tour__count'), title = root.querySelector('.tour__title'), body = root.querySelector('.tour__body');
    var next = root.querySelector('[data-t="next"]'), back = root.querySelector('[data-t="back"]'), skip = root.querySelector('[data-t="skip"]');
    var live = root.querySelector('[aria-live]'), dots = root.querySelectorAll('.tour__dots i');
    skip.textContent = o.skip || '';
    back.textContent = o.back || '';

    var placed = false;
    function place(el) {
      var r = el.getBoundingClientRect(), vw = doc.documentElement.clientWidth, vh = g.innerHeight, pad = 8;
      // the first light comes up where it is; later ones travel between parts
      if (!placed) { spot.style.transition = 'none'; card.style.transition = 'none'; }
      var x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
      var w = Math.min(vw - 4, r.right + pad) - x, h = Math.min(vh - 4, r.bottom + pad) - y;
      var rad = parseFloat(g.getComputedStyle(el).borderTopLeftRadius) || 0;
      spot.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      spot.style.width = Math.round(w) + 'px';
      spot.style.height = Math.round(h) + 'px';
      spot.style.borderRadius = Math.round(Math.min(rad + pad, w / 2, h / 2)) + 'px';
      var ch = card.offsetHeight, gap = 16, room = vh - (y + h), top, side;
      if (room >= ch + gap + 12 || room >= y) { top = Math.min(y + h + gap, vh - ch - 12); side = 'below'; }
      else { top = Math.max(12, y - gap - ch); side = 'above'; }
      card.style.transform = 'translateY(' + Math.round(top) + 'px)';
      card.setAttribute('data-side', side);
      var cr = card.getBoundingClientRect();
      card.style.setProperty('--ax', Math.round(Math.max(26, Math.min(cr.width - 26, x + w / 2 - cr.left))) + 'px');
      if (!placed) {
        placed = true;
        void spot.offsetWidth;
        spot.style.transition = ''; card.style.transition = '';
        root.classList.add('is-open');
      }
    }

    function show(k) {
      var s = list[k], el = doc.querySelector(s.sel);
      if (!visible(el)) {
        list.splice(k, 1);
        if (!list.length) return end();
        return show(Math.min(k, list.length - 1));
      }
      idx = k;
      count.textContent = o.step ? o.step(k + 1, list.length) : (k + 1) + '/' + list.length;
      title.textContent = s.title;
      body.textContent = s.body;
      back.hidden = k === 0;
      next.textContent = k === list.length - 1 ? (o.done || '') : (o.next || '');
      for (var d = 0; d < dots.length; d++) dots[d].className = d < list.length ? (d === k ? 'is-on' : d < k ? 'is-past' : '') : 'is-gone';
      root.classList.add('is-moving');
      bring(el, function () {
        settle(el, function () {
          if (ended || idx !== k) return;
          place(el);
          root.classList.remove('is-moving');
          spot.classList.remove('is-scan'); void spot.offsetWidth; spot.classList.add('is-scan');
          next.focus({ preventScroll: true });
          live.textContent = count.textContent + '. ' + s.title + '. ' + s.body;
        });
      });
    }

    function end() {
      if (ended) return;
      ended = true;
      current = null;
      doc.removeEventListener('keydown', onKey, true);
      g.removeEventListener('resize', onMove);
      g.removeEventListener('scroll', onMove);
      g.removeEventListener('hashchange', end);
      if (o.inert) o.inert.inert = false;
      doc.documentElement.classList.remove('is-touring');
      root.classList.add('is-out');
      setTimeout(function () { root.remove(); }, motionOff() ? 0 : 260);
      if (prev && prev.isConnected && prev.focus) prev.focus({ preventScroll: true });
      if (o.onEnd) o.onEnd();
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); end(); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); next.click(); return; }   // forward, right to left
      if (e.key === 'ArrowRight' && idx > 0) { e.preventDefault(); back.click(); return; }
      if (e.key === 'Tab') {
        var f = [skip, back, next].filter(function (b) { return !b.hidden; });
        var at = f.indexOf(doc.activeElement);
        e.preventDefault();
        f[(at + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
      }
    }
    var moveRaf = 0;
    function onMove() {
      if (moveRaf || idx < 0 || root.classList.contains('is-moving')) return;
      moveRaf = g.requestAnimationFrame(function () {
        moveRaf = 0;
        var el = doc.querySelector(list[idx].sel);
        if (visible(el)) place(el);
      });
    }

    next.addEventListener('click', function () { if (idx >= list.length - 1) end(); else show(idx + 1); });
    back.addEventListener('click', function () { if (idx > 0) show(idx - 1); });
    skip.addEventListener('click', end);
    doc.addEventListener('keydown', onKey, true);
    g.addEventListener('resize', onMove);
    g.addEventListener('scroll', onMove, { passive: true });
    g.addEventListener('hashchange', end);

    current = { end: end };
    show(0);
    return current;
  }

  g.Tour = { start: start, active: function () { return !!current; } };
})(window);
