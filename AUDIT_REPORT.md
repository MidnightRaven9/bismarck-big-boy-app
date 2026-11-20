# Bismarck Big Boy — Audit Report

Audit date: 2026-11-20. Baseline commit: `374cc4f`. Scope: customer-facing PWA, Android TWA packaging, automation, docs and assets.

## Method

- Read every tracked source file, both automation workflows, all docs, and verified icon/screenshot dimensions.
- Ran syntax, JSON and YAML validation before and after changes.
- Performed read-only HTTP checks on the live restaurant site and the framed/handed-off third-party origins.
- Wrote dependency-free unit tests and Playwright browser integration tests against a local static server.
- Distinguished **verified** defects (reproduced or directly proven from code) from **potential** risks (need a real device/browser to confirm).

## Confirmed findings and status

| ID | Severity | Location (baseline) | Verified impact | Status |
|---|---|---|---|---|
| F-01 | Critical | `index.html` hours duplicated throughout inline script | Open/Closed status, "today" row and daily alert used the **visitor's** local clock; wrong state for travellers and no DST handling. | **Fixed** — `core.js` `businessNow()` uses `Intl` with `America/Chicago`; single `RESTAURANT` source; opt-in `hours_overrides.json`. |
| F-02 | High | `sw.js` cache/install logic | Any navigation response could be cached as the shell (including error pages); install failures were silent; JSON was cache-first and went stale. | **Fixed** — `bb-app-v16`, `res.ok`/HTML checks, persisted `SHELL_INSTALL_FAILED` reporting, network-first JSON, CSP-safe offline page. |
| F-03 | High | inline external-link handling | `window.open` without `noopener,noreferrer`; hostname **blocklist** let unknown sites be framed; iframe had excessive permissions; all external links were intercepted. | **Fixed** — allowlisted framing, direct secure handoff for payments/ordering/accounts/social, anchor-based `openExternal` with `data-raw` guard, sandboxed iframe with minimal `allow`. |
| F-04 | High | `index.html` CSP | `script-src 'unsafe-inline'`, `img-src * data:`, broad `frame-src`. | **Fixed** — external `core.js`/`app.js`, `script-src 'self'`, images limited to Wix and Google favicons, frames limited to OpenStreetMap and Food Dudes, `referrer` policy added. |
| F-05 | Medium | Facebook deals rendering | No schema validation; truncated post text rendered as-is; no duplicate/URL/date checks. | **Fixed** — `normalizeDeals()` with field types, length caps, URL origin rejection, expiry and dedupe; "confirm on original post" note. |
| F-06 | Medium | IAB dialog and tabs | IAB dialog had no focus trap/restoration; tabs lacked selected state; safe-area padding was overwritten. | **Fixed** — focus trap + restoration, `aria-current`, CSS override for safe area, focus-visible rings, reduced-motion, live status region. |
| F-07 | Medium | `.github/workflows/auto-package.yml`; `scripts/package-android.py` | `continue-on-error` hid failures; unpinned deps and `\| tail`/`\|\| true` masked exit codes; `extractall()` allowed unsafe paths; release errors were not reported. | **Fixed locally** — workflow hardened with three jobs (`validate`, `package`, `deals`), pinned SHAs/Playwright, least privilege, `set -euo pipefail`, guarded scraper, full-shell hash; packaging script hardened previously. **Not committed, pushed or triggered.** |
| F-08 | Medium | inline menu data | 56 menu items inline in HTML; no duplicate-ID detection; render logic coupled to data. | **Fixed** — extracted to `menu.json`, validated on load with duplicate-ID detection; IDs unchanged so favorites survive. |
| F-09 | Low–Medium | `README.md`; `SECURITY.md`; `manifest.webmanifest` | Documentation claimed a single inline HTML file and that all external links open inside the app; "live hours" needed the time-zone fix. | **Fixed** — docs and manifest copy updated to match behavior. |
| F-10 | Low | `scripts/scrape_fb_deals.js` | Previously seen deals were re-added forever, so deleted posts could never disappear. | **Fixed** — `lastSeen` tracking with 14-day retirement; last-good-file protection retained. |
| F-11 | Low | CSS header/status | Status badge overflowed a 320px viewport by ~3px, causing horizontal scroll. | **Fixed** — `@media (max-width:360px)` spacing/sizing rules. |
| F-12 | High | `sw.js` offline fallback | Inline `onclick` could not run under a strict CSP; retry was script-dependent. | **Fixed** — plain `<a class="retry" href="./">TRY AGAIN</a>` and fallback response CSP `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`. |
| F-13 | Medium | SW install-failure reporting | The failure message arrived just before the controllerchange reload, so the page never displayed the notice. | **Fixed** — notice state persisted in `sessionStorage` and redrawn on the replacement page; browser regression test added. |
| F-14 | Medium | `index.html` at 195 CSS px (~200% zoom) | Horizontal overflow of 65–92px on home and menu caused by fixed-size tile grids, nav columns and menu rows. | **Fixed** — targeted `@media (max-width:300px)` reflow rules; no redesign. Browser regression test added. |
| F-15 | Medium | scraper output | An empty or malformed scrape could replace the last good `facebook_deals.json` and be committed by cron. | **Fixed** — temp output, non-empty candidate check, schema/URL validation, `process.exitCode = 1`, `DEALS_OUTPUT`/`DEALS_PREVIOUS`, atomic replace only after validation. |
| F-16 | Medium | release hash | Hash covered only `index.html`, `manifest.webmanifest` and `sw.js`, so shell code/data changes could be missed. | **Fixed** — hash covers `index.html core.js app.js menu.json hours_overrides.json manifest.webmanifest sw.js icons/*.png`; `APP_SHELL_HASH.txt` resynced. |
| F-17 | Medium | test tooling | Browser tests relied on an ambient Playwright install and `NODE_PATH`; no lockfile. | **Fixed** — minimal test-only `package.json` + committed `package-lock.json` pinning Playwright `1.65.1`; workflows use `npm ci`. No runtime dependency or build step added. |

## Data verification

- **Hours** — the official site (`https://www.bismarckbigboy.com/`) states "SEVEN DAYS A WEEK 10:30 AM - 9:00 PM". `core.js` matches exactly; `hours_overrides.json` is empty and a unit test now prevents invented exceptions.
- **Menu** — re-fetched the official `/menu` page. All seven categories and 55 listed items/prices match `menu.json`. One legacy entry, **Shake Flavors** (Small $4.29 / Large $5.29 with a long flavor list), is present in `menu.json` but not on the current official menu page.
- **Promotions** — remaining `facebook_deals.json` entries use only original Facebook post URLs and are validated for schema, expiry and duplicates on render. Two entries carry explicit expiry dates; none contains an invented offer.

## Unresolved / owner confirmation needed

- **Shake Flavors menu entry** — likely stale, but absence from the website is not proof the restaurant no longer offers it. It was **left unchanged** to avoid silently changing restaurant facts. Please confirm whether it should be removed.
- Physical-device checks are still required (see `TEST_REPORT.md`).
- No credential rotation, release publication, deployment, push or workflow run was performed.

## Potential risks (not confirmed)

- Real browser framing of OpenStreetMap and Food Dudes on the production origin.
- Android TWA return-to-app, popup blocking and digital-asset-link behaviour on a physical phone.
- iOS Safari service-worker update/offline behaviour.
- Screen-reader announcements and large-text/narrow-screen layout with real assistive technology.

## Baseline checks that passed

`node --check` on all JS, Python compile, JSON and YAML parse, 5 valid PNG icons at expected sizes, 6 screenshots at 390×844, `.gitignore` excludes secrets and build artifacts; clean git tree at `374cc4f` before changes.
