# Contributing

Use [GitHub Issues](https://github.com/MidnightRaven9/bismarck-big-boy-app/issues) to report an app bug or propose a feature. Include the device, browser or Android build, affected screen, and the steps you took. For a menu correction, include the item name and a source. Send order and restaurant questions to [Bismarck Big Boy](https://www.bismarckbigboy.com/), and report vulnerabilities through the [private security channel](SECURITY.md).

## Make a change

1. Fork the repository and create a branch from `main`.
2. Follow the [local setup](README.md#getting-started). Use the existing HTML, CSS, and JavaScript conventions.
3. Check the affected screen and any shared navigation at a mobile width. For visual changes, include screenshots. For behavior changes, cover the affected path with the [relevant checks](README.md#checks-and-releases).
4. Open a pull request against `main`. Describe what changed, why it matters, and which checks you ran.

Reuse the CSS variables and shared helpers where they fit. Preserve keyboard focus and reduced-motion behavior when editing interactions. Treat external data as untrusted and follow the existing validation and escaping patterns.

Keep discussions focused on the work. Give specific feedback and respect other contributors.
