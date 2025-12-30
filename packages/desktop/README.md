# Grünerator Desktop

Tauri 2.x desktop application for Windows, macOS, and Linux.

## Features

- Native desktop app with system-level integration
- Deep link authentication (`gruenerator://auth/callback`)
- File system access for document management
- Native file dialogs (open/save)
- System notifications
- Window state persistence (remembers size/position)
- Auto-updates via GitHub Releases

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v8+)

### Platform-Specific Dependencies

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

**Linux (Fedora):**
```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel
```

**Linux (Arch):**
```bash
sudo pacman -S webkit2gtk-4.1 base-devel curl wget file openssl \
  libappindicator-gtk3 librsvg
```

**macOS:**
```bash
xcode-select --install
# For universal builds (Intel + Apple Silicon):
rustup target add x86_64-apple-darwin aarch64-apple-darwin
```

**Windows:**
- Install [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  - Select "Desktop development with C++"
  - Include Windows 10/11 SDK
- WebView2 Runtime (auto-installed on Windows 10/11)

## Development

```bash
# Terminal 1: Start frontend dev server
pnpm --filter gruenerator_frontend dev

# Terminal 2: Start Tauri dev mode
cd packages/desktop && pnpm dev
```

The app will open with hot-reload enabled for both frontend and Rust code.

## Building

### Local Build
```bash
pnpm build          # Production build
pnpm build:debug    # Debug build with dev tools
```

Built applications are in `src-tauri/target/release/bundle/`:
- **Windows**: `.msi`, `.exe` (NSIS installer)
- **macOS**: `.dmg`, `.app`
- **Linux**: `.AppImage`, `.deb`

### CI/CD Build (Recommended)

All production builds are handled by GitHub Actions:

1. Create a tag: `git tag desktop-v1.0.0`
2. Push the tag: `git push origin desktop-v1.0.0`
3. GitHub Actions builds for all platforms
4. Artifacts attached to GitHub Release

## Auto-Updates

The app checks for updates from GitHub Releases. To enable:

1. Generate signing keys:
   ```bash
   pnpm signer:generate
   ```

2. Add the public key to `src-tauri/tauri.conf.json`:
   ```json
   "plugins": {
     "updater": {
       "pubkey": "YOUR_PUBLIC_KEY_HERE"
     }
   }
   ```

3. Add secrets to GitHub repository:
   - `TAURI_SIGNING_PRIVATE_KEY`: The private key content
   - `TAURI_KEY_PASSWORD`: The key password (if set)

## Available Plugins

| Plugin | Purpose | Usage |
|--------|---------|-------|
| `@tauri-apps/plugin-fs` | File system access | `import { readTextFile } from '@tauri-apps/plugin-fs'` |
| `@tauri-apps/plugin-dialog` | Native file dialogs | `import { open, save } from '@tauri-apps/plugin-dialog'` |
| `@tauri-apps/plugin-notification` | System notifications | `import { sendNotification } from '@tauri-apps/plugin-notification'` |
| `@tauri-apps/plugin-updater` | Auto-updates | `import { check } from '@tauri-apps/plugin-updater'` |
| `@tauri-apps/plugin-opener` | Open URLs/files | `import { open } from '@tauri-apps/plugin-opener'` |
| `@tauri-apps/plugin-shell` | Shell commands | `import { open } from '@tauri-apps/plugin-shell'` |

## Platform Detection

Use the shared platform utilities for cross-platform code:

```typescript
import { isDesktop, isTauri, getPlatform } from '@gruenerator/shared';

if (isDesktop()) {
  // Desktop-specific code
  const { open } = await import('@tauri-apps/plugin-dialog');
  const file = await open({ multiple: false });
}
```

## Security

- **CSP**: Strict Content Security Policy enabled
- **Prototype Freeze**: Prevents prototype pollution attacks
- **Sandboxed**: macOS uses App Sandbox entitlements
- **Permissions**: Granular capability-based permissions model
