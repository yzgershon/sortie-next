/* תחקיר — data layer.
 *
 * On-device only. IndexedDB is the store of record with a localStorage mirror;
 * the two are merged by id on boot so a half-committed write cannot lose data.
 *
 * v3 model: one RECORD per flight, filled in two stages.
 *   תדריך  (brief)   — filled before the flight
 *   תחקיר  (debrief) — filled after, prefilled from the brief
 *
 * Questions are data the pilot owns. Each carries a `stage`, and brief
 * questions declare how they appear in the debrief:
 *   inDebrief: 'edit'     prefilled and editable   (נושא טיסה, סילבוס)
 *   inDebrief: 'readonly' shown as reference only  (דגשים)
 *   inDebrief: 'none'     brief only               (בטיחות שתודרכה)
 */
(function (global) {
  'use strict';

  var DB_NAME = 'sortie', DB_VER = 1, STORE = 'sorties';
  var LS_MIRROR = 'sortie:mirror', LS_SETTINGS = 'sortie:settings';
  /* Drafts are per form, not one global slot. The old single key only ever held
     a new תדריך, so a תחקיר — the long one, filled standing on the apron — was
     kept in the DOM and nowhere else until the save button. */
  var LS_DRAFT_OLD = 'sortie:draft', DRAFT_PREFIX = 'sortie:draft:';
  var DRAFT_TTL = 30 * 86400000;
  var SCHEMA = 4;
  var LS_RECOVERY = 'sortie:recovery', LS_TRASH = 'sortie:trash';
  var storageIssue = false;

  function writeLocal(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) {
      storageIssue = true;
      if (global.dispatchEvent && global.CustomEvent) global.dispatchEvent(new CustomEvent('sortie:storage-error'));
      return false;
    }
  }
  function readJSON(key, fallback) {
    try { var value = JSON.parse(localStorage.getItem(key)); return value == null ? fallback : value; }
    catch (e) { return fallback; }
  }
  function failure(code) { var e = new Error(code); e.code = code; return e; }
  var LS_TRANSACTION = 'sortie:transaction';
  function replayLocal(values) {
    return Object.keys(values).every(function (key) {
      if (values[key] !== null) return writeLocal(key, values[key]);
      try { localStorage.removeItem(key); return true; } catch (e) { return false; }
    });
  }
  // A durable intent allows a launch interrupted between localStorage writes
  // to finish the operation. The previous full state remains in recovery.
  function commitLocal(values) {
    var before = {};
    Object.keys(values).forEach(function (key) { before[key] = localStorage.getItem(key); });
    var journal = { state: 'apply', before: before, after: values };
    if (!writeLocal(LS_TRANSACTION, JSON.stringify(journal))) return false;
    if (replayLocal(values)) { localStorage.removeItem(LS_TRANSACTION); return true; }
    journal.state = 'rollback';
    if (writeLocal(LS_TRANSACTION, JSON.stringify(journal)) && replayLocal(before)) localStorage.removeItem(LS_TRANSACTION);
    return false;
  }
  function recoverTransaction() {
    var raw = localStorage.getItem(LS_TRANSACTION);
    if (!raw) return;
    var pending;
    try { pending = JSON.parse(raw); } catch (e) { throw failure('RECOVERY_REQUIRED'); }
    if (!pending || !pending.before || !pending.after || !replayLocal(pending.state === 'rollback' ? pending.before : pending.after)) throw failure('RECOVERY_REQUIRED');
    localStorage.removeItem(LS_TRANSACTION);
  }
  function readArray(key) {
    var value = readJSON(key, []);
    if (Array.isArray(value)) return value.filter(function (x) { return x && typeof x === 'object'; });
    storageIssue = true;
    if (!writeLocal(key + ':damaged', localStorage.getItem(key))) throw failure('RECOVERY_REQUIRED');
    return [];
  }
  function draftEntries() {
    var out = {};
    try { for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key === LS_DRAFT_OLD || key.indexOf(DRAFT_PREFIX) === 0) out[key] = localStorage.getItem(key);
    } } catch (e) {}
    return out;
  }
  function recoverySnapshot(reason) {
    var snapshot = { at: Date.now(), reason: reason, flights: clone(cache), settings: clone(settings),
      drafts: draftEntries(), workspace: readJSON('sortie:workspace', null), feedbackDraft: readJSON('sortie:feedback-draft', null), trash: readArray(LS_TRASH) };
    return writeLocal(LS_RECOVERY, JSON.stringify(snapshot));
  }

  var db = null, dbHealthy = false, cache = [], settings = null;

  var TYPES = ['text', 'textarea', 'choice', 'number', 'minutes', 'date', 'goals', 'syllabus', 'list'];
  var STAGES = ['brief', 'debrief'];

  /* Only the goal loop is structural; everything else is his to delete. */
  var PROTECTED = ['goals', 'goalsNext'];
  function isProtected(q) { return !!q && PROTECTED.indexOf(q.role) !== -1; }

  function defaultQuestions() {
    return [
      /* ---- תדריך ---- */
      { id: 'q_period',     label: 'פיריט',        type: 'choice', options: ['1', '2', '3', '4'],
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_subject',    label: 'נושא טיסה',    type: 'text', suggest: true, role: 'subject',
        options: ['AW', 'ניווט', 'הקפות', 'מבנה', 'גנ״מ', 'מ״מ', 'משולבת', 'לילה', 'סולו', 'א״א', 'מאמן'],
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_instructor', label: 'מדריך',        type: 'text', suggest: true, role: 'instructor',
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_area',       label: 'איזור',        type: 'text', suggest: true,
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_goals',      label: 'יעדים',        type: 'goals', role: 'goals',
        stage: 'brief', inDebrief: 'edit' },
      // דגשים are written per exercise inside the syllabus, not as one blob
      { id: 'q_syllabus',   label: 'סילבוס',       type: 'syllabus',
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_safety_b',   label: 'בטיחות',       type: 'textarea',
        stage: 'brief', inDebrief: 'none' },

      /* ---- תחקיר ---- */
      { id: 'q_minutes',    label: 'דקות טיסה',    type: 'minutes',  stage: 'debrief' },
      { id: 'q_points',     label: 'נקודות עיקריות', type: 'list', role: 'points', stage: 'debrief' },
      { id: 'q_safety_d',   label: 'בטיחות',       type: 'textarea', stage: 'debrief' },
      { id: 'q_solo',       label: 'אישור לסולו',  type: 'choice', options: ['כן', 'לא'], role: 'solo',
        stage: 'debrief' },
      { id: 'q_goals_next', label: 'יעדים לטיסה הבאה', type: 'goals', role: 'goalsNext', stage: 'debrief' }
    ].map(function (q, i) {
      q.order = i; q.archived = false; q.hint = q.hint || '';
      return q;
    });
  }

  /* ---------------------------------------------------------------- utils */

  function uid(p) {
    return (p || 'r') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(v) { if (settled) return; settled = true; clearTimeout(t); resolve(v); }
      var t = setTimeout(function () { finish(fallback); }, ms);
      promise.then(finish, function () { finish(fallback); });
    });
  }

  /* ------------------------------------------------------------ indexeddb */

  function openDB() {
    return new Promise(function (resolve) {
      if (!global.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
  }
  function idbAll() {
    return new Promise(function (resolve) {
      if (!db) return resolve(null);
      try {
        var rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        rq.onsuccess = function () { resolve(rq.result || []); };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }
  function idbWrite(fn) {
    return new Promise(function (resolve) {
      if (!db) return resolve(false);
      try {
        var tx = db.transaction(STORE, 'readwrite');
        var timer = setTimeout(function () { try { tx.abort(); } catch (e) {} resolve(false); }, 5000);
        function finish(ok) { clearTimeout(timer); resolve(ok); }
        tx.oncomplete = function () { finish(true); };
        tx.onerror = tx.onabort = function () { finish(false); };
        fn(tx.objectStore(STORE));
      } catch (e) { resolve(false); }
    });
  }
  var idbPut = function (r) { return idbWrite(function (os) { os.put(r); }); };
  var idbDelete = function (id) { return idbWrite(function (os) { os.delete(id); }); };
  var idbClear = function () { return idbWrite(function (os) { os.clear(); }); };

  function mirror() { return writeLocal(LS_MIRROR, JSON.stringify(cache)); }
  function readMirror() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(LS_MIRROR) || '[]'); } catch (e) { raw = null; }
    if (Array.isArray(raw)) return raw;
    storageIssue = true;
    if (!writeLocal('sortie:damaged-mirror', localStorage.getItem(LS_MIRROR) || '')) throw failure('RECOVERY_REQUIRED');
    return [];
  }

  /* --------------------------------------------------------------- drafts */

  /** Where a form's autosave lives. A brand-new תדריך has no record yet, so it
   *  gets the one fixed 'new' slot; everything else is keyed by stage AND id,
   *  because the same flight has a תדריך form and a תחקיר form and they hold
   *  different answers. */
  function draftKey(id, stage) {
    if (!id) return DRAFT_PREFIX + 'new';
    return DRAFT_PREFIX + (stage === 'brief' ? 'b' : 'd') + ':' + id;
  }

  /** Drop drafts for flights that no longer exist and drafts nobody came back
   *  to. Without this every abandoned form stays in localStorage for good. */
  function pruneDrafts() {
    // Drafts are user work. Old/orphaned drafts remain available in recovery.
    return 0;
  }

  /* ------------------------------------------------------------- settings */

  function defaultSettings() {
    return {
      schema: SCHEMA, mig: 0, theme: 'dark',
      questions: defaultQuestions(),
      nextGoals: [],
      /* Which course's syllabus and categories are in force. null means it has
         never been chosen, which is what makes the picker appear once. */
      course: null,
      pin: null, lastExport: 0, lastBackup: 0, installDismissed: false, startDismissed: false,
      releaseSeen: null, pilotProfile: { name: '', callsign: '', focus: '' }
    };
  }

  /* Display preferences added after MIG 5. They are optional: absent means the
     default (no manual hours, motion by the phone, haptics on, every home
     section shown), so no migration writes them and no record changes. */
  var HOME_PARTS = ['focus', 'quick', 'goals', 'recent'];
  var PREFS = {
    // minutes added to (or taken from) the logged total, never a flight
    hoursAdjust: function (v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 600000 && Math.round(v) === v; },
    motion: function (v) { return ['auto', 'full', 'reduced', 'off'].indexOf(v) !== -1; },
    haptics: function (v) { return typeof v === 'boolean'; },
    homeHide: function (v) { return Array.isArray(v) && v.every(function (x) { return HOME_PARTS.indexOf(x) !== -1; }); }
  };

  /** The active course, always a real one. */
  function course() {
    var C = global.Courses;
    if (!C) return null;
    return C.resolve(settings && settings.course);
  }
  function courseId() {
    var c = course();
    return c ? c.id : null;
  }

  /* Targeted migrations. Bumping SCHEMA rebuilds the whole question list from
     the defaults, which throws away anything he renamed or added; these change
     one field and leave the rest of his setup alone. */
  var MIG = 5;
  function migrate(base) {
    var m = +base.mig || 0;
    function byId(id) {
      return base.questions.filter(function (q) { return q.id === id; })[0] || null;
    }
    if (m < 1) {
      // נקודות עיקריות is an itemized list now, not one block of text
      var qp = byId('q_points');
      if (qp && qp.type === 'textarea') qp.type = 'list';
      m = 1;
    }
    if (m < 2) {
      // the solo call is found by role, so renaming it keeps the home readout
      var qs = byId('q_solo');
      if (qs && !qs.role) qs.role = 'solo';
      m = 2;
    }
    if (m < 3) {
      // מדריך and נקודות עיקריות are read by role now, so the instructor
      // breakdown and the read-across list survive a rename
      var qi = byId('q_instructor');
      if (qi && !qi.role) qi.role = 'instructor';
      var qpt = byId('q_points');
      if (qpt && !qpt.role) qpt.role = 'points';
      m = 3;
    }
    if (m < 4) {
      // Additive only. A previous CSV export does not establish a recovery backup.
      base.lastBackup = +base.lastBackup || 0;
      base.startDismissed = !!base.startDismissed;
    }
    if (m < 5) {
      // Optional local identity only; no flight, question, draft or course changes.
      base.pilotProfile = base.pilotProfile || { name: '', callsign: '', focus: '' };
    }
    base.mig = MIG;
  }

  function normalizeQuestion(q, i) {
    var type = TYPES.indexOf(q.type) === -1 ? 'text' : q.type;
    var stage = STAGES.indexOf(q.stage) === -1 ? 'debrief' : q.stage;
    var inDebrief = q.inDebrief;
    if (stage === 'brief' && ['edit', 'readonly', 'none'].indexOf(inDebrief) === -1) inDebrief = 'edit';
    return {
      id: q.id || uid('q'),
      label: String(q.label || '').trim() || 'שאלה',
      type: type,
      stage: stage,
      inDebrief: stage === 'brief' ? inDebrief : null,
      options: Array.isArray(q.options) ? q.options.filter(function (o) { return String(o).trim(); }) : [],
      suggest: !!q.suggest,
      hint: q.hint || '',
      role: q.role || null,
      archived: !!q.archived,
      order: typeof q.order === 'number' ? q.order : i
    };
  }

  function ensureRoles(qs) {
    [['goals', 'brief'], ['goalsNext', 'debrief']].forEach(function (pair) {
      if (qs.some(function (q) { return q.role === pair[0] && !q.archived; })) return;
      var def = defaultQuestions().filter(function (q) { return q.role === pair[0]; })[0];
      def.order = qs.length;
      qs.push(def);
    });
  }

  function loadSettings() {
    var s;
    try { s = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null'); } catch (e) { s = null; }
    if (!s && localStorage.getItem(LS_SETTINGS)) {
      if (!writeLocal('sortie:damaged-settings', localStorage.getItem(LS_SETTINGS))) throw failure('RECOVERY_REQUIRED');
      s = readJSON('sortie:settings:last-good', null);
      storageIssue = true;
    }
    if (s && (+s.mig || 0) < 4 && !localStorage.getItem('sortie:pre-v23')) {
      if (!writeLocal('sortie:pre-v23', JSON.stringify({ settings: s, mirror: localStorage.getItem(LS_MIRROR), drafts: draftEntries() }))) throw failure('RECOVERY_REQUIRED');
    }
    var base = defaultSettings();
    if (s && typeof s === 'object') {
      Object.keys(s).forEach(function (k) {
        if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype') base[k] = s[k];
      });
      // anything older than v3 predates the brief/debrief split
      if (!Array.isArray(s.questions) || !s.questions.length || (s.schema || 0) < SCHEMA) {
        base.questions = defaultQuestions();
      }
    }
    base.questions = base.questions.map(normalizeQuestion);
    ensureRoles(base.questions);

    // Categories added in later versions get merged into the existing question
    // rather than forcing a rebuild, so his own edits survive the update.
    (function () {
      var live = base.questions.filter(function (q) { return q.role === 'subject'; })[0];
      var def = defaultQuestions().filter(function (q) { return q.role === 'subject'; })[0];
      if (!live || !def) return;
      def.options.forEach(function (o) {
        if (live.options.indexOf(o) === -1) live.options.push(o);
      });
    })();
    migrate(base);
    base.nextGoals = (Array.isArray(base.nextGoals) ? base.nextGoals : []).map(normalizeGoal);
    base.schema = SCHEMA;
    return base;
  }
  var settingsMutation = false;
  function saveSettings() {
    var old = localStorage.getItem(LS_SETTINGS);
    if (old) { try { JSON.parse(old); writeLocal('sortie:settings:last-good', old); } catch (e) {} }
    var ok = writeLocal(LS_SETTINGS, JSON.stringify(settings));
    if (!ok && settingsMutation) throw failure('STORAGE_FULL');
    return ok;
  }

  /** A goal. `cats` is which flight categories it is waiting on: a goal missed
   *  on an AW flight comes back on the next AW flight and nowhere else. Empty
   *  means it belongs to no category in particular and rides the next flight
   *  whatever it is — that is what a goal typed on the home screen gets.
   *
   *  `from` is the flight that put it on the shelf. It exists so re-saving a
   *  flight replaces only that flight's own contribution instead of rebuilding
   *  the whole shelf from one record — see the carry in save(). */
  function normalizeGoal(g) {
    g = g || {};
    if (typeof g === 'string') g = { text: g };
    return {
      id: g.id || uid('g'),
      text: String(g.text == null ? '' : g.text),
      status: ['open', 'met', 'missed'].indexOf(g.status) === -1 ? 'open' : g.status,
      cats: Array.isArray(g.cats)
        ? g.cats.map(String).filter(function (c) { return c.trim(); })
        : [],
      from: g.from ? String(g.from) : null,
      course: g.course || null,
      carryOf: g.carryOf || null,
      sourceId: g.sourceId || null,
      suggested: g.suggested || null,
      originalText: g.originalText == null ? null : String(g.originalText)
    };
  }
  /** One line of an itemized answer, e.g. a נקודות עיקריות bullet. */
  function normalizeItem(x) {
    x = x || {};
    if (typeof x === 'string') x = { text: x };
    return { id: x.id || uid('i'), text: String(x.text == null ? '' : x.text) };
  }
  /** A syllabus row. `focus` is the דגש written at the תדריך, `notes` is what
   *  actually happened, written at the תחקיר. */
  function normalizeEx(x) {
    x = x || {};
    if (typeof x === 'string') x = { text: x };
    return {
      id: x.id || uid('x'),
      text: String(x.text == null ? '' : x.text),
      focus: String(x.focus == null ? '' : x.focus),
      notes: String(x.notes == null ? '' : x.notes)
    };
  }

  /* -------------------------------------------------------------- records */

  function typeOf(qid) {
    var q = Store.question(qid);
    return q ? q.type : null;
  }

  function normalize(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw failure('INVALID_RECORD');
    var out = Object.assign({}, r, {
      id: r.id || uid('f'),
      flownAt: r.flownAt || todayISO(),
      stage: r.stage === 'done' ? 'done' : 'brief',   // brief = flown not yet debriefed
      /* The course this was flown under. Stamped when the record is FIRST
         saved and never rewritten — not filled in here, on purpose. Every
         flight that already existed before courses were a thing predates the
         answer, and guessing one for it would be a label that is wrong for
         anybody who has since moved up a stage, or who restores an old backup
         while set to the other course. null means "before this was recorded",
         which is true and harmless. */
      course: r.course || null,
      answers: {},
      createdAt: r.createdAt == null ? 0 : r.createdAt,
      updatedAt: r.updatedAt == null ? (r.createdAt == null ? 0 : r.createdAt) : r.updatedAt
    });
    var src = (r.answers && typeof r.answers === 'object') ? r.answers : {};
    Object.keys(src).forEach(function (k) { out.answers[k] = src[k]; });

    // coerce the structured types no matter which version wrote them
    (settings ? settings.questions : defaultQuestions()).forEach(function (q) {
      if (q.type === 'goals') {
        var g = out.answers[q.id];
        out.answers[q.id] = Array.isArray(g) ? g.map(normalizeGoal) : [];
      } else if (q.type === 'syllabus') {
        var x = out.answers[q.id];
        if (typeof x === 'string') {
          x = x.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
        }
        out.answers[q.id] = Array.isArray(x) ? x.map(normalizeEx) : [];
      } else if (q.type === 'list') {
        // answers written while this was a plain text box split into bullets
        var li = out.answers[q.id];
        if (typeof li === 'string') {
          li = li.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
        }
        out.answers[q.id] = Array.isArray(li) ? li.map(normalizeItem) : [];
      }
    });
    return out;
  }

  /* Categories are recognised as key phrases inside נושא טיסה, so "AW 3" and
     "ניווט 5" both match their category and the flight number is ignored.
     Hebrew gershayim get normalised because a phone keyboard may produce
     either ״ or a straight quote. */
  function normCat(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[״׳"']/g, '"').replace(/([a-zא-ת])(\d)/gi, '$1 $2').replace(/\s+/g, ' ').trim();
  }

  /* The categories come from the COURSE, not from the stored question. The two
     courses have different series, so options saved on the question would be
     the previous course's the moment anybody switched — and a category that is
     not in the vocabulary silently drops its flights out of the goal loop. */
  function categoryVocab(id) {
    var c = id && global.Courses ? Courses.get(id) : course();
    if (c && c.categories && c.categories.length) return c.categories.slice();
    var q = subjectQuestion();
    if (q && q.options && q.options.length) return q.options.slice();
    var found = [];
    settings.questions.forEach(function (x) {
      if (x.type === 'text' && x.options && x.options.length) found = found.concat(x.options);
    });
    return found;
  }

  function subjectQuestion() {
    return roleQuestion('subject') || Store.question('q_subject');
  }

  /* Spellings that mean a category without naming it. The syllabus matcher
     folds these too — if they only lived there, writing "אווירובטיקה 7" would
     load the right exercises and then file the flight under no category at
     all, so it would drop out of the AW filter and the AW goal carry.
     Per course, because מתקדם spells things its own way (קאב / קא״ב). */
  function catAliases() {
    var c = course();
    return (c && c.aliases) || {};
  }

  /** Which of the known categories appear in a נושא טיסה, e.g. "AW 7 לילה"
   *  is both AW and לילה. The flight number is ignored on purpose. */
  function categoriesInText(text, id) {
    var hay = normCat(text);
    if (!hay) return [];
    var vocab = categoryVocab(id), c = id && global.Courses ? Courses.get(id) : course();
    var aliases = (c && c.aliases) || {}, matches = [];
    vocab.map(function (v) { return [v, v]; }).concat(Object.keys(aliases).map(function (a) {
      return [a, aliases[a]];
    })).forEach(function (pair) {
      var phrase = normCat(pair[0]), start = -1;
      while ((start = hay.indexOf(phrase, start + 1)) !== -1) {
        var end = start + phrase.length;
        if ((start && /[a-zא-ת]/i.test(hay[start - 1])) || (end < hay.length && /[a-zא-ת]/i.test(hay[end]))) continue;
        matches.push({ start: start, end: end, category: pair[1] });
      }
    });
    matches.sort(function (a, b) { return (b.end - b.start) - (a.end - a.start); });
    var occupied = [], out = [];
    matches.forEach(function (m) {
      if (c && c.id !== 'rishoni' && occupied.some(function (x) { return m.start < x.end && m.end > x.start; })) return;
      occupied.push(m);
      if (out.indexOf(m.category) === -1) out.push(m.category);
    });
    return vocab.filter(function (v) { return out.indexOf(v) !== -1; });
  }

  /** Which of the known categories appear in this flight's נושא טיסה. */
  function categoriesOf(rec) {
    var q = questionFor(rec, 'subject') || Store.question('q_subject');
    // Text tags for unassigned history use both vocabularies, independent of
    // Settings. They never assign a course or syllabus credit.
    if (!rec.course) {
      var tags = [];
      (global.Courses ? Courses.all() : []).forEach(function (c) { categoriesInText(q && rec.answers[q.id], c.id).forEach(function (cat) { if (tags.indexOf(cat) === -1) tags.push(cat); }); });
      return tags;
    }
    return q ? categoriesInText(rec.answers[q.id], rec.course) : [];
  }

  /** The goals waiting on a flight of these categories: the ones missed or set
   *  for next time on the last flight that shared a category, plus anything
   *  untagged. This is what a תדריך pulls in once he types the נושא טיסה. */
  function pendingGoalsFor(cats, id) {
    cats = cats || [];
    id = id || courseId();
    return settings.nextGoals.filter(function (g) {
      var origin = g.from && Store.get(g.from);
      var gc = g.course || (origin && origin.course);
      if (gc && gc !== id) return false;
      if (!g.cats.length) return true;
      return g.cats.some(function (c) { return cats.indexOf(c) !== -1; });
    });
  }

  function roleQuestion(role) {
    return settings.questions.filter(function (q) { return q.role === role && !q.archived; })[0] || null;
  }
  function questionFor(rec, role) {
    var active = roleQuestion(role);
    if (active && rec.answers[active.id] !== undefined) return active;
    return settings.questions.filter(function (q) { return q.role === role && rec.answers[q.id] !== undefined; })[0] || active;
  }

  /** What a debriefed flight leaves outstanding: the goals it set for next time
   *  plus the ones it marked ✗. Trimmed text, de-duplicated, order kept. */
  function carriedBy(rec) {
    var qThis = questionFor(rec, 'goals'), qNext = questionFor(rec, 'goalsNext');
    var out = [], seen = {};
    function push(t) {
      t = String(t == null ? '' : t).trim();
      if (!t || seen[t]) return;
      seen[t] = 1; out.push(t);
    }
    if (qNext) (rec.answers[qNext.id] || []).forEach(function (g) { push(g.text); });
    if (qThis) (rec.answers[qThis.id] || []).forEach(function (g) {
      if (g.status === 'missed') push(g.text);
    });
    return out;
  }
  /** A goal is identified by its wording AND what it is waiting on, so the same
   *  sentence pending on ניווט does not swallow the copy an AW flight missed. */
  function gkey(t, cs) { return t + ' :: ' + (cs || []).slice().sort().join(','); }

  /** Did a flight AFTER this one already grade this goal? Editing an old sortie
   *  must not contradict a newer one: putting a ✗ back on a July flight cannot
   *  undo the ✓ an August flight recorded for the same goal. */
  function settledAfter(rec, text) {
    var qThis = roleQuestion('goals');
    if (!qThis) return false;
    var t = String(text).trim();
    return cache.some(function (r) {
      if (r.id === rec.id || r.stage !== 'done') return false;
      if (r.course !== rec.course) return false;
      var cats = categoriesOf(rec), laterCats = categoriesOf(r);
      if (cats.length && !cats.some(function (c) { return laterCats.indexOf(c) !== -1; })) return false;
      if (r.flownAt < rec.flownAt) return false;
      if (r.flownAt === rec.flownAt && (r.createdAt || 0) <= (rec.createdAt || 0)) return false;
      return (r.answers[qThis.id] || []).some(function (g) {
        return String(g.text || '').trim() === t && g.status !== 'open';
      });
    });
  }

  function sortRecords(a, b) {
    if (a.flownAt !== b.flownAt) return a.flownAt < b.flownAt ? 1 : -1;
    return b.createdAt - a.createdAt;
  }
  function resort() { cache.sort(sortRecords); }

  /* ------------------------------------------------------------------ pin */

  function bufToB64(b) { var a = new Uint8Array(b), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function b64ToBuf(x) { var s = atob(x), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function cryptoReady() { return !!(global.crypto && global.crypto.subtle && global.isSecureContext); }
  function derive(pin, salt) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' }, k, 256);
      });
  }

  /* --------------------------------------------------------------- export */

  var BOM = String.fromCharCode(0xFEFF);
  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function answerToText(q, v) {
    if (q.type === 'goals') {
      return (Array.isArray(v) ? v : []).filter(function (g) { return g.text.trim(); })
        .map(function (g) {
          return g.text + (g.status === 'met' ? ' [הושג]' : g.status === 'missed' ? ' [לא הושג]' : '');
        }).join(' | ');
    }
    if (q.type === 'syllabus') {
      return (Array.isArray(v) ? v : []).filter(function (x) { return x.text.trim(); })
        .map(function (x) {
          return x.text +
            (x.focus.trim() ? ' (דגש: ' + x.focus + ')' : '') +
            (x.notes.trim() ? ' — ' + x.notes : '');
        }).join(' | ');
    }
    if (q.type === 'list') {
      return (Array.isArray(v) ? v : []).map(function (x) { return String(x.text || '').trim(); })
        .filter(Boolean).join(' | ');
    }
    if (q.type === 'minutes') return v ? String(v) : '';
    return v == null ? '' : String(v);
  }

  /** An itemized answer as its lines, whichever shape it is stored in. */
  function linesOf(v) {
    if (Array.isArray(v)) {
      return v.map(function (x) { return String(x && x.text != null ? x.text : x).trim(); })
        .filter(Boolean);
    }
    var s = String(v == null ? '' : v).trim();
    return s ? [s] : [];
  }

  function toCSV() {
    var qs = Store.questions(true).slice();
    var head = ['תאריך'].concat(qs.map(function (q) { return q.label + (q.stage === 'brief' ? ' (תדריך)' : ''); }));
    var rows = cache.slice().reverse().map(function (r) {
      return [r.flownAt].concat(qs.map(function (q) {
        return answerToText(q, r.answers[q.id]);
      })).map(csvCell).join(',');
    });
    return BOM + head.map(csvCell).join(',') + '\r\n' + rows.join('\r\n');
  }

  function toJSON() {
    return JSON.stringify({
      app: 'tahkir', schema: SCHEMA, backupVersion: 1, exportedAt: new Date().toISOString(),
      questions: settings.questions, nextGoals: settings.nextGoals, flights: cache,
      preferences: { course: settings.course, theme: settings.theme, startDismissed: settings.startDismissed,
        installDismissed: settings.installDismissed, releaseSeen: settings.releaseSeen, pilotProfile: settings.pilotProfile,
        hoursAdjust: settings.hoursAdjust, motion: settings.motion, haptics: settings.haptics, homeHide: settings.homeHide },
      drafts: draftEntries(), workspace: readJSON('sortie:workspace', null), feedbackDraft: readJSON('sortie:feedback-draft', null), trash: readArray(LS_TRASH)
    }, null, 2);
  }

  function inspectImport(text) {
    var data = JSON.parse(text, function (k, v) {
      if (k === '__proto__' || k === 'prototype' || k === 'constructor') throw failure('INVALID_BACKUP');
      return v;
    });
    if (!data || typeof data !== 'object') throw failure('INVALID_BACKUP');
    var list = Array.isArray(data) ? data : (data.flights || data.debriefs || data.sorties);
    if (!Array.isArray(list)) throw failure('INVALID_BACKUP');
    list.forEach(function (r) {
      if (!r || typeof r !== 'object' || Array.isArray(r) || (r.id != null && typeof r.id !== 'string') ||
          (r.answers != null && (typeof r.answers !== 'object' || Array.isArray(r.answers))) ||
          (r.flownAt && !/^\d{4}-\d{2}-\d{2}$/.test(r.flownAt))) throw failure('INVALID_RECORD');
      normalize(r);
    });
    if (data.questions != null) {
      if (!Array.isArray(data.questions)) throw failure('INVALID_BACKUP');
      var questionIds = {};
      data.questions.forEach(function (q) {
        if (!q || typeof q !== 'object' || !q.id || typeof q.id !== 'string' || questionIds[q.id] || (q.type && TYPES.indexOf(q.type) === -1) || (q.options && !Array.isArray(q.options))) throw failure('INVALID_BACKUP');
        questionIds[q.id] = true;
      });
    }
    if (data.preferences && data.preferences.pilotProfile != null) {
      var profile = data.preferences.pilotProfile;
      if (typeof profile !== 'object' || Array.isArray(profile) || ['name', 'callsign', 'focus'].some(function (k) {
        return profile[k] != null && typeof profile[k] !== 'string';
      })) throw failure('INVALID_BACKUP');
    }
    if (data.nextGoals != null && !Array.isArray(data.nextGoals)) throw failure('INVALID_BACKUP');
    Object.keys(data.drafts || {}).forEach(function (key) {
      if (key !== LS_DRAFT_OLD && key.indexOf(DRAFT_PREFIX) !== 0) throw failure('INVALID_BACKUP');
      var d = JSON.parse(data.drafts[key]);
      if (!d || typeof d !== 'object') throw failure('INVALID_BACKUP');
    });
    if (data.workspace) {
      if (data.workspace.schema !== 1 || !Array.isArray(data.workspace.notes) || !Array.isArray(data.workspace.folders) || !Array.isArray(data.workspace.milestones)) throw failure('INVALID_BACKUP');
      ['notes', 'folders', 'milestones'].forEach(function (kind) { data.workspace[kind].forEach(function (r) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) throw failure('INVALID_BACKUP');
      }); });
    }
    if (data.trash && !Array.isArray(data.trash)) throw failure('INVALID_BACKUP');
    var added = 0, updated = 0;
    list.forEach(function (r) { var have = r.id && Store.get(r.id); if (!have) added++; else if ((r.updatedAt || 0) > (have.updatedAt || 0)) updated++; });
    return { data: data, list: list, added: added, updated: updated,
      drafts: Object.keys(data.drafts || {}).length, notes: data.workspace ? data.workspace.notes.length : 0,
      questions: (data.questions || []).length, goals: (data.nextGoals || []).length };
  }

  function importJSON(text, options) {
    var plan = inspectImport(text), data = plan.data, list = plan.list;
    options = options || {};
    // Never merge over damaged notebook data or mutate settings before checking it.
    if (global.Workspace) Workspace.all();
    var restore = options.restorePreferences === true || cache.length === 0;
    if (!recoverySnapshot('before-import')) return Promise.reject(failure('STORAGE_FULL'));
    var original = { settings: clone(settings), cache: clone(cache) }, remap = {};
    if (Array.isArray(data.questions) && data.questions.length) {
      var byId = {};
      settings.questions.forEach(function (q) { byId[q.id] = q; });
      data.questions.map(normalizeQuestion).forEach(function (q) {
        if (byId[q.id] && byId[q.id].type !== q.type && cache.length) {
          var originalId = q.id;
          q.id += '_import_' + q.type;
          remap[originalId] = q.id;
          if (restore) byId[originalId].archived = true;
          else q.archived = true;
        }
        if (!byId[q.id]) { settings.questions.push(q); byId[q.id] = q; }
        else if (restore) Object.assign(byId[q.id], q);
      });
      ensureRoles(settings.questions);
    }
    if (restore && data.preferences) ['course', 'theme', 'startDismissed', 'installDismissed', 'releaseSeen', 'pilotProfile'].forEach(function (k) {
      if (data.preferences[k] !== undefined) settings[k] = data.preferences[k];
    });
    if (restore && data.preferences) Object.keys(PREFS).forEach(function (k) {
      var v = data.preferences[k];
      if (v !== undefined && PREFS[k](v)) settings[k] = clone(v);
    });
    if (Array.isArray(data.nextGoals)) {
      var shelf = cache.length ? settings.nextGoals.slice() : [], seenGoals = {};
      shelf.forEach(function (g) { seenGoals[g.id] = true; });
      data.nextGoals.map(normalizeGoal).forEach(function (g) { if (!seenGoals[g.id]) { shelf.push(g); seenGoals[g.id] = true; } });
      settings.nextGoals = shelf;
    }
    var have = {};
    cache.forEach(function (r) { have[r.id] = r; });
    var added = 0, updated = 0;
    function remapAnswers(raw) {
      raw = clone(raw);
      Object.keys(remap).forEach(function (old) {
        if (raw.answers && raw.answers[old] !== undefined) { raw.answers[remap[old]] = raw.answers[old]; delete raw.answers[old]; }
      });
      return raw;
    }
    list.forEach(function (raw) {
      var rec = normalize(remapAnswers(raw));
      if (have[rec.id]) {
        if ((rec.updatedAt || 0) <= (have[rec.id].updatedAt || 0)) return;
        Object.assign(have[rec.id], rec); updated++;
      } else {
        cache.push(rec); have[rec.id] = rec; added++;
      }
    });
    resort();
    var values = {}; values[LS_SETTINGS] = JSON.stringify(settings); values[LS_MIRROR] = JSON.stringify(cache);
    Object.keys(data.drafts || {}).forEach(function (key) {
      var old = readJSON(key, null), incoming = JSON.parse(data.drafts[key]);
      if (incoming.rec) incoming.rec = remapAnswers(incoming.rec); else incoming = remapAnswers(incoming);
      if (!old || (+incoming.at || 0) > (+old.at || 0)) values[key] = JSON.stringify(incoming);
    });
    function mergeRows(a, b) {
      var map = Object.create(null);
      (a || []).concat(b || []).forEach(function (r) { if (!r || !r.id) return; if (!map[r.id] || (+r.updatedAt || 0) >= (+map[r.id].updatedAt || 0)) map[r.id] = r; });
      return Object.keys(map).map(function (id) { return map[id]; });
    }
    if (data.workspace) {
      var workspace = readJSON('sortie:workspace', { schema: 1, notes: [], folders: [], milestones: [] });
      ['notes', 'folders', 'milestones'].forEach(function (k) { workspace[k] = mergeRows(workspace[k], data.workspace[k]); });
      values['sortie:workspace'] = JSON.stringify(workspace);
    }
    if (data.trash) values[LS_TRASH] = JSON.stringify(mergeRows(readArray(LS_TRASH), data.trash));
    if (data.feedbackDraft && !localStorage.getItem('sortie:feedback-draft')) values['sortie:feedback-draft'] = JSON.stringify(data.feedbackDraft);
    if (!commitLocal(values)) { settings = original.settings; cache = original.cache; return Promise.reject(failure('IMPORT_NOT_SAVED')); }
    return idbWrite(function (os) { cache.forEach(function (r) { os.put(clone(r)); }); }).then(function (ok) {
      // The complete mirror is durable even where IndexedDB is unavailable.
      if (db && !ok) storageIssue = true;
      Store.applyCourse();
      if (global.Workspace) Workspace.reload();
      return { added: added, updated: updated };
    });
  }

  /* ------------------------------------------------------------------ api */

  var Store = {
    TYPES: TYPES, STAGES: STAGES,
    todayISO: todayISO, uid: uid,
    normalizeGoal: normalizeGoal, normalizeEx: normalizeEx, normalizeItem: normalizeItem,
    linesOf: linesOf,

    init: function () {
      try { recoverTransaction(); settings = loadSettings(); }
      catch (e) { return Promise.reject(e); }
      return withTimeout(openDB(), 2000, null).then(function (d) {
        db = d;
        return withTimeout(idbAll(), 2000, null);
      }).then(function (rows) {
        dbHealthy = rows !== null;
        if (db && !dbHealthy) storageIssue = true;
        var byId = {};
        readMirror().forEach(function (raw) { try { var r = normalize(raw); byId[r.id] = r; } catch (e) { storageIssue = true; } });
        (rows || []).forEach(function (raw) {
          if (!raw || typeof raw !== 'object') { storageIssue = true; return; }
          var r = normalize(raw), have = byId[r.id];
          if (!have || (r.updatedAt || 0) >= (have.updatedAt || 0)) byId[r.id] = r;
        });
        var deleted = readJSON(LS_TRASH, []).filter(function (r) { return r.kind === 'flight'; });
        deleted.forEach(function (r) { if (byId[r.id] && (+r.updatedAt || 0) >= (+byId[r.id].updatedAt || 0)) delete byId[r.id]; });
        cache = Object.keys(byId).map(function (k) { return byId[k]; });
        resort(); mirror(); saveSettings();
        if (db && dbHealthy) {
          var inDb = {};
          (rows || []).forEach(function (r) { inDb[r.id] = 1; });
          cache.forEach(function (r) { if (!inDb[r.id]) idbPut(clone(r)); });
        }
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
        pruneDrafts();
        return Store;
      });
    },

    /* --- questions --- */
    questions: function (all) {
      return settings.questions
        .filter(function (q) { return all || !q.archived; })
        .sort(function (a, b) { return a.order - b.order; });
    },
    /** Questions to render for a stage. The debrief also shows brief answers. */
    stageQuestions: function (stage, all) {
      return Store.questions(all).filter(function (q) {
        if (stage === 'brief') return q.stage === 'brief';
        return q.stage === 'debrief' || (q.stage === 'brief' && q.inDebrief !== 'none');
      });
    },
    question: function (id) {
      return settings.questions.filter(function (q) { return q.id === id; })[0] || null;
    },
    roleQuestion: roleQuestion,
    questionFor: questionFor,
    isProtected: isProtected,

    /* --- course --- */
    course: course,
    courseId: courseId,
    /** Has a course ever been chosen? The picker shows exactly once on this. */
    coursePicked: function () { return !!(settings && settings.course); },
    setCourse: function (id) {
      var c = global.Courses ? global.Courses.resolve(id) : null;
      if (!c) return null;
      settings.course = c.id;
      saveSettings();
      if (global.SyllabusRef) global.SyllabusRef.setCourse(c.id);
      return c;
    },
    /** Point the syllabus at whatever the settings say. Called at boot. */
    applyCourse: function () {
      var c = course();
      if (c && global.SyllabusRef) global.SyllabusRef.setCourse(c.id);
      return c;
    },

    categoryVocab: categoryVocab,
    categoriesOf: categoriesOf,
    categoriesInText: categoriesInText,
    pendingGoalsFor: pendingGoalsFor,

    addQuestion: function (q) {
      var out = normalizeQuestion(q, settings.questions.length);
      out.order = settings.questions.length;
      settings.questions.push(out); saveSettings();
      return out;
    },
    updateQuestion: function (id, patch) {
      var q = Store.question(id);
      if (!q) return null;
      if (patch.type && patch.type !== q.type && !isProtected(q) && TYPES.indexOf(patch.type) !== -1 &&
          cache.some(function (r) { return r.answers[id] !== undefined; })) {
        var next = clone(q); next.id = uid('q'); next.archived = false;
        q.archived = true; settings.questions.push(next); q = next;
      }
      if (patch.label !== undefined) q.label = String(patch.label).trim() || q.label;
      if (patch.hint !== undefined) q.hint = patch.hint;
      if (patch.stage !== undefined && !isProtected(q) && STAGES.indexOf(patch.stage) !== -1) {
        q.stage = patch.stage;
        q.inDebrief = patch.stage === 'brief' ? (q.inDebrief || 'edit') : null;
      }
      if (patch.inDebrief !== undefined && q.stage === 'brief') q.inDebrief = patch.inDebrief;
      if (patch.type !== undefined && !isProtected(q) && TYPES.indexOf(patch.type) !== -1) q.type = patch.type;
      if (patch.options !== undefined) {
        q.options = patch.options.filter(function (o) { return String(o).trim(); });
      }
      saveSettings();
      return q;
    },
    removeQuestion: function (id) {
      var q = Store.question(id);
      if (!q || isProtected(q)) return false;
      q.archived = true; saveSettings();
      return true;
    },
    moveQuestion: function (id, dir) {
      var live = Store.questions();
      var i = live.findIndex(function (q) { return q.id === id; });
      var j = i + dir;
      if (i === -1 || j < 0 || j >= live.length) return false;
      var t = live[i].order; live[i].order = live[j].order; live[j].order = t;
      saveSettings();
      return true;
    },
    resetQuestions: function () {
      if (!recoverySnapshot('before-template-reset')) throw failure('STORAGE_FULL');
      var defaults = defaultQuestions(), ids = {};
      defaults.forEach(function (q) { ids[q.id] = true; });
      var historical = settings.questions.filter(function (q) { return !ids[q.id]; });
      historical.forEach(function (q) { q.archived = true; });
      // Keep the stored type for an existing definition: changing the template must not reinterpret answers.
      defaults.forEach(function (q) { var old = Store.question(q.id); if (old) q.type = old.type; });
      settings.questions = defaults.concat(historical); saveSettings();
    },

    /** Previously used answers for a question, newest first, for suggestions. */
    suggestions: function (qid) {
      var seen = {}, out = [];
      cache.forEach(function (r) {
        var v = r.answers[qid];
        if (typeof v !== 'string') return;
        v = v.trim();
        if (!v || seen[v]) return;
        seen[v] = 1; out.push(v);
      });
      return out.slice(0, 8);
    },

    /* --- goals for the next flight --- */
    nextGoals: function () { return settings.nextGoals; },
    addNextGoal: function (text) {
      var g = normalizeGoal({ text: text, course: courseId() });
      settings.nextGoals.push(g); saveSettings();
      return g;
    },
    removeNextGoal: function (id) {
      settings.nextGoals = settings.nextGoals.filter(function (g) { return g.id !== id; });
      saveSettings();
    },
    setNextGoals: function (list) {
      settings.nextGoals = (list || []).map(normalizeGoal)
        .filter(function (g) { return g.text.trim(); });
      saveSettings();
      return settings.nextGoals;
    },

    /* --- flights --- */
    all: function () { return cache; },
    count: function () { return cache.length; },
    get: function (id) {
      for (var i = 0; i < cache.length; i++) if (cache[i].id === id) return cache[i];
      return null;
    },
    latest: function () { return cache[0] || null; },
    /** The briefed flight still waiting on its debrief, if there is one. */
    openBrief: function () {
      for (var i = 0; i < cache.length; i++) if (cache[i].stage === 'brief') return cache[i];
      return null;
    },
    /** ALL of them, newest first. Flying four times a week means forgetting a
     *  תחקיר is routine, and showing only the newest hid the older one
     *  everywhere except the log. */
    openBriefs: function () {
      return cache.filter(function (r) { return r.stage === 'brief'; });
    },
    done: function () { return cache.filter(function (r) { return r.stage === 'done'; }); },

    /** A fresh brief. Only the untagged goals come in here — the ones tied to a
     *  category cannot be known until he types the נושא טיסה, so the form pulls
     *  those in as he does. */
    newBrief: function () {
      var rec = { id: '', flownAt: todayISO(), stage: 'brief', course: courseId(), answers: {} };
      var qg = roleQuestion('goals');
      if (qg) {
        rec.answers[qg.id] = pendingGoalsFor([]).map(function (g) {
          return Object.assign({}, g, { status: 'open', sourceId: g.sourceId || g.id });
        });
      }
      return rec;
    },

    /** The goal texts a debriefed flight leaves outstanding: what it set for
     *  next time, plus what it marked ✗. */
    carriedBy: carriedBy,

    save: function (rec) {
      // Other tabs can save between form-open and Save. Merge their durable mirror first.
      var merged = {};
      cache.concat(readMirror()).forEach(function (r) { if (r && r.id && (!merged[r.id] || (+r.updatedAt || 0) > (+merged[r.id].updatedAt || 0))) merged[r.id] = r; });
      cache = Object.keys(merged).map(function (id) { return merged[id]; });
      var diskSettings = readJSON(LS_SETTINGS, null);
      if (diskSettings && Array.isArray(diskSettings.nextGoals)) settings.nextGoals = diskSettings.nextGoals.map(normalizeGoal);
      var existing = rec.id ? Store.get(rec.id) : null;
      if (existing && rec.baseUpdatedAt != null && +rec.baseUpdatedAt !== +existing.updatedAt) return Promise.reject(failure('EDIT_CONFLICT'));
      var oldCache = clone(cache), oldSettings = clone(settings);
      // snapshot BEFORE the merge — the goal delta below compares against it,
      // and Object.assign(existing, …) would otherwise overwrite it in place
      var wasDone = !!(existing && existing.stage === 'done');
      var before = wasDone ? carriedBy(existing) : [];

      var out;
      if (existing) {
        out = normalize(Object.assign({}, existing, rec, { course: existing.course }));
        Object.assign(existing, out); out = existing;
      } else {
        out = normalize(rec);
        if (!out.createdAt) out.createdAt = Date.now();
        // a brand-new flight is the only thing that knows its own course
        if (!out.course) out.course = courseId();
        cache.push(out);
      }
      out.updatedAt = Math.max(Date.now(), (existing && +existing.updatedAt || 0) + 1);
      delete out.baseUpdatedAt; delete out.buffers; delete out.draftNew;

      // Roll the goal loop forward once the flight is debriefed: goals set for
      // next time, plus anything missed today, go back on the shelf TAGGED with
      // this flight's categories. They come out again on the next flight that
      // shares one, so an AW goal waits for the next AW and nothing else.
      if (out.stage === 'done') {
        var cats = categoriesOf(out);
        var now = carriedBy(out);

        if (!wasDone) {
          /* First time this flight is debriefed. Everything it could have
             pulled in is settled: the goals sharing a category with it, and the
             untagged ones every flight gets. Whatever it did not settle keeps
             waiting for its own category. */
          var qg = questionFor(out, 'goals');
          var received = qg ? (out.answers[qg.id] || []) : [];
          var keep = settings.nextGoals.filter(function (g) {
            return !received.some(function (taken) {
              if (taken.status === 'open') return false;
              if (taken.id === g.id || taken.sourceId === g.id) return true;
              // Old forms did not persist origin fields; match wording only within the same origin/course.
              var origin = g.from && Store.get(g.from);
              var older = !origin || origin.flownAt < out.flownAt || (origin.flownAt === out.flownAt && origin.createdAt <= out.createdAt);
              return older && taken.text.trim() === g.text.trim() && (!g.course || g.course === out.course) &&
                (!g.cats.length || g.cats.some(function (c) { return cats.indexOf(c) !== -1; }));
            });
          });
          // keyed on the categories too, so the same wording waiting on ניווט
          // does not swallow the copy this AW flight just missed
          var seen = {};
          keep.forEach(function (g) { seen[(g.course || '') + ':' + gkey(g.text.trim(), g.cats)] = 1; });
          now.forEach(function (t) {
            var k = (out.course || '') + ':' + gkey(t, cats);
            if (seen[k]) return;
            if (settledAfter(out, t)) return;
            seen[k] = 1;
            keep.push(normalizeGoal({ text: t, cats: cats, from: out.id, course: out.course }));
          });
          settings.nextGoals = keep;
        } else {
          /* Saving a flight that was ALREADY debriefed — which is what "edit a
             flight" does, for a typo or a note added later. Rebuilding the
             shelf from this one record was wrong twice over: it resurrected
             goals a later flight had since achieved, and it dropped goals a
             later flight of the same category was still waiting on. Both were
             reproduced; see dev/probe-resave.js.
             So apply only what actually CHANGED in this record, and touch no
             goal that belongs to another flight. An edit that does not move a
             ✓/✗ is a no-op here, which is the common case. */
          var had = {}, has = {};
          before.forEach(function (t) { had[t] = 1; });
          now.forEach(function (t) { has[t] = 1; });

          settings.nextGoals = settings.nextGoals.filter(function (g) {
            // no longer outstanding, and this flight is the one that put it up
            return !(g.from === out.id && had[g.text.trim()] && !has[g.text.trim()]);
          });
          var onShelf = {};
          settings.nextGoals.forEach(function (g) { onShelf[(g.course || '') + ':' + gkey(g.text.trim(), g.cats)] = 1; });
          now.forEach(function (t) {
            var key = (out.course || '') + ':' + gkey(t, cats);
            if (had[t] || onShelf[key]) return;
            // and never contradict a later flight: marking something ✗ on an old
            // sortie must not undo a ✓ that a flight after it already recorded
            if (settledAfter(out, t)) return;
            onShelf[key] = 1;
            settings.nextGoals.push(normalizeGoal({ text: t, cats: cats, from: out.id, course: out.course }));
          });
        }
      }

      resort();
      var values = {}; values[LS_MIRROR] = JSON.stringify(cache); values[LS_SETTINGS] = JSON.stringify(settings);
      var settingsOK = out.stage !== 'done' || commitLocal(values);
      var mirrorOK = out.stage === 'done' ? settingsOK : mirror();
      if (!settingsOK) {
        cache = oldCache; settings = oldSettings; saveSettings(); mirror();
        return Promise.reject(failure('STORAGE_FULL'));
      }
      return idbPut(clone(out)).then(function (idbOK) {
        if (!idbOK && !mirrorOK) {
          cache = oldCache; settings = oldSettings; saveSettings();
          throw failure('STORAGE_FULL');
        }
        return out;
      });
    },

    /** Resolves with the record that was removed, so the caller can offer to
     *  put it back. A flight record is the only copy of that debrief there is,
     *  and a confirm dialog is a worse safety net than an undo. */
    remove: function (id) {
      var gone = Store.get(id);
      var copy = gone ? clone(gone) : null;
      if (!copy) return Promise.resolve(null);
      var trash = readJSON(LS_TRASH, []).filter(function (r) { return r.id !== id; });
      trash.push({ id: id, kind: 'flight', updatedAt: Date.now(), record: copy,
        drafts: [Store.readDraft(id, 'brief'), Store.readDraft(id, 'debrief')] });
      if (!writeLocal(LS_TRASH, JSON.stringify(trash))) return Promise.reject(failure('STORAGE_FULL'));
      cache = cache.filter(function (r) { return r.id !== id; });
      mirror();
      Store.clearDraft(id, 'brief'); Store.clearDraft(id, 'debrief');
      return idbDelete(id).then(function () { return copy; });
    },
    /** Put a deleted flight back exactly as it was, goal shelf untouched. */
    restore: function (rec) {
      if (!rec) return Promise.resolve(null);
      var out = normalize(rec);
      out.updatedAt = Math.max(Date.now(), (+rec.updatedAt || 0) + 1);
      var trash = readArray(LS_TRASH), deleted = trash.filter(function (r) { return r.id === out.id; })[0];
      var old = clone(cache), values = {};
      if (!Store.get(out.id)) cache.push(out);
      resort();
      values[LS_MIRROR] = JSON.stringify(cache);
      values[LS_TRASH] = JSON.stringify(trash.filter(function (r) { return r.id !== out.id; }));
      if (deleted && deleted.drafts) deleted.drafts.forEach(function (d, i) { if (d) values[draftKey(out.id, i ? 'debrief' : 'brief')] = JSON.stringify({ at: Date.now(), rec: d }); });
      if (!commitLocal(values)) { cache = old; return Promise.reject(failure('STORAGE_FULL')); }
      return idbPut(clone(out)).then(function () { return out; });
    },
    clearAll: function () {
      if (!recoverySnapshot('before-clear-all')) return Promise.reject(failure('STORAGE_FULL'));
      var trash = readArray(LS_TRASH), oldCache = clone(cache), oldSettings = clone(settings), values = {};
      cache.forEach(function (r) { trash.push({ id: r.id, kind: 'flight', updatedAt: Date.now(), record: clone(r) }); });
      cache = []; settings.nextGoals = [];
      values[LS_TRASH] = JSON.stringify(trash); values[LS_MIRROR] = '[]'; values[LS_SETTINGS] = JSON.stringify(settings);
      if (!commitLocal(values)) { cache = oldCache; settings = oldSettings; return Promise.reject(failure('STORAGE_FULL')); }
      // Drafts and personal notes remain recoverable after clearing flights.
      return idbClear();
    },

    search: function (q) {
      q = (q || '').trim().toLowerCase();
      if (!q) return cache;
      var qs = Store.questions(true);
      return cache.filter(function (r) {
        var hay = [r.flownAt];
        qs.forEach(function (question) { hay.push(answerToText(question, r.answers[question.id])); });
        return hay.join(' ').toLowerCase().indexOf(q) !== -1;
      });
    },

    asText: function (r, fmtDate) {
      var L = ['תחקיר', (fmtDate ? fmtDate(r.flownAt) : r.flownAt), ''];
      Store.questions(true).forEach(function (q) {
        var v = r.answers[q.id];
        var txt = answerToText(q, v);
        if (!txt) return;
        if (q.type === 'goals') {
          L.push(q.label + ':');
          (v || []).filter(function (g) { return g.text.trim(); }).forEach(function (g) {
            L.push('  ' + (g.status === 'met' ? '✓' : g.status === 'missed' ? '✗' : '•') + ' ' + g.text);
          });
        } else if (q.type === 'syllabus') {
          L.push(q.label + ':');
          (v || []).filter(function (x) { return x.text.trim(); }).forEach(function (x) {
            L.push('  • ' + x.text);
            if (x.focus.trim()) L.push('      דגש: ' + x.focus);
            if (x.notes.trim()) L.push('      ' + x.notes);
          });
        } else if (q.type === 'list') {
          L.push(q.label + ':');
          linesOf(v).forEach(function (line) { L.push('  • ' + line); });
        } else if (q.type === 'minutes') {
          L.push(q.label + ': ' + txt + ' דק׳');
        } else {
          L.push(q.label + ': ' + txt);
        }
      });
      return L.join('\n');
    },

    /* --- settings --- */
    settings: function () { return settings; },
    set: function (k, v) {
      if (PREFS[k] && v !== undefined && !PREFS[k](v)) return false;
      var old = settings[k]; settings[k] = v; if (!saveSettings()) { settings[k] = old; return false; } return true;
    },
    homeParts: HOME_PARTS.slice(),
    storageMode: function () { return dbHealthy ? 'indexeddb' : 'local'; },

    setPin: function (pin) {
      if (!cryptoReady()) return Promise.resolve(false);
      var salt = crypto.getRandomValues(new Uint8Array(16));
      return derive(pin, salt).then(function (bits) {
        return Store.set('pin', { salt: bufToB64(salt), hash: bufToB64(bits) });
      });
    },
    checkPin: function (pin) {
      if (!settings.pin || !cryptoReady()) return Promise.resolve(true);
      return derive(pin, b64ToBuf(settings.pin.salt))
        .then(function (b) { return bufToB64(b) === settings.pin.hash; })
        .catch(function () { return false; });
    },
    clearPin: function () { settings.pin = null; saveSettings(); },
    cryptoReady: cryptoReady,

    toCSV: toCSV, toJSON: toJSON, importJSON: importJSON, inspectImport: inspectImport, answerToText: answerToText,
    markExported: function (kind) { settings.lastExport = Date.now(); if (kind === 'backup') settings.lastBackup = Date.now(); saveSettings(); },
    storageIssue: function () { return storageIssue; },
    emergencyJSON: function () {
      var raw = {};
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (/^sortie:(mirror|settings|draft|workspace|feedback-draft|trash|recovery|transaction|pre-v23|damaged)/.test(key)) raw[key] = localStorage.getItem(key);
      }
      return JSON.stringify({ app: 'sortie-raw-recovery', exportedAt: new Date().toISOString(), raw: raw }, null, 2);
    },
    recoverySnapshot: recoverySnapshot,
    recovery: function () { return readJSON(LS_RECOVERY, null); },
    drafts: draftEntries,
    trash: function () { return readArray(LS_TRASH); },
    writeLocal: writeLocal,

    /* --- drafts ---
       One slot per form: 'new' for a תדריך that has no record yet, otherwise
       the stage and the record id. A single shared slot could only ever hold
       one form, which is why the תחקיר had no autosave at all. */
    draftKey: draftKey,
    promoteDraft: function (record) {
      var values = {}, current = localStorage.getItem(draftKey(null));
      // Opening an orphan as a new brief must not overwrite another new brief.
      if (current) values[DRAFT_PREFIX + 'recovered:' + uid('draft')] = current;
      var next = clone(record); next.id = uid('f'); next.draftNew = true;
      values[draftKey(null)] = JSON.stringify({ at: Date.now(), rec: next });
      return commitLocal(values);
    },
    saveDraft: function (d, stage) {
      return writeLocal(draftKey(d && d.draftNew ? null : d && d.id, stage), JSON.stringify({ at: Date.now(), rec: d }));
    },
    readDraft: function (id, stage) {
      var raw = null;
      try { raw = JSON.parse(localStorage.getItem(draftKey(id, stage)) || 'null'); } catch (e) {}
      // the single-slot draft written by builds up to v20
      if (!raw && !id) {
        try { raw = JSON.parse(localStorage.getItem(LS_DRAFT_OLD) || 'null'); } catch (e) {}
      }
      if (!raw) return null;
      var rec = raw && raw.rec ? raw.rec : raw;          // bare record = old shape
      var at = +(raw && raw.at) || 0;
      // Old work stays recoverable; age is displayed instead of deleting it.
      return rec && typeof rec === 'object' ? rec : null;
    },
    draftAge: function (id, stage) {
      try {
        var raw = JSON.parse(localStorage.getItem(draftKey(id, stage)) || 'null');
        return raw && raw.at ? Date.now() - raw.at : null;
      } catch (e) { return null; }
    },
    clearDraft: function (id, stage) {
      try {
        localStorage.removeItem(draftKey(id, stage));
        if (!id) localStorage.removeItem(LS_DRAFT_OLD);
      } catch (e) {}
    },
    pruneDrafts: pruneDrafts
  };

  // Preference actions either persist or retain their previous value.
  ['setCourse', 'addQuestion', 'updateQuestion', 'removeQuestion', 'moveQuestion', 'resetQuestions',
    'addNextGoal', 'removeNextGoal', 'setNextGoals', 'clearPin'].forEach(function (name) {
    var action = Store[name];
    Store[name] = function () {
      var before = clone(settings); settingsMutation = true;
      try { return action.apply(Store, arguments); }
      catch (e) { settings = before; throw e; }
      finally { settingsMutation = false; }
    };
  });
  global.Store = Store;
})(window);
