# Changelog

Notable changes to the Bismarck Big Boy mobile web app. The installable Android
build uses release tag `v1.0.0`; the web app shell cache version is in `sw.js`.

## 2026-11-21 — Modern Americana redesign (Home + Info)

### Changed
- Rebuilt the design system around a Modern Americana identity:
  signature red `#C8102E`, deep red `#A50D26`, heritage navy `#193B63`,
  classic white `#FFFFFF`, ice blue `#DCEAF5`, cool gray `#F5F7FA`, and
  vintage gold `#D4A63A` used sparingly for heritage highlights.
- Redesigned the Home hero with stronger red/navy color blocking, a gold
  "Est. 1954" badge, checkerboard accents, and a more dramatic typographic
  composition while keeping the existing restaurant photo.
- Transformed the Info timeline into a premium heritage exhibit: deep navy
  section background, large gold year labels, gold timeline line and milestone
  rings, red accents for 1954 and Today, white and ice-blue milestone panels,
  and a distinctive owner-quote treatment.
- Reworked signature-food cards (Flying Style, Hot-N-Tot, Fries & Gravy,
  Big Boy Snow) with larger photography and varied color-blocked treatments.
- Improved contact and social sections with navy icon buttons and clearer
  hierarchy.
- Updated the bottom navigation to heritage navy with a red active tab.

### Fixed
- Prevented horizontal overflow on the Info screen at 195 px zoom by switching
  social buttons to a single column on very narrow viewports.

## 2026-11-20 — Brand-aligned red, white, and blue refresh

### Changed
- Rebalanced the palette to match the restaurant’s classic identity: warm cream
  `#FFF8F2` and pure white `#FFFFFF` as dominant backgrounds, Big Boy red
  `#C8102E` for primary actions and selected states, heritage navy `#203D60`
  for navigation and secondary accents.
- Converted menu, rewards, delivery, info, awards, specials, and alert cards
  from dark charcoal to light cards with subtle warm borders.
- Made menu category filter thumbnails perfectly circular (`40px × 40px`,
  `border-radius:50%`, `object-fit:cover`) while keeping the same image files,
  names, order, and selection behavior.
- Updated the active bottom-nav tab, order bar, primary buttons, and selected
  category chip to red; size chips and section accents remain navy.

## 2026-11-20 — Classic Diner redesign and splash update

### Changed
- Rebuilt the visual system around a classic American diner menu board:
  cream `#F8F5F2` background, dark charcoal `#252525` cards with cream/white
  text, deep navy `#1F3A5F` as the main action accent, and Big Boy red
  `#C8102E` reserved for awards, small highlights and focus outlines.
- Primary actions (Order Online, order bar, category pills, active bottom-nav
  tab, buttons) now use navy; delivery and social buttons are charcoal with
  light text and no brand colors.
- Reworked the hero scrim and checker strip to match the new palette and
  removed heavy shadows and generic rounded-card uniformity.
- Removed the generic Mission/Vision filler cards from the Info screen.

### Fixed
- Updated the Android splash screen background to `#050114` so it matches the
  dark background of the existing app icon; manifest theme color now matches
  the cream app background.
- Ensured all light text on dark cards meets WCAG AA contrast (4.5:1).

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
