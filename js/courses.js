/* תחקיר — the courses the app knows about.
 *
 * A course decides three things: which syllabus a גיחה is looked up in, which
 * categories the נושא טיסה field offers, and therefore which flights the goal
 * loop treats as "the same kind of flight". Everything else — the questions,
 * the two-stage form, the weekly summary — is shared.
 *
 * Adding a course means adding an entry here plus its syllabus file. Nothing
 * else in the app needs to know the list.
 */
(function (g) {
  'use strict';

  var COURSES = [
    {
      id: 'rishoni',
      label: 'ראשוני',
      /* Categories are matched as key phrases inside נושא טיסה, so "AW 3"
         files under AW and the number is ignored. */
      categories: ['AW', 'ניווט', 'הקפות', 'מבנה', 'גנ״מ', 'מ״מ', 'משולבת',
                   'לילה', 'סולו', 'א״א', 'מאמן'],
      /* Spellings that mean a category without naming it. */
      aliases: { 'אווירובטיקה': 'AW', 'מבנה מתקדם': 'מ״מ' }
    },
    {
      id: 'mitkadem',
      label: 'מתקדם',
      /* The seventeen series of the מתקדם chart, kept separate rather than
         folded together: א and ב of a series are flown differently, and
         collapsing them would merge two sets of goals that should not mix. */
      categories: ['הסבה', 'מבנה', 'צ״א', 'רב״ש', 'הכנות', 'קא״ב', 'סולו',
                   'מטוס פתוח', 'לילה בסיסי', 'לילה מתקדם', 'יירוטים א',
                   'יירוטים ב', 'מוגבל', 'חתפים', 'בנ״ז', 'הכנה למסכמות',
                   'מסכמת', 'מאמן'],
      /* The chart is not consistent with its own spelling, and neither is a
         phone keyboard. Every form on the left resolves to the category on the
         right, so it does not matter which one gets typed. */
      aliases: {
        'קאב': 'קא״ב',
        'קא"ב': 'קא״ב',
        'ירוטים א': 'יירוטים א',
        'ירוטים ב': 'יירוטים ב',
        'יירוטים': 'יירוטים א',
        'ירוטים': 'יירוטים א',
        'בנז': 'בנ״ז',
        'רבש': 'רב״ש',
        'צא': 'צ״א',
        'מסכמות': 'מסכמת',
        'לילה': 'לילה בסיסי'
      }
    }
  ];

  var DEFAULT = 'rishoni';

  function get(id) {
    for (var i = 0; i < COURSES.length; i++) if (COURSES[i].id === id) return COURSES[i];
    return null;
  }

  g.Courses = {
    all: function () { return COURSES.slice(); },
    get: get,
    /** Never returns null: an unknown id falls back rather than leaving the app
     *  with no categories and no syllabus at all. */
    resolve: function (id) { return get(id) || get(DEFAULT); },
    defaultId: DEFAULT,
    ids: function () { return COURSES.map(function (c) { return c.id; }); },
    label: function (id) { var c = get(id); return c ? c.label : ''; }
  };
})(window);
