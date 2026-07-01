# mano — Clipboard Manager for GNOME Shell

[![TypeScript](https://badgen.net/badge/icon/typescript?icon=typescript&label)](#)
[![License: GPL v2+](https://img.shields.io/badge/License-GPLv2%2B-blue.svg)](./LICENSE)

**mano** is a fast, content-aware clipboard manager for GNOME Shell on Wayland.

> **Origin & credit:** mano started as a fork of the (now unmaintained)
> [Pano — Clipboard Manager](https://github.com/oae/gnome-shell-pano) by
> **Alperen Elhan** and its contributors, and is evolving into its own project
> with continued maintenance, security hardening, and new features. mano remains
> free software under **GPL-2.0-or-later**. See [NOTICE](./NOTICE) for full
> attribution and [CHANGELOG.md](./CHANGELOG.md) for what has changed.

## Features

- ⌨️ Keyboard-driven navigation — see [Navigation](#navigation)
- 🧠 Content-aware previews & notifications (Image, Link, Text, Code, Color, Emoji, File)
- 🎨 Highly customizable UI
- ⭐ Favorite items and access them quickly
- 🔒 Privacy-conscious: incognito mode, app exclusions, and session-only history

> ℹ️ mano is under active modernization. See [CHANGELOG.md](./CHANGELOG.md) for
> the current state and the roadmap (a lighter footprint and efficiency work).

## Screenshots

_Fresh screenshots of mano will be added here. (Place images in
`assets/screenshots/` and reference them with relative paths.)_

## Supported GNOME Shell versions

- GNOME Shell **45, 46, 47, 48, 49, 50**

## Requirements

mano needs `libgda` and `gsound`:

- **Fedora:** `sudo dnf install libgda libgda-sqlite`
- **Arch Linux:** `sudo pacman -S libgda6`
- **Ubuntu/Debian:** `sudo apt install gir1.2-gda-5.0 gir1.2-gsound-1.0`
- **openSUSE:** `sudo zypper install libgda-6_0-sqlite typelib-1_0-Gda-6_0 typelib-1_0-GSound-1_0`

Both libgda 5.0 and 6.0 are supported.

## Installation

First install the [runtime requirements](#requirements) above (`libgda` +
`gsound`) for your distro — mano needs them regardless of how you install it.

> mano is an independent extension with its own UUID (`mano@m4ush3r.github.io`),
> D-Bus name, and settings schema, so it installs and runs side by side with the
> original Pano without conflicts.

### Option A — Install the prebuilt package (recommended)

No build tools needed.

1. Download `mano@m4ush3r.github.io.zip` from the
   [**Releases**](https://github.com/m4ush3r/mano/releases) page.
2. Install it:

   ```sh
   gnome-extensions install --force ~/Downloads/mano@m4ush3r.github.io.zip
   ```

3. **Log out and back in** (on Wayland, GNOME Shell only loads new extensions at
   login — a session restart isn't enough).
4. Enable it:

   ```sh
   gnome-extensions enable mano@m4ush3r.github.io
   ```

   (Or toggle it on in the **Extensions** / **Extension Manager** app.)

### Option B — Build from source (only if you need to)

Use this if there's no prebuilt package for you, or you want the latest
unreleased changes. Requires **Node.js 20.17+ / 22+ / 24+**.

```sh
git clone https://github.com/m4ush3r/mano.git
cd mano
corepack enable            # provides yarn
yarn install
yarn build:package         # produces dist/mano@m4ush3r.github.io.zip
gnome-extensions install --force dist/mano@m4ush3r.github.io.zip
```

Then **log out and back in**, and enable it:

```sh
gnome-extensions enable mano@m4ush3r.github.io
```

> **Developing mano?** Instead of packaging, symlink the build output and use
> the watcher:
>
> ```sh
> yarn build
> ln -s "$PWD/dist" "$HOME/.local/share/gnome-shell/extensions/mano@m4ush3r.github.io"
> yarn watch   # rebuilds on change (still needs a re-login to reload on Wayland)
> ```

### Uninstall

```sh
gnome-extensions uninstall mano@m4ush3r.github.io
```

## Usage

### Navigation

- `<super>` `<shift>` `v` — toggle mano's visibility (configurable in settings)
- `<ctrl>` `<super>` `<shift>` `v` — toggle incognito mode
- `left` / `right` — navigate between items (`left` on the first item focuses the search box)
- `up` / `down` — move between the search box and items
- `enter` or click — copy the item (hold `shift` to also paste, e.g. into a terminal)
- Type anywhere — focus the search box and filter
- `delete` — remove the focused item
- `tab` / `shift`+`tab` — cycle item types (image, link, …)
- `backspace` on an empty search box — clear the item-type filter
- `ctrl`+`s` — favorite / unfavorite
- `alt` — switch between favorites and all items
- `ctrl`+`1`…`9` — copy the item at that index
- `ctrl`+`click` / `ctrl`+`enter` — copy a link and open it in the browser (if enabled)

### CLI

```sh
busctl --user call org.gnome.Shell /io/github/m4ush3r/Mano io.github.m4ush3r.Mano clearHistory  # clear history
busctl --user call org.gnome.Shell /io/github/m4ush3r/Mano io.github.m4ush3r.Mano toggle        # toggle window
busctl --user call org.gnome.Shell /io/github/m4ush3r/Mano io.github.m4ush3r.Mano hide          # hide window
busctl --user call org.gnome.Shell /io/github/m4ush3r/Mano io.github.m4ush3r.Mano show          # show window
```

## Contributing

Issues and pull requests are welcome. By contributing you agree your changes are
licensed under GPL-2.0-or-later.

## License

mano is licensed under the **GNU General Public License v2.0 or later**
(GPL-2.0-or-later), inherited from the upstream Pano project. See [LICENSE](./LICENSE).

Copyright © Alperen Elhan and the Pano contributors (original work).
Copyright © 2026 the mano contributors (modifications).
