# Security Policy

Thank you for helping us keep this project secure!

## Supported versions

- **Latest release** — Fully supported
- **Previous release** — Security fixes for critical issues only

## Reporting a vulnerability

If you believe you have found a security vulnerability, **please do not open a public issue.** Report it privately through the repository's **Security → Report a vulnerability** tab on GitHub, including:

- A short description of the issue
- How to reproduce it
- Your recommended fix (optional, but appreciated)

We will respond within **48 hours**.

## Reporting a bug (non-security)

Please open an issue on GitHub with:
- Steps to reproduce
- Expected vs. actual behavior
- Device + browser version
- Screenshots or recordings (optional)

## Security model overview

Briefly:

- **The app is static**: no server logic, no personal data collection beyond local favorites.
- **XSS hardening**: user-controlled strings (search queries, FB deal titles) are HTML-escaped on insert.
- **CSP**: a content-security-policy meta tag limits script/style/connect/image/frame sources.
- **Secrets**: Android signing key is stored only in GitHub Actions secrets and in gitignored local `release/`.
- **Closed assets**: menu data mirrors bismarckbigboy.com but is updated manually by maintainers.

## Keystore handling (v1+)

The Android signing key is intentionally **not committed** to the public repo. It lives at:

- Local: `release/signing.keystore` (gitignored)
- Remote: GitHub Action secret `ANDROID_KEYSTORE_B64` (base64) and `ANDROID_KEYSTORE_PASSWORD`

Never check these files in. If you have concerns about key security, rotate them via a fresh key and a new Play Store upload cert — contact us for help.

## Policies

- **DoS/Abuse**: don't hammer the PWABuilder CloudAPK API or Pages; if you need to run our full pipeline, do it sparingly.
- **Service worker abuse**: don't commit unauthorized cache-busting or exfiltrating code into `sw.js`/`index.html`.
- **Transparency**: we value security researchers who operate responsibly and disclose through the channel above.
