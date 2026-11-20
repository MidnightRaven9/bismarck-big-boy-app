/* Bismarck Big Boy — service worker.
   Cache only successful, same-origin app-shell responses. Bump CACHE when any
   shell input changes (index.html, app.js, menu.json, manifest, icons). */
const CACHE = 'bb-app-v16';
const SHELL = [
  './',
  './index.html',
  './app.js',
  './core.js',
  './menu.json',
  './hours_overrides.json',
  './facebook_deals.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
  './icons/favicon-48.png'
];
const JSON_ASSETS = new Set(['./menu.json', './hours_overrides.json', './facebook_deals.json']);
/* Install-time postMessage is not delivered to clients. Persist the failure and
   report it from activate (and on request) so the page can actually show it. */
const FAILURE_KEY = './__shell_install_failed';
/* The retry is a normal link, not inline JS: the fallback is served with a
   strict CSP and must work without scripts (and without any extra asset). */
const OFFLINE_HTML = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bismarck Big Boy — Offline</title><style>body{margin:0;background:#1E1E1E;color:#fff;font:16px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:28px;text-align:center}div{max-width:34ch}h1{color:#C8102E;font-size:30px;margin:0 0 10px}p{color:#CFCFCF}.retry{display:inline-block;margin-top:14px;background:#C8102E;color:#fff;border-radius:10px;padding:12px 20px;font-weight:700;text-decoration:none}</style><div><h1>You are offline</h1><p>The app could not reach the internet and no saved copy is available yet. Reconnect and try again.</p><a class="retry" href="./">TRY AGAIN</a></div></html>';

function relativeKey(url){
  const scopePath = new URL(self.registration.scope).pathname;
  let rel = url.pathname.startsWith(scopePath) ? url.pathname.slice(scopePath.length) : '';
  return './' + rel;
}
function isHTML(res){
  return res.ok && res.type === 'basic' && /text\/html/i.test(res.headers.get('content-type') || '');
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.all(SHELL.map(async u => {
      try {
        const res = await fetch(u, { cache:'reload' });
        if (!res.ok) return { u, error:'HTTP ' + res.status };
        if (JSON_ASSETS.has(u)) await res.clone().json();
        await cache.put(u, res.clone());
        return { u, ok:true };
      } catch (err) { return { u, error:String(err) }; }
    }));
    const failed = results.filter(r => !r.ok);
    if (failed.length){
      await cache.put(FAILURE_KEY, new Response(JSON.stringify(failed), {
        headers: { 'Content-Type':'application/json' }
      }));
    } else {
      await cache.delete(FAILURE_KEY);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const failure = await cache.match(FAILURE_KEY);
    if (failure){
      const failed = await failure.json().catch(() => []);
      const clients = await self.clients.matchAll({ includeUncontrolled:true }).catch(() => []);
      clients.forEach(c => c.postMessage({ type:'SHELL_INSTALL_FAILED', failed }));
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* A client that loads after activation can still ask for the install result. */
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'CHECK_SHELL') return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const failure = await cache.match(FAILURE_KEY);
    if (!failure || !e.source) return;
    e.source.postMessage({ type:'SHELL_INSTALL_FAILED', failed: await failure.json().catch(() => []) });
    await cache.delete(FAILURE_KEY);
  })().catch(() => {}));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;   // Wix photos / favicons: network only

  /* Navigation: network first. Never store an error page as the shell. */
  if (req.mode === 'navigate'){
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (isHTML(res)){
          const cache = await caches.open(CACHE);
          await cache.put('./index.html', res.clone()).catch(() => {});
        }
        return res;
      } catch (err) {
        const cache = await caches.open(CACHE);
        const cached = await cache.match('./') || await cache.match('./index.html');
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

  const key = relativeKey(url);
  if (!SHELL.includes(key)) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    /* Small JSON: fresh when online, cached copy when offline. Errors never overwrite good data. */
    if (JSON_ASSETS.has(key)){
      try {
        const res = await fetch(req, { cache:'no-store' });
        if (res.ok){
          try {
            await res.clone().json();
            await cache.put(key, res.clone()).catch(() => {});
          } catch (_) { /* malformed JSON: keep the previous good copy */ }
          return res;
        }
      } catch (err) { /* offline */ }
      return (await cache.match(key)) || new Response('[]', {
        status: 503, headers: { 'Content-Type':'application/json' }
      });
    }

    /* Static shell assets: cached copy immediately, refreshed in the background. */
    const cached = await cache.match(key);
    const network = fetch(req).then(res => {
      if (res.ok && res.type === 'basic') cache.put(key, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response('', { status: 503 });
  })());
});
