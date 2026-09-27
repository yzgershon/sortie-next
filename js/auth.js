/* תחקיר — the Google sign-in gate.
 *
 * Worth being straight about what this is: a curtain, not a lock. The app is
 * static files on GitHub Pages, so anyone can fetch the JavaScript directly,
 * and anyone with devtools can write a session into localStorage. What it does
 * do is stop someone who lands on the URL from reading anything, and tie
 * getting in to a named Google account.
 *
 * No SDK and no popup, both on purpose:
 *   - Firebase Auth's signInWithRedirect wants its handler served from the
 *     app's own domain, which GitHub Pages cannot do, and Safari's tracking
 *     prevention breaks the cross-domain fallback.
 *   - A popup is worse: an installed iOS PWA sends window.open to Safari and
 *     loses the opener, so the token never finds its way back.
 * A plain top-level redirect through Google's OpenID endpoint dodges both and
 * needs no library at all.
 *
 * The token's claims are checked — audience, issuer, expiry, nonce, verified
 * email — but its RSA signature is NOT. Verifying that needs Google's JWKS, and
 * untested crypto that could lock his brother out of his own logbook is worse
 * than none, given localStorage is editable either way. Do not read the checks
 * below as more than they are.
 */
(function (g) {
  'use strict';

  var LS_SESSION = 'sortie:auth';
  var LS_PENDING = 'sortie:auth-pending';
  var DAY = 86400000;

  function cfg() { return g.AUTH_CONFIG || {}; }
  function clientId() { return String(cfg().clientId || '').trim(); }
  function enabled() { return !!clientId(); }
  function sessionDays() { var d = +cfg().sessionDays; return d > 0 ? d : 30; }
  function redirectUri() {
    var set = String(cfg().redirectUri || '').trim();
    return set || (location.origin + location.pathname);
  }

  /* ------------------------------------------------------------------ jwt */

  /** base64url -> string, decoding the bytes as UTF-8 so Hebrew or an accented
   *  name in the token does not come back mangled. */
  function fromB64Url(s) {
    s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try {
      return decodeURIComponent(atob(s).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (e) { return null; }
  }

  /** The middle segment of a JWT. Signature untouched — see the note up top. */
  function claimsOf(token) {
    var parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    var json = fromB64Url(parts[1]);
    if (!json) return null;
    try { return JSON.parse(json); } catch (e) { return null; }
  }

  /* ------------------------------------------------------------ allowlist */

  function normEmail(e) { return String(e == null ? '' : e).trim().toLowerCase(); }

  function sha256Hex(s) {
    if (!(g.crypto && g.crypto.subtle && g.TextEncoder)) return Promise.resolve(null);
    try {
      return g.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
        .then(function (buf) {
          return Array.prototype.map.call(new Uint8Array(buf), function (b) {
            return ('0' + b.toString(16)).slice(-2);
          }).join('');
        }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /** An empty list lets nobody in. Failing closed is the right way round. */
  function isAllowed(email) {
    var list = (cfg().allow || []).map(function (x) { return String(x).trim().toLowerCase(); })
      .filter(Boolean);
    var e = normEmail(email);
    if (!list.length || !e) return Promise.resolve(false);
    if (list.indexOf(e) !== -1) return Promise.resolve(true);
    return sha256Hex(e).then(function (h) { return !!h && list.indexOf(h) !== -1; });
  }

  /** Which course this address is expected to be on, or null if unlisted.
   *  Only ever used to preselect the picker — it is not a permission. */
  function courseFor(email) {
    var map = cfg().courses || {};
    var e = normEmail(email);
    if (!e) return Promise.resolve(null);
    if (map[e]) return Promise.resolve(map[e]);
    return sha256Hex(e).then(function (h) { return (h && map[h]) || null; });
  }

  /* -------------------------------------------------------------- session */

  /** The stored session, whatever state it is in. `expired` is reported rather
   *  than swallowed, because being out of date and being absent need different
   *  answers when there is no signal to sign in with. */
  function rawSession() {
    try {
      var s = JSON.parse(localStorage.getItem(LS_SESSION) || 'null');
      if (!s || !s.email) return null;
      s.expired = !(+s.exp > Date.now());
      return s;
    } catch (e) { return null; }
  }
  function readSession() {
    var s = rawSession();
    return s && !s.expired ? s : null;
  }
  function writeSession(email) {
    var s = { email: email, exp: Date.now() + sessionDays() * DAY, at: Date.now() };
    try { localStorage.setItem(LS_SESSION, JSON.stringify(s)); } catch (e) {}
    return s;
  }
  /** Push the expiry out again. Called on every launch that passes the
   *  allowlist, so the window is thirty days of NOT USING the app rather than
   *  thirty days from signing in. Without this the whole course, who all
   *  signed in the same week, would have been bounced to Google in the same
   *  week — and anyone without signal at that moment could not get back to
   *  their own flights at all. */
  function touchSession(s) {
    if (!s) return s;
    var next = Date.now() + sessionDays() * DAY;
    // only write when it actually moves the needle, to avoid a write per launch
    if (+s.exp > next - DAY) return s;
    s.exp = next;
    try { localStorage.setItem(LS_SESSION, JSON.stringify({ email: s.email, exp: s.exp, at: s.at || Date.now() })); }
    catch (e) {}
    return s;
  }
  function signOut() {
    try { localStorage.removeItem(LS_SESSION); localStorage.removeItem(LS_PENDING); } catch (e) {}
  }

  /* --------------------------------------------------------------- signin */

  function randomHex(n) {
    var a = new Uint8Array(n || 16);
    if (g.crypto && g.crypto.getRandomValues) g.crypto.getRandomValues(a);
    else for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  /** Builds the request and records the nonce and where he was, ready to be
   *  navigated to. Kept apart from signIn() so it can be checked without
   *  actually leaving the page — location.assign cannot be stubbed. */
  function authUrl() {
    if (!enabled()) return null;
    var nonce = randomHex(16);
    var here = String(location.hash || '');
    try {
      localStorage.setItem(LS_PENDING, JSON.stringify({
        nonce: nonce,
        route: here.indexOf('id_token') === -1 ? here : ''
      }));
    } catch (e) {}
    return 'https://accounts.google.com/o/oauth2/v2/auth' +
      '?client_id=' + encodeURIComponent(clientId()) +
      '&redirect_uri=' + encodeURIComponent(redirectUri()) +
      '&response_type=id_token' +
      '&scope=' + encodeURIComponent('openid email') +
      '&nonce=' + encodeURIComponent(nonce) +
      '&prompt=select_account';
  }

  function signIn() {
    var u = authUrl();
    if (u) location.assign(u);
  }

  /** Google answers in the URL fragment, which is also where this app's router
   *  lives. So this runs before navigate() and puts the route back afterwards,
   *  or the first thing after signing in would be a a bogus screen name. */
  function consumeRedirect() {
    var h = String(location.hash || '');
    if (h.indexOf('id_token=') === -1 && h.indexOf('error=') === -1) return null;

    var p = {};
    h.replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) {
        try { p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)); }
        catch (e) {}
      }
    });

    var pending = {};
    try { pending = JSON.parse(localStorage.getItem(LS_PENDING) || '{}') || {}; } catch (e) {}
    try { localStorage.removeItem(LS_PENDING); } catch (e) {}

    var route = pending.route || '#/';
    try { history.replaceState(null, '', location.pathname + location.search + route); }
    catch (e) { location.hash = route; }

    if (p.error) return { ok: false, why: p.error };
    var c = claimsOf(p.id_token);
    if (!c) return { ok: false, why: 'bad-token' };
    if (String(c.aud || '') !== clientId()) return { ok: false, why: 'wrong-audience' };
    if (!/(^|\.)accounts\.google\.com$/.test(String(c.iss || '').replace(/^https?:\/\//, '')))
      return { ok: false, why: 'wrong-issuer' };
    if (!(+c.exp * 1000 > Date.now())) return { ok: false, why: 'expired' };
    if (pending.nonce && String(c.nonce || '') !== pending.nonce) return { ok: false, why: 'nonce' };
    if (c.email_verified === false || c.email_verified === 'false')
      return { ok: false, why: 'unverified-email' };
    if (!normEmail(c.email)) return { ok: false, why: 'no-email' };
    return { ok: true, email: normEmail(c.email) };
  }

  /* ------------------------------------------------------------------ api */

  g.Auth = {
    enabled: enabled,
    session: readSession,
    rawSession: rawSession,
    touchSession: touchSession,
    authUrl: authUrl,
    signIn: signIn,
    signOut: signOut,
    redirectUri: redirectUri,
    isAllowed: isAllowed,
    courseFor: courseFor,
    claimsOf: claimsOf,
    consumeRedirect: consumeRedirect,

    /**
     * What the gate should do right now.
     *   off     no client id configured; there is no gate
     *   ok      signed in and on the list
     *   needed  never signed in, or the session ran out
     *   denied  a real Google account, but not one on the list
     *   error   the sign-in came back broken; say so and offer another go
     *
     * The allowlist is re-checked against the stored session on every launch,
     * so taking somebody off the list actually takes them off it. A launch that
     * passes also pushes the expiry out — see touchSession.
     *
     * An EXPIRED session with no network is let through anyway, as long as the
     * address is still on the list. Signing in needs Google, Google needs
     * signal, and refusing here would mean a pilot with a full logbook on the
     * device and no reception cannot open his own flights. The allowlist check
     * is local and still runs, so this widens nothing except the clock.
     */
    resolve: function () {
      if (!enabled()) return Promise.resolve({ state: 'off' });

      var back = consumeRedirect();
      if (back && !back.ok) return Promise.resolve({ state: 'error', why: back.why });
      if (back && back.ok) {
        return isAllowed(back.email).then(function (yes) {
          if (!yes) return { state: 'denied', email: back.email };
          writeSession(back.email);
          return { state: 'ok', email: back.email };
        });
      }

      var s = rawSession();
      if (!s) return Promise.resolve({ state: 'needed' });
      return isAllowed(s.email).then(function (yes) {
        if (!yes) { signOut(); return { state: 'denied', email: s.email }; }
        if (!s.expired) { touchSession(s); return { state: 'ok', email: s.email }; }
        if (g.navigator && g.navigator.onLine === false) {
          return { state: 'ok', email: s.email, stale: true };
        }
        return { state: 'needed', email: s.email };
      });
    }
  };
})(window);
