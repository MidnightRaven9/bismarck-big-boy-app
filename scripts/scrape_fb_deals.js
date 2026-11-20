/* Facebook Deals Scraper — extracts Facebook-page deals/specials/promotions
 * from Bismarck Big Boy's public timeline and writes them to facebook_deals.json
 * in the repo. Used by the auto-packager cron (every 6 hours).
 *
 * Run: node scripts/scrape_fb_deals.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://www.facebook.com/bismarckbigboy/';
const OUT = path.join(__dirname, '..', 'facebook_deals.json');

// Deal-keyword filter (case-insensitive)
const DEAL_WORDS = /deal|specials?|cater|gift card|gift cards|bonus|limited time|happy hour|voucher|coupon|discount|% off|hot n tot|spice|easter|thanksgiv|veterans|honoring|honor|anniversary|freebies|new item|today only|giveaway|tickets|prize|promo|offer|value meal/i;

// Facebook chrome we don't want to treat as deals
const CHROME = /^(profile for|home|posts|notifications?|about|photos|videos|mentions|write a post|write a comment|like .+ and|see all|login|more|\d+ (.+ )?likes?|comments?|posted via|rebounduri|mv2|facebook)/i;

// ---------------------------------------------------------------------------
// Deal-expiry parsing — read time-bound language off Facebook post text.
// Returns an ISO Date string for when the deal expires, or null (no expiry).
// ---------------------------------------------------------------------------
function parseExpiry(text, from){
  const now = new Date(from);
  const asDate = (str) => new Date(`${str} 2026`);          // assume 2026
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
  return /Address|Contact info|Details|See more|Bismarck, ND|58501-5042|\(701\)|bismarckbigboy\.com|foodtruck@|Posts|Photos|Videos|Reels|Log in|On Facebook|shares|likes? and|\d+ share|\d+ like|\d+ views|\d+ comments?/i.test(text)
       || /user-content|full-screen|see-all/i.test(text);
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
      ignoreHTTPSErrors: true,
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

    // Gather all candidate post texts from the page (mixed DOM + text scrape)
    const allTexts = await page.evaluate(() => {
      const seen = new Set(); const out = [];
      const walk = n => {
        if (n.nodeType === 3){
          const t = n.textContent.trim().replace(/\s+/g, ' ');
          if (t && !seen.has(t)) { seen.add(t); out.push(t); }
        } else if (n.nodeType === 1 && !n.closest('script, style, noscript')){
          n.childNodes.forEach(walk);
          if (n.shadowRoot) n.shadowRoot.childNodes.forEach(walk);
        }
      };
      document.body.childNodes.forEach(walk);
      return out.filter(t => t.length > 25);
    }).catch(() => []);

    const more = extractText(raw).split('\n').map(s => s.trim()).filter(s => s.length > 25);

    // Combine, dedupe, filter
    const seen = new Set();
    const candidates = [];
    for (const t of [...allTexts, ...more]){
      const key = t.slice(0, 60).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(t);
    }

    const scrapeTime = Date.now();

    // Filter: real deals, not noise, not already expired
    const deals = candidates.filter(t =>
      DEAL_WORDS.test(t) && !CHROME.test(t) && !looksLikeNoise(t)
    );

    // Structure: title = first sentence before period/emoji; add expiry info
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
      structured.push({
        title,
        text: t.slice(0, 350).trim(),
        expires: expires ? expires.toISOString() : null,
      });
    }

    fs.writeFileSync(OUT, JSON.stringify(structured, null, 2));
    console.log('Wrote', structured.length, 'deals to', OUT);
  } catch (e) {
    console.log('ERROR', e.message);
    // Always write a file so the app doesn't show stale data silently
    fs.writeFileSync(OUT, JSON.stringify([], null, 2));
  } finally {
    await browser.close();
  }
})();
