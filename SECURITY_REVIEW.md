# Security Review

## Trust model

The app is a static PWA. It receives two kinds of untrusted input:

1. `facebook_deals.json`, written by an automated scraper of a public Facebook page.
2. Search text typed by the customer.

There are no accounts, no backend, no analytics and no personal data leaving the device. Favorites and alert preferences are stored in `localStorage` only.

## Controls verified in this review

- **XSS** — dynamic strings go through `escapeHtml()` before `innerHTML`. Deals also pass through `normalizeDeals()`, which caps lengths, rejects non-Facebook URLs, invalid dates and duplicates. Text lengths are bounded (title 120, text 700).
- **CSP** — `script-src 'self'` only (inline JS removed); `img-src` limited to self, `data:`, Wix media and Google favicons; `frame-src` limited to the two origins the app actually embeds; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`. The offline fallback is served with `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'` and uses a plain retry link instead of inline JS. Browser tests assert no CSP violations.
- **URL handling** — `hostnameOf()` rejects unparseable URLs and non-http(s) schemes. `canEmbed()` is an allowlist, not a blocklist. Sensitive hosts hand off directly. `openExternal()` uses a generated anchor with `target="_blank" rel="noopener noreferrer"` and `data-raw` so the global interceptor cannot recurse (a recursion bug found and fixed during browser testing).
- **Iframe** — `sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"` and `allow="fullscreen"`. Geolocation and clipboard permissions were removed.
- **Referrer** — `strict-origin-when-cross-origin`.
- **Service worker** — only successful same-origin responses are cached; error pages are never stored as the shell; malformed JSON never overwrites a previously good cached copy; stale caches are removed on activation; install failures are persisted and reported to the page.
- **Scraper** — writes to `DEALS_OUTPUT` only after a non-empty candidate check and schema/URL validation; `process.exitCode = 1` on failure; the workflow validates the temp JSON and only then replaces `facebook_deals.json`. A failed scrape never overwrites good data.
- **Packaging** — safe archive extraction with path traversal and size checks, `testzip()` integrity verification, retried API calls, SHA-256 logged, signing material and tokens redacted from all error output, explicit failure on incomplete packages or failed uploads.
- **CI** — `validate.yml` and the `validate`/`deals` jobs in `auto-package.yml` use least-privilege permissions. Actions are pinned to full commit SHAs, Playwright is pinned to `1.65.1`, installs use `npm ci`, and all multi-line shell steps use `set -euo pipefail`. No `continue-on-error`, `| tail`, or `|| true` masking remains. Validation runs before packaging; the signing job and the data-refresh job are separated and never push concurrently.

## Residual risks

- `ANDROID_KEYSTORE_B64` and `ANDROID_KEYSTORE_PASSWORD` live in GitHub Actions secrets; local keystores are gitignored. Previously exposed PAT/password credentials still need rotation by the owner. No credentials were rotated during this pass.
- Facebook's anonymous DOM is unreliable; deal text may remain truncated. The UI tells customers to confirm details on the original post.
- Third-party pages can still change framing behaviour; verify embedded map and delivery pages periodically.
- The legacy "Shake Flavors" menu entry is not on the current official menu page. It was left unchanged pending owner confirmation rather than silently changing restaurant data.
- The hardened workflow changes are local only: no commit, push, workflow run, release publication or deployment has been performed.

## Not claimed

No penetration test, dependency audit, Android reverse-engineering or server-side assessment was performed. No secret value was printed, stored or transmitted during this review.
