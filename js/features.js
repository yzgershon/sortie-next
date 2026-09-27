/* Notebook, course journey, feedback, recovery and release notes. */
(function (g) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function $(s, root) { return (root || document).querySelector(s); }
  function all(s, root) { return Array.from((root || document).querySelectorAll(s)); }
  function date(ts) { return new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function button(label, attr, ic, cls) { return '<button type="button" class="btn ' + (cls || '') + '" ' + attr + '>' + (ic ? icon(ic) : '') + esc(label) + '</button>'; }
  function input(label, id, value, type) { return '<label class="field"><span class="field__label"><b>' + esc(label) + '</b></span><input class="input" id="' + id + '" type="' + (type || 'text') + '" dir="auto" value="' + esc(value || '') + '"></label>'; }
  function profile(route, ui) {
    ui.topbar({ title: T.pilotProfile, back: true, backTo: 'settings' });
    var pilot = Store.settings().pilotProfile || {}, dirty = false, timer;
    ui.view.innerHTML = '<section class="profile-editor stack-6"><header class="page-heading"><span class="page-heading__context">' + esc(Store.course().label) + '</span><h1>' + esc(T.pilotProfile) + '</h1><p>' + esc(T.pilotProfileSub) + '</p></header>' +
      '<div class="panel"><div class="panel__body stack-6">' + input(T.pilotName, 'pilotName', pilot.name) + input(T.pilotCallsign, 'pilotCallsign', pilot.callsign) +
      '<label class="field"><span class="field__label"><b>' + esc(T.pilotFocus) + '</b></span><textarea class="input ta" id="pilotFocus" rows="3" maxlength="240" dir="auto" placeholder="' + esc(T.pilotFocusPlaceholder) + '">' + esc(pilot.focus || '') + '</textarea></label></div></div>' +
      '<p class="field__hint">' + esc(T.pilotProfileHint) + '</p><p class="profile-status" id="profileState" role="status">' + esc(T.profileSaved) + '</p></section>';
    $('#pilotName').maxLength = 80; $('#pilotCallsign').maxLength = 32;
    function flush() {
      clearTimeout(timer); if (!dirty) return true;
      var saved = Store.set('pilotProfile', { name: $('#pilotName').value.trim(), callsign: $('#pilotCallsign').value.trim(), focus: $('#pilotFocus').value.trim() });
      $('#profileState').textContent = saved ? T.profileSaved : T.saveFailed;
      if (saved) dirty = false;
      return saved;
    }
    $('.profile-editor').addEventListener('input', function () { dirty = true; $('#profileState').textContent = T.draftSaving; clearTimeout(timer); timer = setTimeout(flush, 400); });
    ui.setFlush(flush);
  }
  function notebook(route, ui) {
    var data = Workspace.all(), folders = data.folders.filter(function (f) { return !f.deletedAt; });
    var folder = g.Features.folder || '', query = g.Features.noteQuery || '';
    if (folder && folder !== 'inbox' && !folders.some(function (f) { return f.id === folder; })) folder = g.Features.folder = '';
    var selectedFolder = folders.find(function (f) { return f.id === folder; });
    var existing = route.param && Workspace.note(route.param);
    if (existing && !existing.deletedAt) return editor(existing, folders, ui);
    // the notebook is a main tab, so its list is a top-level screen
    ui.topbar({ title: T.app });
    ui.view.innerHTML = '<section class="notebook"><header class="notebook__heading"><span class="page-heading__context">' + esc(T.notebookTitle) + '</span>' +
      '<h1>' + esc(selectedFolder ? selectedFolder.title : folder === 'inbox' ? T.noteInbox : T.noteAll) + '</h1><p id="noteCount" role="status"></p>' +
      '<div class="notebook__toolbar">' +
      button(T.noteFolders, 'data-folders aria-controls="notebookFolders" aria-expanded="false" aria-haspopup="dialog"', 'folder') + button(T.noteNew, 'data-newnote', 'plus', 'btn--lit') + '</div></header>' +
      '<label class="search">' + icon('search') + '<input class="input" id="noteSearch" type="search" value="' + esc(query) + '" placeholder="' + esc(T.noteSearch) + '" aria-label="' + esc(T.noteSearch) + '"></label>' +
      '<div id="noteRows"></div><p class="notebook__foot">' + esc(T.onDeviceOnly) + '</p>' +
      '<dialog id="notebookFolders" class="notebook-drawer" aria-labelledby="notebookFoldersTitle"><div class="notebook-drawer__head"><h2 id="notebookFoldersTitle">' + esc(T.noteFolders) + '</h2>' +
      '<button type="button" class="iconbtn" data-closefolders aria-label="' + esc(T.closeFolders) + '">' + icon('x') + '</button></div><nav aria-label="' + esc(T.noteFolders) + '">' +
      [{ id: '', title: T.noteAll }, { id: 'inbox', title: T.noteInbox }].concat(folders).map(function (f) {
        var count = data.notes.filter(function (n) { return !n.deletedAt && (!f.id || (f.id === 'inbox' ? !n.folder : n.folder === f.id)); }).length;
        return '<button type="button" class="notebook-drawer__folder" data-folder="' + esc(f.id) + '"' + (folder === f.id ? ' aria-current="page"' : '') + '>' + icon(f.id ? 'folder' : 'notebook') + '<span>' + esc(f.title) + '</span><small>' + count + '</small></button>';
      }).join('') + '</nav><div class="notebook-drawer__tools">' + button(T.folderNew, 'data-newfolder', 'plus') +
      (selectedFolder ? '<details class="notebook__options"><summary>' + esc(T.folderOptions) + icon('chevDown') + '</summary><div class="notebook__actions">' + button(T.folderRename, 'data-renamefolder', 'pencil') + button(T.folderDelete, 'data-deletefolder', 'trash') + '</div></details>' : '') + '</div></dialog></section>';
    var drawer = $('#notebookFolders'), toggle = $('[data-folders]');
    toggle.onclick = function () { drawer.showModal(); toggle.setAttribute('aria-expanded', 'true'); };
    drawer.addEventListener('close', function () { toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); });
    $('[data-closefolders]').onclick = function () { drawer.close(); };
    drawer.onclick = function (e) {
      if (e.target !== drawer) return;
      var r = drawer.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) drawer.close();
    };
    all('[data-folder]', drawer).forEach(function (el) { el.onclick = function () {
      drawer.close(); g.Features.folder = el.dataset.folder; notebook(route, ui); $('[data-folders]').focus();
    }; });
    function paint() {
      var notes = Workspace.all().notes.filter(function (n) {
        return !n.deletedAt && (!folder || (folder === 'inbox' ? !n.folder : n.folder === folder)) &&
          (!query || (n.title + '\n' + n.body).toLowerCase().indexOf(query.toLowerCase()) !== -1);
      }).sort(function (a, b) { return (+b.pinned - +a.pinned) || b.priority - a.priority || b.updatedAt - a.updatedAt; });
      $('#noteCount').textContent = T.noteCount(notes.length);
      $('#noteRows').innerHTML = notes.length ? notes.map(function (n) {
          return '<a class="note-page" href="#/notebook/' + encodeURIComponent(n.id) + '"><div class="note-page__meta"><span class="note-page__date">' + esc(date(n.updatedAt)) + '</span>' + (n.priority ? '<span class="note-page__priority priority-' + n.priority + '">' + esc(T.priorities[n.priority]) + '</span>' : '') + '</div>' +
            '<h2>' + (n.pinned ? icon('flag') : '') + esc(n.title || T.noteUntitled) + '</h2><p dir="auto">' + esc((n.body || '').slice(0, 150)) + '</p>' +
            '</a>';
        }).join('') : '<div class="notebook__empty">' + icon(query ? 'search' : 'notebook') + '<h2>' + esc(query ? T.noteSearchEmpty : T.noteEmpty) + '</h2><p>' + esc(query ? T.noteSearchEmptyBody : T.noteEmptyBody) + '</p></div>';
    }
    if (selectedFolder) {
      $('[data-renamefolder]').onclick = function () { folderSheet(selectedFolder); };
      $('[data-deletefolder]').onclick = function () { drawer.close(); ui.confirm({ title: T.folderDelete, text: T.folderDeleteBody, onConfirm: function () {
        try { Workspace.removeFolder(folder); g.Features.folder = ''; notebook(route, ui); } catch (e) { ui.toast(T.saveFailedBody, 'alert'); }
      } }); };
    }
    function folderSheet(f) {
      drawer.close();
      ui.sheet({ title: f ? T.folderRename : T.folderNew, body: input(T.folderName, 'folderTitle', f && f.title), actions: [
        { label: T.save, cls: 'btn--lit', keepOpen: true, run: function (sh) {
          var title = $('#folderTitle', sh).value.trim(); if (!title) return $('#folderTitle', sh).focus();
          try { var saved = Workspace.folder(title, f && f.id); sh.close(); g.Features.folder = saved.id; notebook(route, ui); } catch (e) { ui.toast(T.saveFailedBody, 'alert'); }
        } }, { label: T.cancel }
      ] });
    }
    $('[data-newfolder]').onclick = function () { folderSheet(null); };
    $('[data-newnote]').onclick = function () {
      try { var note = Workspace.saveNote({ title: '', body: '', folder: folder && folder !== 'inbox' ? folder : '', priority: 0 }); ui.go('notebook/' + note.id); }
      catch (e) { ui.toast(T.saveFailedBody, 'alert'); }
    };
    $('#noteSearch').oninput = function (e) { query = e.target.value; g.Features.noteQuery = query; paint(); };
    paint();
  }
  function editor(note, folders, ui) {
    ui.topbar({ title: T.notebook, back: true, backTo: 'notebook' });
    ui.view.innerHTML = '<article class="notebook notebook--editor"><div class="notebook__paper">' +
      '<details class="notebook__options" id="noteOptions"><summary>' + icon('settings') + '<span>' + esc(T.noteOptions) + '</span>' + icon('chevDown') + '</summary><div class="notebook__editorbar"><label><span>' + esc(T.noteFolder) + '</span><select id="noteFolder">' + [{ id: '', title: T.noteInbox }].concat(folders).map(function (f) { return '<option value="' + esc(f.id) + '"' + (note.folder === f.id ? ' selected' : '') + '>' + esc(f.title) + '</option>'; }).join('') + '</select></label>' +
      '<label><span>' + esc(T.priority) + '</span><select id="notePriority">' + T.priorities.map(function (p, i) { return '<option value="' + i + '"' + (+note.priority === i ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="notebook__actions">' + button(note.pinned ? T.unpinNote : T.pinNote, 'data-pinnote', 'flag') + button(T.downloadNote, 'data-downloadnote', 'download') + button(T.noteDelete, 'data-deletenote', 'trash') + '</div></details>' +
      '<input id="noteTitle" class="notebook__title" dir="auto" maxlength="200" value="' + esc(note.title) + '" placeholder="' + esc(T.noteTitle) + '" aria-label="' + esc(T.noteTitle) + '">' +
      '<div class="notebook__status"><span id="noteState" role="status">' + esc(T.draftSaved) + '</span><span>' + esc(date(note.updatedAt)) + '</span></div>' +
      '<button class="btn" data-notecopy hidden>' + esc(T.saveSeparateCopy) + '</button>' +
      '<textarea id="noteBody" class="notebook__writing" dir="auto" placeholder="' + esc(T.noteBody) + '" aria-label="' + esc(T.noteBody) + '">' + esc(note.body) + '</textarea></div></article>';
    var timer, dirty = false, alive = true, root = $('.notebook--editor');
    function flush() {
      clearTimeout(timer);
      if (!dirty || !alive) return true;
      try {
        note = Workspace.saveNote(Object.assign({}, note, { baseUpdatedAt: note.updatedAt, title: $('#noteTitle').value, body: $('#noteBody').value,
          folder: $('#noteFolder').value, priority: +$('#notePriority').value }));
        dirty = false; $('#noteState').textContent = T.draftSaved; return true;
      } catch (e) { $('#noteState').textContent = e.message === 'EDIT_CONFLICT' ? T.draftConflict : T.saveFailed; $('[data-notecopy]').hidden = e.message !== 'EDIT_CONFLICT'; return false; }
    }
    function touched() { dirty = true; $('#noteState').textContent = T.draftSaving; clearTimeout(timer); timer = setTimeout(flush, 400); }
    root.addEventListener('input', touched); root.addEventListener('change', touched);
    ui.setFlush(flush);
    $('[data-downloadnote]').onclick = function () { ui.saveFile('sortie-note.txt', $('#noteTitle').value + '\n\n' + $('#noteBody').value, 'text/plain'); };
    $('[data-notecopy]').onclick = function () {
      try { var copy = Workspace.saveNote({ title: $('#noteTitle').value, body: $('#noteBody').value, folder: $('#noteFolder').value, priority: +$('#notePriority').value }); dirty = false; clearTimeout(timer); ui.go('notebook/' + copy.id); }
      catch (e) { ui.toast(T.saveFailedBody, 'alert'); }
    };
    $('[data-pinnote]').onclick = function () {
      if (!flush()) return;
      try { note = Workspace.saveNote(Object.assign({}, note, { pinned: !note.pinned, baseUpdatedAt: note.updatedAt })); editor(note, folders, ui); $('#noteOptions summary').focus(); }
      catch (e) { ui.toast(T.saveFailedBody, 'alert'); }
    };
    $('[data-deletenote]').onclick = function () { ui.confirm({ title: T.noteDelete, onConfirm: function () {
      if (!flush()) return;
      try { Workspace.deleteNote(note.id); alive = false; clearTimeout(timer); ui.setFlush(null); ui.toast(T.noteDeleted); ui.go('notebook'); }
      catch (e) { ui.toast(T.saveFailedBody, 'alert'); }
    } }); };
    if (!note.title && !note.body) $('#noteBody').focus();
  }
  function progress(route, ui) {
    ui.topbar({ title: T.courseProgress, back: true, backTo: '' });
    var p = ui.progress(), course = Store.course(), pct = Math.round(p.done / Math.max(1, p.total) * 100);
    var milestones = Workspace.all().milestones.filter(function (m) { return !m.deletedAt && m.course === course.id; }).sort(function (a, b) { return (a.date || '9999').localeCompare(b.date || '9999'); });
    var unknown = Store.done().filter(function (r) { return !r.course; }).length;
    var checkpoints = [];
    SyllabusRef.all(course.id).forEach(function (entry) {
      if (entry.sim || !/סולו|לילה/.test(entry.name)) return;
      var kind = /סולו/.test(entry.name) ? T.checkpointSolo : T.checkpointNight;
      if (!checkpoints.some(function (item) { return item.kind === kind; })) checkpoints.push({ kind: kind, entry: entry });
    });
    var pilot = Store.settings().pilotProfile || {};
    ui.view.innerHTML = '<div class="journey stack-6"><header class="journey__hero"><div class="journey__eyebrow">' + icon('flag') + '<span>' + esc(course.label) + '</span>' + (pilot.name || pilot.callsign ? '<b dir="auto">' + esc(pilot.callsign || pilot.name) + '</b>' : '') + '</div>' +
      '<h1>' + esc(T.courseProgress) + '</h1><p>' + esc(T.progressSub) + '</p>' +
      /* The course as a flight plan: each section a numbered waypoint, legs as
         long as the sorties they hold, lit as far as the recorded coverage. */
      '<figure class="journey__map">' +
      '<div class="journey__reading"><strong dir="ltr">' + pct + '<small>%</small></strong><span>' + esc(T.progressCount(p.done, p.total)) + '</span></div>' +
      Visuals.course({ sections: p.sections, done: p.done, w: 360, h: 280, seed: course.id, headings: true, padX: 26, padY: 34,
        shipKind: 'f16', shipSize: 22, label: T.courseRouteLabel(pct, p.next ? p.next.section || p.next.name : '') }) +
      '<figcaption>' + esc(T.courseRouteHint) + '</figcaption></figure>' +
      '<div class="journey__numbers"><div><b>' + p.done + '</b><span>' + esc(T.progressCompleted) + '</span></div><div><b>' + (p.total - p.done) + '</b><span>' + esc(T.progressRemaining) + '</span></div></div>' +
      button(T.shareProgress, 'data-shareprogress', 'share', 'btn--lit btn--block') + '<p class="field__hint">' + esc(T.progressBasis) + '</p>' +
      (unknown ? '<p class="field__hint">' + esc(T.progressUnknown(unknown)) + '</p>' : '') + '</header>' +
      '<section><div class="section-heading"><h2>' + esc(T.milestones) + '</h2>' + button(T.milestoneAdd, 'data-addmilestone', 'plus') + '</div><div class="milestones">' +
      (milestones.length ? milestones.map(function (m) {
        var done = m.done || (m.target > 0 && p.done >= m.target);
        return '<button type="button" class="milestone' + (done ? ' is-done' : '') + '" data-milestone="' + esc(m.id) + '"><span class="milestone__dot">' + icon(done ? 'check' : 'flag') + '</span><span class="milestone__text"><b>' + esc(m.title) + '</b><small>' + esc(m.date ? date(m.date + 'T12:00:00') : T.milestonePersonal) + '</small></span>' + (m.share ? icon('share') : '') + icon('chevLeft') + '</button>';
      }).join('') : '<p class="field__hint">' + esc(T.milestoneEmpty) + '</p>') + '</div></section>' +
      '<section><h2 class="h-sect">' + esc(T.catalogueCheckpoints) + '</h2><p class="field__hint">' + esc(T.catalogueCheckpointsHint) + '</p><div class="milestones">' + checkpoints.map(function (item) {
        var done = !!p.flown[item.entry.name];
        return '<div class="milestone' + (done ? ' is-done' : '') + '"><span class="milestone__dot">' + icon(done ? 'check' : 'flag') + '</span><span class="milestone__text"><b>' + esc(item.kind) + '</b><small dir="auto">' + esc(item.entry.name) + '</small></span><span class="field__hint">' + esc(done ? T.checkpointLogged : T.checkpointPending) + '</span></div>';
      }).join('') + '</div></section>' +
      '<section><h2 class="h-sect">' + esc(T.progressSections) + '</h2><div class="journey__sections">' + p.sections.map(function (s, i) {
        var done = s.done === s.total;
        return '<div class="journey-section' + (done ? ' is-done' : '') + '"><span class="journey-section__number">' + (done ? icon('check') : String(i + 1).padStart(2, '0')) + '</span><div><div class="journey-section__head"><b>' + esc(s.name) + '</b><span dir="ltr">' + s.done + ' / ' + s.total + '</span></div><div class="journey-section__track"><span style="width:' + Math.round(s.done / s.total * 100) + '%"></span></div></div></div>';
      }).join('') + '</div></section>' + (p.next ? '<a class="journey__next" href="#/syllabus"><span>' + esc(T.progressNext) + '</span><b dir="auto">' + esc(p.next.name) + '</b>' + icon('chevLeft') + '</a>' : '') + '</div>';
    function milestoneSheet(m) {
      ui.sheet({ title: m ? m.title : T.milestoneAdd, body: input(T.milestoneTitle, 'milestoneTitle', m && m.title) + input(T.milestoneDate, 'milestoneDate', m && m.date, 'date') +
        input(T.milestoneTarget, 'milestoneTarget', m && m.target, 'number') + '<label class="checkline"><input type="checkbox" id="milestoneDone"' + (m && m.done ? ' checked' : '') + '> ' + esc(T.milestoneDone) + '</label>' +
        '<label class="checkline"><input type="checkbox" id="milestoneShare"' + (m && m.share ? ' checked' : '') + '> ' + esc(T.milestoneShare) + '</label>',
        actions: [{ label: T.save, cls: 'btn--lit', keepOpen: true, run: function (sh) {
          var title = $('#milestoneTitle', sh).value.trim(); if (!title) return $('#milestoneTitle', sh).focus();
          try { Workspace.milestone({ id: m && m.id, course: course.id, title: title, date: $('#milestoneDate', sh).value,
            target: Math.max(0, +$('#milestoneTarget', sh).value || 0), done: $('#milestoneDone', sh).checked, share: $('#milestoneShare', sh).checked }); sh.close(); progress(route, ui); }
          catch (e) { ui.toast(T.saveFailedBody, 'alert'); }
        } }].concat(m ? [{ label: T.delete, cls: 'btn--danger', run: function () { try { Workspace.deleteMilestone(m.id); progress(route, ui); } catch (e) { ui.toast(T.saveFailedBody, 'alert'); } } }] : []).concat([{ label: T.cancel }])
      });
    }
    $('[data-addmilestone]').onclick = function () { milestoneSheet(null); };
    all('[data-milestone]').forEach(function (b) { b.onclick = function () { milestoneSheet(milestones.find(function (m) { return m.id === b.dataset.milestone; })); }; });
    $('[data-shareprogress]').onclick = function () { shareProgress(p, course, milestones, ui); };
  }
  async function shareProgress(p, course, milestones, ui) {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    var pct = Math.round(p.done / Math.max(1, p.total) * 100), canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1350;
    var theme = getComputedStyle(document.documentElement);
    function color(token) { return theme.getPropertyValue(token).trim(); }
    var c = canvas.getContext('2d'); c.fillStyle = color('--bg'); c.fillRect(0, 0, 1080, 1350);
    c.strokeStyle = color('--rule-2'); c.lineWidth = 2; c.strokeRect(40, 40, 1000, 1270);
    // the flag's two blue stripes, as thin rules inside the frame
    c.fillStyle = color('--iaf'); c.fillRect(40, 66, 1000, 5); c.fillRect(40, 1279, 1000, 5);
    c.direction = 'rtl'; c.textAlign = 'right'; c.fillStyle = color('--cyan'); c.font = '500 32px Heebo, Arial'; c.fillText(T.app, 976, 132);
    c.fillStyle = color('--fg'); c.font = '700 64px Heebo, Arial'; c.fillText(T.courseProgress, 976, 236);
    c.fillStyle = color('--fg-mid'); c.font = '400 36px Heebo, Arial'; c.fillText(course.label, 976, 296);
    c.font = '400 30px Heebo, Arial'; c.fillText(T.progressCount(p.done, p.total), 976, 356);
    c.direction = 'ltr'; c.textAlign = 'left'; c.fillStyle = color('--fg'); c.font = '600 132px "Space Grotesk", Arial'; c.fillText(pct + '%', 100, 300);

    /* The same course route the progress screen draws, at print size. */
    // the map takes the room of any milestone rows that are not shared
    var visible = milestones.filter(function (m) { return m.share; }).slice(0, 3);
    var MX = 80, MY = 400, MW = 920, MH = 460 + (3 - visible.length) * 80, base = MY + MH;
    var geo = Visuals.courseRoute({ sections: p.sections, done: p.done, w: MW, h: MH, seed: course.id, padX: 70, padY: 70 });
    function trace(pts) { c.beginPath(); pts.forEach(function (q, i) { if (i) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }); }
    c.save(); c.beginPath(); c.rect(MX, MY, MW, MH); c.clip(); c.translate(MX, MY);
    c.fillStyle = color('--face'); c.fillRect(0, 0, MW, MH);
    c.lineWidth = 1; c.strokeStyle = color('--rule');
    for (var gx = 0; gx <= MW; gx += 46) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, MH); c.stroke(); }
    for (var gy = 0; gy <= MH; gy += 46) { c.beginPath(); c.moveTo(0, gy); c.lineTo(MW, gy); c.stroke(); }
    c.strokeStyle = color('--rule-2'); c.lineWidth = 1.5; c.stroke(new Path2D(Visuals.topoPath(course.id + ':share', MW, MH, 4)));
    [110, 220].forEach(function (r) { c.beginPath(); c.arc(geo.wps[0].x, geo.wps[0].y, r, 0, Math.PI * 2); c.stroke(); });
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.setLineDash([14, 14]); c.strokeStyle = color('--fg-dim'); c.lineWidth = 3; trace(geo.pts); c.stroke(); c.setLineDash([]);
    if (geo.lit.length > 1) {
      c.strokeStyle = color('--cyan'); c.globalAlpha = .25; c.lineWidth = 20; trace(geo.lit); c.stroke();
      c.globalAlpha = 1; c.lineWidth = 7; trace(geo.lit); c.stroke();
    }
    geo.wps.forEach(function (w) {
      var lit = w.kind === 'start' || w.state === 'done' || w.state === 'passed';
      c.beginPath();
      if (w.kind !== 'wp') c.arc(w.x, w.y, 13, 0, Math.PI * 2);
      else { c.moveTo(w.x, w.y - 12); c.lineTo(w.x + 12, w.y); c.lineTo(w.x, w.y + 12); c.lineTo(w.x - 12, w.y); c.closePath(); }
      c.fillStyle = lit ? color('--cyan') : color('--face'); c.fill();
      c.lineWidth = 3; c.strokeStyle = w.state === 'next' ? color('--amber') : lit ? color('--cyan') : color('--fg-dim'); c.stroke();
      if (w.label) {
        c.fillStyle = w.state === 'next' ? color('--amber') : color('--fg-mid'); c.font = '600 22px "Space Grotesk", Arial';
        c.textAlign = 'center'; c.direction = 'ltr'; c.fillText(w.label, w.x, w.y - 24);
      }
    });
    c.save(); c.translate(geo.ship.x, geo.ship.y); c.rotate(geo.ship.h * Math.PI / 180); c.scale(.64, .64); c.translate(-50, -50);
    c.fillStyle = color('--fg'); c.fill(new Path2D(Visuals.jetPath('f16'))); c.restore();
    c.restore();
    c.strokeStyle = color('--rule-2'); c.lineWidth = 2; c.strokeRect(MX, MY, MW, MH);
    if (p.next) { c.direction = 'rtl'; c.textAlign = 'right'; c.fillStyle = color('--amber'); c.font = '500 28px Heebo, Arial'; c.fillText(T.progressNext + ': ' + p.next.name, 976, base + 52, 880); }

    c.direction = 'rtl'; c.textAlign = 'right';
    visible.forEach(function (m, i) { c.fillStyle = color('--amber'); c.fillRect(960, base + 114 + i * 80, 10, 10); c.fillStyle = color('--fg'); c.font = '500 30px Heebo, Arial'; c.fillText(m.title.slice(0, 48), 930, base + 132 + i * 80, 805); c.fillStyle = color('--fg-mid'); c.font = '400 22px Heebo, Arial'; c.fillText(m.date ? date(m.date + 'T12:00:00') : T.milestonePersonal, 930, base + 160 + i * 80); });
    c.textAlign = 'center'; c.font = '400 22px Heebo, Arial'; c.fillStyle = color('--fg-mid'); c.fillText(T.progressBasis, 540, 1230, 920); c.fillText(date(Date.now()), 540, 1268);
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
    if (!blob) return ui.toast(T.shareFailed, 'alert');
    var url = URL.createObjectURL(blob), caption = T.shareCaption(course.label, pct, p.done, p.total);
    var file = new File([blob], 'sortie-progress.png', { type: 'image/png' });
    function download() { var a = document.createElement('a'); a.href = url; a.download = file.name; a.click(); }
    ui.sheet({ title: T.sharePreview, text: T.shareProgressHint, body: '<img class="share-preview" src="' + url + '" alt="' + esc(caption) + '">', actions: [
      { label: T.shareImage, cls: 'btn--lit', keepOpen: true, run: function () {
        if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], title: T.courseProgress, text: caption }).catch(function (e) { if (e.name !== 'AbortError') ui.toast(T.shareFailed, 'alert'); });
        else download();
      } }, { label: T.downloadImage, keepOpen: true, run: download },
      { label: T.copySummary, keepOpen: true, run: function () { navigator.clipboard.writeText(caption).then(function () { ui.toast(T.copiedToast); }).catch(function () { ui.toast(T.shareFailed, 'alert'); }); } },
      { label: T.cancel, run: function () { URL.revokeObjectURL(url); } }
    ] });
  }
  function feedback(route, ui) {
    ui.topbar({ title: T.feedback, back: true, backTo: 'settings' });
    var draft = Workspace.feedbackDraft() || { id: Store.uid('feedback'), kind: 0, message: '', contact: '', diagnostics: false };
    var endpoint = g.FEEDBACK_CONFIG && FEEDBACK_CONFIG.endpoint;
    ui.view.innerHTML = '<section class="stack-4"><div class="feature-intro">' + icon('pencil') + '<h1>' + esc(T.feedback) + '</h1><p>' + esc(T.feedbackSub) + '</p></div>' +
      '<form id="feedbackForm" class="panel"><div class="panel__body stack-4"><label class="field"><span class="field__label">' + esc(T.feedbackKind) + '</span><select class="input" id="feedbackKind">' + T.feedbackTypes.map(function (t, i) { return '<option value="' + i + '"' + (+draft.kind === i ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="field__label">' + esc(T.feedbackMessage) + '</span><textarea class="ta" id="feedbackMessage" dir="auto" rows="7" minlength="5" maxlength="5000" required>' + esc(draft.message) + '</textarea></label>' +
      input(T.feedbackContact, 'feedbackContact', draft.contact, 'email') +
      '<label class="checkline"><input id="feedbackDiagnostics" type="checkbox"' + (draft.diagnostics ? ' checked' : '') + '> ' + esc(T.feedbackDiagnostics) + '</label>' +
      '<p class="field__hint">' + esc(T.feedbackPrivacy) + '</p><p id="feedbackState" role="status">' + esc(endpoint ? '' : T.feedbackNotReady) + '</p>' +
      '<button type="submit" class="btn btn--lit btn--block" id="feedbackSend">' + esc(endpoint ? T.feedbackSend : T.save) + '</button></div></form></section>';
    var busy = false, feedbackRoot = $('#feedbackForm'), stateEl = $('#feedbackState'), sendButton = $('#feedbackSend');
    var kindEl = $('#feedbackKind'), messageEl = $('#feedbackMessage'), contactEl = $('#feedbackContact'), diagnosticsEl = $('#feedbackDiagnostics');
    function save() {
      draft.kind = +kindEl.value; draft.message = messageEl.value; draft.contact = contactEl.value; draft.diagnostics = diagnosticsEl.checked;
      try { Workspace.saveFeedback(draft); return true; } catch (e) { stateEl.textContent = T.saveFailed; return false; }
    }
    ui.setFlush(save); $('#feedbackForm').addEventListener('input', save);
    $('#feedbackForm').onsubmit = async function (e) {
      e.preventDefault(); if (busy || !save()) return;
      if (!endpoint) { stateEl.textContent = T.feedbackSaved; return; }
      if (navigator.onLine === false) { stateEl.textContent = T.feedbackOffline; return; }
      if (draft.message.trim().length < 5 || draft.message.length > 5000) { stateEl.textContent = T.feedbackLength; return; }
      busy = true; sendButton.disabled = true; stateEl.textContent = T.feedbackSending;
      all('input, textarea, select', feedbackRoot).forEach(function (el) { el.disabled = true; });
      var payload = { message: draft.message.trim(), category: T.feedbackTypes[draft.kind], submission_id: draft.id };
      if (draft.contact.trim()) payload.email = draft.contact.trim();
      if (draft.diagnostics) payload.diagnostics = { build: ui.build, course: Store.courseId(), device: navigator.userAgent };
      var sentMessage = draft.message;
      var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
      try {
        var response = await fetch(endpoint, { method: 'POST', headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        if (!response.ok) throw new Error('SEND_FAILED');
        var latest = Workspace.feedbackDraft();
        if (latest && latest.id === draft.id && latest.message === sentMessage) Workspace.clearFeedback();
        if (document.contains(feedbackRoot)) {
          ui.setFlush(null); stateEl.textContent = T.feedbackSent;
          all('input, textarea, select', feedbackRoot).forEach(function (el) { el.disabled = true; });
        }
      } catch (err) { stateEl.textContent = T.feedbackFailed; sendButton.disabled = false; all('input, textarea, select', feedbackRoot).forEach(function (el) { el.disabled = false; }); }
      finally { clearTimeout(timeout); busy = false; }
    };
  }
  function whatsnew(route, ui) {
    ui.topbar({ title: T.whatsNew, back: true, backTo: 'settings' });
    ui.view.innerHTML = '<section class="release"><span class="release__version mono">' + esc(ui.build) + '</span><h1>' + esc(T.whatsNew) + '</h1><p>' + esc(T.releaseIntro) + '</p><div class="release__list">' + T.releaseItems.map(function (x, i) { return '<article><span class="mono">' + String(i + 1).padStart(2, '0') + '</span><div><h2>' + esc(x[0]) + '</h2><p>' + esc(x[1]) + '</p></div></article>'; }).join('') + '</div><div class="release__acts">' + button(T.releaseTour, 'data-starttour', 'plane', 'btn--lit btn--block btn--lg') +
      button(T.understood, 'data-understood', 'check', 'btn--quiet btn--block') + '</div></section>';
    function seen() { return /preview/.test(ui.build) || Store.set('releaseSeen', ui.build); }
    $('[data-understood]').onclick = function () { if (seen()) ui.go(''); else ui.toast(T.saveFailedBody, 'alert'); };
    // the same guided look the update message offers, on demand
    $('[data-starttour]').onclick = function () { if (seen()) ui.tour(); else ui.toast(T.saveFailedBody, 'alert'); };
  }
  function recovery(route, ui) {
    ui.topbar({ title: T.backupRecovery, back: true, backTo: 'settings' });
    var trash = Store.trash().filter(function (r) { return r.kind === 'flight'; }), workspace;
    try { workspace = Workspace.all(); } catch (e) { workspace = { notes: [], milestones: [] }; }
    var notes = workspace.notes.filter(function (n) { return n.deletedAt; }), drafts = Store.drafts();
    var milestones = workspace.milestones.filter(function (m) { return m.deletedAt; });
    var archived = Store.questions(true).filter(function (q) { return q.archived; });
    ui.view.innerHTML = '<div class="stack-6"><section class="panel"><div class="panel__body stack"><h1>' + esc(T.backupRecovery) + '</h1><p>' + esc(T.backupRecoveryBody) + '</p>' +
      button(T.exportJson, 'data-fullbackup', 'download', 'btn--lit btn--block') + (Store.recovery() ? button(T.recoveryCopy, 'data-recoverycopy', 'download', 'btn--block') : '') + button(T.rawRecovery, 'data-rawbackup', 'download', 'btn--quiet') + '</div></section>' +
      '<section><h2 class="h-sect">' + esc(T.recentlyDeleted) + '</h2>' + (trash.length + notes.length + milestones.length ? '<div class="group">' + trash.map(function (item) {
        var q = Store.questionFor(item.record, 'subject');
        return '<div class="recovery-row"><span><b dir="auto">' + esc(q && item.record.answers[q.id] || item.record.flownAt) + '</b><small>' + esc(date(item.updatedAt)) + '</small></span>' + button(T.restore, 'data-restoreflight="' + esc(item.id) + '"', 'upload') + '</div>';
      }).concat(notes.map(function (n) { return '<div class="recovery-row"><span><b>' + esc(n.title || T.noteUntitled) + '</b><small>' + esc(T.notebook) + '</small></span>' + button(T.restore, 'data-restorenote="' + esc(n.id) + '"', 'upload') + '</div>'; })).concat(milestones.map(function (m) { return '<div class="recovery-row"><span><b>' + esc(m.title) + '</b><small>' + esc(T.milestones) + '</small></span>' + button(T.restore, 'data-restoremilestone="' + esc(m.id) + '"', 'upload') + '</div>'; })).join('') + '</div>' : '<p class="field__hint">' + esc(T.recoveryEmpty) + '</p>') + '</section>' +
      '<section><h2 class="h-sect">' + esc(T.recoveryDrafts) + '</h2><div class="group">' + Object.keys(drafts).map(function (key, i) {
        var draft; try { draft = JSON.parse(drafts[key]); } catch (e) { return ''; }
        var rec = draft.rec || draft, q = rec.answers && Store.questionFor(rec, 'subject');
        return '<div class="recovery-row"><span><b>' + esc(q && rec.answers[q.id] || T.resumeDraft) + '</b><small>' + esc(draft.at ? date(draft.at) : '') + '</small></span>' + button(T.resumeDraft, 'data-draftkey="' + i + '"', 'pencil') + '</div>';
      }).join('') + '</div></section>' +
      '<section><h2 class="h-sect">' + esc(T.archivedQuestions) + '</h2><div class="group">' + archived.map(function (q) { return '<div class="recovery-row"><b>' + esc(q.label) + '</b>' + button(T.archiveRestore, 'data-unarchive="' + esc(q.id) + '"', 'upload') + '</div>'; }).join('') + '</div></section></div>';
    $('[data-fullbackup]').onclick = function () { ui.saveFile('sortie-backup-' + Store.todayISO() + '.json', Store.toJSON(), 'application/json', 'backup'); };
    $('[data-rawbackup]').onclick = function () { ui.saveFile('sortie-raw-recovery.json', Store.emergencyJSON(), 'application/json'); };
    if ($('[data-recoverycopy]')) $('[data-recoverycopy]').onclick = function () {
      var r = Store.recovery(); ui.saveFile('sortie-recovery.json', JSON.stringify({ app: 'tahkir', schema: 4, backupVersion: 1, flights: r.flights, questions: r.settings.questions, nextGoals: r.settings.nextGoals,
      preferences: { course: r.settings.course, theme: r.settings.theme, pilotProfile: r.settings.pilotProfile }, drafts: r.drafts, workspace: r.workspace, trash: r.trash }, null, 2), 'application/json');
    };
    all('[data-restoreflight]').forEach(function (b) { b.onclick = function () { var item = trash.find(function (t) { return t.id === b.dataset.restoreflight; }); Store.restore(item.record).then(function () { ui.toast(T.restored); recovery(route, ui); }).catch(function () { ui.toast(T.saveFailedBody, 'alert'); }); }; });
    all('[data-restorenote]').forEach(function (b) { b.onclick = function () { try { Workspace.restoreNote(b.dataset.restorenote); ui.toast(T.restored); recovery(route, ui); } catch (e) { ui.toast(T.saveFailedBody, 'alert'); } }; });
    all('[data-restoremilestone]').forEach(function (b) { b.onclick = function () { try { Workspace.restoreMilestone(b.dataset.restoremilestone); ui.toast(T.restored); recovery(route, ui); } catch (e) { ui.toast(T.saveFailedBody, 'alert'); } }; });
    all('[data-unarchive]').forEach(function (b) { b.onclick = function () {
      var questions = JSON.parse(JSON.stringify(Store.settings().questions)); questions.find(function (q) { return q.id === b.dataset.unarchive; }).archived = false;
      if (Store.set('questions', questions)) recovery(route, ui); else ui.toast(T.saveFailedBody, 'alert');
    }; });
    all('[data-draftkey]').forEach(function (b) { b.onclick = function () {
      var key = Object.keys(drafts)[+b.dataset.draftkey], wrapper = JSON.parse(drafts[key]), rec = wrapper.rec || wrapper;
      if (rec.id && Store.get(rec.id)) ui.go((key.indexOf(':b:') !== -1 ? 'brief/' : 'debrief/') + rec.id);
      else if (key === 'sortie:draft:new' || key === 'sortie:draft') ui.go('brief');
      else { if (Store.promoteDraft(rec)) ui.go('brief'); else ui.toast(T.saveFailedBody, 'alert'); }
    }; });
  }
  g.Features = { render: function (route, ui) {
    try { ({ notebook: notebook, progress: progress, feedback: feedback, whatsnew: whatsnew, recovery: recovery, profile: profile })[route.name](route, ui); }
    catch (e) { ui.view.innerHTML = '<section class="empty"><h1>' + esc(T.startupError) + '</h1><p>' + esc(T.startupErrorBody) + '</p><a class="btn" href="#/recovery">' + esc(T.backupRecovery) + '</a></section>'; console.error('Feature could not open', e); }
  } };
})(window);
