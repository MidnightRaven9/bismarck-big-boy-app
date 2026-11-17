# Bismarck Big Boy — Mobile Web App

**Live app:** https://midnightraven9.github.io/bismarck-big-boy-app/

A customer-facing mobile web app for **Bismarck Big Boy** — the original 1954 drive-in at 2511 E Main Ave, Bismarck, ND. Built as a single self-contained HTML file with an installable PWA manifest, so customers can add it to their home screen on Android and iPhone and it opens like a native app.

## Features

- **Home** — live open/closed status (10:30 AM – 9:00 PM, 7 days), today's hours, specials, awards, and directions with an embedded OpenStreetMap
- **Menu** — all 58 items with real photos from bismarckbigboy.com, searchable, with category filters and per-size pricing
- **Favorites** — tap ♡ on any item; saved locally on the device, no account needed
- **Delivery** — one-tap links to Uber Eats, DoorDash, and Food Dudes
- **Rewards** — Toast loyalty sign-up, eGift cards, and the Big Boy shop
- **In-app browser** — external links open inside the app instead of bouncing out to another browser (sites that block embedding get an explanatory handoff card)
- **Offline** — the service worker caches the app shell, so the menu and hours work without a signal
- **Installable** — real mascot app icon, standalone display, branded theme color

## Install

### Android (PWA)

Open the live URL in Chrome → **⋮ menu → Install app**.

### Android (APK)

Grab `BismarckBigBoy-v1.0.0.apk` from the [latest release](../../releases/latest), open it on the phone, and allow "install from unknown sources" when prompted. The APK is a Trusted Web Activity (TWA): it looks and launches like a native app and loads the live site.

### iPhone

Open the live URL in Safari → **Share → Add to Home Screen**.

> iOS does not allow sideloading; the home-screen PWA is the supported distribution method without a Mac and a paid Apple Developer account.

## Releases

| File | Purpose |
| --- | --- |
| `BismarckBigBoy-v1.0.0.apk` | Sideloadable Android app (signed) |
| `BismarckBigBoy-v1.0.0.aab` | Android App Bundle for Google Play upload |
| `signing.keystore` + `signing-key-info.txt` | **Not in this repo** — keep them private and backed up |

Packages are generated with [PWABuilder's CloudAPK service](https://pwabuilder.com) (Bubblewrap under the hood) from the deployed manifest.

⚠️ **The signing keystore is intentionally excluded from this repository** (it is stored in `release/` locally, which is gitignored). Anyone holding it can publish updates as this app — back it up somewhere private, such as a password manager. Losing it means future Play Store uploads would require publishing under a new app identity.

`assetlinks.json` (from the package) is served at the domain root — `https://midnightraven9.github.io/.well-known/assetlinks.json` — via the `MidnightRaven9.github.io` repository, which lets Android verify the app and run it fullscreen without a browser toolbar.

## Development

The whole app is one file: `index.html` (markup, styles, menu data, and logic inline).

```bash
python3 -m http.server 8080 --bind 127.0.0.1
# open http://127.0.0.1:8080/
```

A server is only needed for local editing — production runs on GitHub Pages over HTTPS.

### Project structure

```
index.html            the entire app
manifest.webmanifest  PWA manifest (name, icons, standalone display)
sw.js                 service worker — offline app-shell cache
icons/                192, 512, maskable-512, apple-touch-180, favicon
release/              APK, AAB, signing keystore (gitignored)
```

### Updating the app

1. Edit `index.html`.
2. **Bump the cache version** in `sw.js` (`const CACHE = 'bb-app-v2'`) — installed copies only pick up changes when the cache name changes.
3. Commit and push `main`. GitHub Pages rebuilds in ~30 seconds.

### Rebuilding the Android package

Re-run packaging against the deployed manifest (PWABuilder CloudAPK):

- **Endpoint:** `POST https://pwabuilder-cloudapk.azurewebsites.net/enqueuePackageJob`
- **Auth:** the response returns `{ id, accessToken }`; pass `Authorization: Bearer <accessToken>` to `/getPackageJob?id=` (poll until `Completed`) and `/downloadPackageZip?id=`
- **Headers:** `content-type: application/json`, plus `platform-identifier`, `platform-identifier-version`, `correlation-id`
- The ZIP contains the APK, AAB, keystore, and `assetlinks.json`

If you generate a **new** keystore, update `.well-known/assetlinks.json` with the new SHA-256 fingerprint and keep the old keystore for continuity.

## Credits

- Menu items, prices, photos, history, and awards: [bismarckbigboy.com](https://www.bismarckbigboy.com/)
- App icon: Big Boy mascot artwork from the restaurant's site media library, composited on brand red (`#C8102E`)
- Fonts: [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue) and [Inter](https://fonts.google.com/specimen/Inter)
- Map: OpenStreetMap contributors
- Delivery links: Uber Eats, DoorDash, Food Dudes

---

Bismarck Big Boy · 2511 E Main Ave, Bismarck, ND 58501 · 701-223-4125 · Open daily 10:30 AM – 9:00 PM
