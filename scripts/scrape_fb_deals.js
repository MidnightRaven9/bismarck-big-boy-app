/* Facebook Deals Scraper — extracts Facebook-page deals/specials/promotions
 * from Bismarck Big Boy's public timeline and writes them to facebook_deals.json
 * in the repo. Used by the auto-packager cron (every 6 hours).
 *
 * Run: node scripts/scrape_fb_deals.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

/* Reuse the app's deal policy instead of maintaining a second, weaker regex. */
require('../core.js');
const { assertDealsPayload } = globalThis.BigBoyCore;

const TARGET = 'https://www.facebook.com/bismarckbigboy/';
/* DEALS_OUTPUT/DEALS_PREVIOUS let the release workflow write to a temporary
   file and only replace the committed data after output validation succeeds. */
const OUT = process.env.DEALS_OUTPUT ? path.resolve(process.env.DEALS_OUTPUT)
                                     : path.join(__dirname, '..', 'facebook_deals.json');
const PREVIOUS = process.env.DEALS_PREVIOUS ? path.resolve(process.env.DEALS_PREVIOUS) : OUT;
const STALE_AFTER_DAYS = 14; // retire posts Facebook has stopped showing

// Deal-keyword filter (case-insensitive)
const DEAL_WORDS = /deal|specials?|cater|gift card|gift cards|bonus|limited time|happy hour|voucher|coupon|discount|% off|hot n tot|spice|easter|thanksgiv|veterans|honoring|honor|anniversary|freebies|new item|today only|giveaway|tickets|prize|promo|offer|value meal/i;

// Facebook chrome we don't want to treat as deals
const CHROME = /^(profile for|home|posts|notifications?|about|photos|videos|mentions|write a post|write a comment|like .+ and|see all|login|more|\d+ (.+ )?likes?|comments?|posted via|rebounduri|mv2|facebook)/i;

// Known permalink ids for the page's recurring promotional posts. Facebook only
// embeds post ids intermittently in the anonymous DOM, so this keeps "Open on
// Facebook" working even when a scrape can't discover them dynamically. New
// posts still get ids from the page data (see findPostId below).
const KNOWN_POST_IDS = [
  { match: /big news|big boy catering/i,                         id: '1592191682935787' },
  { match: /gift card bonus|it.s back.*gift card/i,              id: '1591260033028952' },
  { match: /family tradition since 1954/i,                       id: '1590095783145377' },
  { match: /big flavor.*big savings|7\.99 big boy meal/i,        id: '1589030993251856' },
  { match: /let.s talk sides/i,                                  id: '1587906313364324' },
  { match: /crispy.*cheesy.*oh.so.tasty/i,                       id: '1586592133495742' },
  { match: /bring the big boy flavor home/i,                     id: '1585444516943837' },
  { match: /spice up your sip|hot.n.tot/i,                       id: '1584187913736164' },
  { match: /honoring our heroes|veterans day/i,                  id: '1583115303843425' },
];

// ---------------------------------------------------------------------------
// Deal-expiry parsing — read time-bound language off Facebook post text.
// Returns an ISO Date string for when the deal expires, or null (no expiry).
// ---------------------------------------------------------------------------
function parseExpiry(text, from){
  const now = new Date(from);
  const nextWeekday = (d, dayName) => {
    const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const target = days.indexOf(dayName.toLowerCase());
    if (target < 0) return null;
    const d2 = new Date(d);
    let delta = target - d2.getDay();
    if (delta <= 0) delta += 7;                             // next occurrence (strictly future)
    return new Date(d2.getFullYear(), d2.getMonth(), d2.getDate() + delta);
  };
  const t = text.toLowerCase();

  // 1) Explicit absolute dates: "expires Jan 15 2026" / "good until Sep 1"
  const abs = t.match(/(?:expires?|good until|until|ends? on?|by)\s+(\w+ \d{1,2}(?:st|nd|rd|th)?(?:,\s*)?20\d\d)/i);
  if (abs) return new Date(abs[1]);

  // 2) "this <day>" or "on <day>"
  const thisDay = t.match(/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
              || t.match(/\bon\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (thisDay){
    const d2 = new Date(now); d2.setDate(d2.getDate() + 1);
    return nextWeekday(d2, thisDay[1]);
  }

  // 3) "this weekend"
  const thisWeekend = t.match(/\bthis\s+weekend\b/);
  if (thisWeekend){
    const d2 = new Date(now);
    let delta = 6 - d2.getDay() + 2;                        // next Sunday-ish +1d buffer
    return new Date(d2.getFullYear(), d2.getMonth(), d2.getDate() + delta);
  }

  // 4) "this week"
  const thisWeek = t.match(/\bthis\s+week\b/);
  if (thisWeek){
    const d2 = new Date(now);
    const delta = 6 - d2.getDay() || 7;                     // end of this week (Sunday)
    return new Date(d2.getFullYear(), d2.getMonth(), d2.getDate() + delta);
  }

  // 5) "this month"
  const thisMonth = t.match(/\bthis\s+month\b/);
  if (thisMonth){
    const d2 = new Date(now);
    const lastDay = new Date(d2.getFullYear(), d2.getMonth() + 1, 0);
    return lastDay;
  }

  // 6) "today only" / "today"
  if (/\btoday( only)?\b/.test(t)){
    const d2 = new Date(now);
    d2.setHours(23, 59, 59, 999);
    return d2;
  }

  // 7) "tomorrow"
  if (/\btomorrow\b/.test(t)){
    const d2 = new Date(now);
    d2.setDate(d2.getDate() + 1);
    d2.setHours(23, 59, 59, 999);
    return d2;
  }

  // 8) "ends <day>"
  const endsOn = t.match(/\bends?\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (endsOn){
    return nextWeekday(now, endsOn[1]);
  }

  // 9) "LIMITED TIME" / "LTO" → conservative 3-day window
  if (/\blto\b|\blimited\s+time\b|\blimited\s+offer\b/.test(t)){
    const d2 = new Date(now);
    d2.setDate(d2.getDate() + 3);
    return d2;
  }

  // 10) "WHILE SUPPLIES LAST" → 2-day window
  if (/\bwhile\s+supplies\s+last\b/i.test(t)){
    const d2 = new Date(now);
    d2.setDate(d2.getDate() + 2);
    return d2;
  }

  return null;   // no expiry info — assume ongoing
}

// Drop junk that's not really a deal/promo (Facebook page metadata).
function looksLikeNoise(text){
  return /Address|Contact info|Details|See more|Bismarck, ND|58501-5042|\(701\)|bismarckbigboy\.com|foodtruck@|Posts|Photos|Videos|Reels|Log in|On Facebook|shares|likes? and|\d+ share|\d+ like|\d+ views|\d+ comments?|AI content/i.test(text)
       || /user-content|full-screen|see-all/i.test(text)
       // Facebook UI glyphs live in the Unicode private-use area; real post
       // copy never contains them, so any text with them is page chrome.
       || /[\u{F0000}-\u{FFFFD}\u{E000}-\u{F8FF}]/u.test(text);
}

function extractText(html) {
  // crude: strip scripts/styles, then take visible text between > and <
  let t = html.replace(/<script[^>]*>.*?<\/script>/gs, ' ');
  t = t.replace(/<style[^>]*>.*?<\/style>/gs, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/g, ' ');
  t = t.replace(/[ \t]+/g, ' ');
  return t;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 420, height: 880 },
      userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(25000);

    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

    // Wait for timeline posts to appear (they're client-side)
    let raw = '';
    for (let i = 0; i < 10; i++){
      raw = await page.content();
      // Also check the DOM for post text
      const visible = await page.evaluate(() => {
        const els = document.querySelectorAll('[data-testid="subtree"], div[dir="auto"], [role="article"]');
        const texts = [];
        els.forEach(el => texts.push((el.innerText || '').trim()));
        return texts.join('\n').slice(0, 8000);
      }).catch(() => raw);
      const trimmed = (visible || '').trim();
      if (trimmed.length > 500) break;
      await page.waitForTimeout(1500);
    }
    await page.waitForTimeout(2000); // settle

    // Gather post texts (original full-text walk) + a map of text-prefix → post id.
    // Facebook only serves a truncated preview anonymously, so the "full" text is
    // the longest preview available; the post URL lets readers see the rest.
    const scraped = await page.evaluate(() => {
      const seen = new Set(); const texts = [];
      const walk = n => {
        if (n.nodeType === 3){
          const t = n.textContent.trim().replace(/\s+/g, ' ');
          if (t && !seen.has(t)) { seen.add(t); texts.push(t); }
        } else if (n.nodeType === 1 && !n.closest('script, style, noscript')){
          n.childNodes.forEach(walk);
          if (n.shadowRoot) n.shadowRoot.childNodes.forEach(walk);
        }
      };
      document.body.childNodes.forEach(walk);

      // Map a normalised text prefix to the nearest post id found in ancestors.
      const idMap = {};
      document.querySelectorAll('[data-mcomponent="TextArea"]').forEach(ta => {
        const nt = ta.querySelector('.native-text');
        if (!nt) return;
        const text = (nt.innerText || nt.textContent || '').replace(/\s+/g, ' ').trim();
        const prefix = text.replace(/[^a-z0-9]+/gi, ' ').trim().slice(0, 30).toLowerCase();
        if (!prefix) return;
        let id = null, el = ta;
        for (let i = 0; i < 14 && el; i++) {
          const attrs = [...el.attributes].map(a => a.value || '').join(' ');
          const m = attrs.match(/\b(1[0-9]{15,17})\b/);
          if (m) { id = m[1]; break; }
          el = el.parentElement;
        }
        if (id) idMap[prefix] = id;
      });
      return { texts, idMap };
    }).catch(() => ({ texts: [], idMap: {} }));
    const allTexts = scraped.texts;
    const idMap = scraped.idMap || {};

    const more = extractText(raw).split('\n').map(s => s.trim()).filter(s => s.length > 25);

    // Combine and dedupe, keeping the LONGEST variant of each post. Facebook
    // renders both a short aria-hidden preview and a longer copy of the same
    // post; keeping the longest recovers as much text as is available.
    const byKey = new Map();
    for (const t of [...allTexts, ...more]){
      if (t.length <= 25) continue;
      const key = t.slice(0, 60).toLowerCase();
      const prev = byKey.get(key);
      if (!prev || t.length > prev.length) byKey.set(key, t);
    }
    const candidates = [...byKey.values()];

    const scrapeTime = Date.now();

    // Filter: real deals, not noise, not already expired
    const deals = candidates.filter(t =>
      DEAL_WORDS.test(t) && !CHROME.test(t) && !looksLikeNoise(t)
    );

    // Look up a post id: first from ids discovered in this scrape, then from
    // the curated map of recurring promotional posts.
    const findPostId = text => {
      const prefix = text.replace(/[^a-z0-9]+/gi, ' ').trim().slice(0, 30).toLowerCase();
      if (idMap[prefix]) return idMap[prefix];
      for (let n = 24; n >= 12; n -= 4) {
        const p = prefix.slice(0, n);
        for (const k of Object.keys(idMap)) if (k.startsWith(p)) return idMap[k];
      }
      const known = KNOWN_POST_IDS.find(k => k.match.test(text));
      return known ? known.id : null;
    };

    // Structure: title = first sentence before period/emoji; add expiry + post URL.
    const structured = [];
    const seenTitles = new Set();
    for (const t of deals){
      const title = (t.split(/[.?!]+/)[0] || t).slice(0, 100).trim();
      if (!title.trim()) continue;
      const tKey = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40);
      if (seenTitles.has(tKey)) continue;
      const expires = parseExpiry(t, scrapeTime);
      if (expires && expires.getTime() < Date.now() - 86400000) continue;  // already expired by >1 day
      seenTitles.add(tKey);
      const id = findPostId(t);
      structured.push({
        title,
        text: t.trim(),
        expires: expires ? expires.toISOString() : null,
        url: id ? `https://www.facebook.com/bismarckbigboy/posts/${id}/` : null,
        lastSeen: new Date().toISOString(),
      });
    }

    // An empty candidate set means Facebook's DOM changed or blocked us. Fail
    // loudly so automation never commits an empty or junk file over good data.
    if (deals.length === 0) throw new Error('Scraper found no deal candidates');

    // Facebook's anonymous DOM is flaky: a scrape may expose only some posts,
    // or a shorter preview than a previous run. Merge with the last good output
    // so a partial scrape never drops deals or truncates text.
    if (fs.existsSync(PREVIOUS)) {
      try {
        const previous = JSON.parse(fs.readFileSync(PREVIOUS, 'utf8'));
        if (Array.isArray(previous)) {
          for (const d of structured) {
            const old = previous.find(p => (p.url && p.url === d.url) || p.title === d.title);
            if (!old) continue;
            if (typeof old.text === 'string' && old.text.length > d.text.length) d.text = old.text;
            if (!d.url && old.url) d.url = old.url;
            if (!d.expires && old.expires) d.expires = old.expires;
            d.lastSeen = old.lastSeen || scrapeTime;
          }
          const known = new Set(structured.map(d => (d.url || d.title).toLowerCase()));
          for (const old of previous) {
            if (known.has((old.url || old.title).toLowerCase())) continue;
            structured.push({ ...old, lastSeen: old.lastSeen || scrapeTime });
          }
        }
      } catch (_) {}
    }

    // Drop expired posts and posts Facebook has not surfaced for two weeks.
    const now = Date.now();
    const live = structured.filter(d => {
      if (d.expires && new Date(d.expires).getTime() <= now) return false;
      const seen = Date.parse(d.lastSeen);
      if (Number.isFinite(seen) && now - seen > STALE_AFTER_DAYS * 86400000) return false;
      return true;
    });
    // Validate our own output before it can be published, using the same
    // policy the app and the workflow gate use. An empty result is allowed
    // only when real deals were found and then expired/aged out.
    assertDealsPayload(live);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(live, null, 2));
    console.log('Wrote', live.length, 'deals to', OUT);
  } catch (e) {
    process.exitCode = 1;
    console.error('ERROR', e.message);
    // Never write a partial file: a transient Facebook failure must not wipe
    // every deal. The app already hides expired ones on render.
  } finally {
    await browser.close();
  }
})();
