# Proposed changes to `.github/workflows/auto-package.yml`

**Status: APPLIED LOCALLY, NOT COMMITTED OR PUSHED.** The hardening below is present in the working tree as a reviewable change. No workflow run, release, deployment, credential rotation or publish action was triggered.

## What was applied

- Removed both `continue-on-error` entries; later steps now run only when earlier steps succeed.
- Added `set -euo pipefail` to every multi-line `run:` block. Removed all `| tail -N`, `|| true` and `2>&1 || echo` exit-code masking. Exit codes are preserved.
- Pinned Actions to full commit SHAs:
  - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2)
  - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0)
- Pinned Playwright to `1.65.1` in a committed `package.json` + `package-lock.json`; CI uses `npm ci` and `npx playwright install --with-deps chromium`.
- Added least-privilege permissions: workflow default `contents: read`; only the `package` and `deals` jobs get `contents: write`.
- Split the workflow into three gated jobs:
  1. `validate` — no secrets, read-only, syntax/JSON/unit/browser checks.
  2. `package` — `needs: validate`; preserves the existing package ID, version, release tag, APK URL and signing secrets.
  3. `deals` — `needs: [validate, package]`; scrape/data commit only, no signing secrets, runs after packaging to avoid concurrent pushes.
- Guarded the scraper with temp output (`DEALS_OUTPUT`/`DEALS_PREVIOUS`), a non-empty candidate check, schema and Facebook-URL validation, `process.exitCode = 1`, and atomic replacement only after a separate CI validation step succeeds. A failed scrape leaves the last good file alone.
- Hash now covers every shell input:
  `sha256sum index.html core.js app.js menu.json hours_overrides.json manifest.webmanifest sw.js icons/*.png | awk '{printf "%s", $1}' > /tmp/shell-hash.txt`
  `APP_SHELL_HASH.txt` was resynced to the matching value. `facebook_deals.json` is excluded because the scraper refreshes it independently.
- Hash commit reports success without a no-op commit when the hash is already current; real commit/push failures still fail the job.
- No change to signing identity, keystore, package ID, release config, APK/AAB assets or repository secrets.

## Validation of this change

- YAML parse: pass for both workflows.
- Syntax, JSON, unit (11/11) and browser (19/19) checks: pass.
- `git`: all changes remain uncommitted; nothing was pushed or published.

## Not included

No key rotation, no release overwrite, no manual publish, no change to the signing identity or package ID. The APK remains unchanged for these web-only fixes because the TWA loads the live site.
