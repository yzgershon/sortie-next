/* תחקיר — the training syllabus, kept in the app as a reference.
 *
 * One entry per גיחה. `items` are the חתך rows for that גיחה, which become the
 * סילבוס of a תדריך automatically when נושא טיסה matches. Entries may also
 * carry `goals` (the מתקדם chart has a יעדים מומלצים column; the ראשוני one
 * does not), a planned `minutes`, and the chart's notes.
 *
 * Everything stays editable after it is filled in: this only saves the typing.
 *
 * There is one catalogue PER COURSE. A גיחה name is only unique inside its own
 * course — both courses have a "מבנה 1" and they are different flights — so a
 * lookup that ignored the course would answer with the wrong exercises.
 */
(function (g) {
  'use strict';

  /* What he types on the left, what the chart calls it on the right. Both sides
     of a comparison get folded, so either spelling finds the same גיחה. */
  var ALIASES = {
    'אווירובטיקה': 'AW',
    'מ״מ': 'מבנה מתקדם'
  };

  var CATALOGUES = {};       // courseId -> [entry]
  var current = null;        // courseId

  /** Fold away the things that vary between the chart and a phone keyboard:
   *  gershayim vs a straight quote, hyphen styles, double spaces, case, and
   *  whether a number is joined to its word. The chart writes "AW3" while he
   *  types "AW 3", so a letter/digit boundary always becomes a space and both
   *  forms land on the same key. */
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[״׳"']/g, '"')
      .replace(/[־‐-―_-]/g, ' ')
      .replace(/([a-z֐-׿])(\d)/g, '$1 $2')
      .replace(/(\d)([a-z֐-׿])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** אווירובטיקה and AW are the same thing, so either spelling matches. */
  function applyAliases(s) {
    var out = s;
    Object.keys(ALIASES).forEach(function (k) {
      out = out.split(norm(k)).join(norm(ALIASES[k]));
    });
    return out.replace(/\s+/g, ' ').trim();
  }

  function list() { return CATALOGUES[current] || []; }

  /** Gershayim are optional in practice: the chart writes בנ״ז and רב״ש, and a
   *  thumb on a phone writes בנז and רבש. Dropping the mark entirely gives a
   *  second key both spellings land on. This is done here rather than as another
   *  alias table — two tables pointing in opposite directions is a trap this
   *  repo has already been caught by, and every gershayim pair would need an
   *  entry in it. */
  function loose(s) { return s.replace(/"/g, ''); }

  /** Every name a single entry answers to: its display name, and the wording
   *  printed in the chart when the two differ (a מתקדם entry renamed to keep it
   *  apart from a simulator session of the same number). */
  function keysOf(f) {
    var out = [applyAliases(norm(f.name))];
    if (f.raw) {
      var r = applyAliases(norm(f.raw));
      if (r && out.indexOf(r) === -1) out.push(r);
    }
    return out.filter(Boolean);
  }

  /**
   * Every syllabus entry that could be what he typed, best first.
   *
   *   1. exactly            "AW 3"      -> AW 3
   *   2. he typed MORE      "AW 3 לילה" -> AW 3      (extra categories on the flight)
   *   3. he typed LESS      "ניווט 5"   -> ניווט 5 - עובדה חזור
   *
   * Case 3 is not a nicety. Ten גיחות in the ראשוני chart carry a description
   * after the number — "ניווט 5 - עובדה חזור", "לילה 5 צ׳ק סולו לילה" — and
   * nobody types those. Without it they simply never matched and the סילבוס
   * stayed empty with no hint why.
   *
   * Where case 3 lands on SEVERAL entries the answer is genuinely ambiguous:
   * "SBT" is five different sessions in מתקדם, and "הכנות 1" is both a
   * simulator session and an air sortie. Those are returned as candidates for
   * the caller to offer, because guessing is worse than asking.
   *
   * Every comparison is on whole tokens, so "AW 3" can never reach "AW 30".
   */
  function candidates(subject) {
    var want = applyAliases(norm(subject));
    if (!want) return [];
    var hit = match(want, false);
    // only if nothing landed, so a precise spelling is never beaten by a fuzzy
    // one — "בנ״ז 1" resolves on its own terms before "בנז 1" is considered
    return hit.length ? hit : match(loose(want), true);
  }

  function match(want, useLoose) {
    if (!want) return [];
    var exact = [], shorter = null, shorterLen = -1, longer = [];
    list().forEach(function (f) {
      var keys = keysOf(f);
      for (var i = 0; i < keys.length; i++) {
        var key = useLoose ? loose(keys[i]) : keys[i];
        if (!key) continue;
        if (key === want) { if (exact.indexOf(f) === -1) exact.push(f); return; }
        if (want.indexOf(key + ' ') === 0) {
          // he typed more than the name; the longest name that still fits wins
          if (key.length > shorterLen) { shorter = f; shorterLen = key.length; }
          return;
        }
        if (key.indexOf(want + ' ') === 0) { if (longer.indexOf(f) === -1) longer.push(f); return; }
      }
    });

    if (exact.length) return exact;
    if (shorter) return [shorter];
    return longer;
  }

  /** The single best match, or null when there is not exactly one. Kept because
   *  most callers want an answer rather than a list. */
  function lookup(subject) {
    var c = candidates(subject);
    return c.length === 1 ? c[0] : null;
  }

  g.SyllabusRef = {
    aliases: ALIASES,
    /** Add a course's catalogue. Called by each syllabus data file. */
    register: function (courseId, entries) {
      CATALOGUES[courseId] = (entries || []).map(function (f) {
        return {
          name: String(f.name || '').trim(),
          raw: f.raw ? String(f.raw).trim() : '',
          section: String(f.section || '').trim(),
          sim: !!f.sim,
          minutes: f.minutes || null,
          opens: f.opens || '',
          note: f.note || '',
          instNote: f.instNote || '',
          items: (f.items || []).map(function (i) { return String(i).trim(); }).filter(Boolean),
          goals: (f.goals || []).map(function (i) { return String(i).trim(); }).filter(Boolean)
        };
      }).filter(function (f) { return f.name; });
      if (!current) current = courseId;
      return CATALOGUES[courseId].length;
    },
    /** Which catalogue lookups read. Unknown ids are ignored rather than
     *  emptying the syllabus, which would look exactly like a missing chart. */
    setCourse: function (courseId) {
      if (CATALOGUES[courseId]) current = courseId;
      return current;
    },
    course: function () { return current; },
    courses: function () { return Object.keys(CATALOGUES); },
    all: function (courseId) { return CATALOGUES[courseId || current] || []; },
    count: function (courseId) { return (CATALOGUES[courseId || current] || []).length; },
    lookup: function (subject, courseId) {
      if (!courseId || courseId === current) return lookup(subject);
      var previous = current; g.SyllabusRef.setCourse(courseId);
      try { return lookup(subject); } finally { g.SyllabusRef.setCourse(previous); }
    },
    candidates: function (subject, courseId) {
      if (!courseId || courseId === current) return candidates(subject);
      var previous = current; g.SyllabusRef.setCourse(courseId);
      try { return candidates(subject); } finally { g.SyllabusRef.setCourse(previous); }
    },
    norm: norm,
    /** Replace the active catalogue wholesale. Kept for the older data file. */
    load: function (entries) { return g.SyllabusRef.register(current || 'rishoni', entries); }
  };
})(window);
