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
- **Smart terminal paste:** when *paste on select* targets a terminal, mano now
  sends `Ctrl+Shift+V` (the terminal paste shortcut) instead of `Ctrl+V`, which
  previously did nothing there. Ships with a default list of common terminals
  that is editable in **Settings → General → Terminal Paste**.
- **Quick actions:** right-click an item (or press the `Menu` key) to transform
  or act on its text — UPPERCASE / lowercase, trim whitespace, Base64 and URL
  encode/decode, pretty-print JSON, count characters & words, show a QR code, or
  open it as a link. Text transforms put the result on the clipboard.
- **Snippets:** author reusable text via the indicator menu → **Add snippet…**.
  Snippets are saved as favorites (never pruned by the history limit) and behave
  like any item — searchable, pasteable, and usable with quick actions.

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
- Search now filters the loaded items in memory instead of querying SQLite on
  every keystroke.

### Performance
- Added an index on `copyDate` (every query orders by it).

### Removed
- Dropped the `date-fns`, `is-url`, `hex-color-converter`, `pretty-bytes` and
  `validate-color` dependencies in favor of small local helpers / native APIs,
  and deleted dead code (unused query-builder methods, a no-op `.build()`, a
  redundant index, a duplicate helper).

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
- Consolidate code detection/rendering onto a single syntax library (currently
  both `highlight.js` and `prismjs` are bundled).
- Restore the unit-test runner (`jasmine` is currently missing from devDeps).

---

> mano is based on Pano by Alperen Elhan and contributors, licensed GPL-2.0-or-later.
