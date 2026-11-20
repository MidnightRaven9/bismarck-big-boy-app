# Contributing

Thank you for your interest in contributing to Bismarck Big Boy! We welcome community contributions.

## Table of Contents
- [Getting started](#getting-started)
- [Development setup](#development-setup)
- [Working on a change](#working-on-a-change)
- [Code style](#code-style)
- [Submitting a pull request](#submitting-a-pull-request)
- [Community guidelines](#community-guidelines)

## Getting started

1. Fork the repo on GitHub.
2. Clone your fork locally.
3. Set up the dev environment (see [Developer Setup](README.md#developer-setup)).
4. Create a branch for your work.

## Development setup

```bash
git clone https://github.com/YOUR_USERNAME/bismarck-big-boy-app.git
cd bismarck-big-boy-app
python3 -m http.server 8000   # or: npm -g serve / npx serve
```

Then open http://localhost:8000/

## Working on a change

1. Pick an issue or feature to work on.
2. Create a branch (e.g., `feature/live-music`).
3. Make your changes.
4. Test locally (`python3 -m http.server 8000` + visit the page).
5. Verify nothing broke (menu, search, favs, etc.).

## Code style

- **Single-file app**: keep edits in `index.html`; do not split the app into modules.
- **Comments**: only the *why*, not the *what* — if a line is obvious, don't comment it.
- **No emojis in UI text.** Use words or SVGs (the app uses SVGs from an inline sprite).
- **HTML changes**: prefer semantic markup (`<section id="...">`, `data-*` attributes).
- **CSS**: use the CSS variables from `:root` (don't hardcode brand colors elsewhere).
- **JS**: keep it plain — no build step, no webpack, no TypeScript.
- **XSS-safe**: any dynamic string inserted into `innerHTML` must be escaped via `escapeHtml()`.
- **Touch-friendly**: buttons and targets ≥ 40px.
- **Reduced motion**: add transitions to `.anim` classes and honor `prefers-reduced-motion`.

## Submitting a pull request

1. Push your branch to your fork.
2. Open a PR against `main` on the original repo.
3. Use the PR template (title, problem, solution, how-verified).
4. Before submitting, run:
   ```bash
   node --check index.html && node --check scripts/*.js && python3 -m py_compile scripts/*.py
   ```

## Community guidelines

- **Be respectful.** Be kind to contributors and users; follow our [conduct guide](CODE_OF_CONDUCT.md).
- **No harassment.** Targeted harassment of any contributor will result in mute/block.
- **Safe spaces.** Report issues at any time; we take feedback seriously.

## Questions?

File an issue or message the maintainer directly. We try to respond within 48 hours.

---

Thanks for making the Bismarck Big Boy app better for everyone!
