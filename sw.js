/* Bismarck Big Boy — service worker.
   The cache name is content-addressed from APP_SHELL_HASH.txt's inputs, so a
   release can never mix HTML, JS, data and icons from different versions. */
importScripts('core.js');

const Core = globalThis.BigBoyCore;
const CACHE_PREFIX = 'bb-app-';
const STATE_CACHE = 'bb-shell-state';
const VERSION_KEY = './version';
const FAILURE_KEY = './__shell_install_failed';
/* Everything needed to start the app offline. sw.js is included so its own
   bytes are covered by the version hash; facebook_deals.json is shell content
   but is deliberately excluded from the release hash because the scraper
   refreshes it independently. */
const SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './startup.js',
  './assets/startup/big-boy-bismarck.webp',
  './core.js',
  './menu.json',
  './hours_overrides.json',
  './facebook_deals.json',
  './manifest.webmanifest',
  './sw.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/favicon-48.png'
];
/* Exact 15-file list produced by .github/workflows/auto-package.yml. */
const HASH_SOURCES = [
  './index.html',
  './styles.css',
  './core.js',
  './app.js',
  './startup.js',
  './assets/startup/big-boy-bismarck.webp',
  './menu.json',
  './hours_overrides.json',
  './manifest.webmanifest',
  './sw.js',
  './icons/apple-touch-icon-180.png',
  './icons/favicon-48.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
const JSON_ASSETS = new Set(['./menu.json', './hours_overrides.json', './facebook_deals.json']);
const HASH_FILE = 'APP_SHELL_HASH.txt';
/* The retry is a normal link, not inline JS: the fallback is served with a
   strict CSP and must work without scripts (and without any extra asset). */
const OFFLINE_HTML = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bismarck Big Boy — Offline</title><style>body{margin:0;background:#1E1E1E;color:#fff;font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:28px;text-align:center}div{max-width:34ch}h1{color:#C8102E;font-size:30px;margin:0 0 10px}p{color:#CFCFCF}.retry{display:inline-block;margin-top:14px;background:#C8102E;color:#fff;border-radius:10px;padding:12px 20px;font-weight:700;text-decoration:none}</style><div><h1>You are offline</h1><p>The app could not reach the internet and no saved copy is available yet. Reconnect and try again.</p><a class="retry" href="./">TRY AGAIN</a></div></html>';

let activeCacheName = null;
let cacheNamePromise = null;
const fallbackNotified = new Set();

function relativeKey(url){
  const scopePath = new URL(self.registration.scope).pathname;
  return url.pathname.startsWith(scopePath) ? './' + url.pathname.slice(scopePath.length) : null;
}
function toHex(buf){
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function validHash(h){
  return typeof h === 'string' && /^[a-f0-9]{960}$/.test(h);
}
/* The committed hash is a concatenation of 15 per-file digests. Hashing that
   entire string (not a prefix) means every shell input affects the version. */
async function releaseVersion(hashText){
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashText));
  return toHex(digest).slice(0, 24);
}
/* Syntax was already checked by JSON.parse(); these are application-schema
   gates. A parseable but structurally wrong payload must never become the
   "last known good" copy for a release. */
function validateJsonSchema(url, data){
  if (url === './menu.json'){
    Core.validateMenu(data);
  } else if (url === './hours_overrides.json'){
    if (!data || !Array.isArray(data.overrides)) throw new Error('invalid hours_overrides schema');
    Core.normalizeOverrides(data);
  } else if (url === './facebook_deals.json'){
    Core.assertDealsPayload(data);
  }
}
async function readAsset(url){
  try {
    const res = await fetch(url, { cache:'reload' });
    if (!res.ok) return { ok:false, url, error:'HTTP ' + res.status };
    const bytes = await res.clone().arrayBuffer();
    if (JSON_ASSETS.has(url)){
      let data;
      try { data = JSON.parse(new TextDecoder().decode(bytes)); }
      catch (e) { return { ok:false, url, error:'invalid JSON syntax' }; }
      try { validateJsonSchema(url, data); }
      catch (e) { return { ok:false, url, error:'invalid schema: ' + e.message }; }
    }
    return { ok:true, url, res, bytes };
  } catch (e) {
    return { ok:false, url, error:String(e) };
  }
}
async function stateCache(){
  return caches.open(STATE_CACHE);
}
async function currentCacheName(){
  if (activeCacheName) return activeCacheName;
  if (!cacheNamePromise){
    cacheNamePromise = (async () => {
      const state = await stateCache();
      const res = await state.match(VERSION_KEY);
      if (!res) return null;
      const version = (await res.text()).trim();
      if (!/^[a-f0-9]{24}$/.test(version)) return null;
      activeCacheName = CACHE_PREFIX + version;
      return activeCacheName;
    })();
  }
  return cacheNamePromise;
}
async function reportFailure(failed){
  const state = await stateCache();
  await state.put(FAILURE_KEY, new Response(JSON.stringify(failed), {
    headers: { 'Content-Type':'application/json' }
  }));
  const clients = await self.clients.matchAll({ includeUncontrolled:true }).catch(() => []);
  clients.forEach(c => c.postMessage({ type:'SHELL_INSTALL_FAILED', failed }));
}
async function notifyFallback(url, reason){
  if (fallbackNotified.has(url)) return;
  fallbackNotified.add(url);
  const clients = await self.clients.matchAll({ includeUncontrolled:true }).catch(() => []);
  clients.forEach(c => c.postMessage({ type:'CONTENT_FALLBACK', url, reason:String(reason) }));
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const entries = await Promise.all(SHELL.map(readAsset));
    const failed = entries.filter(x => !x.ok).map(({ url, error }) => ({ u:url, error }));
    if (!failed.length){
      try {
        const byUrl = new Map(entries.map(x => [x.url, x]));
        const digests = [];
        for (const url of HASH_SOURCES){
          const entry = byUrl.get(url);
          if (!entry || !entry.ok) throw new Error('Missing shell input ' + url);
          digests.push(toHex(await crypto.subtle.digest('SHA-256', entry.bytes)));
        }
        const computed = digests.join('');
        const hashRes = await fetch(HASH_FILE, { cache:'no-store' });
        const expected = hashRes.ok ? (await hashRes.text()).trim() : '';
        if (!validHash(expected) || expected !== computed){
          throw new Error('App shell hash mismatch');
        }
        const version = await releaseVersion(computed);
        const cacheName = CACHE_PREFIX + version;
        const cache = await caches.open(cacheName);
        await Promise.all(entries.map(({ url, res }) => cache.put(url, res.clone())));
        const state = await stateCache();
        await state.put(VERSION_KEY, new Response(version, {
          headers: { 'Content-Type':'text/plain' }
        }));
        await state.delete(FAILURE_KEY);
        activeCacheName = cacheName;
        cacheNamePromise = Promise.resolve(cacheName);
        /* Tell clients the recovery succeeded so a pending failure notice is
           cleared instead of surviving the controllerchange reload. */
        const clients = await self.clients.matchAll({ includeUncontrolled:true }).catch(() => []);
        clients.forEach(c => c.postMessage({ type:'SHELL_INSTALL_OK', version }));
        await self.skipWaiting();
        return;
      } catch (err) {
        failed.push({ u:HASH_FILE, error:String(err) });
      }
    }
    // Never activate an incomplete shell. Persist the failure for the page to
    // read, then reject install so the previous complete worker stays in
    // control. RETRY forces a fresh install with a new script URL.
    await reportFailure(failed);
    throw new Error('App shell installation failed');
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const state = await stateCache();
    const failure = await state.match(FAILURE_KEY);
    if (failure){
      const failed = await failure.json().catch(() => []);
      const clients = await self.clients.matchAll({ includeUncontrolled:true }).catch(() => []);
      clients.forEach(c => c.postMessage({ type:'SHELL_INSTALL_FAILED', failed }));
      await state.delete(FAILURE_KEY);
    }
    const name = await currentCacheName();
    if (name){
      const keys = await caches.keys();
      // Only release caches are ours. User data lives in localStorage and is
      // never touched; unrelated origin caches are left alone too.
      await Promise.all(keys
        .filter(k => k.startsWith(CACHE_PREFIX) && k !== name)
        .map(k => caches.delete(k)));
    }
    await self.clients.claim();
    // Install-time messages can be lost; activation is the reliable point.
    // A successful activation clears any stale failure notice on open tabs.
    const clients = await self.clients.matchAll({ includeUncontrolled:true }).catch(() => []);
    clients.forEach(c => c.postMessage({
      type:'SHELL_INSTALL_OK',
      version: name ? name.slice(CACHE_PREFIX.length) : null
    }));
  })());
});

/* A client that loads after activation can still ask for the install result. */
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'CHECK_SHELL') return;
  e.waitUntil((async () => {
    const state = await stateCache();
    const failure = await state.match(FAILURE_KEY);
    if (!failure || !e.source) return;
    e.source.postMessage({
      type:'SHELL_INSTALL_FAILED',
      failed: await failure.json().catch(() => [])
    });
    await state.delete(FAILURE_KEY);
  })().catch(() => {}));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  const key = relativeKey(url);
  if (!key) return;

  /* Navigation: network first. The cached shell is only ever written by a
     successful, hash-verified install, so serving a live HTML response into a
     versioned cache would create exactly the mixed release we prevent. */
  if (req.mode === 'navigate'){
    e.respondWith((async () => {
      try {
        return await fetch(req);
      } catch (err) {
        const name = await currentCacheName();
        const cache = name ? await caches.open(name) : null;
        const cached = cache && await cache.match('./index.html');
        return cached || new Response(OFFLINE_HTML, {
          status: 503,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
          }
        });
      }
    })());
    return;
  }

  if (!SHELL.includes(key)) return;

  e.respondWith((async () => {
    const name = await currentCacheName();
    const cache = name ? await caches.open(name) : null;

    /* JSON: fresh when valid, last known good when the network is offline,
       malformed, schema-invalid or an HTTP error. Network data is never
       written here — a new version arrives through the verified install. */
    if (JSON_ASSETS.has(key)){
      const cached = cache ? await cache.match(key) : null;
      try {
        const res = await fetch(req, { cache:'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.clone().json();
        validateJsonSchema(key, data);
        return res;
      } catch (err) {
        await notifyFallback(key, err);
        return cached || new Response('[]', {
          status: 503,
          headers: {
            'Content-Type':'application/json',
            'X-BigBoy-Content-Fallback':'none'
          }
        });
      }
    }

    /* Static shell assets are immutable within a version. Freshness comes
       from a new install creating a new cache, not from mutating this one. */
    if (cache){
      const cached = await cache.match(key);
      if (cached) return cached;
    }
    try { return await fetch(req); }
    catch (err) { return new Response('', { status:503 }); }
  })());
});
