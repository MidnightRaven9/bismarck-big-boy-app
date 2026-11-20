# Improvement Plan

## Implemented (in priority order)

1. **Time source of truth** — `core.js` holds `RESTAURANT`, `businessNow()` (America/Chicago, DST-safe via `Intl`), `effectiveHours()`, `nextOpening()` and `effectiveHours(now, overrides)`. `app.js` uses these for status, hours grid and the open alert. `hours_overrides.json` is an empty, documented, validated opt-in mechanism — no dates or hours were invented.
2. **PWA reliability** — `sw.js` uses content-addressed caches derived from the full shell hash, installs atomically and rejects incomplete shells, never stores navigation errors as the shell, validates JSON syntax and schema before use, falls back to last-known-good data offline, and serves a clear CSP-safe offline page when nothing is cached.
3. **External-link safety** — allowlisted framing (`www.openstreetmap.org`, `fooddudesdelivery.com`); direct `noopener noreferrer` handoff for Toast ordering/loyalty/gift cards, Facebook, Instagram, Uber Eats, DoorDash and bismarckbigboy.com; sandboxed iframe with only `allow="fullscreen"`.
4. **CSP hardening** — no inline JavaScript, images restricted to the app plus Wix media and Google favicons, frames restricted to the two embeddable origins, `strict-origin-when-cross-origin` referrer policy.
5. **Data quality** — menu extracted to validated `menu.json` (duplicate IDs rejected, sizes sanitized); Facebook deals normalized and validated; scraper retires posts unseen for 14 days.
6. **Accessibility** — dialog focus trap/restoration, `aria-current` tabs, `aria-live` status, safe-area-aware tab bar, visible focus rings, reduced-motion support, promotional caveat text.
7. **Maintainability** — pure logic in `core.js`, app logic in `app.js`, markup/styles in `index.html`. No frameworks, build step, analytics, accounts or backend added.
8. **Testing** — `tests/unit.test.js` and `tests/browser.test.js`, plus a new secret-free `.github/workflows/validate.yml` for pull requests.

## Applied in the final hardening pass (uncommitted)

- `.github/workflows/auto-package.yml` was hardened locally with three gated jobs (`validate`, `package`, `deals`), pinned Actions/Playwright, `npm ci`, least-privilege permissions, `set -euo pipefail`, a guarded scraper, and a hash covering every shell input. See `PROPOSED_WORKFLOW_CHANGES.md`.
- Test tooling is pinned in `package.json` + `package-lock.json`; validation CI uses `npm ci`.
- Offline fallback uses a CSP-safe retry link; install failures and SW updates have browser regression coverage.
- 195 CSS px / ~200% zoom reflow and the install-notice reload race were fixed.
- `APP_SHELL_HASH.txt` is synced to the new full-shell hash so the cron will not repackage unexpectedly from these web-only changes.

## Applied in the full-remediation pass (uncommitted)

- Every menu/deal string is escaped at render time; IDs and Wix media IDs are allowlisted, and URLs are built from a fixed host with encoded ids.
- Service worker versioning now hashes the complete 768-character shell hash, so changes to `sw.js`, manifest or icons also create a new cache version; failed installs are rejected before activation and recovered through a retry URL.
- JSON handling distinguishes syntax from schema validation, preserves last-known-good cached data, and reports fallbacks to the page.
- Workflows add concurrency groups, explicit `main`/repository guards, token-only git extraheaders, and shared `assertDealsPayload` validation in scraper, workflow and service worker.
- External image failures use a local CSP-allowed SVG placeholder; favorites/storage failures show throttled live-region notices.
- Test suites expanded from 11/19 to **17/25**; final `npm audit` reports 0 vulnerabilities.

## Deferred — requires explicit approval

- Committing and pushing the workflow and code changes.
- Releasing a new APK/AAB. The TWA loads the live site, so a repackage is not required for these web-only changes.
- Credential rotation: a targeted current-tree/history scan found no live secret and no GitHub token or private-key pattern; current workflows use `GITHUB_TOKEN` and the scraper needs no Facebook password. No rotation is needed unless a real credential was exposed outside the repository, and any rotation remains owner-controlled.
- Regenerating screenshots: existing binary assets were intentionally left untouched.
- Confirming whether the legacy "Shake Flavors" menu item should be removed from `menu.json` — **confirmed 2026-11-20: keep all Shake Flavors entries unchanged**.

## Recommended next steps

1. Review the working tree locally, then merge only when ready.
2. Verify the manual checklist in `TEST_REPORT.md` on a physical Android device (Chrome PWA and installed TWA) and on iOS Safari.
3. Ask the owner to approve any commit/push, release or deployment explicitly; credential rotation is unnecessary unless a real credential was exposed outside the repository.
4. Supply official holiday/exception dates, if any, for `hours_overrides.json` — leave empty until then.
