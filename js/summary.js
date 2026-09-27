/* Read-only instructor report. Never writes flights, settings or the goal shelf. */
(function (g) {
  'use strict';
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function text(v) { return String(v == null ? '' : v).trim(); }
  function date(iso) { return iso ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : ''; }
  function course(id) { var c = g.Courses.get(id); return c ? c.label : g.T.reportUnassigned; }
  function role(r, name) { var q = g.Store.questionFor(r, name); return q ? r.answers[q.id] : null; }
  function field(r, type) { return g.Store.questions(true).find(function (q) { return q.type === type && r.answers[q.id] !== undefined; }); }
  function lines(v) { return g.Store.linesOf(v).filter(Boolean); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function answerLines(q, value) {
    if (q.type === 'goals' && Array.isArray(value)) return value.filter(function (x) { return text(x.text); }).map(function (x) {
      return x.text + ' · ' + (x.status === 'met' ? g.T.goalMet : x.status === 'missed' ? g.T.goalMissed : g.T.reportNotGraded);
    });
    if (q.type === 'syllabus' && Array.isArray(value)) return value.map(function (x) {
      return [text(x.text), text(x.focus) ? g.T.reportBriefFocus + ': ' + x.focus : '', text(x.notes) || g.T.reportNoExerciseNote].filter(Boolean).join('\n');
    });
    return lines(value);
  }
  function build(records) {
    var rows = records.filter(function (r) { return r.stage === 'done'; }).slice().sort(function (a, b) {
      return a.flownAt.localeCompare(b.flownAt) || (+a.createdAt || 0) - (+b.createdAt || 0) || a.id.localeCompare(b.id);
    });
    var goals = new Map(), next = new Map(), exercises = new Map(), focus = new Map(), courses = new Set();
    var s = { records: rows, flights: rows.length, minutes: 0, durationMissing: 0, graded: 0, metCount: 0, missedCount: 0, openCount: 0,
      solo: { yes: 0, total: 0 }, points: [], safety: [], details: [] };
    function collect(map, key, value, source) {
      if (!map.has(key)) map.set(key, { t: value, sources: [], n: 0, course: source.course, cats: source.cats });
      var row = map.get(key);
      if (!row.sources.some(function (x) { return x.id === source.id; })) { row.sources.push(source); row.n++; }
      return row;
    }
    rows.forEach(function (r, index) {
      var cats = g.Store.categoriesOf(r).slice().sort(), cid = r.course || '', subject = text(role(r, 'subject'));
      var source = { id: r.id, date: r.flownAt, subject: subject, course: cid, cats: cats };
      var key = function (value) { return JSON.stringify([cid, cats, text(value).replace(/\s+/g, ' ')]); };
      var mq = field(r, 'minutes'), minutes = mq ? Number(r.answers[mq.id]) : NaN;
      var validMinutes = mq && text(r.answers[mq.id]) !== '' && Number.isFinite(minutes) && minutes >= 0;
      if (validMinutes) s.minutes += minutes; else s.durationMissing++;
      courses.add(course(cid));
      var sq = g.Store.questionFor(r, 'solo'), solo = sq && text(r.answers[sq.id]);
      if (solo) { s.solo.total++; if (solo === ((sq.options || [])[0] || 'כן')) s.solo.yes++; }
      arr(role(r, 'goals')).forEach(function (item) {
        var value = text(item.text); if (!value) return;
        var row = collect(goals, key(value), value, source);
        if (!row.met) { row.met = []; row.missed = []; }
        var verdict = item.status === 'met' ? 'met' : item.status === 'missed' ? 'missed' : 'open';
        if (verdict !== 'open') {
          s.graded++; s[verdict === 'met' ? 'metCount' : 'missedCount']++;
          if (!row[verdict].some(function (x) { return x.id === r.id; })) row[verdict].push(source);
        } else s.openCount++;
        row.latest = verdict; row.latestIndex = index;
      });
      arr(role(r, 'goalsNext')).forEach(function (item) {
        var value = text(item.text || item); if (!value) return;
        var row = collect(next, key(value), value, source); row.key = key(value); row.latestIndex = index;
      });
      var xq = field(r, 'syllabus'), xs = xq ? arr(r.answers[xq.id]) : [];
      xs.forEach(function (x) {
        if (text(x.text) && text(x.notes)) collect(exercises, key(x.text), text(x.text), source);
        if (text(x.focus)) collect(focus, key(x.focus), text(x.focus), source);
      });
      var points = lines(role(r, 'points')); if (points.length) s.points.push({ source: source, lines: points });
      var safety = lines(r.answers.q_safety_d); if (safety.length) s.safety.push({ source: source, lines: safety });
      var used = ['q_safety_d'];
      ['subject', 'instructor', 'points', 'goals', 'goalsNext'].forEach(function (name) {
        var q = g.Store.questionFor(r, name); if (q) used.push(q.id);
      });
      if (mq) used.push(mq.id); if (xq) used.push(xq.id);
      var extras = g.Store.questions(true).filter(function (q) {
        return r.answers[q.id] !== undefined && used.indexOf(q.id) === -1;
      }).map(function (q) { return { label: q.label, stage: q.stage, lines: answerLines(q, r.answers[q.id]) }; }).filter(function (q) { return q.lines.length; });
      s.details.push({ record: r, source: source, subject: subject, instructor: text(role(r, 'instructor')), minutes: validMinutes ? minutes : null,
        goals: arr(role(r, 'goals')), next: arr(role(r, 'goalsNext')), exercises: xs, points: points, safety: safety, extras: extras });
    });
    var rank = function (list) { return list.sort(function (a, b) { return b.n - a.n || a.t.localeCompare(b.t, 'he'); }); };
    var allGoals = Array.from(goals.values());
    s.met = rank(allGoals.filter(function (x) { return x.met.length; }).map(function (x) { return Object.assign({}, x, { n: x.met.length, sources: x.met }); }));
    s.missed = rank(allGoals.filter(function (x) { return x.missed.length; }).map(function (x) { return Object.assign({}, x, { n: x.missed.length, sources: x.missed }); }));
    s.recurring = s.missed.filter(function (x) { return x.n > 1; });
    s.next = rank(Array.from(next.values()).map(function (x) {
      var later = goals.get(x.key); x.resolved = !!(later && later.latestIndex > x.latestIndex && later.latest === 'met'); return x;
    }));
    s.focus = rank(Array.from(focus.values()).filter(function (x) { return x.n > 1; }));
    s.exercises = rank(Array.from(exercises.values()));
    s.courses = Array.from(courses); s.hours = (Math.round(s.minutes / 6) / 10).toFixed(1);   // six-minute tenths, as on Home
    s.from = rows.length ? rows[0].flownAt : ''; s.to = rows.length ? rows[rows.length - 1].flownAt : '';
    s.dateRange = s.from === s.to ? date(s.from) : date(s.from) + ' – ' + date(s.to);
    return s;
  }
  function sourceLabel(x) {
    return [date(x.date), x.subject, course(x.course)].filter(Boolean).join(' · ');
  }
  function documentHTML(s, options) {
    var T = g.T, o = options || {};
    function list(values) { return '<ul>' + values.map(function (v) { return '<li>' + esc(v).replace(/\n/g, '<br>') + '</li>'; }).join('') + '</ul>'; }
    function section(title, body) { return body ? '<section><h2>' + esc(title) + '</h2>' + body + '</section>' : ''; }
    function ranked(values, kind) {
      return values.map(function (v) { return '<article><p><b>' + esc(v.t) + '</b>' + (v.n > 1 ? ' · ' + esc(T.inNFlights(v.n)) : '') +
        (kind === 'missed' && v.latest === 'met' || kind === 'next' && v.resolved ? ' <span class="resolved">' + esc(T.reportLaterMet) + '</span>' : '') +
        '</p><p class="source">' + esc(v.sources.map(sourceLabel).join(' / ')) + '</p></article>'; }).join('');
    }
    function dated(values) { return values.map(function (v) { return '<article><p class="source">' + esc(sourceLabel(v.source)) + '</p>' + list(v.lines) + '</article>'; }).join(''); }
    var h = '<header><p class="eyebrow">' + esc(T.app) + ' / ' + esc(T.reportEyebrow) + '</p><h1>' + esc(T.reportTitle) + '</h1>' +
      '<p class="range">' + esc(s.dateRange) + '</p><p>' + esc(s.courses.join(' · ')) + '</p>' +
      (text(o.identity) ? '<p class="identity">' + esc(T.reportCadet) + ': ' + esc(o.identity) + '</p>' : '') + '</header>';
    h += '<table class="stats"><tr><th>' + esc(T.rFlights) + '</th><th>' + esc(T.rHours) + '</th><th>' + esc(T.reportGoalsRate) + '</th></tr><tr><td>' + s.flights + '</td><td>' + s.hours + '</td><td>' + (s.graded ? Math.round(s.metCount / s.graded * 100) + '%' : esc(T.reportNoGrade)) + '</td></tr></table>';
    h += '<p class="source">' + esc(T.reportGraded(s.metCount, s.graded, s.openCount)) + ' · ' + s.minutes + ' ' + esc(T.rMinutes) + '</p>';
    if (s.durationMissing) h += '<p class="source">' + esc(T.reportMissingMinutes(s.durationMissing)) + '</p>';
    if (s.solo.total) h += '<p>' + esc(T.docSolo(s.solo.yes, s.solo.total)) + '</p>';
    h += section(T.secRepeatGoals, ranked(s.recurring, 'missed'));
    h += section(T.reportNext, ranked(s.next, 'next'));
    h += section(T.goalsMet, ranked(s.met));
    h += section(T.goalsMissed, ranked(s.missed, 'missed'));
    h += section(T.secFocus, ranked(s.focus));
    h += section(T.secPoints, dated(s.points));
    h += section(T.secSafety, s.safety.length ? dated(s.safety) : '<p class="source">' + esc(T.reportNoSafety) + '</p>');
    if (!o.compact) h += section(T.secFlights, s.details.map(function (d, i) {
      var body = '<article class="flight"><h3>' + String(i + 1).padStart(2, '0') + ' · ' + esc(sourceLabel(d.source)) + '</h3><p class="source">' +
        esc([d.instructor, d.minutes !== null ? d.minutes + ' ' + T.rMinutes : ''].filter(Boolean).join(' · ')) + '</p>';
      if (d.goals.length) body += '<h4>' + esc(T.secGoals) + '</h4>' + list(d.goals.filter(function (x) { return text(x.text); }).map(function (x) { return x.text + ' · ' + (x.status === 'met' ? T.goalMet : x.status === 'missed' ? T.goalMissed : T.reportNotGraded); }));
      var told = d.exercises.filter(function (x) { return text(x.notes); }), planned = d.exercises.filter(function (x) { return text(x.text) && !text(x.notes); });
      if (told.length) body += '<h4>' + esc(T.documentedExercises) + '</h4>' + told.map(function (x) { return '<p><b>' + esc(x.text) + '</b></p>' + (text(x.focus) ? '<p class="source">' + esc(T.reportBriefFocus) + ': ' + esc(x.focus) + '</p>' : '') + '<p class="reflection">' + esc(x.notes).replace(/\n/g, '<br>') + '</p>'; }).join('');
      if (planned.length) body += '<h4>' + esc(T.plannedExercises.trim()) + '</h4>' + list(planned.map(function (x) {
        return x.text + (text(x.focus) ? '\n' + T.reportBriefFocus + ': ' + x.focus : '');
      }));
      if (d.points.length) body += '<h4>' + esc(T.secPoints) + '</h4>' + list(d.points);
      if (d.safety.length) body += '<h4>' + esc(T.secSafety) + '</h4>' + list(d.safety);
      if (d.next.length) body += '<h4>' + esc(T.reportNext) + '</h4>' + list(d.next.map(function (x) { return x.text || x; }));
      d.extras.forEach(function (q) { body += '<h4>' + esc(q.label) + ' <span class="source">(' + esc(q.stage === 'brief' ? T.briefTitle : T.debriefTitle) + ')</span></h4>' + list(q.lines); });
      return body + '</article>';
    }).join(''));
    h += '<footer>' + esc(T.reportBasis) + '</footer>';
    return '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(T.reportTitle) + '</title><style>' +
      '@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;direction:rtl;text-align:right;color:#202821;background:#fff;line-height:1.65;font-size:11pt;margin:0 auto;max-width:760px;padding:28px}header{border-top:4px solid #53644c;padding-top:18px;margin-bottom:24px}h1{font-size:26pt;line-height:1.2;margin:8px 0}h2{font-size:14pt;border-bottom:1px solid #cbd3c8;padding-bottom:6px;margin:24px 0 10px}h3{font-size:12pt;margin:16px 0 4px}h4{font-size:11pt;margin:12px 0 4px}p{margin:4px 0}ul{padding-inline-start:22px;margin:6px 0 12px}li{margin:4px 0}article{margin-bottom:12px}.eyebrow,.source,footer{font-size:9.5pt;color:#566151}.range{font-size:14pt}.stats{border-collapse:collapse;width:100%;table-layout:fixed;background:#f3f5f0;margin-bottom:12px}.stats th,.stats td{text-align:right;padding:10px 12px;border:1px solid #d3dacd}.stats th{font-size:10pt;font-weight:normal}.stats td{font-size:21pt}.resolved{font-size:9pt;color:#365b3c}.reflection{white-space:pre-wrap;overflow-wrap:anywhere}footer{border-top:1px solid #cbd3c8;padding-top:14px;margin-top:28px}h2,h3,h4{break-after:avoid}.stats{break-inside:avoid}@media print{body{padding:0;max-width:none}a{color:inherit;text-decoration:none}}' +
      '</style></head><body>' + h + '</body></html>';
  }
  function plain(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('br').forEach(function (n) { n.replaceWith(doc.createTextNode('\n')); });
    doc.querySelectorAll('p,h1,h2,h3,h4,li,tr,article,section,header,footer').forEach(function (n) { n.appendChild(doc.createTextNode('\n')); });
    doc.querySelectorAll('td,th').forEach(function (n) { n.appendChild(doc.createTextNode(' | ')); });
    return doc.body.textContent.replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  g.Summary = { build: build, documentHTML: documentHTML, plain: plain, sourceLabel: sourceLabel, date: date, course: course };
})(window);
