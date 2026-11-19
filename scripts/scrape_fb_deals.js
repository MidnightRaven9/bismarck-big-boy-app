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

// Chrome words we don't want as "deals"
const CHROME_NOISE = /(?:like|shares?|comments?|posts? like|\(function|WebLite|Comet|Facebook Watch|Profile for|Home |Posts |Notification|About|Friends|Photos|Videos|Friends|React|wp-|insights|business|about|new posts|refresh|replay|Not now|No thanks|Skip|Get mobile app|Powered by)/i;

const DEAL_WORDS = /(?:deal|dealing|specials?|specials|catering|cater|bonus|gift card|gift cards|limited time|happy hour|voucher|coupon|discount|% off|value meal|sides|cheese|low price|hot n tot|spice|easter|thanksgiv|veterans|honoring|honor|birthday|anniversary|freebies|new item|menu item|today only|stock up|giveaway|raffle|tickets|prize|promo|offer|bonus codes)/i;

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 410, height: 830 },
      userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
      ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(15000);

    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    for (let i = 0; i < 6; i++){
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(1000);
    }

    const deals = await page.evaluate(() => {
      const seen = new Set();
      const out = [];
      const pick = (el) => {
        const t = (el.innerText || '').trim().slice(0, 300);
        if (t && !seen.has(t)) { seen.add(t); out.push(t); }
      };
      // Facebook posts
      document.querySelectorAll('div[data-testid="subtree"], div[data-testid="story/glimpse"], [role="article"]').forEach(pick);
      document.querySelectorAll('div[dir="auto"], div[class*="x"], [class*="mtf"]').forEach(pick);
      // Walk all visible text
      (function walk(node){
        if (node.nodeType === 3){
          pick({ innerText: node.textContent });
        } else if (node.nodeType === 1){
          node.childNodes.forEach(walk);
        }
      })(document.body);
      return out;
    });

    // Filter: deal-ish posts
    const filtered = deals.filter(t =>
      t.length >= 25 &&
      DEAL_WORDS.test(t) &&
      !CHROME_NOISE.test(t)
    ).slice(0, 10);

    // Dedupe by normalized title
    const seenTitles = new Set();
    const structured = [];
    for (const t of filtered){
      const title = (t.split(/[.?!]/)[0] || t).slice(0, 100).trim();
      const key = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40);
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      structured.push({ title, text: t.slice(0, 300).trim() });
    }

    fs.writeFileSync(OUT, JSON.stringify(structured, null, 2));
    console.log('Wrote', structured.length, 'deals to', OUT);
  } catch (e) {
    console.log('ERROR', e.message);
  } finally {
    await browser.close();
  }
})();
