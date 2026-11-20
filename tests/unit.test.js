/* Lightweight, dependency-free regression tests for the pure app logic.
   Run: node --test tests/unit.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

require('../core.js');
const C = globalThis.BigBoyCore;

test('businessNow uses America/Chicago across DST', () => {
  // January = CST (UTC-6)
  const winter = C.businessNow(new Date('2026-01-15T17:00:00Z'));
  assert.equal(winter.date, '2026-01-15');
  assert.equal(winter.weekday, 4); // Thursday
  assert.equal(winter.minutes, 11 * 60);

  // July = CDT (UTC-5)
  const summer = C.businessNow(new Date('2026-07-15T17:00:00Z'));
  assert.equal(summer.date, '2026-07-15');
  assert.equal(summer.minutes, 12 * 60);

  // DST transition day, just after local midnight
  const spring = C.businessNow(new Date('2026-03-08T06:30:00Z'));
  assert.equal(spring.date, '2026-03-08');
  assert.equal(spring.minutes, 30);
});

test('published hours match the official source and no exceptions are invented', () => {
  assert.equal(C.RESTAURANT.timeZone, 'America/Chicago');
  for (const h of C.RESTAURANT.hours){
    assert.equal(h.open, 10 * 60 + 30, 'official opening time is 10:30 AM daily');
    assert.equal(h.close, 21 * 60, 'official closing time is 9:00 PM daily');
    assert.equal(h.closed, false);
  }
  const overrides = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hours_overrides.json'), 'utf8'));
  assert.deepEqual(overrides.overrides, [], 'only restaurant-supplied exceptions may be added');
});

test('open/closed boundary conditions are exact', () => {
  const open = now => {
    const h = C.effectiveHours(now);
    return !h.closed && now.minutes >= h.open && now.minutes < h.close;
  };
  assert.equal(open(C.businessNow(new Date('2026-01-15T16:29:00Z'))), false); // 10:29 CT
  assert.equal(open(C.businessNow(new Date('2026-01-15T16:30:00Z'))), true);  // 10:30 CT
  assert.equal(open(C.businessNow(new Date('2026-01-16T02:59:00Z'))), true);  // 20:59 CT
  assert.equal(open(C.businessNow(new Date('2026-01-16T03:00:00Z'))), false); // 21:00 CT
});

test('exceptional hours and closures are validated and applied', () => {
  const map = C.normalizeOverrides({ overrides: [
    { date: '2026-11-26', closed: true },
    { date: '2026-11-27', open: '11:00', close: '15:30' },
    { date: 'bad-date', closed: true },
    { date: '2026-11-28', open: '25:00', close: '30:00' },
    { date: '2026-11-29', open: '18:00', close: '09:00' }
  ]});
  assert.equal(map.size, 2);
  const closed = C.effectiveHours({ date: '2026-11-26', weekday: 4 }, map);
  assert.equal(closed.closed, true);
  const short = C.effectiveHours({ date: '2026-11-27', weekday: 5 }, map);
  assert.equal(short.open, 660);
  assert.equal(short.close, 930);

  const next = C.nextOpening({ date: '2026-11-26', weekday: 4, minutes: 600 }, map);
  assert.equal(next.date, '2026-11-27');
  assert.equal(next.open, 660);
});

test('time formatting and safe date arithmetic', () => {
  assert.equal(C.formatTime(630), '10:30 AM');
  assert.equal(C.formatTime(1260), '9:00 PM');
  assert.equal(C.formatTime(0), '12:00 AM');
  assert.equal(C.addDaysUTC('2026-12-31', 1), '2027-01-01');
  assert.equal(C.parseHHMM('9:05'), 545);
  assert.equal(C.parseHHMM('24:00'), null);
});

test('menu schema rejects duplicates and unusable records', () => {
  const good = [
    { id:'a', name:'A', items:[{ id:'x', n:'X', img:'i.jpg', d:'desc', s:[['Small', 3.5]] }] }
  ];
  assert.equal(C.validateMenu(good).length, 1);
  const dup = JSON.parse(JSON.stringify(good));
  dup[0].items.push({ ...dup[0].items[0], id:'x' });
  assert.equal(C.validateMenu(dup)[0].items.length, 1);
  assert.throws(() => C.validateMenu([]), /empty/);
  assert.throws(() => C.validateMenu([{ id:'z', name:'Z', items:[{ id:'q', n:'Q', s:[['bad','x']] }] }]), /No valid/);
});

test('real menu file is valid and has unique IDs', () => {
  const menu = C.validateMenu(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'menu.json'), 'utf8')));
  const ids = menu.flatMap(g => g.items.map(i => i.id));
  assert.equal(ids.length, 56);
  assert.equal(new Set(ids).size, ids.length);
});

test('deals validation filters expired, duplicate and unsafe records', () => {
  const now = Date.now();
  const deals = C.normalizeDeals([
    { title:'Live', text:'A'.repeat(900), url:'https://www.facebook.com/bismarckbigboy/posts/1/', expires:null },
    { title:'Gone', text:'old', url:'https://www.facebook.com/bismarckbigboy/posts/2/', expires:new Date(now - 1000).toISOString() },
    { title:'Bad scheme', text:'nope', url:'javascript:alert(1)', expires:null },
    { title:'Live', text:'dup', url:'https://www.facebook.com/bismarckbigboy/posts/1/', expires:null },
    null
  ]);
  assert.equal(deals.length, 1);
  assert.equal(deals[0].text.length, 700);
  assert.equal(deals[0].url, 'https://www.facebook.com/bismarckbigboy/posts/1/');
});

test('real deals file parses cleanly', () => {
  const deals = C.normalizeDeals(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'facebook_deals.json'), 'utf8')));
  assert.ok(deals.length > 0);
  for (const d of deals) assert.ok(/^https:\/\/(www\.)?facebook\.com\//.test(d.url));
});

test('URL policy allowlists framing and hands off sensitive flows', () => {
  assert.equal(C.canEmbed('https://www.openstreetmap.org/export/embed.html'), true);
  assert.equal(C.canEmbed('https://fooddudesdelivery.com/bismarck/big-boy'), true);
  assert.equal(C.canEmbed('https://www.toasttab.com/loyalty/welcome/X'), false);
  assert.equal(C.canEmbed('javascript:alert(1)'), false);
  assert.equal(C.shouldHandoff('https://order.toasttab.com/online/x'), true);
  assert.equal(C.shouldHandoff('https://www.facebook.com/bismarckbigboy/'), true);
  assert.equal(C.shouldHandoff('https://www.openstreetmap.org/export/embed.html'), false);
  assert.deepEqual(C.hostnameOf('not a url'), { host:'', protocol:'' });
});

test('manifest and shell wiring are internally consistent', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
  for (const s of manifest.shortcuts){
    assert.ok(s.url.startsWith('./#'), 'shortcut must resolve to an in-app hash route');
    assert.ok(fs.existsSync(path.join(root, s.icons[0].src)));
  }
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'inline JS must not be permitted');
  assert.ok(!/img-src \*/.test(csp), 'images must not be allowed from any host');
  assert.ok(html.includes('<script src="core.js" defer>') && html.includes('<script src="app.js" defer>'));
  assert.ok(/id="iabFrame"[^>]*sandbox=/.test(html), 'third-party iframe must be sandboxed');
  assert.ok(!/window\.open\(/.test(fs.readFileSync(path.join(root, 'app.js'), 'utf8')));
  assert.ok(html.includes('https://www.toasttab.com/loyalty/welcome/RQQO1ZM52u5HXnVX'),
    'the approved rewards URL must not change');
  assert.ok(!/big.?boy.?bucks/i.test(html), 'the retired game must not return');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(sw.includes('res.ok') && sw.includes('SHELL_INSTALL_FAILED'));
  assert.ok(!/cache\.addAll/.test(sw));
  assert.ok(csp.includes('https://openstreetmap.org'), 'CSP must match canEmbed allowlist');
  assert.ok(csp.includes('https://www.fooddudesdelivery.com'), 'CSP must match canEmbed allowlist');
});

test('APP_SHELL_HASH is reproducible from the committed shell inputs', () => {
  const root = path.join(__dirname, '..');
  const files = [
    'index.html', 'core.js', 'app.js', 'menu.json', 'hours_overrides.json',
    'manifest.webmanifest', 'sw.js', 'icons/apple-touch-icon-180.png',
    'icons/favicon-48.png', 'icons/icon-192.png', 'icons/icon-512.png',
    'icons/icon-maskable-512.png'
  ];
  const computed = files
    .map(f => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex'))
    .join('');
  const committed = fs.readFileSync(path.join(root, 'APP_SHELL_HASH.txt'), 'utf8').trim();
  assert.match(committed, /^[a-f0-9]{768}$/);
  assert.equal(committed, computed, 'shell hash is stale; rerun the workflow hash command');

  const workflow = fs.readFileSync(path.join(root, '.github/workflows/auto-package.yml'), 'utf8');
  assert.match(workflow, /LC_ALL=C sha256sum index\.html core\.js app\.js menu\.json hours_overrides\.json manifest\.webmanifest sw\.js icons\/\*\.png/);
});

test('menu validation rejects unsafe ids, media ids and non-numeric prices', () => {
  const out = C.validateMenu([{
    id:'safe-group', name:'<b>Deals</b>', items:[
      { id:'ok-item', n:'Burger & Shake', img:'063b6c_abc~mv2.jpg', d:'A < B & "C"', s:[['Small', 3.5]] },
      { id:'bad', n:'X', img:'javascript:alert(1)', d:'x', s:[['Large', null]] },
      { id:'also-bad', n:'Y', img:'x" onerror="alert(1)', d:'y', s:[['Large', true]] },
      { id:'" onmouseover="alert(1)', n:'Z', img:'ok.jpg', d:'z', s:[['Small', 1]] }
    ]
  }]);
  assert.equal(out[0].items.length, 1);
  assert.equal(out[0].items[0].n, 'Burger & Shake');
  assert.equal(out[0].items[0].img, '063b6c_abc~mv2.jpg');
  assert.equal(C.isValidWixImageId('063b6c_abc~mv2.jpg'), true);
  assert.equal(C.isValidWixImageId('javascript:alert(1)'), false);
  assert.equal(C.isValidWixImageId('../escape.jpg'), false);
  assert.equal(C.isValidMenuId('ok-item'), true);
  assert.equal(C.isValidMenuId('a"b'), false);
});

test('generated deal payloads use the strict shared schema gate', () => {
  assert.doesNotThrow(() => C.assertDealsPayload([
    { title:'Save & smile', text:'<b>Today</b>', url:'https://www.facebook.com/bismarckbigboy/posts/1/' }
  ]));
  assert.throws(() => C.assertDealsPayload({ broken:true }), /not an array/);
  assert.throws(() => C.assertDealsPayload([
    { title:'Bad', text:'x', url:'javascript:alert(1)' }
  ]), /host is not allowlisted/);
  assert.throws(() => C.assertDealsPayload([
    { title:'Bad', text:'x', expires:'not-a-date' }
  ]), /expiry is invalid/);
});

test('workflow safeguards prevent overlapping or unsafe writes', () => {
  const root = path.join(__dirname, '..');
  const auto = fs.readFileSync(path.join(root, '.github/workflows/auto-package.yml'), 'utf8');
  const validate = fs.readFileSync(path.join(root, '.github/workflows/validate.yml'), 'utf8');
  assert.match(auto, /concurrency:\s*\n\s*group: auto-package-main\s*\n\s*cancel-in-progress: false/);
  assert.match(validate, /concurrency:\s*\n\s*group: validate-/);
  assert.ok(auto.includes('persist-credentials: false'));
  assert.ok(validate.includes('persist-credentials: false'));
  assert.ok(auto.includes('ref: main'));
  assert.ok(auto.includes("github.ref == 'refs/heads/main'"));
  assert.ok(auto.includes('C.assertDealsPayload(d)'));
  assert.ok(auto.includes('[[ "$HASH" =~ ^[a-f0-9]{768}$ ]]'));
  assert.ok(!/continue-on-error|push --force|git push -f|git add -A/.test(auto));
  assert.equal((auto.match(/uses: actions\/(checkout|setup-node)@[a-f0-9]{40}/g) || []).length, 5);
});

test('service worker versions atomically and validates cached JSON schemas', () => {
  const root = path.join(__dirname, '..');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(sw.includes("importScripts('core.js')"));
  assert.ok(sw.includes("const CACHE_PREFIX = 'bb-app-'"));
  assert.ok(!/const CACHE = ['"]bb-app-v/.test(sw), 'manual cache version must be removed');
  assert.ok(sw.includes('APP_SHELL_HASH.txt'));
  assert.ok(sw.includes("crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashText))"),
    'cache version must derive from the full shell hash');
  assert.ok(app.includes("crypto.subtle.digest('SHA-256', new TextEncoder().encode(hash))"),
    'registration URL must derive from the full shell hash');
  assert.ok(sw.includes('assertDealsPayload'));
  assert.ok(sw.includes('SHELL_INSTALL_OK'));
  assert.ok(sw.includes('X-BigBoy-Content-Fallback'));
  assert.ok(sw.includes("k.startsWith(CACHE_PREFIX)"), 'cleanup must be prefix-scoped');
  assert.ok(!/cache\.put\(key/.test(sw), 'fetch handler must not mutate a versioned cache');
});

test('app rendering escapes menu data and reports storage failures', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(app.includes('escapeHtml(it.n)'));
  assert.ok(app.includes('escapeHtml(g.name)'));
  assert.ok(app.includes('escapeHtml(s[0])'));
  assert.ok(app.includes('escapeHtml(c.id)'));
  assert.ok(app.includes('data:image/svg+xml'));
  assert.ok(app.includes('favorites-write'));
  assert.ok(app.includes('SHELL_INSTALL_OK'), 'recovery must clear the failure notice');
  assert.ok(app.includes('bb_sw_retry_v1'), 'retry must force a fresh worker URL');
  assert.ok(!/\[data-fav="\$\{id\}"\]/.test(app), 'ids must not be interpolated into selectors');
});
