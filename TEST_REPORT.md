# Test Report

Date: 2026-11-20. All commands were run locally in `/root/projects/bismarck-big-boy-app`. No deployment, push, release, workflow run or signing-material access was performed.

## Baseline before remediation

| Command | Result |
|---|---|
| `npm ci` | pass — Playwright `1.65.1`, 0 vulnerabilities |
| `npm test` | **11/11 pass** |
| `npm run test:browser` | **19/19 pass** |

Repository was clean at `8a2092f` before any edit. `package.json` exposes only `test`, `test:browser` and `test:all`; there is **no `npm run build` script** (the app has no runtime build step).

## Final validation commands

| Command | Result |
|---|---|
| `npm ci` | pass — 2 packages, 0 vulnerabilities |
| `npm audit` | pass — **0 vulnerabilities** |
| `npm test` | **17/17 pass** |
| `npm run test:browser` | **25/25 pass** |
| `npm run test:all` | pass — both suites above, sequential |
| `node --check core.js` | pass |
| `node --check app.js` | pass |
| `node --check sw.js` | pass |
| `node --check scripts/scrape_fb_deals.js` | pass |
| `node --check scripts/capture_screenshots.js` | pass |
| `node --check tests/unit.test.js` | pass |
| `node --check tests/browser.test.js` | pass |
| `python3 -m py_compile scripts/package-android.py` | pass |
| JSON parse of `manifest.webmanifest`, `menu.json`, `facebook_deals.json`, `hours_overrides.json`, `package.json`, `package-lock.json` | pass |
| YAML parse of `.github/workflows/auto-package.yml` and `.github/workflows/validate.yml` | pass — jobs `validate`, `package`, `deals` / `validate` |
| `APP_SHELL_HASH.txt` reproducibility via the workflow hash command | pass |

YAML was parsed with a temporary PyYAML install in `/tmp/opencode/yaml-venv`; no parser dependency was added to the repository. `actionlint` was not available.

Final shell hash (768 hex characters, no trailing newline):

```
bffa98ba570f36bee14ba8794dee05b21102204c8ea98da67390c45181d1323e7c3404640c6c70179be48169673734a19420678cd2ebf32fedddcfbc45b479a1c46844a6690e4e50f2d56dab588d0b7fd18837dc27bacdc48268df35ab143ac7896953e960b304678e29b4eb620729ed9916df27d93100148c447e713d1834513f137e9222699c3641ddf2af7f6c90ab6ba9dbf756ca2fbd289cdab429f426159f6a70efb80055385f497fc0806fd78a1cf5b3f9dc6a28c496ceb77931c0e41825f912a5dd594e4a46d43ce338b33c1722d27c1466fa1bf4fb0eaf8be246f822305c19c20ccd562dffb054a2748bb89d8cd38a72e4f568550aa390a422f260fcfb6a7dda6fb28bc68d00e4163237567736595db03296597da7d9a096b0e14f0b7a99e38e5eacf48b1e46511b0ff16d3623d2b2f89b6a008c87ab7ddd3914d4ff98b16aa1dd6628590e678d61fbed875ca1f52675802a20c1ebb5a5b10dda6f33655be39fb9c71fa69abd42d362a7ffca9f7ec06dbfc28f58e0febec41fc401b7
```

Regenerated with:

```bash
LC_ALL=C sha256sum index.html core.js app.js menu.json hours_overrides.json \
  manifest.webmanifest sw.js icons/*.png | awk '{printf "%s", $1}' > APP_SHELL_HASH.txt
```

The service worker and registration URL derive the release version from a SHA-256 digest of this **entire** 768-character string, so a change to any of the 12 inputs (including `sw.js`, manifest or icons) creates a new cache version.

## Unit tests (17/17)

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
11. Manifest/shortcut/CSP/iframe/service-worker wiring, exact rewards URL, retired game absent — pass.
12. `APP_SHELL_HASH.txt` reproducible from the 12 committed shell inputs — pass.
13. Menu validation rejects unsafe IDs/media IDs and non-numeric prices — pass.
14. Generated deals use the strict shared `assertDealsPayload` gate — pass.
15. Workflow concurrency, least privilege, `main`/repository guards and no force pushes — pass.
16. Service worker versions atomically from the full hash, validates JSON schema, scopes cleanup — pass.
17. App rendering escapes menu data, uses a local image placeholder and reports storage failures — pass.

## Browser integration tests (25/25, headless Chromium, 390×844 unless noted)

1. Shell, 56 menu items, 8 chips and resolved status — pass.
2. Malicious menu values render as text; no injected scripts/handlers/URLs execute — pass.
3. Tab navigation, `aria-current`, `#directions` deep link — pass.
4. OpenStreetMap framing, Tab focus trap, Escape and focus restoration — pass.
5. Toast ordering hands off via popup instead of being framed — pass.
6. Favorites persist across reload; corrupted `localStorage` does not break the menu — pass.
7. Malformed deals JSON with no cached copy shows a safe empty state — pass.
8. Schema-invalid menu JSON falls back to last known good data and reports `CONTENT_FALLBACK` — pass.
9. Service worker takes control, installs cleanly and serves the cached menu offline — pass.
10. Menu search, category filters and safe empty state — pass.
11. No horizontal overflow at 320px and 360px — pass.
12. Closed-status text stays inside the right-aligned header pill at 360px, 320px and 195px — pass.
13. 200% zoom reflow at 195 CSS px has no horizontal scroll on any of the five tabs — pass.
14. Keyboard navigation reaches and activates tabs with a visible focus outline — pass.
15. Reduced motion disables transitions and animations — pass.
16. Key text meets 4.5:1 colour contrast — pass.
17. Basic accessibility semantics: unique IDs, named buttons, image alt text, iframe title, dialog role, live status region — pass.
18. Offline startup with caches deleted returns the 503 fallback with no inline handler, a working retry link and a strict CSP header — pass.
19. Failed shell installation is reported, never activates an incomplete worker, and shows a retry — pass.
20. Failed install recovers after reconnection; marker and notice are cleared — pass.
21. Broken external images use a local `data:image/svg+xml` placeholder with stable layout and preserved alt text — pass.
22. Favorites storage failure is reported once and favorites remain usable in memory — pass.
23. Content-addressed updates replace old caches, keep both tabs in control and preserve unrelated caches — pass.
24. External actions (ordering, rewards, gift cards, delivery, directions) use the expected URLs and safe handoffs; Food Dudes remains framed — pass.
25. No page errors or CSP violations — pass.

Defects found and fixed by the regression work: manual cache versioning that ignored later shell inputs; a failed install being activated with an empty cache; a failure notice that could not clear after recovery; malformed JSON reaching the page; unescaped menu values at several HTML sinks; and the closed-status “Opens 10:30 AM” pill clipping on narrow headers.

## Data and source verification (read-only)

- `https://www.bismarckbigboy.com/` states "SEVEN DAYS A WEEK 10:30 AM - 9:00 PM", matching `core.js`.
- Official `/menu` page: seven categories; the legacy **Shake Flavors** entry is not listed. Owner confirmed on 2026-11-20 to keep all Shake Flavors entries unchanged.
- Ordering, rewards, gift cards, Facebook, OpenStreetMap, Food Dudes, Google Maps, Instagram and the approved Toast loyalty URL remain unchanged and are exercised by the browser tests where a headless browser can reach them.
- Uber Eats presents a bot challenge in headless Chromium; physical-device verification is still required.

## Not executed / limitations

- No physical Android or iOS device was available. TWA fullscreen, digital asset links, install/update flow, popup behaviour and return-to-app need manual verification.
- No real screen reader or OS-level text-size test was run. 195px/320px/360px reflow, keyboard focus, reduced motion and contrast were checked programmatically.
- Production Facebook framing was not verified in a real browser session against the live origin.
- APK/AAB packaging and release upload were not run; no signing material was accessed or overwritten.
- The workflow files were parsed but no workflow was executed on GitHub.

## Manual test checklist (owner)

1. Install the PWA on Android Chrome and verify install, offline menu, and update after a shell change.
2. Open the installed TWA and confirm fullscreen, shortcut deep links, external handoff and return to app.
3. On iOS Safari, Add to Home Screen, then verify offline menu and status.
4. With the phone in a different time zone, confirm the badge and hours still show Bismarck time.
5. Tap Order Online, Rewards, eGift Card, social links, Uber Eats, DoorDash and Directions; confirm each opens the intended destination and Back returns to the app.
6. Enable a screen reader and keyboard navigation; confirm the IAB dialog traps focus and closes with Escape.
7. Confirm map and Food Dudes iframes actually render on the production origin.
8. Shake Flavors: owner confirmed to keep all added entries; no action required.
