# Bismarck Big Boy

> A modern-retro mobile app for Bismarck's original 1954 drive-in.

[![License: MIT](https://img.shields.io/badge/License-MIT-4c71af.svg)](https://github.com/MidnightRaven9/bismarck-big-boy-app/blob/main/LICENSE)
[![Stack: HTML5](https://img.shields.io/badge/Stack-HTML5%20%26%20PWA-000000?logo=html5&logoColor=white)](https://html.spec.org/)
[![Live app](https://img.shields.io/badge/Live%20app-GitHub%20Pages-00aaff)](https://midnightraven9.github.io/bismarck-big-boy-app/)

Customer-facing PWA for [Bismarck Big Boy](https://www.bismarckbigboy.com/) at 2511 E Main Ave, Bismarck, ND. Built with plain HTML, CSS, and JavaScript — no framework, no build step, no backend. The app installs to the home screen, works offline, and keeps the original Big Boy logo, mascot, and signature red on a clean black background with 1950s drive-in diner details.

## Features

- **Home** — live open/closed status in Bismarck time (America/Chicago, DST-aware), today's hours, specials, awards, and directions with an embedded OpenStreetMap.
- **Menu** — full menu with photos from bismarckbigboy.com, search, category filters, per-size pricing, and one-tap favorites.
- **Favorites** — saved locally on the device; no account or tracking required.
- **Rewards** — links to Toast loyalty sign-up, eGift cards, and the Big Boy shop.
- **Delivery** — one-tap ordering through Uber Eats, DoorDash, and Food Dudes.
- **Info** — Facebook page, verified history timeline, contact details, phone, address, and current deals.
- **External links** — map and Food Dudes open in-app; ordering, rewards, gift cards, and social pages hand off safely to the browser.
- **Offline** — service worker caches the app shell, menu, and hours. Photos, maps, deals, and ordering require a connection.
- **Accessibility** — 44 px touch targets, high-contrast text, focus outlines, and reduced-motion support.

## Screenshots

Screenshots are captured at 390 × 844 from the live app. Drop replacement images in `assets/screenshots/` with the same filenames, then run `node scripts/capture_screenshots.js` to regenerate them.

| Home | Menu | Favorites |
| :---: | :---: | :---: |
| ![Home screen](assets/screenshots/1-home.png) | ![Menu screen](assets/screenshots/2-menu.png) | ![Favorites screen](assets/screenshots/3-favorites.png) |

| Delivery | Rewards | Info |
| :---: | :---: | :---: |
| ![Delivery](assets/screenshots/6-delivery.png) | ![Rewards screen](assets/screenshots/4-rewards.png) | ![Info screen](assets/screenshots/5-info.png) |

## Install

### Android (PWA)

Open the live URL in Chrome, tap **⋮** → **Install app**. It will be added to your home screen, opens like a native app, and works offline.

### Android (APK — sideload)

Download **BismarckBigBoy-v1.0.0.apk** from the [latest release](https://github.com/MidnightRaven9/bismarck-big-boy-app/releases/latest). On your phone, open the file → allow “Install unknown apps” when prompted → install. It's a Trusted Web Activity, so it loads the live site.

### iPhone

iOS does not allow sideloading. Open the live URL in Safari → **Share** → **Add to Home Screen**.

## Requirements

- Nothing to run. The app is static files (`index.html`, `core.js`, `app.js`, `menu.json`, `sw.js` and icons).

## Developer Setup

```bash
# Clone the repo
git clone https://github.com/MidnightRaven9/bismarck-big-boy-app.git
cd bismarck-big-boy-app

# Serve locally for testing (any static server works)
python3 -m http.server 8000

# or use a static web server of your choice
# npm -g serve
# python3 -m http.server
```

Then open http://localhost:8000/ in Chrome.

### Key files

| File | Purpose |
|------|---------|
| `index.html` | App shell and markup; loads `styles.css`, `core.js`, and `app.js` |
| `styles.css` | Modern-retro styling: black background, red accents, rounded cards, responsive layout |
| `core.js` | Pure, testable logic: Bismarck time, validation, URL policy |
| `app.js` | Rendering, navigation, favorites, deals, and external-link handling |
| `menu.json` | Validated menu data with photos and prices |
| `hours_overrides.json` | Optional, validated holiday/exceptional-hours overrides |
| `manifest.webmanifest` | PWA manifest: name, icons, standalone display |
| `sw.js` | Service worker — content-addressed, atomic offline app-shell cache |
| `APP_SHELL_HASH.txt` | SHA-256 manifest for the 13 shell inputs; derives the cache version |
| `tests/` | Unit and browser integration tests |
| `icons/` | App icon in 5 sizes (192, 512, maskable, apple-touch, favicon) |
| `scripts/package-android.py` | Packages the PWA into an Android APK via PWABuilder CloudAPK |
| `scripts/scrape_fb_deals.js` | Cron scraper for Facebook deals (writes `facebook_deals.json`) |
| `scripts/capture_screenshots.js` | Headless-Chrome screenshot capture |

## Android Packaging & Releasing

Re-run the packager when the site changes:

```bash
# Enqueue via PWABuilder CloudAPK (versions and secrets come from GH Actions)
python3 scripts/package-android.py
```

## Automation

| Trigger | Action |
|---------|--------|
| every 6h (`main`) | `auto-package.yml` validates tests and the hash of 13 shell inputs (`index.html`, `styles.css`, `core.js`, `app.js`, `menu.json`, `hours_overrides.json`, `manifest.webmanifest`, `sw.js`, 5 icons); repackages the APK/AAB when it changes. Concurrency and `main`/repository guards prevent overlapping writes. |
| every 6h (`main`) | Scrapes and strictly validates Facebook deals, then commits + pushes only a validated change to `facebook_deals.json` |

## Contributing

We welcome community contributions. To get started:

1. Fork the repo on GitHub.
2. Create a new branch (e.g., `improve-menu-search`).
3. Push your changes.
4. Open a pull request and describe your change.

Follow the existing code style. Before submitting, run the checks below and load the app at `http://localhost:8000/` to confirm the tabs still work.

### Testing

The app has no runtime dependencies or build step. Testing dependencies are pinned in `package.json` and `package-lock.json`.

```bash
# Reproducible install (Node 20+)
npm ci
npx playwright install chromium

# Syntax, JSON and unit tests
node --check core.js && node --check app.js && node --check sw.js
npm test

# Browser integration tests + everything above
npm run test:browser
# or: npm run test:all
```

`.github/workflows/validate.yml` runs these checks on pull requests with no secrets and no publishing. See `TEST_REPORT.md` for results and `AUDIT_REPORT.md` for the full audit.

If you're interested in becoming a maintainer of the app, please open a PR and note your interest.

## Credits

- Restaurant info, prices, and photos: [bismarckbigboy.com](https://www.bismarckbigboy.com/)
- Design: modern-retro 1950s American drive-in, built around the original Big Boy identity
- Maintained by [MidnightRaven9](https://github.com/MidnightRaven9) for Bismarck Big Boy

## License

MIT — see [LICENSE](LICENSE).
