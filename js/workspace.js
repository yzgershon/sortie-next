/* Personal notebook and milestones. Local only; included by Store.toJSON(). */
(function (g) {
  'use strict';
  var KEY = 'sortie:workspace';
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function empty() { return { schema: 1, notes: [], folders: [], milestones: [] }; }
  function read() {
    var raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    var data;
    try { data = JSON.parse(raw); } catch (e) { throw new Error('WORKSPACE_DAMAGED'); }
    if (!data || data.schema !== 1 || !Array.isArray(data.notes) || !Array.isArray(data.folders) || !Array.isArray(data.milestones)) throw new Error('WORKSPACE_DAMAGED');
    return data;
  }
  function change(fn) {
    var data = read(), result = fn(data);
    if (!Store.writeLocal(KEY, JSON.stringify(data))) throw new Error('STORAGE_FULL');
    return copy(result == null ? data : result);
  }
  function upsert(kind, item) {
    return change(function (data) {
      var previous = data[kind].find(function (r) { return r.id === item.id; });
      if (previous && item.baseUpdatedAt != null && +item.baseUpdatedAt !== +previous.updatedAt) throw new Error('EDIT_CONFLICT');
      var out = Object.assign({}, previous || {}, item, { id: item.id || Store.uid(kind), updatedAt: Math.max(Date.now(), +(previous && previous.updatedAt || 0) + 1) });
      if (!out.createdAt) out.createdAt = Date.now();
      delete out.baseUpdatedAt;
      if (previous) Object.assign(previous, out); else data[kind].push(out);
      return out;
    });
  }
  g.Workspace = {
    all: read,
    reload: read,
    note: function (id) { return read().notes.find(function (n) { return n.id === id; }) || null; },
    saveNote: function (note) {
      return upsert('notes', Object.assign({}, note, { title: String(note.title || '').slice(0, 200), body: String(note.body || ''),
        priority: [0, 1, 2].indexOf(+note.priority) === -1 ? 0 : +note.priority, folder: note.folder || '', pinned: !!note.pinned }));
    },
    deleteNote: function (id) { return upsert('notes', { id: id, deletedAt: Date.now() }); },
    restoreNote: function (id) { return upsert('notes', { id: id, deletedAt: null }); },
    folder: function (title, id) { return upsert('folders', { id: id, title: String(title || '').trim().slice(0, 80) }); },
    removeFolder: function (id) { return change(function (data) {
      data.notes.forEach(function (n) { if (n.folder === id) { n.folder = ''; n.updatedAt = Date.now(); } });
      var folder = data.folders.find(function (f) { return f.id === id; });
      if (folder) { folder.deletedAt = Date.now(); folder.updatedAt = Date.now(); }
    }); },
    milestone: function (item) { return upsert('milestones', item); },
    deleteMilestone: function (id) { return upsert('milestones', { id: id, deletedAt: Date.now() }); },
    restoreMilestone: function (id) { return upsert('milestones', { id: id, deletedAt: null }); },
    feedbackDraft: function () {
      try { return JSON.parse(localStorage.getItem('sortie:feedback-draft') || 'null'); } catch (e) { return null; }
    },
    saveFeedback: function (draft) { if (!Store.writeLocal('sortie:feedback-draft', JSON.stringify(draft))) throw new Error('STORAGE_FULL'); },
    clearFeedback: function () { localStorage.removeItem('sortie:feedback-draft'); }
  };
})(window);
