# Grünerator Docs Desktop

Tauri 2 desktop wrapper for the Grünerator Docs collaborative document editor.

## Prerequisites

- [Rust](https://rustup.rs/) toolchain
- [Tauri CLI prerequisites](https://v2.tauri.app/start/prerequisites/)
- pnpm (workspace root)

## Development

```bash
# Terminal 1: Start the docs frontend dev server
pnpm --filter @gruenerator/apps-docs dev

# Terminal 2: Start the Tauri desktop shell
cd apps/docs-desktop && pnpm dev
```

The Tauri dev shell connects to `http://localhost:3002` (the docs dev server).

## Production Build

```bash
# From repo root
pnpm build:docs-desktop

# Or from this directory
pnpm build
```

## Pre-flight Check

Validates the build environment before CI:

```bash
pnpm preflight
```

## Architecture

- **Frontend**: `apps/docs` (React 19 + BlockNote + Hocuspocus)
- **Desktop shell**: `apps/docs-desktop/src-tauri` (Tauri 2 / Rust)
- **Deep link scheme**: `gruenerator-docs://`
- **WebSocket**: Hocuspocus real-time collaboration via `ws://localhost:1240` (dev) / `wss://*.gruenerator.eu` (prod)
