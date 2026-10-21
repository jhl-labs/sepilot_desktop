# Sepilot Desktop

Sepilot Desktop is the desktop app for Sepilot, a local-first AI agent. It
starts and talks to the local `sepilotd` daemon over HTTP and WebSocket.

Version: 1.0.8

## License

This repository is **source-available, not open source** under the
[Sepilot Source-Available License](LICENSE). Individuals and businesses may
use the unmodified software, including commercially. Copying, modifying,
redistributing, or using the source in another product requires the copyright
holder's prior written permission. See [LICENSE](LICENSE) for the complete
terms.

## Repository layout

| Path | Contents |
| --- | --- |
| `packages/desktop` | Electron main process, preload and the Next.js renderer |
| `sepilot-cli` | Git submodule: [jhl-labs/sepilot-cli](https://github.com/jhl-labs/sepilot-cli), which provides the daemon and the shared client libraries |
| `scripts` | Release staging, hardening and artifact verification |
| `tools/launcher` | Single-file Windows launcher |

## Build from source

Requirements: Node.js 22.18 or newer, pnpm 10, and git. Windows packaging also
needs a Rust toolchain for the launcher.

```sh
git clone --recurse-submodules https://github.com/jhl-labs/sepilot_desktop.git
cd sepilot_desktop
pnpm install
pnpm build
```

If you cloned without `--recurse-submodules`, run
`git submodule update --init` first.

Package the app for the current platform:

```sh
pnpm dist:linux   # AppImage and deb
pnpm dist:mac     # zip (x64 and arm64), unsigned
pnpm dist:win     # portable single-file exe (requires: cargo build --release --manifest-path tools/launcher/Cargo.toml)
```

Run the app against a development daemon with `pnpm dev`.
