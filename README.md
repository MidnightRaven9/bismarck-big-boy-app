# Bismarck Big Boy

> A installable mobile web app for Bismarck's original 1954 drive-in. Menu, hours, deals, rewards, and ordering — no accounts, no tracking, no build step.

[![License: MIT](https://img.shields.io/badge/License-MIT-4c71af.svg)](LICENSE)
[![Stack: HTML5 PWA](https://img.shields.io/badge/Stack-HTML5%20%26%20PWA-000000?logo=html5&logoColor=white)](https://html.spec.org/)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Live app](https://img.shields.io/badge/Live-GitHub%20Pages-00aaff)](https://midnightraven9.github.io/bismarck-big-boy-app/)

[Bismarck Big Boy](https://www.bismarckbigboy.com/) is the oldest continuously operating restaurant in Bismarck, ND — a family-run drive-in at 2511 E Main Ave since 1954. This project is the customer-facing Progressive Web App: plain HTML, CSS, and vanilla JavaScript that installs like a native app on Android and iPhone.

## Features

- **Live open/closed status** — Bismarck Central Time (DST-aware), today’s hours, and optional holiday overrides via `hours_overrides.json`.
- **Full menu** — 56 items with real photos, category filters, search, and per-size pricing.
- **Favorites** — Saved locally on the device; no account or analytics required.
- **Facebook deals** — Current specials pulled from the restaurant’s public page, with a link to the original post.
- **Rewards & gift cards** — Direct links to Toast loyalty, eGift cards, and the Big Boy shop.
- **Delivery** — One-tap handoff to Uber Eats, DoorDash, and Food Dudes.
- **Safe external links** — The map and Food Dudes embed in-app; ordering, payments, and social links hand off to the browser or their native app.
- **Offline-ready** — The service worker caches the app shell, menu, and hours so browsing works without a signal.

## Screenshots

Drop phone-sized screenshots into `assets/screenshots/` and the table below will pick them up.

| Home | Menu | Favorites |
| :---: | :---: | :---: |
| ![Home screen](assets/screenshots/1-home.png) | ![Menu screen](assets/screenshots/2-menu.png) | ![Favorites screen](assets/screenshots/3-favorites.png) |

| Rewards | Info | Delivery |
| :---: | :---: | :---: |
| ![Rewards screen](assets/screenshots/4-rewards.png) | ![Info screen](assets/screenshots/5-info.png) | ![Delivery options](assets/screenshots/6-delivery.png) |

To regenerate screenshots locally:

```bash
npm ci
node scripts/capture_screenshots.js
```

## Install

### Android

1. Open https://midnightraven9.github.io/bismarck-big-boy-app/ in Chrome.
2. Tap **⋮ → Install app**.
3. The icon appears on your home screen and works offline.

### iPhone

1. Open the live URL in Safari.
2. Tap **Share → Add to Home Screen**.

### Android APK (sideload)

Download `BismarckBigBoy-v1.0.0.apk` from the [latest release](https://github.com/MidnightRaven9/bismarck-big-boy-app/releases/latest). It is a Trusted Web Activity that loads the live site.

## Developer setup

The app has no build step and no runtime dependencies. You only need a static file server and Node 20+ if you want to run tests.

```bash
git clone https://github.com/MidnightRaven9/bismarck-big-boy-app.git
cd bismarck-big-boy-app

# Serve locally
python3 -m http.server 8000
```

Then open http://localhost:8000/ in Chrome.

### Running tests

```bash
npm ci
npx playwright install chromium

# Unit tests
npm test

# Browser integration tests
npm run test:browser

# Everything
npm run test:all
```

## Project layout

| File | Purpose |
|------|---------|
| `index.html` | App shell, styles, and markup |
| `core.js` | Pure logic: Bismarck time, validation, URL policy |
| `app.js` | Rendering, navigation, favorites, deals, external-link overlay |
| `menu.json` | Validated menu data |
| `hours_overrides.json` | Optional holiday/exceptional-hours overrides |
| `facebook_deals.json` | Scraped Facebook specials |
| `manifest.webmanifest` | PWA manifest |
| `sw.js` | Content-addressed offline cache |
| `APP_SHELL_HASH.txt` | SHA-256 manifest for the 12 shell inputs |
| `tests/` | Unit and browser integration tests |
| `scripts/` | Android packaging, screenshot capture, Facebook scraper |

## Android packaging

The packager is designed for GitHub Actions. For local runs, copy `.env.example` to `.env` and fill in the signing values:

```bash
cp .env.example .env
# Edit .env with your keystore and token
python3 scripts/package-android.py
```

`.env` is gitignored — never commit signing material.

## Automation

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `validate.yml` | Push/PR to `main` | Syntax checks, JSON validation, unit tests |
| `auto-package.yml` | Every 6 hours on `main` | Validates, repackages APK/AAB if the shell hash changed, and refreshes Facebook deals |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, style guide, and how to open a pull request.

## Security

See [SECURITY.md](SECURITY.md) for the security policy, reporting process, and trust-model overview.

## License

MIT — see [LICENSE](LICENSE).

---

Restaurant info, photos, and prices courtesy of [bismarckbigboy.com](https://www.bismarckbigboy.com/). Maintained by [MidnightRaven9](https://github.com/MidnightRaven9) for Bismarck Big Boy.
