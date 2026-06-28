# Changelog

All notable changes in **mano** relative to upstream
[Pano](https://github.com/oae/gnome-shell-pano) are documented here.

This project adheres to [Keep a Changelog](https://keepachangelog.com/) and
[Semantic Versioning](https://semver.org/) where practical.

## [Unreleased]

mano begins from Pano at upstream version `1004` and is rebranded as an
independent extension (`mano@m4ush3r.github.io`).

### Added
- **GNOME Shell 50 support** (now `45`–`50`).

### Changed
- **Rebranded to an independent identity** — new UUID, D-Bus name
  (`io.github.m4ush3r.Mano`), settings schema, GObject type names and CSS
  classes — so mano installs and runs alongside the original Pano.
- **Privacy-first link previews:** disabled by default. When enabled, mano only
  fetches public `http(s)` URLs — it refuses loopback, link-local (incl.
  `169.254.169.254`), private and multicast addresses, caps redirects at 3
  (re-validating each hop), sends an honest User-Agent, and size/format-checks
  preview images before decoding them.
- Data/cache/db directories are created `0700` and the database file `0600`.

### Fixed
- **Project builds again.** The `validate-color` dependency was fetched from a
  `gitpkg.now.sh` URL that now returns `HTTP 402`, breaking `yarn install`.
  Replaced with a small local validator (`src/utils/colorValidator.ts`).
- **Memory leaks:** removed clipboard items are now destroyed (releasing their
  60s timer and signal handlers); long-lived theme-context and GSettings
  handlers are disconnected on teardown; the search box no longer re-connects a
  handler on every Tab press; stale debounce / selection source ids are cleared.
- A cancelled shutdown no longer wipes history in session-only mode
  (`PrepareForShutdown` now honors its boolean argument).

### Planned
- **Lighter footprint:** drop redundant/replaceable dependencies and dead code.
- **Efficiency:** debounced in-memory search, indexed queries, bounded initial
  load.

---

> mano is based on Pano by Alperen Elhan and contributors, licensed GPL-2.0-or-later.
