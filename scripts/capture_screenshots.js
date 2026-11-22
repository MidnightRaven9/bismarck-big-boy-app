#!/usr/bin/env node
/**
 * Capture headless-Chrome screenshots of the live app for the README.
 * Usage: node scripts/capture_screenshots.js
 * Writes to assets/screenshots/: 1-home, 2-menu, 3-favorites, 4-rewards, 5-info, 6-delivery
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.APP_URL || 'https://midnightraven9.github.io/bismarck-big-boy-app/';
const OUT = path.join(__dirname, '..', 'assets', 'screenshots');

async function shot(page, name, actions) {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('#statusMain').filter({hasNotText:'Checking…'}).waitFor();
  if (actions) await actions(page);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log('  ✓', name);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

    // 1 — Home
    const p1 = await ctx.newPage();
    await shot(p1, '1-home.png');
    await p1.close();

    // 2 — Menu (scrolled down to show items)
    const p2 = await ctx.newPage();
    await shot(p2, '2-menu.png', async p => {
      await p.click('.tab[data-tab="menu"]');
      await p.waitForTimeout(900);
    });
    await p2.close();

    // 3 — Favorites
    const p3 = await ctx.newPage();
    await shot(p3, '3-favorites.png', async p => {
      await p.click('.tab[data-tab="menu"]');
      await p.waitForTimeout(700);
      const favBtn = p.locator('#menuList [data-fav]').first();
      if (await favBtn.count()) await favBtn.click();  // add a favorite
      await p.click('.tab[data-tab="favs"]');
      await p.waitForTimeout(700);
    });
    await p3.close();

    // 4 — Rewards
    const p4 = await ctx.newPage();
    await shot(p4, '4-rewards.png', async p => {
      await p.click('.tab[data-tab="rewards"]');
      await p.waitForTimeout(800);
    });
    await p4.close();

    // 5 — Info (should show Facebook deals)
    const p5 = await ctx.newPage();
    await shot(p5, '5-info.png', async p => {
      await p.click('.tab[data-tab="info"]');
      await p.waitForTimeout(1000);
    });
    await p5.close();

    // 6 — Delivery (from Home scroll)
    const p6 = await ctx.newPage();
    await shot(p6, '6-delivery.png', async p => {
      await p.waitForTimeout(800);
      await p.evaluate(() => document.getElementById('delivery') &&
        document.getElementById('delivery').scrollIntoView({ behavior: 'instant', block: 'center' }));
    });
    await p6.close();

    console.log('✓ All screenshots saved to', OUT);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
