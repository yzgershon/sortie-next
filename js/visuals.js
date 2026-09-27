/* תחקיר — mission-chart graphics.
 *
 * Procedural SVG in the language of a flight-planning display: a plotting
 * grid, terrain contours, range rings with bearings, route legs, waypoints and
 * an own-ship symbol. Every colour comes from a CSS class, so all three themes
 * restyle the charts without touching this file.
 *
 * Decorative charts are seeded, so a screen does not redraw a different map on
 * every render. The course route is the one chart drawn from real data: each
 * syllabus section is a waypoint, spaced by how many sorties it holds, and the
 * route is lit as far as the recorded coverage reaches. No real map, place or
 * position is implied anywhere.
 *
 * Read-only: nothing here touches storage.
 */
(function (g) {
  'use strict';

  var uid = 0;
  var TAU = Math.PI * 2;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function pad3(v) { return ('00' + Math.round(v) % 360).slice(-3); }

  /* A small deterministic generator, so a seed always draws the same chart. */
  function rng(seed) {
    var s = String(seed), h = 1779033703 ^ s.length;
    for (var i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return function () {
      h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }

  /* ------------------------------------------------------------ aircraft */

  /* Top-view planforms in a 100×100 box, nose up. Half outlines are mirrored,
     so the silhouettes stay symmetric. Generic shapes of the types, not
     engineering drawings. */
  var HALF = {
    f35: [[50, 0], [52.5, 6], [54.5, 14], [56, 22], [59, 27], [59.5, 36], [90, 57], [91, 63], [63, 63], [62, 68], [80, 81], [80, 88], [59, 88], [57.5, 96], [50, 97]],
    f16: [[50, 0], [51.5, 8], [53, 18], [53.5, 32], [56, 40], [58, 47], [88, 63], [89, 63], [89.5, 70], [58, 72], [57, 78], [74, 88], [74, 92], [56, 91], [54, 99], [50, 100]],
    f15: [[50, 0], [52, 7], [53.5, 16], [56, 21], [60, 23], [60, 40], [90, 60], [91, 69], [62, 70], [62, 76], [79, 86], [79, 93], [62, 93], [59, 100], [50, 99]]
  };
  var FINS = {
    f35: [[57, 67], [60, 67], [66, 84], [63, 85]],
    f15: [[60, 74], [63, 74], [64, 92], [61, 92]]
  };
  function mirror(pts) { return pts.map(function (p) { return [100 - p[0], p[1]]; }).reverse(); }
  function poly(pts) { return 'M' + pts.map(function (p) { return r1(p[0]) + ' ' + r1(p[1]); }).join('L') + 'Z'; }
  function jetPath(kind) {
    var half = HALF[kind] || HALF.f35;
    var d = poly(half.concat(mirror(half).slice(1)));
    if (FINS[kind]) d += poly(FINS[kind]) + poly(mirror(FINS[kind]));
    return d;
  }
  /* An aircraft centred on (x, y), pointing along heading h (0 = up). */
  function jet(kind, x, y, h, size, cls) {
    var s = size / 100;
    return '<path class="' + (cls || 'mchart__ship') + '" d="' + jetPath(kind) + '" transform="translate(' + r1(x) + ' ' + r1(y) +
      ') rotate(' + r1(h) + ') scale(' + r1(s * 100) / 100 + ') translate(-50 -50)"/>';
  }

  /* ------------------------------------------------------------ geometry */

  function bearing(a, b) { return (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI + 360) % 360; }
  function measure(pts) {
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return cum;
  }
  /* The point `dist` along a polyline, with the heading of the leg it is on. */
  function along(pts, cum, dist) {
    var total = cum[cum.length - 1];
    dist = Math.max(0, Math.min(total, dist));
    for (var i = 1; i < pts.length; i++) {
      if (dist <= cum[i] || i === pts.length - 1) {
        var span = cum[i] - cum[i - 1] || 1, t = (dist - cum[i - 1]) / span;
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
          h: bearing(pts[i - 1], pts[i]), leg: i };
      }
    }
    return { x: pts[0].x, y: pts[0].y, h: 0, leg: 1 };
  }
  function upTo(pts, cum, dist) {
    var p = along(pts, cum, dist), out = pts.slice(0, p.leg);
    out.push({ x: p.x, y: p.y });
    return out;
  }
  function line(pts) { return 'M' + pts.map(function (p) { return r1(p.x) + ' ' + r1(p.y); }).join('L'); }

  /* A route that snakes across the chart in rows, starting top right like a
     Hebrew page, with enough jitter to read as a planned track. */
  function snake(R, w, h, turns, padX, padY, forceRows) {
    var rows = forceRows || (turns > 6 ? 3 : turns > 3 ? 2 : 1);
    var per = Math.max(2, Math.ceil(turns / rows) + 1), pts = [];
    for (var row = 0; row < rows; row++) {
      var y0 = padY + (rows === 1 ? (h - 2 * padY) / 2 : row * (h - 2 * padY) / (rows - 1));
      for (var i = 0; i < per; i++) {
        var t = i / (per - 1), ltr = row % 2 === 1;
        var x = padX + (ltr ? t : 1 - t) * (w - 2 * padX);
        // rows join at the edges with a straight turn, like a racetrack pattern
        var edge = i === 0 || i === per - 1;
        var jy = rows === 1 ? (R() - .5) * (h - 2 * padY) * .9 : edge ? 0 : (R() - .5) * Math.min(22, (h - 2 * padY) / (rows * 1.6));
        pts.push({ x: x + (edge ? 0 : (R() - .5) * 14), y: Math.max(padY * .6, Math.min(h - padY * .6, y0 + jy)) });
      }
    }
    return pts;
  }

  /* The course as a navigation route. Waypoint i sits where section i ends,
     measured in sorties, so a long section is a long leg. */
  function courseRoute(o) {
    var w = o.w, h = o.h, R = rng(o.seed || 'course');
    var sections = (o.sections || []).filter(function (s) { return s.total > 0; });
    var sum = sections.reduce(function (n, s) { return n + s.total; }, 0) || 1;
    var pts = snake(R, w, h, Math.max(3, Math.round(sections.length * .6)), o.padX || 22, o.padY || 26, o.rows);
    var cum = measure(pts), L = cum[cum.length - 1];
    var frac = Math.max(0, Math.min(1, (o.done || 0) / sum)), acc = 0, current = -1;
    var wps = [{ x: pts[0].x, y: pts[0].y, kind: 'start', label: '' }];
    sections.forEach(function (s, i) {
      acc += s.total;
      var at = acc / sum, p = along(pts, cum, at * L);
      var state = s.done >= s.total ? 'done' : at <= frac + 1e-9 ? 'passed' : 'todo';
      if (state === 'todo' && current === -1) { current = i; state = 'next'; }
      wps.push({ x: p.x, y: p.y, kind: i === sections.length - 1 ? 'end' : 'wp', state: state,
        label: ('0' + (i + 1)).slice(-2), name: s.name, done: s.done, total: s.total });
    });
    var ship = along(pts, cum, frac * L);
    return { w: w, h: h, pts: pts, cum: cum, length: L, frac: frac, lit: upTo(pts, cum, frac * L), ship: ship, wps: wps, next: current };
  }

  /* ------------------------------------------------------------ layers */

  function grid(id, w, h) {
    return '<defs><pattern id="' + id + 'g" width="16" height="16" patternUnits="userSpaceOnUse"><path class="mchart__grid" d="M16 0H0V16"/></pattern>' +
      '<pattern id="' + id + 'G" width="80" height="80" patternUnits="userSpaceOnUse"><path class="mchart__grid mchart__grid--major" d="M80 0H0V80"/></pattern></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="url(#' + id + 'g)"/><rect width="' + w + '" height="' + h + '" fill="url(#' + id + 'G)"/>';
  }

  /* Terrain contours: families of closed, wobbling rings around a few peaks. */
  function topo(R, w, h, peaks) { return '<path class="mchart__topo" d="' + topoPath(R, w, h, peaks) + '"/>'; }
  function topoPath(R, w, h, peaks) {
    var d = '';
    for (var c = 0; c < peaks; c++) {
      var cx = R() * w, cy = R() * h, base = 10 + R() * 14, rings = 4 + Math.floor(R() * 4);
      var ph = [R() * TAU, R() * TAU, R() * TAU], am = [.14 + R() * .12, .06 + R() * .08, .03 + R() * .05], squash = .65 + R() * .3;
      for (var k = 1; k <= rings; k++) {
        var rad = base * k * (.9 + R() * .2);
        for (var i = 0; i <= 44; i++) {
          var t = i / 44 * TAU;
          var m = 1 + am[0] * Math.sin(2 * t + ph[0] + k * .35) + am[1] * Math.sin(3 * t + ph[1]) + am[2] * Math.sin(5 * t + ph[2] - k * .2);
          d += (i ? 'L' : 'M') + r1(cx + Math.cos(t) * rad * m) + ' ' + r1(cy + Math.sin(t) * rad * m * squash);
        }
      }
    }
    return d;
  }

  /* Range rings with a bearing scale, labelled the way a compass card is. */
  function rings(x, y, r, labels) {
    var s = '<g class="mchart__rings">';
    [.34, .67, 1].forEach(function (k, i) {
      s += '<circle class="mchart__ring' + (i === 2 ? ' mchart__ring--outer' : '') + '" cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + r1(r * k) + '"/>';
    });
    s += '<path class="mchart__ring" d="M' + r1(x - r) + ' ' + r1(y) + 'H' + r1(x + r) + 'M' + r1(x) + ' ' + r1(y - r) + 'V' + r1(y + r) + '"/>';
    var ticks = '';
    for (var a = 0; a < 360; a += 5) {
      var len = a % 30 === 0 ? 7 : a % 10 === 0 ? 4 : 2, rad = a * Math.PI / 180, sn = Math.sin(rad), cs = Math.cos(rad);
      ticks += 'M' + r1(x + sn * r) + ' ' + r1(y - cs * r) + 'L' + r1(x + sn * (r + len)) + ' ' + r1(y - cs * (r + len));
    }
    s += '<path class="mchart__tick" d="' + ticks + '"/>';
    if (labels !== false) {
      [[0, '36'], [90, '09'], [180, '18'], [270, '27']].forEach(function (b) {
        var rad = b[0] * Math.PI / 180;
        s += '<text class="mchart__bearing" x="' + r1(x + Math.sin(rad) * (r + 14)) + '" y="' + r1(y - Math.cos(rad) * (r + 14) + 3) + '" text-anchor="middle">' + b[1] + '</text>';
      });
    }
    return s + '</g>';
  }

  function diamond(x, y, s) { return 'M' + r1(x) + ' ' + r1(y - s) + 'L' + r1(x + s) + ' ' + r1(y) + 'L' + r1(x) + ' ' + r1(y + s) + 'L' + r1(x - s) + ' ' + r1(y) + 'Z'; }
  function triangle(x, y, s) { return 'M' + r1(x) + ' ' + r1(y - s) + 'L' + r1(x + s * .9) + ' ' + r1(y + s * .6) + 'L' + r1(x - s * .9) + ' ' + r1(y + s * .6) + 'Z'; }

  /* The route itself: the full plan dashed, the flown part lit, the leg ahead
     animated, waypoints by state, and the aircraft where the progress is. */
  function routeLayer(geo, o) {
    var s = '<g class="mchart__route">';
    s += '<path class="mchart__plan" d="' + line(geo.pts) + '"/>';
    if (geo.lit.length > 1) {
      s += '<path class="mchart__glow" d="' + line(geo.lit) + '"/><path class="mchart__lit" d="' + line(geo.lit) + '"/>';
    }
    // the leg ahead, from the aircraft to the next corner of the route
    var ahead = [{ x: geo.ship.x, y: geo.ship.y }].concat(geo.pts.slice(geo.ship.leg, geo.ship.leg + 1));
    if (geo.frac < 1 && ahead.length > 1) s += '<path class="mchart__ahead" d="' + line(ahead) + '"/>';
    if (o.headings) {
      for (var i = 1; i < geo.pts.length; i++) {
        var a = geo.pts[i - 1], b = geo.pts[i], len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 54) continue;
        s += '<text class="mchart__hdg" x="' + r1((a.x + b.x) / 2) + '" y="' + r1((a.y + b.y) / 2 - 5) + '" text-anchor="middle">' + pad3(bearing(a, b)) + '°</text>';
      }
    }
    var placed = [];
    geo.wps.forEach(function (w) {
      var cls = 'mchart__wp mchart__wp--' + (w.kind === 'start' ? 'start' : w.state || 'todo');
      if (w.kind === 'start') {
        s += '<g class="' + cls + '"><circle cx="' + r1(w.x) + '" cy="' + r1(w.y) + '" r="5"/><path d="M' + r1(w.x - 2) + ' ' + r1(w.y - 3.5) + 'V' + r1(w.y + 3.5) + 'M' + r1(w.x + 2) + ' ' + r1(w.y - 3.5) + 'V' + r1(w.y + 3.5) + '"/></g>';
      } else if (w.kind === 'end') {
        s += '<g class="' + cls + '"><circle cx="' + r1(w.x) + '" cy="' + r1(w.y) + '" r="6"/><circle cx="' + r1(w.x) + '" cy="' + r1(w.y) + '" r="2.4"/></g>';
      } else {
        s += '<path class="' + cls + '" d="' + (w.state === 'todo' || w.state === 'next' ? triangle(w.x, w.y, 4.6) : diamond(w.x, w.y, 4)) + '"/>';
      }
      if (w.state === 'next') s += '<circle class="mchart__pulse" cx="' + r1(w.x) + '" cy="' + r1(w.y) + '" r="9"/>';
      // short sections sit close together; a label that would overprint an
      // earlier one is left off, except the next waypoint's, which always shows
      var crowded = placed.some(function (q) { return Math.abs(q.x - w.x) < 13 && Math.abs(q.y - w.y) < 10; });
      if (o.wpLabels && w.label && (!crowded || w.state === 'next')) {
        placed.push({ x: w.x, y: w.y });
        s += '<text class="mchart__wplabel' + (w.state === 'next' ? ' is-next' : '') + '" x="' + r1(w.x) + '" y="' + r1(w.y - 9) + '" text-anchor="middle">' + esc(w.label) + '</text>';
      }
    });
    if (o.ship !== false) {
      s += '<circle class="mchart__shipring" cx="' + r1(geo.ship.x) + '" cy="' + r1(geo.ship.y) + '" r="' + r1((o.shipSize || 22) * .72) + '"/>' +
        jet(o.shipKind || 'f35', geo.ship.x, geo.ship.y, geo.ship.h, o.shipSize || 22);
    }
    return s + '</g>';
  }

  function open(o, w, h) {
    var labelled = !!o.label;
    return '<svg class="mchart' + (o.cls ? ' ' + o.cls : '') + '" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="' + (o.fit || 'xMidYMid slice') +
      '" focusable="false" ' + (labelled ? 'role="img" aria-label="' + esc(o.label) + '"' : 'aria-hidden="true"') + '>';
  }

  /* ------------------------------------------------------------ public */

  /* A decorative planning chart: terrain, rings, and an invented route. */
  function chart(o) {
    o = o || {};
    var w = o.w || 400, h = o.h || 220, R = rng(o.seed || 'sortie'), id = 'mc' + (++uid);
    var s = open(o, w, h) + grid(id, w, h) + topo(R, w, h, o.peaks || 3);
    var rx = o.ringX == null ? w * (.22 + R() * .2) : o.ringX, ry = o.ringY == null ? h * (.35 + R() * .3) : o.ringY;
    s += rings(rx, ry, o.ringR || Math.min(w, h) * .38, o.bearings);
    if (o.route !== false) {
      var pts = [], n = o.legs || 5;
      var band = o.band || [.2, .8];
      for (var i = 0; i <= n; i++) {
        var t = i / n;
        pts.push({ x: w * (.94 - t * .88), y: h * (band[0] + R() * (band[1] - band[0])) });
      }
      var cum = measure(pts), L = cum[cum.length - 1], frac = o.progress == null ? .35 + R() * .3 : o.progress;
      var wps = pts.map(function (p, i) {
        var at = cum[i] / L;
        return { x: p.x, y: p.y, kind: i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'wp',
          state: at <= frac ? 'done' : 'todo', label: i ? ('0' + i).slice(-2) : '' };
      });
      for (var j = 0; j < wps.length; j++) if (wps[j].state === 'todo') { wps[j].state = 'next'; break; }
      var geo = { pts: pts, cum: cum, frac: frac, lit: upTo(pts, cum, frac * L), ship: along(pts, cum, frac * L), wps: wps };
      s += routeLayer(geo, { headings: o.headings !== false, wpLabels: o.wpLabels !== false, shipKind: o.shipKind, shipSize: o.shipSize });
    }
    return s + '</svg>';
  }

  /* The course route, from real syllabus coverage. */
  function course(o) {
    var w = o.w || 400, h = o.h || 240, id = 'mc' + (++uid);
    var geo = courseRoute({ sections: o.sections, done: o.done, w: w, h: h, seed: o.seed, padX: o.padX, padY: o.padY, rows: o.rows });
    var R = rng((o.seed || 'course') + ':terrain');
    var s = open(o, w, h) + (o.grid === false ? '' : grid(id, w, h)) + (o.topo === false ? '' : topo(R, w, h, o.peaks || 3));
    if (o.rings !== false) s += rings(geo.wps[0].x, geo.wps[0].y, Math.min(w, h) * (o.ringScale || .3), false);
    s += routeLayer(geo, { headings: !!o.headings, wpLabels: o.wpLabels !== false, shipKind: o.shipKind || 'f16', shipSize: o.shipSize || 20 });
    return s + '</svg>';
  }

  /* A scope for the sign-in, course and PIN screens: rings, a bearing card,
     a turning sweep and a few quiet contacts. */
  function scope(seed) {
    var R = rng(seed || 'scope'), c = 200, id = 'ms' + (++uid), s = '<svg class="mscope" viewBox="0 0 400 400" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + id + 'w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="currentColor" stop-opacity="0"/><stop offset="1" stop-color="currentColor" stop-opacity=".55"/></linearGradient></defs>';
    s += rings(c, c, 190, true);
    s += '<g class="mscope__sweep"><path d="M200 200L200 10A190 190 0 0 1 322 55Z" fill="url(#' + id + 'w)"/><path class="mscope__beam" d="M200 200L322 55"/></g>';
    for (var i = 0; i < 5; i++) {
      var a = R() * TAU, r = 50 + R() * 130;
      s += '<circle class="mscope__blip" style="animation-delay:' + r1(R() * 6) + 's" cx="' + r1(c + Math.sin(a) * r) + '" cy="' + r1(c - Math.cos(a) * r) + '" r="2.4"/>';
    }
    return s + '</svg>';
  }

  /* The app mark: a thin ring around a six-pointed star drawn as two
     triangles. It borrows the Israeli roundel's geometry in outline; it is not
     the insignia itself. */
  function mark(cls) {
    var tri = function (flip) {
      var p = [0, 1, 2].map(function (k) {
        var a = (k * 120 + (flip ? 180 : 0)) * Math.PI / 180;
        return r1(12 + Math.sin(a) * 7.4) + ' ' + r1(12 - Math.cos(a) * 7.4);
      });
      return 'M' + p.join('L') + 'Z';
    };
    return '<svg class="' + (cls || 'mark') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<circle class="mark__ring" cx="12" cy="12" r="10.5"/><path class="mark__star" d="' + tri(false) + tri(true) + '"/></svg>';
  }

  /* A compass heading tape, like the strip across the top of a HUD. */
  function tape(hdg, w) {
    w = w || 320;
    var s = '<svg class="htape" viewBox="0 0 ' + w + ' 26" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">', span = 60, px = w / span;
    for (var d = Math.ceil((hdg - span / 2) / 5) * 5; d <= hdg + span / 2; d += 5) {
      var x = w / 2 + (d - hdg) * px, major = ((d % 10) + 10) % 10 === 0;
      s += '<path class="htape__tick" d="M' + r1(x) + ' 26V' + (major ? 16 : 20) + '"/>';
      if (major) s += '<text class="htape__num" x="' + r1(x) + '" y="12" text-anchor="middle">' + ('0' + (((d / 10) % 36 + 36) % 36)).slice(-2) + '</text>';
    }
    return s + '<path class="htape__caret" d="M' + r1(w / 2 - 5) + ' 26L' + r1(w / 2) + ' 20L' + r1(w / 2 + 5) + ' 26Z"/></svg>';
  }

  /* ------------------------------------------------------------ contrail */

  /* Flights per week as a contrail: the oldest week on the right, the newest
     on the left where a Hebrew line ends, and an F-35 at the head of the
     trail. The curve passes through every real count. With `animate` the
     aircraft flies the trail once (SVG motion, so it follows the exact curve)
     while CSS draws the line behind it; without it the aircraft sits at the
     newest week. The caller decides, so reduced motion and plain re-renders
     get the still version. */
  function contrail(o) {
    var vals = (o.values || []).map(function (v) { return Math.max(0, +v || 0); });
    if (vals.length < 2) vals = [0, 0].concat(vals).slice(-2);
    var n = vals.length, w = o.w || 320, h = o.h || 64, id = 'ct' + (++uid);
    var padX = o.padX == null ? 16 : o.padX, top = 12, bottom = h - 10, dur = o.dur || 1700;
    var max = Math.max(1, Math.max.apply(null, vals));
    var pts = vals.map(function (v, i) {
      return { x: w - padX - i * (w - 2 * padX) / (n - 1), y: bottom - v / max * (bottom - top) };
    });
    function cy(y) { return Math.max(top - 4, Math.min(bottom + 2, y)); }
    var d = 'M' + r1(pts[0].x) + ' ' + r1(pts[0].y);
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + r1(p1.x + (p2.x - p0.x) / 6) + ' ' + r1(cy(p1.y + (p2.y - p0.y) / 6)) + ' ' +
        r1(p2.x - (p3.x - p1.x) / 6) + ' ' + r1(cy(p2.y - (p3.y - p1.y) / 6)) + ' ' + r1(p2.x) + ' ' + r1(p2.y);
    }
    var last = pts[n - 1], prev = pts[n - 2];
    var s = '<svg class="contrail' + (o.animate ? ' is-live' : '') + '" viewBox="0 0 ' + w + ' ' + h + '" role="img"' +
      (o.label ? ' aria-label="' + esc(o.label) + '"' : ' aria-hidden="true"') + ' focusable="false">' +
      '<defs><linearGradient id="' + id + 's" gradientUnits="userSpaceOnUse" x1="' + padX + '" y1="0" x2="' + (w - padX) + '" y2="0">' +
        '<stop offset="0" class="contrail__s0"/><stop offset="1" class="contrail__s1"/></linearGradient>' +
      '<linearGradient id="' + id + 'a" gradientUnits="userSpaceOnUse" x1="0" y1="' + top + '" x2="0" y2="' + h + '">' +
        '<stop offset="0" class="contrail__a0"/><stop offset="1" class="contrail__a1"/></linearGradient></defs>' +
      '<path class="contrail__area" fill="url(#' + id + 'a)" d="' + d + 'L' + r1(last.x) + ' ' + h + 'L' + r1(pts[0].x) + ' ' + h + 'Z"/>' +
      '<path class="contrail__glow" d="' + d + '" pathLength="1"/>' +
      '<path class="contrail__line" id="' + id + 'l" stroke="url(#' + id + 's)" d="' + d + '" pathLength="1"/>';
    pts.forEach(function (p, k) {
      // roughly when the eased flight passes this week
      var t = Math.round(dur * (1 - Math.pow(1 - k / (n - 1), 1 / 3)));
      s += '<circle class="contrail__dot' + (k === n - 1 ? ' contrail__dot--now' : '') + '" cx="' + r1(p.x) + '" cy="' + r1(p.y) + '" r="' +
        (k === n - 1 ? 3.2 : 2) + '" style="animation-delay:' + t + 'ms"/>';
    });
    var body = '<ellipse class="contrail__burn" cx="-9" cy="0" rx="7" ry="2.4"/>' +
      '<path class="contrail__ship" d="' + jetPath('f35') + '" transform="rotate(90) scale(.17) translate(-50 -50)"/>';
    if (o.animate) {
      s += '<g class="contrail__jet">' + body + '<animateMotion dur="' + dur + 'ms" fill="freeze" rotate="auto" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".16 1 .3 1">' +
        '<mpath href="#' + id + 'l" xlink:href="#' + id + 'l"/></animateMotion></g>';
    } else {
      s += '<g class="contrail__jet" transform="translate(' + r1(last.x) + ' ' + r1(last.y) + ') rotate(' +
        r1(Math.atan2(last.y - prev.y, last.x - prev.x) * 180 / Math.PI) + ')">' + body + '</g>';
    }
    return s + '</svg>';
  }

  g.Visuals = { chart: chart, course: course, courseRoute: courseRoute, scope: scope, mark: mark, tape: tape, jetPath: jetPath, contrail: contrail,
    topoPath: function (seed, w, h, peaks) { return topoPath(rng(seed), w, h, peaks || 3); } };
})(window);
