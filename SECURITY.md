# Security policy

## Report a vulnerability privately

Use GitHub’s [private vulnerability reporting form](https://github.com/MidnightRaven9/bismarck-big-boy-app/security/advisories/new). Include the affected URL or APK version, the expected and observed behavior, and enough detail for a maintainer to reproduce the issue safely. Keep credentials and personal data out of the report. Use the public issue tracker for ordinary bugs.

For an APK report, start with the [current GitHub release](https://github.com/MidnightRaven9/bismarck-big-boy-app/releases/latest) if you can reproduce the issue there.

## Security boundaries

The app is served as static files, and favorites and alert preferences are stored on the device. Ordering and account interactions are handled by linked services. The app validates data before rendering or caching it and uses a Content Security Policy to limit the origins it can load. See the [security review](SECURITY_REVIEW.md) for implementation details and known limits.

Release credentials are provided through GitHub Actions secrets or a local ignored environment. The packaging process sends signing material to the configured CloudAPK provider. Keep the keystore and password out of Git, public reports, and shared logs.
