/* Sortie — icon set. Lucide-style strokes, 24x24, stroke-width 1.75.
   No emoji anywhere in this app: every glyph is a vector. */
(function (global) {
  'use strict';

  var P = {
    notebook: '<path d="M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M8 3v18M2 7h4M2 12h4M2 17h4M11 8h5M11 12h5"/>',
    folder: '<path d="M3 7V4h6l3 3h9v13H3Z"/>',
    plane:      '<path d="M17.8 19.8 16 14l-4-1.5-4 1.5-1.8 5.8L4 21l1.3-6.4L2 12l3.3-2.6L4 3l2.2 1.2L8 10l4 1.5L16 10l1.8-5.8L20 3l-1.3 6.4L22 12l-3.3 2.6L20 21z"/>',
    horizon:    '<path d="M3 12h18"/><path d="m9 8 3 3 3-3"/><circle cx="12" cy="12" r="9"/>',
    plus:       '<path d="M12 5v14M5 12h14"/>',
    layers:     '<path d="M4 7h16M4 12h16M4 17h10"/>',
    trending:   '<path d="M3 17l6-6 4 4 7-7"/><path d="M14 8h6v6"/>',
    settings:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
    chevRight:  '<path d="m9 18 6-6-6-6"/>',
    chevLeft:   '<path d="m15 18-6-6 6-6"/>',
    chevDown:   '<path d="m6 9 6 6 6-6"/>',
    chevUp:     '<path d="m6 15 6-6 6 6"/>',
    flag:       '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    check:      '<path d="m20 6-11 11-5-5"/>',
    checkCircle:'<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
    x:          '<path d="M18 6 6 18M6 6l12 12"/>',
    search:     '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    download:   '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/>',
    upload:     '<path d="M12 21V9"/><path d="m7 13 5-5 5 5"/><path d="M4 3h16"/>',
    trash:      '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    pencil:     '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>',
    share:      '<path d="M12 3v13"/><path d="m8 7 4-4 4 4"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    calendar:   '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    target:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
    alert:      '<path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    crosshair:  '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    anchor:     '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v13"/><path d="M5 12H3a9 9 0 0 0 18 0h-2"/>',
    list3:      '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    lock:       '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    delete:     '<path d="M20 6H9l-6 6 6 6h11a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/><path d="m17 10-4 4M13 10l4 4"/>',
    sun:        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:       '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
    contrast:   '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
    tag:        '<path d="M3 11V4a1 1 0 0 1 1-1h7l9 9-8 8z"/><path d="M7.5 7.5h.01"/>',
    info:       '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    copy:       '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    filter:     '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    grip:       '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/>' +
                '<circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/>' +
                '<circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/>' +
                '<circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/>' +
                '<circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/>' +
                '<circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>'
  };

  /**
   * icon('plane', {size, cls}) -> SVG string
   */
  function icon(name, opts) {
    opts = opts || {};
    var body = P[name];
    if (!body) return '';
    var size = opts.size || 24;
    var cls = opts.cls ? ' class="' + opts.cls + '"' : '';
    return '<svg' + cls + ' width="' + size + '" height="' + size + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  icon.has = function (n) { return !!P[n]; };
  global.icon = icon;
})(window);
