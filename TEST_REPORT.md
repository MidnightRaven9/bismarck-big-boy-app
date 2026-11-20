# Test Report

Date: 2026-11-20. All commands were run locally in the repository. No deployment, push, release, workflow run or signing-material access was performed.

## Automated checks actually executed

| Command | Result |
|---|---|
| `rm -rf node_modules && npm ci --ignore-scripts --no-audit --no-fund` | pass — Playwright `1.65.1`, 2 packages |
| `node --check core.js` | pass |
| `node --check app.js` | pass |
| `node --check sw.js` | pass |
| `node --check scripts/scrape_fb_deals.js` | pass |
| `node --check scripts/capture_screenshots.js` | pass |
| `python3 -m py_compile scripts/package-android.py` | pass |
| JSON parse: `manifest.webmanifest`, `menu.json`, `facebook_deals.json`, `hours_overrides.json`, `package.json`, `package-lock.json` | pass |
| YAML parse: `.github/workflows/auto-package.yml`, `.github/workflows/validate.yml` | pass — jobs `validate`, `package`, `deals` / `validate` |
| `npm test` | **11/11 pass** |
| `npm run test:browser` | **19/19 pass** (five consecutive full runs after the final flake fix, plus the earlier clean-install run and final combined run) |
| `APP_SHELL_HASH.txt` vs full-shell `sha256sum` | **match** |

Final shell hash (768 hex chars, no trailing newline):

```
c778c1b231383e0b48ac869155189e648dedf93ee072a7dffeb29339ceb9914a0041abb217979a909057ad67d60b561295b2b6b5361487fdfcfcbaece17ba446c8e65e5fa0c2b1ca3e112890329798d6be589c784ab19a143549b038c77677d8896953e960b304678e29b4eb620729ed9916df27d93100148c447e713d1834513f137e9222699c3641ddf2af7f6c90ab6ba9dbf756ca2fbd289cdab429f426159f6a70efb80055385f497fc0806fd78a1cf5b3f9dc6a28c496ceb77931c0e4185f43b6957aad6139da2597e06a859a8e13fba8917de18ee4e6975a71b0a15340305c19c20ccd562dffb054a2748bb89d8cd38a72e4f568550aa390a422f260fcfb6a7dda6fb28bc68d00e4163237567736595db03296597da7d9a096b0e14f0b7a99e38e5eacf48b1e46511b0ff16d3623d2b2f89b6a008c87ab7ddd3914d4ff98b16aa1dd6628590e678d61fbed875ca1f52675802a20c1ebb5a5b10dda6f33655be39fb9c71fa69abd42d362a7ffca9f7ec06dbfc28f58e0febec41fc401b7
```

Computed with:

```bash
sha256sum index.html core.js app.js menu.json hours_overrides.json \
  manifest.webmanifest sw.js icons/*.png | awk '{printf "%s", $1}' > APP_SHELL_HASH.txt
```

### Unit tests (11/11)

1. `businessNow()` across CST/CDT and the DST transition date — pass.
2. Official hours (10:30–21:00 daily, `America/Chicago`) and empty overrides — pass.
3. Exact open/closed boundaries at 10:29, 10:30, 20:59 and 21:00 Central — pass.
4. Exceptional hours, closures, invalid dates, invalid times and inverted ranges — pass.
5. Time formatting and UTC date arithmetic — pass.
6. Menu schema: valid data, duplicate IDs and malformed sizes — pass.
7. Real `menu.json`: 56 items, all IDs unique — pass.
8. Deals schema: expired, duplicate, over-long and `javascript:` URLs — pass.
9. Real `facebook_deals.json` parses and only Facebook URLs survive — pass.
10. URL policy: framing allowlist, sensitive handoff list, unsafe protocol rejection — pass.
11. Manifest/shortcut/CSP/iframe/service-worker wiring, exact rewards URL, retired game absent, offline fallback CSP-safe — pass.

### Browser integration tests (19/19, headless Chromium, 390×844 unless noted, local HTTP server)

1. Shell, 56 menu items, 8 chips and resolved status — pass.
2. Tab navigation, `aria-current`, `#directions` deep link — pass.
3. OpenStreetMap framing, Tab focus trap, Escape and focus restoration — pass.
4. Toast ordering hands off via popup instead of being framed — pass.
5. Favorites persist across reload; corrupted `localStorage` does not break the menu — pass.
6. Malformed deals JSON shows a safe empty state — pass.
7. Service worker takes control, installs cleanly and serves the cached menu offline — pass.
8. Menu search, category filters and safe empty state — pass.
9. No horizontal overflow at 320px and 360px — pass.
10. 200% zoom reflow at 195 CSS px has no horizontal scroll (found and fixed a 92px menu overflow) — pass.
11. Keyboard navigation reaches and activates tabs with a visible focus outline — pass.
12. Reduced motion disables transitions and animations — pass.
13. Key text meets 4.5:1 colour contrast — pass.
14. Basic accessibility semantics: unique IDs, named buttons, image alt text, iframe title, dialog role, live status region — pass.
15. Offline startup with caches deleted returns the 503 fallback with no inline handler, a working retry link and a strict CSP header — pass.
16. Failed shell installation is reported to the page and survives the controllerchange reload — pass.
17. Service worker update installs a new cache, removes old caches and keeps control — pass.
18. External actions (ordering, rewards, gift cards, delivery, directions) use the expected URLs and safe handoffs; Food Dudes remains framed — pass.
19. No page errors or CSP violations — pass.

Two bugs were found and fixed by the new tests during this pass: the install-failure notice was lost on the automatic reload, and the update test raced the deliberate reload. Earlier passes also found and fixed the `data-raw` recursion bug, the 320px status overflow and the 195px menu overflow.

## Data and source verification (read-only)

- `https://www.bismarckbigboy.com/` — re-fetched 2026-11-20; "SEVEN DAYS A WEEK 10:30 AM - 9:00 PM" matches `core.js`.
- `https://www.bismarckbigboy.com/menu` — re-fetched 2026-11-20; 7 categories and 55 items/prices match `menu.json`. The legacy **Shake Flavors** entry is not on the official page; it was left unchanged pending owner confirmation and recorded in `AUDIT_REPORT.md`.
- Toast online ordering, gift cards, DoorDash, Facebook page/posts, OpenStreetMap, Food Dudes, Google Maps, Instagram and the approved Toast loyalty URL — all previously returned 200/expected redirects; raw `curl` still receives 403 bot challenges from some providers, so a real browser/device is required.
- Uber Eats redirects to an Uber bot challenge in headless Chromium; physical-device check still required.

## Not executed / limitations

- No physical Android or iOS device was available. TWA fullscreen delegation, digital asset links, install/update flow, popup blocking and return-to-app need manual verification.
- No real screen reader or OS-level 200% text-size test was run. 195px/320px/360px reflow, keyboard focus, reduced motion and contrast were checked programmatically.
- Production Facebook framing was not verified in a real browser session against the live origin.
- APK/AAB packaging and release upload were not run; no signing material was accessed or overwritten.
- The workflow files were parsed but no workflow was executed on GitHub.

## Manual test checklist (owner)

1. Install the PWA on Android Chrome and verify install, offline menu, and update after a cache bump.
2. Open the installed TWA and confirm fullscreen, shortcut deep links, external handoff and return to app.
3. On iOS Safari, Add to Home Screen, then verify offline menu and status.
4. With the phone in a different time zone, confirm the badge and hours still show Bismarck time.
5. Tap Order Online, Rewards, eGift Card, social links and Directions; confirm each opens the intended destination and that Back returns to the app.
6. Enable screen reader and keyboard navigation; confirm the IAB dialog traps focus and closes with Escape.
7. Confirm map and Food Dudes iframes actually render on the production origin.
8. Confirm whether the legacy "Shake Flavors" menu item should be removed.
