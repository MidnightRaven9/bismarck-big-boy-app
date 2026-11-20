/* Browser integration checks. Run after `npm ci` with:
   npm run test:browser  (or: node tests/browser.test.js) */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png', '.css':'text/css' };
const results = [];
const check = (name, fn) => results.push({ name, fn });

// Used by the failed-shell-install test: service-worker fetches are not
// interceptable with context.route, so the server itself must fail the asset.
let failMenu = false;
const server = http.createServer((req, res) => {
  const clean = decodeURIComponent(req.url.split('?')[0]);
  if (failMenu && clean === '/menu.json'){
    res.writeHead(500, { 'Content-Type':'application/json' });
    res.end('{}');
    return;
  }
  let file = path.join(ROOT, clean === '/' ? 'index.html' : clean);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
  const context = await browser.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'allow' });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', e => failures.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) failures.push('CSP: ' + m.text());
  });
  // External sites are out of scope for these tests.
  await context.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());

  const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

  check('app shell, menu and status render', async () => {
    await page.goto(base, { waitUntil:'networkidle' });
    await page.waitForSelector('#menuList .item', { state:'attached' });
    ok(await page.locator('#menuList .item').count() === 56, 'expected 56 menu items');
    ok(await page.locator('#chips .chip').count() === 8, 'expected 8 category chips');
    const status = await page.locator('#statusMain').textContent();
    ok(status !== 'Checking…', 'status never resolved');
    ok(/^(Open now|Closed|Closed today)$/.test(status.trim()), 'unexpected status: ' + status);
  });

  check('navigation, aria-current and hash deep links', async () => {
    await page.locator('.tab[data-tab="menu"]').click();
    ok(await page.locator('.tab[data-tab="menu"]').getAttribute('aria-current') === 'page', 'aria-current missing');
    ok(await page.evaluate(() => location.hash) === '#menu', 'hash not updated');
    await page.goto(base + '#directions', { waitUntil:'networkidle' });
    await page.waitForSelector('#iab.open', { timeout:5000 });
    ok(await page.locator('#iab.open').count() === 1, 'directions shortcut did not open map handoff');
    await page.keyboard.press('Escape');
    ok(await page.locator('#iab.open').count() === 0, 'Escape did not close dialog');
  });

  check('iframe framing and focus restoration', async () => {
    await page.goto(base, { waitUntil:'networkidle' });
    const link = page.locator('.qa a[data-title="Directions"]');
    await link.click();
    await page.waitForSelector('#iab.open');
    const src = await page.locator('#iabFrame').getAttribute('src');
    ok(src.includes('openstreetmap.org'), 'map was not framed: ' + src);
    await page.keyboard.press('Tab');
    ok(await page.evaluate(() => document.activeElement.closest('#iab') !== null), 'focus escaped dialog');
    await page.keyboard.press('Escape');
    ok(await page.evaluate(() => document.activeElement.matches('.qa a[data-title="Directions"]')), 'focus not restored');
  });

  check('sensitive links hand off instead of framing', async () => {
    await page.goto(base, { waitUntil:'networkidle' });
    await page.waitForFunction(() => !!document.querySelector('.qa a.primary'));
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout:5000 }),
      page.locator('.qa a.primary').click()
    ]);
    ok(popup !== null, 'no external handoff opened');
    ok(await page.locator('#iab.open').count() === 0, 'ordering was framed instead of handed off');
    if (popup) await popup.close();
  });

  check('favorites persist and corrupted storage is survivable', async () => {
    await page.goto(base + '#menu', { waitUntil:'networkidle' });
    await page.locator('#menuList .fav').first().click();
    ok((await page.locator('#favBadge').textContent()).trim() === '1', 'favorite not counted');
    await page.reload({ waitUntil:'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#menuList .item').length === 56);
    ok((await page.locator('#favBadge').textContent()).trim() === '1', 'favorite not persisted');
    await page.evaluate(() => localStorage.setItem('bb_favs_v1', '{corrupt'));
    await page.reload({ waitUntil:'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#menuList .item').length === 56);
    ok(await page.locator('#menuList .item').count() === 56, 'corrupt storage broke the menu');
    ok((await page.locator('#favBadge').textContent()).trim() === '0', 'corrupt storage left stale badge');
  });

  check('malformed deals data shows a safe empty state', async () => {
    await context.route('**/facebook_deals.json', r => r.fulfill({ status:200, contentType:'application/json', body:'{"broken":true}' }));
    await page.goto(base + '#info', { waitUntil:'networkidle' });
    await page.waitForFunction(() => !document.querySelector('#fbDealsList').textContent.includes('Loading'));
    const text = await page.locator('#fbDealsList').textContent();
    ok(/No current deals|unavailable/.test(text), 'unsafe deals state: ' + text);
    await context.unroute('**/facebook_deals.json');
  });

  check('service worker caches the shell for offline use', async () => {
    await page.goto(base, { waitUntil:'networkidle' });
    const ready = await page.evaluate(async () => { await navigator.serviceWorker.ready; return !!navigator.serviceWorker.controller; });
    ok(ready, 'service worker never took control');
    ok(await page.locator('#appNotice').isHidden(), 'shell install failure was reported');
    await context.setOffline(true);
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForSelector('#menuList .item', { state:'attached', timeout:10000 });
    ok(await page.locator('#menuList .item').count() === 56, 'offline menu missing');
    await context.setOffline(false);
  });

  check('menu search, category filters and empty state', async () => {
    await page.goto(base + '#menu', { waitUntil:'networkidle' });
    await page.waitForFunction(() => document.querySelectorAll('#menuList .item').length === 56);
    await page.fill('#search', 'shake');
    await page.waitForFunction(() => document.querySelectorAll('#menuList .item').length < 56);
    const n = await page.locator('#menuList .item').count();
    ok(n > 0 && n < 56, 'search did not filter: ' + n);
    await page.fill('#search', 'zzzznotamenuword');
    await page.waitForFunction(() => !!document.querySelector('#clearSearchEmpty'));
    await page.locator('#clearSearchEmpty').click();
    await page.waitForFunction(() => document.querySelectorAll('#menuList .item').length === 56);
    await page.locator('#chips .chip[data-cat="drinks"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#menuList .item').length === 4);
  });

  check('narrow layouts do not overflow horizontally', async () => {
    await page.setViewportSize({ width:320, height:640 });
    await page.goto(base + '#menu', { waitUntil:'networkidle' });
    const narrow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(narrow <= 1, '320px layout overflows by ' + narrow + 'px');
    await page.setViewportSize({ width:360, height:720 });
    const medium = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(medium <= 1, '360px layout overflows by ' + medium + 'px');
    await page.setViewportSize({ width:390, height:844 });
  });

  check('200% zoom reflow (195 CSS px) has no horizontal scroll', async () => {
    await page.setViewportSize({ width:195, height:720 });
    await page.goto(base + '#menu', { waitUntil:'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(overflow <= 1, '195px layout overflows by ' + overflow + 'px');
    await page.setViewportSize({ width:390, height:844 });
  });

  check('keyboard navigation reaches and activates the tabs', async () => {
    await page.goto(base, { waitUntil:'networkidle' });
    await page.evaluate(() => document.activeElement.blur());
    let found = false;
    for (let i = 0; i < 25; i++){
      await page.keyboard.press('Tab');
      found = await page.evaluate(() => document.activeElement.classList.contains('tab'));
      if (found) break;
    }
    ok(found, 'tab order never reaches the bottom navigation');
    await page.keyboard.press('Enter');
    ok((await page.evaluate(() => location.hash)).length > 1, 'Enter did not activate a tab');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    ok(outline !== 'none', 'keyboard focus has no visible outline');
  });

  check('reduced motion disables transitions and animations', async () => {
    await page.emulateMedia({ reducedMotion:'reduce' });
    await page.goto(base, { waitUntil:'networkidle' });
    const m = await page.evaluate(() => {
      const el = document.querySelector('.screen.active');
      const cs = getComputedStyle(el);
      return { duration: cs.transitionDuration, animation: cs.animationDuration };
    });
    ok(m.duration === '0s' || m.duration === '0.01ms', 'transition still active: ' + m.duration);
    ok(m.animation === '0s' || m.animation === '0.01ms', 'animation still active: ' + m.animation);
    await page.emulateMedia({ reducedMotion:'no-preference' });
  });

  check('key text meets minimum colour contrast', async () => {
    await page.goto(base, { waitUntil:'networkidle' });
    const bad = await page.evaluate(() => {
      const lum = c => {
        const [r,g,b] = c.match(/\d+/g).map(Number).slice(0,3).map(v => {
          v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4);
        });
        return 0.2126*r + 0.7152*g + 0.0722*b;
      };
      const ratio = (a,b) => { const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
      const checks = [
        ['body', document.body, getComputedStyle(document.body).backgroundColor],
        ['.chip', document.querySelector('.chip'), getComputedStyle(document.querySelector('.card') || document.body).backgroundColor],
        ['.btn', document.querySelector('.btn'), getComputedStyle(document.body).backgroundColor]
      ];
      return checks.filter(([,el,bg]) => el).map(([name,el,bg]) => [name, ratio(getComputedStyle(el).color, bg)])
        .filter(([,r]) => r < 4.5);
    });
    ok(bad.length === 0, 'low contrast: ' + JSON.stringify(bad));
  });

  check('basic accessibility semantics', async () => {
    await page.goto(base, { waitUntil:'networkidle' });
    const a = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
      return {
        duplicateIds: ids.filter((x,i) => ids.indexOf(x) !== i),
        unnamedButtons: [...document.querySelectorAll('button')]
          .filter(b => !(b.textContent.trim() || b.getAttribute('aria-label') || b.getAttribute('title')))
          .map(b => b.outerHTML.slice(0,80)),
        imagesWithoutAlt: [...document.querySelectorAll('img')].filter(i => !i.hasAttribute('alt')).length,
        iframeTitle: document.querySelector('#iabFrame')?.getAttribute('title'),
        dialogRole: document.querySelector('#iab')?.getAttribute('role'),
        statusLive: document.querySelector('#status')?.getAttribute('aria-live')
      };
    });
    ok(a.duplicateIds.length === 0, 'duplicate ids: ' + a.duplicateIds.join(','));
    ok(a.unnamedButtons.length === 0, 'unnamed buttons: ' + a.unnamedButtons.join(' | '));
    ok(a.imagesWithoutAlt === 0, 'images missing alt: ' + a.imagesWithoutAlt);
    ok(a.iframeTitle === 'In-app browser', 'iframe has no title');
    ok(a.dialogRole === 'dialog' && a.statusLive === 'polite', 'dialog/live-region semantics missing');
  });

  check('offline startup without a cached shell shows a CSP-safe fallback', async () => {
    const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'allow' });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const p = await ctx.newPage();
    await p.goto(base, { waitUntil:'networkidle' });
    // The app reloads once when the worker takes control. Wait for that
    // deliberate navigation to finish before touching the caches.
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout:10000 });
    let cachesCleared = false;
    for (let i = 0; i < 20 && !cachesCleared; i++){
      try {
        await p.evaluate(async () => {
          await navigator.serviceWorker.ready;
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        });
        cachesCleared = true;
      } catch (e) { await p.waitForTimeout(250); }
    }
    ok(cachesCleared, 'could not clear caches on a stable page');
    await ctx.setOffline(true);
    const resp = await p.reload({ waitUntil:'domcontentloaded' });
    ok(resp.status() === 503, 'fallback status was ' + resp.status());
    const html = await p.content();
    ok(html.includes('You are offline'), 'fallback message missing');
    ok(!/onclick=/i.test(html), 'inline handler found in fallback');
    ok(html.includes('<a class="retry" href="./">TRY AGAIN</a>'), 'CSP-safe retry link missing');
    const csp = resp.headers()['content-security-policy'] || '';
    ok(csp.includes("default-src 'none'"), 'fallback CSP header missing');
    await ctx.setOffline(false);
    await p.locator('.retry').click();
    await p.waitForSelector('#menuList .item', { state:'attached', timeout:10000 });
    await ctx.close();
  });

  check('failed shell installation is reported to the page', async () => {
    const ctx = await browser.newContext({ serviceWorkers:'allow' });
    await ctx.addInitScript(() => {
      // The app reloads on controllerchange; keep the log across that reload.
      try { window.__swMessages = JSON.parse(sessionStorage.getItem('bb_test_sw_messages') || '[]'); }
      catch (e) { window.__swMessages = []; }
      navigator.serviceWorker.addEventListener('message', e => {
        window.__swMessages.push(e.data);
        try { sessionStorage.setItem('bb_test_sw_messages', JSON.stringify(window.__swMessages)); } catch (err) {}
      });
    });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    failMenu = true;
    try {
      const p = await ctx.newPage();
      await p.goto(base, { waitUntil:'networkidle' });
      await p.waitForFunction(() => {
        const el = document.querySelector('#appNotice');
        return el && !el.hidden;
      }, null, { timeout:15000 });
      const notice = await p.locator('#appNotice').textContent();
      ok(/Offline setup did not finish/.test(notice), 'shell install notice missing: ' + notice);
      const failed = await p.evaluate(async () => {
        const cache = await caches.open('bb-app-v16');
        const res = await cache.match('./__shell_install_failed');
        return res ? (await res.json()).map(f => f.u) : [];
      });
      // The flag is consumed by CHECK_SHELL, so accept either source of truth.
      const msgs = await p.evaluate(() => window.__swMessages || []);
      ok(failed.some(u => u.includes('menu.json')) || msgs.some(m => m && m.failed && m.failed.some(f => f.u.includes('menu.json'))), 'menu.json failure not reported');
    } finally {
      failMenu = false;
      await ctx.close();
    }
  });

  check('service worker updates replace old caches and keep control', async () => {
    // Dedicated origin serving the original worker until the test explicitly
    // allows the new one. The app's own reg.update() therefore cannot trigger
    // the update before the stale cache has been planted.
    const swSource = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const newSwSource = swSource.replace(
      "const CACHE = 'bb-app-v16';", "const CACHE = 'bb-app-v16-update-test';");
    let allowUpdate = false, newSwFetches = 0;
    const updateServer = http.createServer((req, res) => {
      const clean = decodeURIComponent(req.url.split('?')[0]);
      if (clean === '/sw.js'){
        const src = allowUpdate ? newSwSource : swSource;
        if (allowUpdate) newSwFetches++;
        res.writeHead(200, { 'Content-Type':'text/javascript', 'Cache-Control':'no-store' });
        res.end(src);
        return;
      }
      const file = path.join(ROOT, clean === '/' ? 'index.html' : clean);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()){
        res.writeHead(404).end('not found'); return;
      }
      res.writeHead(200, { 'Content-Type':MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise(r => updateServer.listen(0, '127.0.0.1', r));
    const updateBase = `http://127.0.0.1:${updateServer.address().port}/`;
    const ctx = await browser.newContext({ serviceWorkers:'allow' });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const p = await ctx.newPage();
    await p.goto(updateBase, { waitUntil:'networkidle' });

    // The first activation reloads the page; retry until the context is stable.
    const evalStable = async fn => {
      for (let i = 0; i < 30; i++){
        try { return await p.evaluate(fn); }
        catch (e) { await p.waitForTimeout(250); }
      }
      throw new Error('page never became stable');
    };
    await evalStable(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller){
        await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once:true }));
      }
      const stale = await caches.open('bb-app-old');
      await stale.put('./stale', new Response('stale'));
    });

    allowUpdate = true;
    // Fire and forget: activation deliberately reloads the page, so do not
    // hold an execution context across controllerchange.
    await evalStable(() => {
      navigator.serviceWorker.getRegistration().then(reg => reg.update()).catch(() => {});
    });

    // Poll until the new worker has activated and cleaned up old caches.
    let state;
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline && !state){
      try {
        const s = await p.evaluate(async () => ({
          keys: await caches.keys(),
          controlled: !!navigator.serviceWorker.controller
        }));
        if (s.keys.includes('bb-app-v16-update-test') &&
            !s.keys.includes('bb-app-old') &&
            !s.keys.includes('bb-app-v16') && s.controlled) state = s;
      } catch (e) { /* deliberate reload destroyed the context */ }
      if (!state) await p.waitForTimeout(250);
    }
    ok(!!state, 'page never became stable after the service worker update');
    ok(newSwFetches >= 1, 'updated service worker was never fetched');
    ok(!state.keys.includes('bb-app-old'), 'stale cache survived activation');
    ok(state.keys.includes('bb-app-v16-update-test'), 'updated cache was not created');
    ok(state.controlled, 'control lost after update');
    await ctx.close();
    await new Promise(r => updateServer.close(r));
  });

  check('all external actions use a secure handoff, not framing', async () => {
    await page.goto(base, { waitUntil:'networkidle' });
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href^="https://"]')]
      .filter(a => !a.hasAttribute('data-iab'))
      .map(a => ({ href:a.href, target:a.target, rel:a.rel, text:(a.textContent || '').trim().slice(0,40) })));
    ok(links.some(l => l.href.includes('order.toasttab.com/online/')), 'ordering link missing');
    ok(links.some(l => l.href.includes('ubereats.com')), 'Uber Eats link missing');
    ok(links.some(l => l.href.includes('doordash.com')), 'DoorDash link missing');
    ok(links.some(l => l.href.includes('fooddudesdelivery.com')), 'Food Dudes link missing');
    ok(links.some(l => l.href.includes('RQQO1ZM52u5HXnVX')), 'rewards link missing or changed');
    ok(links.some(l => l.href.includes('/giftcards')), 'gift card link missing');
    // Handoff attributes are applied to a temporary anchor at click time (the
    // static markup stays declarative), so verify the actual popup behaviour.
    for (const [sel, hash] of [
      ['a[href*="ubereats.com"]', ''], ['a[href*="doordash.com"]', ''],
      ['a[href*="RQQO1ZM52u5HXnVX"]', '#rewards'], ['a[href*="/giftcards"]', '#rewards']
    ]){
      await page.goto(base + hash, { waitUntil:'networkidle' });
      const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout:5000 }),
        page.locator(sel).first().click()
      ]);
      ok(!!popup, 'no popup for ' + sel);
      ok(await page.locator('#iab.open').count() === 0, sel + ' was framed instead of handed off');
      await popup.close();
    }
    // Allowlisted delivery partner is the exception: it is framed in-app.
    await page.goto(base, { waitUntil:'networkidle' });
    await page.locator('a[href*="fooddudesdelivery.com"]').first().click();
    ok(await page.locator('#iab.open').count() === 1, 'Food Dudes was not framed');
    await page.keyboard.press('Escape');
  });

  check('no console errors or CSP violations', async () => {
    ok(failures.length === 0, failures.join(' | '));
  });

  let passed = 0;
  for (const t of results){
    try { await t.fn(); console.log('PASS  ' + t.name); passed++; }
    catch (e) { console.log('FAIL  ' + t.name + ' — ' + e.message); }
  }
  await browser.close();
  server.close();
  console.log(`\n${passed}/${results.length} browser checks passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
