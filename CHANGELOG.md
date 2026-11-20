# Changelog

Notable changes to the Bismarck Big Boy mobile web app. The installable Android
build uses release tag `v1.0.0`; the web app shell cache version is in `sw.js`.

## 2026-11-20 — Code, design and repo audit

### Fixed
- Escaped scraped Facebook deal titles before rendering them in the in-app browser
  handoff card, closing an HTML-injection path from untrusted post text.
- Fixed invisible white-on-white text on the selected menu size chip, the secondary
  dialog button, and the in-app browser toolbar after the dark-theme migration.
- Made notification storage safe when browser storage is blocked, reverted the alert
  toggle when permission is denied, and used local dates for the daily open alert.
- Stopped a transient Facebook scrape failure from wiping the last good deals file.
- Removed stale saved menu ids that could leave Favorites in a broken state.
- Added designed empty/error messages for the Facebook deals list.
- Removed inaccurate "pull-to-refresh" claim from the README and fixed `.env.example`
  inline comments that could be copied into real values.

### Changed
- Enlarged small tap targets: size chips and "READ MORE" to 36px, "OPEN ON FACEBOOK"
  to 40px.
- Added dark backing panels behind red category headers, prices and the active tab so
  they meet 3:1 contrast on the dark theme.
- PWA shortcuts now deep-link to the menu, ordering handoff, and directions.
- Removed the stale hardcoded Facebook follower counts.
- Removed dead CSS/imports, consolidated the HTML-escape helper, and refreshed docs
  and screenshots for 56 menu items and current copy.

## 2026-11-17 — v1.0.0

### Added
- Initial single-file PWA with Home, Menu, Favorites, Rewards and Info screens.
- Offline app-shell caching, installable manifest and icons.
- Signed Android TWA (APK/AAB) published on GitHub Releases.
- Scheduled Facebook deal scraping and APK repackaging workflow.
