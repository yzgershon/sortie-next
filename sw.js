/* Verified network-first shell. A partial release never replaces a working cache. */
var VERSION = 'sortie-v23-canary';
var SHELL = VERSION + '-shell';
var FONTS = 'sortie-fonts';
var manifestPromise;

function timedFetch(request) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, 5000);
  return fetch(request, { cache: 'no-store', signal: controller.signal }).finally(function () { clearTimeout(timer); });
}
async function digest(response) {
  var buffer = await response.clone().arrayBuffer();
  var hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
}
async function manifest() {
  if (!manifestPromise) manifestPromise = caches.open(SHELL).then(function (cache) {
    return cache.match('./release-manifest.json');
  }).then(function (response) { if (!response) throw Error('No verified release'); return response.json(); });
  return manifestPromise;
}
self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    var response = await timedFetch('./release-manifest.json');
    if (!response.ok) throw Error('Release manifest unavailable');
    var release = await response.json();
    if (release.version !== VERSION || !release.files) throw Error('Release version mismatch');
    var entries = await Promise.all(Object.keys(release.files).map(async function (file) {
      var asset = await timedFetch(file);
      if (!asset.ok || (file !== './js/auth-config.js' && await digest(asset) !== release.files[file])) throw Error('Incomplete release: ' + file);
      return [file, asset];
    }));
    var cache = await caches.open(SHELL);
    await Promise.all(entries.map(function (entry) { return cache.put(entry[0], entry[1]); }));
    await cache.put('./release-manifest.json', new Response(JSON.stringify(release), { headers: { 'Content-Type': 'application/json' } }));
    if (!(await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).some(function (client) { return client.url.indexOf(self.registration.scope) === 0; })) await self.skipWaiting();
  })());
});
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'ACTIVATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    await manifest();
    var keys = await caches.keys();
    var owned = keys.filter(function (key) { return /^sortie-v[0-9].*-shell$/.test(key) && key !== SHELL; });
    var previous = owned[owned.length - 1];
    await Promise.all(keys.filter(function (key) {
      return /^sortie-v[0-9].*-(shell|assets)$/.test(key) && key !== SHELL && key !== previous;
    }).map(function (key) { return caches.delete(key); }));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith((async function () {
      var cache = await caches.open(FONTS), hit = await cache.match(request);
      if (hit) return hit;
      var response = await fetch(request); if (response.ok || response.type === 'opaque') await cache.put(request, response.clone()); return response;
    })()); return;
  }
  if (url.origin !== self.location.origin || url.href.indexOf(self.registration.scope) !== 0) return;
  if (/\/(sw\.js|release-manifest\.json)$/.test(url.pathname)) return;
  event.respondWith((async function () {
    var relative = './' + url.pathname.slice(new URL(self.registration.scope).pathname.length);
    var key = request.mode === 'navigate' ? './index.html' : relative;
    var release = await manifest(), cache = await caches.open(SHELL);
    if (!release.files[key]) return fetch(request);
    // Access configuration deliberately updates without a release version bump.
    if (key === './js/auth-config.js') {
      try { var config = await timedFetch(request); if (config.ok) { await cache.put(key, config.clone()); return config; } } catch (e) {}
      return (await cache.match(key)) || Response.error();
    }
    try {
      var response = await timedFetch(request);
      if (response.ok && await digest(response) === release.files[key]) {
        await cache.put(key, response.clone()); return response;
      }
    } catch (e) {}
    return (await cache.match(key)) || Response.error();
  })());
});
