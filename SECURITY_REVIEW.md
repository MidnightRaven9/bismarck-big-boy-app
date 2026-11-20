# Security Review

## Trust model

The app is a static PWA. It receives two kinds of untrusted input:

1. `menu.json` and `facebook_deals.json`, written by repository/content automation.
2. Search text typed by the customer and data already in `localStorage`.

There are no accounts, no backend, no analytics and no personal data leaving the device. Favorites and alert preferences are stored in `localStorage` only.

## Controls verified in this review

- **XSS** — every dynamic menu/deal string goes through `escapeHtml()` before `innerHTML`; IDs and Wix media IDs are allowlisted in `core.js` before they reach URLs or selectors. Deals pass through `normalizeDeals()` for rendering and `assertDealsPayload()` before being written or cached. Text lengths are bounded (title 120, text 700).
- **CSP** — `script-src 'self'` only (inline JS removed); `img-src` limited to self, `data:`, Wix media and Google favicons; `frame-src` limited to the two origins the app actually embeds; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`. The offline fallback is served with `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'` and uses a plain retry link instead of inline JS. Browser tests assert no CSP violations.
- **URL handling** — `hostnameOf()` rejects unparseable URLs and non-http(s) schemes. `canEmbed()` is an allowlist, not a blocklist. Sensitive hosts hand off directly. `openExternal()` uses a generated anchor with `target="_blank" rel="noopener noreferrer"` and `data-raw` so the global interceptor cannot recurse (a recursion bug found and fixed during browser testing).
- **Iframe** — `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"` and `allow="fullscreen"`. Geolocation and clipboard permissions were removed.
- **Referrer** — `strict-origin-when-cross-origin`.
- **Service worker** — installs are atomic and hash-verified against all 12 shell inputs; the cache name is derived from a digest of the full shell hash; navigation responses never mutate the cache; JSON is syntax- and schema-validated before use, with last-known-good fallback and a `CONTENT_FALLBACK` notice; stale release caches are removed with a `bb-app-` prefix filter; failed installs are rejected before activation and reported through a persisted marker plus a retry that forces a fresh registration URL.
- **Scraper** — writes to `DEALS_OUTPUT` only after a non-empty candidate check and schema/URL validation; `process.exitCode = 1` on failure; the workflow validates the temp JSON and only then replaces `facebook_deals.json`. A failed scrape never overwrites good data.
- **Packaging** — safe archive extraction with path traversal and size checks, `testzip()` integrity verification, retried API calls, SHA-256 logged, signing material and tokens redacted from all error output, explicit failure on incomplete packages or failed uploads.
- **CI** — both workflows use least-privilege permissions and concurrency groups. `auto-package.yml` guards writes to `main` in the canonical repository, checks out `main` explicitly, disables persisted credentials, and uses token-only `git` extraheaders. Actions are pinned to full commit SHAs, Playwright is pinned to `1.65.1`, installs use `npm ci`, and all multi-line shell steps use `set -euo pipefail`. No `continue-on-error`, `| tail`, `|| true`, force push or `git add -A` remains. Validation runs before packaging; the signing and data-refresh jobs are separated and cannot push concurrently.
- **Images and local storage** — failed external images swap to a local CSP-allowed SVG placeholder instead of a broken icon; favorites/storage failures produce one throttled live-region notice per 30s key while in-memory behavior continues.

## Residual risks

- `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD` live in GitHub Actions secrets; local keystores are gitignored. A targeted scan of the current tree and full git history found no GitHub token or private-key pattern and no live secret; the only history hit was a commented placeholder in `.env.example`. Rotation is not needed unless a real credential was exposed outside the repository. No credentials were rotated during this pass.
- Facebook's anonymous DOM is unreliable; deal text may remain truncated. The UI tells customers to confirm details on the original post.
- Third-party pages can still change framing behaviour; verify embedded map and delivery pages periodically.
- The legacy "Shake Flavors" menu entry is not on the current official menu page. The owner confirmed it should be kept, so it remains unchanged in `menu.json`.
- All current code and workflow changes are local and uncommitted: no commit, push, workflow run, release publication or deployment has been performed.
- Manual device verification is still required for TWA fullscreen/return-to-app, digital asset links, popup behavior, iOS Safari offline behavior, real screen readers and OS-level large text.

## Not claimed

No penetration test, Android reverse-engineering or server-side assessment was performed. `npm audit` was run and reported 0 vulnerabilities. No secret value was printed, stored or transmitted during this review.
