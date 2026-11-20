# Bismarck Big Boy — Mobile Web App

[![License: MIT](https://img.shields.io/badge/License-MIT-4c71af.svg)](https://github.com/MidnightRaven9/bismarck-big-boy-app/blob/main/LICENSE)
[![Stack: HTML5](https://img.shields.io/badge/Stack-HTML5%20%26%20PWA-000000?logo=html5&logoColor=white)](https://html.spec.org/)
[![Built with: OpenCode](https://img.shields.io/badge/Built%20with-OpenCode-4da167)](https://opencode.ai)
[![Live app](https://img.shields.io/badge/Live%20app-bismarckbigboy.app-00aaff)](https://midnightraven9.github.io/bismarck-big-boy-app/)

A customer-facing mobile web app for [Bismarck Big Boy](https://www.bismarckbigboy.com/), the original 1954 drive-in at 2511 E Main Ave, Bismarck, ND. Built as a single self-contained HTML file with an installable Progressive Web App manifest, so customers can add it to their home screen on Android and iPhone and it opens like a native app.

## Features

- **Home** — live open/closed status (10:30 AM–9:00 PM, 7 days), today's hours, specials, awards, and directions with an embedded OpenStreetMap.
- **Menu** — all 58 items with real photos from bismarckbigboy.com, searchable, with category filters and per-size pricing.
- **Favorites** — save items locally on the device; no account or tracking required.
- **Rewards** — Toast loyalty sign-up, eGift cards, and the Big Boy shop.
- **Delivery** — one-tap links to Uber Eats, DoorDash, and Food Dudes.
- **Mini Game** — Big Boy Catch: a quick casual game where Big Boy catches falling pizza burgers.
- **In-app browser** — external links open inside the app instead of bouncing out to another browser.
- **Offline** — the service worker caches the app shell, so the menu and hours work without a signal.
- **Phone, address, and directions** — a single trusted source for the restaurant's contact info and location.
- **Pull-to-refresh** — content reloads on pull to capture the latest specials and status.

## Screenshots

The app on a phone.

| Home | Menu | Favorites |
| :---: | :---: | :---: |
| ![Home screen](assets/screenshots/1-home.png) | ![Menu screen](assets/screenshots/2-menu.png) | ![Favorites screen](assets/screenshots/3-favorites.png) |

| Delivery | Rewards | Info |
| :---: | :---: | :---: |
| ![Delivery](assets/screenshots/6-delivery.png) | ![Rewards screen](assets/screenshots/4-rewards.png) | ![Info screen](assets/screenshots/5-info.png) |

*(To add your own screenshots, run `node scripts/capture_screenshots.js` — see [Developer Setup](#developer-setup).)*

## Install

### Android (PWA)

Open the live URL in Chrome, tap **⋮** → **Install app**. It will be added to your home screen, opens like a native app, and works offline.

### Android (APK — sideload)

Download **BismarckBigBoy-v1.0.0.apk** from the [latest release](https://github.com/MidnightRaven9/bismarck-big-boy-app/releases/latest). On your phone, open the file → allow “Install unknown apps” when prompted → install. It's a Trusted Web Activity, so it loads the live site.

### iPhone

iOS does not allow sideloading. Open the live URL in Safari → **Share** → **Add to Home Screen**.

## Requirements

- Nothing to run. The app runs entirely in a browser (`index.html` + service worker + icons).

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
| `index.html` | Entire app — markup, styles, and logic, all inline |
| `manifest.webmanifest` | PWA manifest: name, icons, standalone display |
| `sw.js` | Service worker — offline app-shell cache |
| `icons/` | App icon in 5 sizes (192, 512, maskable, apple-touch, favicon) |
| `scripts/package-android.py` | Packages the PWA into an Android APK via PWABuilder CloudAPK |
| `scripts/scrape_fb_deals.py` | Cron scraper for Facebook deals (writes `facebook_deals.json`) |
| `scripts/capture_screenshots.js` | Headless-Chrome screenshot capture |

## Android Packaging & Releasing

Re-run the packager when the site changes:

```bash
# Enqueue via CloudAPIPackaging (RELEASE_TAG, versions, secrets come from GH Actions)
python3 scripts/package-android.py
```

## Automation

| Trigger | Action |
|---------|--------|
| every 6h (`main`) | `auto-package.yml` checks the app shell hash; repackages the APK/AAB when it changes |
| every 6h (`main`) | Scrapes Facebook for new deals/specials; commits + pushes changes to `facebook_deals.json` |

## Contributing

We welcome community contributions. To get started:

1. Fork the repo on GitHub.
2. Create a new branch (e.g., `improve-menu-search`).
3. Push your changes.
4. Open a pull request and describe your change.

Be sure to follow the existing code style, and run `node --check index.html` before submitting.

If you're interested in becoming a maintainer of the app, please open a PR and note your interest.

## Credits

- Restaurant info, prices, and photo art: [bismarckbigboy.com](https://www.bismarckbigboy.com/)
- App icon: a custom Big Boy mask on a dark charcoal background
- Demo / author info: powered by the [Owner Mode](https://github.com/midnightraven9) team at Bismarck Big Boy

## License

MIT — see [LICENSE](LICENSE).
