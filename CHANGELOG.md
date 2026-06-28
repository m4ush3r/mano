# Changelog

All notable changes in **mano** relative to upstream
[Pano](https://github.com/oae/gnome-shell-pano) are documented here.

This project adheres to [Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/) where practical.

## [Unreleased]

mano begins from Pano at upstream version `1004` (shell-versions 45–49).

### Fixed
- **Project now builds again.** Upstream pulled the `validate-color` dependency
  from a third-party `gitpkg.now.sh` URL that now returns `HTTP 402`, which
  aborted `yarn install` and made the project impossible to build or install.
  Replaced it with a small, dependency-free local validator
  (`src/utils/colorValidator.ts`) covering CSS hex / `rgb()` / `rgba()` / named
  colors, and removed the dead dependency from `package.json` and
  `rollup.config.mjs`. Verified building and loading cleanly on GNOME Shell 46
  (Wayland).

### Planned
The following are tracked for upcoming releases:
- **Security & privacy hardening:** link previews off by default with
  SSRF / private-address guards, restrictive DB file permissions
  (`0700`/`0600`), broader sensitive-content detection, and guarded D-Bus
  methods.
- **Memory-leak fixes:** destroy removed clipboard items (currently they leak a
  recurring timer and signal handlers), and disconnect long-lived
  `themeContext` / settings handlers on teardown.
- **GNOME 50 support.**
- **Lighter footprint:** drop redundant/replaceable dependencies and dead code.
- **Efficiency:** debounced in-memory search, indexed queries, bounded initial
  load.

---

> mano is based on Pano by Alperen Elhan and contributors, licensed GPL-2.0-or-later.
