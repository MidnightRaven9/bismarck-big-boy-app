# Bismarck Big Boy

> An installable menu, ordering, and restaurant guide for Bismarck’s original 1954 drive-in.

[![License: MIT](https://img.shields.io/badge/License-MIT-4c71af.svg)](https://github.com/MidnightRaven9/bismarck-big-boy-app/blob/main/LICENSE)
[![Stack: HTML5](https://img.shields.io/badge/Stack-HTML5%20%26%20PWA-000000?logo=html5&logoColor=white)](https://html.spec.org/)
[![Live app](https://img.shields.io/badge/Live%20app-GitHub%20Pages-00aaff)](https://midnightraven9.github.io/bismarck-big-boy-app/)

An installable menu and restaurant guide for [Bismarck Big Boy](https://www.bismarckbigboy.com/) at 2511 E Main Ave, Bismarck, ND. Browse the menu, check live hours, save favorites, or open pickup and delivery. The app uses plain HTML, CSS, and JavaScript and can be served as static files.

The **Big Boy After Dark** design uses the drive-in’s red, white, and blue against a near-black canvas. The Info screen includes the original 1954 newspaper clipping and the owner’s message.

## Features

- **Home** — live open/closed status in Bismarck time (America/Chicago, DST-aware), today's hours, specials, awards, and directions with an embedded OpenStreetMap.
- **Menu** — searchable menu with photo category filters, variant prices, and one-tap favorites.
- **Favorites** — saved locally on the device; no account or tracking required.
- **Rewards** — links to Toast loyalty sign-up, eGift cards, and the Big Boy shop.
- **Delivery** — one-tap ordering through Uber Eats, DoorDash, and Food Dudes.
- **Info** — Facebook page, verified history timeline, contact details, phone, address, and current deals.
- **External links** — map and Food Dudes open in-app; ordering, rewards, gift cards, and social pages hand off safely to the browser.
- **Offline** — service worker caches the app shell, menu, and hours. Photos, maps, deals, and ordering require a connection.
- **Accessibility** — 44 px touch targets, high-contrast text, focus outlines, and reduced-motion support.

## Screenshots

Screen previews were captured in Chromium at 390 × 844. To refresh the six viewport previews and the history detail from a local server, run `APP_URL=http://127.0.0.1:8000/ node scripts/capture_screenshots.js`.

| Home | Menu | Favorites |
| :---: | :---: | :---: |
| ![Home screen](assets/screenshots/1-home.png) | ![Menu screen](assets/screenshots/2-menu.png) | ![Favorites screen](assets/screenshots/3-favorites.png) |

| Delivery | Rewards | Info |
| :---: | :---: | :---: |
| ![Delivery](assets/screenshots/6-delivery.png) | ![Rewards screen](assets/screenshots/4-rewards.png) | ![Info screen](assets/screenshots/5-info.png) |

[View the full history timeline](assets/screenshots/7-history.png)

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

# Serve locally for testing
python3 -m http.server 8000 --bind 127.0.0.1
```

Open http://localhost:8000/. Keep local signing files and environment secrets outside any publicly served directory.

### Key files

| File | Purpose |
|------|---------|
| `index.html` | App shell and markup; loads `styles.css`, `core.js`, and `app.js` |
| `styles.css` | Big Boy After Dark palette, responsive layout, and screen styles |
| `core.js` | Pure, testable logic: Bismarck time, validation, URL policy |
| `app.js` | Rendering, navigation, favorites, deals, and external-link handling |
| `startup.js` | Splash readiness, logo decoding, and startup recovery |
| `menu.json` | Menu data, original photo references, and prices |
| `assets/menu/` | Local menu photos with original Wix fallbacks |
| `hours_overrides.json` | Optional, validated holiday/exceptional-hours overrides |
| `manifest.webmanifest` | PWA manifest: name, icons, standalone display |
| `sw.js` | Service worker — content-addressed, atomic offline app-shell cache |
| `APP_SHELL_HASH.txt` | SHA-256 manifest for the 15 shell inputs; derives the cache version |
| `tests/` | Unit, browser integration, and Android splash packaging tests |
| `icons/` | App icon in 5 sizes (192, 512, maskable, apple-touch, favicon) |
| `scripts/package-android.py` | Packages the PWA into an Android APK via PWABuilder CloudAPK |
| `scripts/scrape_fb_deals.js` | Cron scraper for Facebook deals (writes `facebook_deals.json`) |
| `scripts/capture_screenshots.js` | Headless-Chrome screenshot capture |

## Android Packaging & Releasing

The Android APK is a Bubblewrap Trusted Web Activity generated by PWABuilder CloudAPK. It loads the hosted web app. The wrapper uses `#101114` for its launch background. Packaging replaces Bubblewrap’s dedicated TWA splash drawable in each density with the approved artwork in `assets/startup/android/` and re-signs the APK and AAB. The launcher and adaptive icons remain separate. The web launch uses the same artwork from `assets/startup/big-boy-bismarck.webp` and keeps the splash visible until the initial screen is ready. Android and the browser control the handoff to the web app.

To build a signed APK and AAB without uploading them, use a JDK and Android SDK Build Tools (`aapt2`, `zipalign`, and `apksigner`). Set `ANDROID_HOME` to the SDK directory or put those tools on PATH. Supply the signing variables from `.env.example` securely and run:

```bash
python3 scripts/package-android.py --output-dir /path/to/new-build
```

Use a new output directory. This mode refuses to overwrite existing files. Full-logo device testing requires a TWA whose start URL serves these web assets. Run the script without `--output-dir` only when you intend to update the configured GitHub Release.

## Automation

| Trigger | Action |
|---------|--------|
| every 6h (`main`) | `auto-package.yml` validates tests and the hash of the 15 shell inputs, including the startup script and logo; repackages the APK/AAB when the computed hash differs from the committed marker. Concurrency and `main`/repository guards prevent overlapping writes. |
| every 6h (`main`) | Scrapes and strictly validates Facebook deals, then commits + pushes only a validated change to `facebook_deals.json` |

## Security

For the trust model, audit findings, and remaining limits, see [Security Review](SECURITY_REVIEW.md). Report vulnerabilities using the private channel in [Security Policy](SECURITY.md).

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
