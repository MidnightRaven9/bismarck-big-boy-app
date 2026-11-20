/* Browser integration checks. Run after `npm ci` with:
   npm run test:browser  (or: node tests/browser.test.js) */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.webmanifest':'application/manifest+json', '.png':'image/png', '.css':'text/css' };
const results = [];
const check = (name, fn) => results.push({ name, fn });

// Service-worker fetches are not reliably interceptable with context.route,
// so server-side flags drive the failure/fallback scenarios.
let failMenu = false, badMenuSchema = false;
const SHELL_HASH_FILES = [
  'index.html', 'core.js', 'app.js', 'menu.json', 'hours_overrides.json',
  'manifest.webmanifest', 'sw.js', 'icons/apple-touch-icon-180.png',
  'icons/favicon-48.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];
function computeShellHash(overrides = {}){
  return SHELL_HASH_FILES.map(f => {
    const body = overrides[f] || fs.readFileSync(path.join(ROOT, f));
    return crypto.createHash('sha256').update(body).digest('hex');
  }).join('');
}
function versionFromHash(hash){
  return crypto.createHash('sha256').update(hash).digest('hex').slice(0, 24);
}
const server = http.createServer((req, res) => {
  const clean = decodeURIComponent(req.url.split('?')[0]);
  if (failMenu && clean === '/menu.json'){
    res.writeHead(500, { 'Content-Type':'application/json' });
    res.end('{}');
    return;
  }
  if (badMenuSchema && clean === '/menu.json'){
    res.writeHead(200, { 'Content-Type':'application/json' });
    res.end('{"oops":true}');
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
  const stableEval = async (p, fn, tries = 40) => {
    for (let i = 0; i < tries; i++){
      try { return await p.evaluate(fn); }
      catch (e) { await p.waitForTimeout(250); }
    }
    throw new Error('page never became stable');
  };
  const shellVersions = async p => stableEval(p, async () => {
    const state = await caches.open('bb-shell-state');
    const res = await state.match('./version');
    const version = res ? (await res.text()).trim() : null;
    return { version, keys: await caches.keys() };
  });

  check('app shell, menu and status render', async () => {
    await page.goto(base, { waitUntil:'networkidle' });
    await page.waitForSelector('#menuList .item', { state:'attached' });
    ok(await page.locator('#menuList .item').count() === 56, 'expected 56 menu items');
    ok(await page.locator('#chips .chip').count() === 8, 'expected 8 category chips');
    // The first controllerchange reload can replace the DOM mid-check.
    await page.waitForFunction(() => {
      const t = document.querySelector('#statusMain')?.textContent || '';
      return t !== 'Checking…' && /^(Open now|Closed|Closed today)$/.test(t.trim());
    }, null, { timeout:10000 });
    const status = await page.locator('#statusMain').textContent();
    ok(status !== 'Checking…', 'status never resolved');
    ok(/^(Open now|Closed|Closed today)$/.test(status.trim()), 'unexpected status: ' + status);
  });

  check('malicious menu content is displayed as text, never executed', async () => {
    const ctx = await browser.newContext({ serviceWorkers:'block' });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const payload = [{
      id:'specials',
      name:'<img src=x onerror="window.__xss=1">Specials & More',
      items:[{
        id:'ok-item',
        n:'" onerror="window.__xss=2 <script>window.__xss=3</script> Burger',
        img:'x" onerror="window.__xss=4',
        d:"O'Brien's <b>fries</b> & gravy",
        s:[['<svg onload="window.__xss=5">Small', 5.25]]
      }, {
        id:'safe-item', n:'Normal Item', img:'063b6c_abc~mv2.jpg',
        d:'Plain description', s:[['Regular', 4.5]]
      }]
    }];
    await ctx.route('**/menu.json', r => r.fulfill({
      status:200, contentType:'application/json', body:JSON.stringify(payload)
    }));
    const p = await ctx.newPage();
    await p.goto(base + '#menu', { waitUntil:'networkidle' });
    await p.waitForSelector('#menuList .item');
    ok(await p.evaluate(() => window.__xss === undefined), 'injected script executed');
    const injected = await p.locator('#menuList script, #menuList img[onerror], #menuList svg[onload], #chips [onerror], #chips [onload]').count();
    ok(injected === 0, 'malicious markup became a live element');
    ok((await p.locator('#menuList .cat-head').first().textContent()).includes('<img src=x onerror='), 'category name was not shown as text');
    ok((await p.locator('#menuList .item').first().locator('h4').textContent()).includes('<script>'), 'item name was not shown as text');
    ok((await p.locator('#menuList .item').first().locator('.desc').textContent()).includes("O'Brien's"), 'legitimate characters were stripped');
    ok(await p.locator('#menuList .item').first().locator('img').count() === 0, 'unsafe media id produced an image');
    ok((await p.locator('#menuList .item').first().locator('.price').textContent()).trim() === '$5.25', 'price rendering broke');
    await p.locator('#menuList .item').first().locator('.fav').click();
    ok((await p.locator('#favBadge').textContent()).trim() === '1', 'favorites broke with escaped ids');
    await p.fill('#search', 'Normal');
    ok(await p.locator('#menuList .item').count() === 1, 'search broke with escaped content');
    await ctx.close();
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

  check('malformed deals data shows a safe empty state without a cached copy', async () => {
    const ctx = await browser.newContext({ serviceWorkers:'block' });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await ctx.route('**/facebook_deals.json', r => r.fulfill({
      status:200, contentType:'application/json', body:'{"broken":true}'
    }));
    const p = await ctx.newPage();
    await p.goto(base + '#info', { waitUntil:'networkidle' });
    await p.waitForFunction(() => !document.querySelector('#fbDealsList').textContent.includes('Loading'));
    const text = await p.locator('#fbDealsList').textContent();
    ok(/No current deals|unavailable/.test(text), 'unsafe deals state: ' + text);
    await ctx.close();
  });

  check('service worker rejects malformed JSON and serves last known good data', async () => {
    const ctx = await browser.newContext({ serviceWorkers:'allow' });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const p = await ctx.newPage();
    await p.goto(base, { waitUntil:'networkidle' });
    await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout:10000 });
    // The first activation reloads once; let it finish before changing state.
    await p.waitForTimeout(1000);
    badMenuSchema = true;
    try {
      await p.reload({ waitUntil:'networkidle' });
      await p.waitForFunction(() => document.querySelectorAll('#menuList .item').length === 56, null, { timeout:10000 });
      ok(await p.locator('#menuList .item').count() === 56, 'schema-invalid menu replaced the cached copy');
      await p.waitForSelector('#appToast', { timeout:5000 });
      ok(/Showing saved menu/.test(await p.locator('#appToast').textContent()), 'cached fallback was not reported');
      const cachedIsArray = await stableEval(p, async () => {
        const state = await caches.open('bb-shell-state');
        const v = await (await state.match('./version')).text();
        const cache = await caches.open('bb-app-' + v.trim());
        return Array.isArray(await (await cache.match('./menu.json')).json());
      });
      ok(cachedIsArray, 'malformed schema overwrote the last known good menu');
    } finally {
      badMenuSchema = false;
      await ctx.close();
    }
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
      const failed = await stableEval(p, async () => {
        const cache = await caches.open('bb-shell-state');
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

  check('failed shell install recovers after reconnection', async () => {
    const ctx = await browser.newContext({ serviceWorkers:'allow' });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    failMenu = true;
    try {
      const p = await ctx.newPage();
      await p.goto(base, { waitUntil:'networkidle' });
      try {
        await p.waitForFunction(() => {
          const el = document.querySelector('#appNotice');
          return el && !el.hidden;
        }, null, { timeout:15000 });
      } catch (e) { throw new Error('failure notice never appeared: ' + e.message); }
      failMenu = false;
      // The UI retry clears the marker and registers with a fresh script URL.
      await p.locator('#appNotice button').click();
      let recovered = false, last = null;
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline && !recovered){
        try {
          last = await p.evaluate(async () => {
            const state = await caches.open('bb-shell-state');
            return {
              version: !!(await state.match('./version')),
              failure: !!(await state.match('./__shell_install_failed')),
              controlled: !!navigator.serviceWorker.controller,
              noticeHidden: document.querySelector('#appNotice')?.hidden !== false,
              menu: document.querySelectorAll('#menuList .item').length,
              script: (await navigator.serviceWorker.getRegistration())?.active?.scriptURL || null
            };
          });
          if (last.version && !last.failure && last.controlled && last.noticeHidden && last.menu === 56) recovered = true;
        } catch (e) { last = { error: e.message }; }
        if (!recovered) await p.waitForTimeout(250);
      }
      ok(recovered, 'shell did not recover after reconnection: ' + JSON.stringify(last));
      // The final controllerchange reload can land after `recovered` was set.
      // Wait for a settled DOM before reading the two final assertions.
      let final = null;
      const settleDeadline = Date.now() + 10000;
      while (Date.now() < settleDeadline){
        try {
          final = await p.evaluate(() => ({
            hidden: document.querySelector('#appNotice')?.hidden !== false,
            menu: document.querySelectorAll('#menuList .item').length
          }));
          if (final.hidden && final.menu === 56) break;
        } catch (e) { /* reload in progress */ }
        await p.waitForTimeout(250);
      }
      ok(final && final.hidden, 'failure notice survived a successful retry');
      ok(final && final.menu === 56, 'menu missing after recovery: ' + JSON.stringify(final));
    } finally {
      failMenu = false;
      await ctx.close();
    }
  });

  check('broken external images use a local placeholder without layout shift', async () => {
    const ctx = await browser.newContext({ serviceWorkers:'block' });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    const p = await ctx.newPage();
    await p.goto(base + '#menu', { waitUntil:'networkidle' });
    const img = p.locator('#menuList .item img').first();
    await p.waitForFunction(() => {
      const i = document.querySelector('#menuList .item img');
      return i && i.dataset.bbFallback === '1';
    }, null, { timeout:10000 });
    const tile = p.locator('#menuList .item .pic').first();
    const box = await tile.boundingBox();
    ok(box && box.width > 0 && box.height > 0, 'image tile collapsed');
    const src = await img.getAttribute('src');
    ok(src && src.startsWith('data:image/svg+xml'), 'local placeholder was not applied');
    ok((await img.getAttribute('alt') || '').length > 0, 'placeholder removed alt text');
    await ctx.close();
  });

  check('favorites storage failures are reported once and kept in memory', async () => {
    const ctx = await browser.newContext({ serviceWorkers:'block' });
    await ctx.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
    await ctx.addInitScript(() => {
      Object.defineProperty(window.localStorage, 'setItem', {
        configurable: true,
        value(){ throw new DOMException('Quota exceeded', 'QuotaExceededError'); }
      });
    });
    const p = await ctx.newPage();
    await p.goto(base + '#menu', { waitUntil:'networkidle' });
    await p.waitForSelector('#menuList .fav');
    await p.locator('#menuList .fav').nth(0).click();
    await p.waitForSelector('#appToast', { timeout:5000 });
    ok(/Saved for this visit only/.test(await p.locator('#appToast').textContent()), 'storage failure was not explained');
    ok((await p.locator('#favBadge').textContent()).trim() === '1', 'in-memory favorite was lost');
    await p.locator('#menuList .fav').nth(1).click();
    ok(await p.locator('#appToast').count() === 1, 'storage notice was repeated');
    ok((await p.locator('#favBadge').textContent()).trim() === '2', 'second in-memory favorite was lost');
    await ctx.close();
  });

  check('content-addressed updates replace old caches and keep both tabs in control', async () => {
    // Dedicated origin serving the original worker until the test explicitly
    // allows a new one. The hash file changes with it so registration URLs and
    // the install-time hash check both agree on the new release.
    const swSource = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const newSwSource = swSource + '\n/* updated release */\n';
    const oldHash = computeShellHash();
    const newHash = computeShellHash({ 'sw.js': Buffer.from(newSwSource) });
    const oldVersion = versionFromHash(oldHash), newVersion = versionFromHash(newHash);
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
      if (clean === '/APP_SHELL_HASH.txt'){
        res.writeHead(200, { 'Content-Type':'text/plain', 'Cache-Control':'no-store' });
        res.end(allowUpdate ? newHash : oldHash);
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
    const p1 = await ctx.newPage(), p2 = await ctx.newPage();
    for (const p of [p1, p2]){
      await p.goto(updateBase, { waitUntil:'networkidle' });
      await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout:10000 });
    }

    // Plant one obsolete release cache and one unrelated origin cache.
    await stableEval(p1, async () => {
      const stale = await caches.open('bb-app-old');
      await stale.put('./stale', new Response('stale'));
      const unrelated = await caches.open('unrelated-cache');
      await unrelated.put('./keep', new Response('keep'));
    });
    const before = await shellVersions(p1);
    ok(before.version === oldVersion, 'initial release version was not content-addressed');
    ok(before.keys.includes('bb-app-' + oldVersion), 'initial release cache missing');

    allowUpdate = true;
    // Activation reloads both tabs; fire-and-forget so no execution context is
    // held across controllerchange.
    await Promise.all([p1, p2].map(p => stableEval(p, () => {
      navigator.serviceWorker.getRegistration().then(reg => reg.update()).catch(() => {});
      return true;
    })));

    const healthy = s => s.version === newVersion &&
      s.keys.includes('bb-app-' + newVersion) &&
      !s.keys.includes('bb-app-' + oldVersion) &&
      !s.keys.includes('bb-app-old') &&
      s.keys.includes('unrelated-cache') &&
      s.controlled;
    let s1, s2;
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !(s1 && s2)){
      try {
        const [a, b] = await Promise.all([shellVersions(p1), shellVersions(p2)]);
        const [ca, cb] = await Promise.all([
          stableEval(p1, () => !!navigator.serviceWorker.controller),
          stableEval(p2, () => !!navigator.serviceWorker.controller)
        ]);
        if (healthy({ ...a, controlled:ca }) && healthy({ ...b, controlled:cb })){ s1 = a; s2 = b; }
      } catch (e) { /* deliberate reload destroyed the context */ }
      if (!(s1 && s2)) await p1.waitForTimeout(250);
    }
    ok(!!(s1 && s2), 'tabs did not settle on the updated release: ' +
      JSON.stringify({ oldVersion, newVersion, newSwFetches, s1, s2 }));
    ok(newSwFetches >= 1, 'updated service worker was never fetched');
    const kept = await stableEval(p1, async () =>
      !!(await (await caches.open('unrelated-cache')).match('./keep')));
    ok(kept, 'unrelated cache was deleted by release cleanup');
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
