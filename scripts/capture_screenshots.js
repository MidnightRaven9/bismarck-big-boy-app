#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

const base = process.env.APP_URL || 'https://midnightraven9.github.io/bismarck-big-boy-app/';
const output = path.join(__dirname, '..', 'assets', 'screenshots');

async function capture(context, screen, filename, prepare) {
  const page = await context.newPage();
  try {
    await page.goto(new URL('#' + screen, base).href, { waitUntil: 'domcontentloaded' });
    await page.locator('#statusMain').filter({ hasNotText: 'Checking…' }).waitFor();
    await page.locator('#s-' + screen + '.active').waitFor();
    const target = prepare ? await prepare(page) : null;
    await page.evaluate(() => document.fonts.ready);
    if (target) await target.screenshot({ path: path.join(output, filename) });
    else await page.screenshot({ path: path.join(output, filename) });
    console.log('Saved', filename);
  } finally {
    await page.close();
  }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block'
    });
    await capture(context, 'home', '1-home.png', async page => {
      await page.locator('.hero-bg').evaluate(img => img.decode());
    });
    await capture(context, 'menu', '2-menu.png', async page => {
      await page.locator('#menuList .item img').first().evaluate(img => img.decode());
    });
    await capture(context, 'menu', '3-favorites.png', async page => {
      await page.locator('#menuList [data-fav]').first().click();
      await page.locator('.tab[data-tab="favs"]').click();
      await page.locator('#favList .item img').first().evaluate(img => img.decode());
    });
    await capture(context, 'rewards', '4-rewards.png', async page => {
      await page.locator('.reward-photo img').evaluate(img => img.decode());
    });
    await capture(context, 'info', '5-info.png', async page => {
      await page.locator('.story-photo').evaluate(async img => {
        img.loading = 'eager';
        await img.decode();
      });
    });
    await capture(context, 'home', '6-delivery.png', async page => {
      await page.locator('#delivery').evaluate(el => el.scrollIntoView({ block: 'center' }));
    });
    await capture(context, 'info', '7-history.png', async page => {
      await page.locator('.story-photo').evaluate(async img => {
        img.loading = 'eager';
        await img.decode();
      });
      await page.locator('header, .tabbar').evaluateAll(els => {
        els.forEach(el => { el.style.visibility = 'hidden'; });
      });
      return page.locator('.heritage');
    });
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error('Screenshot capture failed:', error.message);
  process.exitCode = 1;
});
