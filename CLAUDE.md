# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Grünerator is an AI-powered content creation platform for the German Green Party (Die Grünen). It's a pnpm monorepo with web, mobile, and desktop clients sharing a common backend. All infrastructure is EU-hosted for data sovereignty.

## Commands

All commands run from the **repository root** using pnpm + Turborepo:

```bash
pnpm install                  # Install all dependencies
pnpm dev:web                  # Frontend dev server (localhost:3000)
pnpm dev:backend              # Backend dev server (requires Postgres, Redis, Keycloak)
pnpm build                    # Build all packages
pnpm build:web                # Build web only
pnpm typecheck                # TypeScript check across all packages
pnpm lint                     # ESLint across all packages
pnpm format:check             # Prettier check
pnpm ci                       # Full CI: typecheck + lint + format:check + test
pnpm test                     # Run all tests
```

Single workspace commands:
```bash
pnpm --filter @gruenerator/api test:auth         # Run auth tests
pnpm --filter @gruenerator/api test:integration  # Run integration tests
pnpm --filter @gruenerator/desktop dev           # Tauri desktop dev
```

## Architecture

### Monorepo Layout

- **`apps/web`** — React 19 + Vite 7 frontend. Feature-sliced design with 26 feature modules in `src/features/`. Routes defined in `src/config/routes.ts`.
- **`apps/api`** — Express 5 backend running in Node.js cluster mode. AI calls are offloaded to a dedicated worker pool (`workers/aiWorkerPool.ts`). Routes in `routes/`, business logic in `services/`.
- **`apps/chat`** — Next.js chat interface using Assistant UI and AI SDK. Runs on port 3210.
- **`apps/docs`** — Collaborative document editor with Hocuspocus real-time sync.
- **`apps/sites`** — Site builder/management interface.
- **`apps/mobile`** — Expo 54 / React Native app with Expo Router.
- **`apps/desktop`** — Tauri 2 wrapper around the web frontend.
- **`packages/shared`** — Shared stores (Zustand), hooks, API clients, and feature modules (sharepic, image-studio, subtitle-editor, tiptap-editor, media-library, search).
- **`services/mcp`** — Model Context Protocol server.
- **`services/comfyui`** — ComfyUI workflows for local GPU image generation.

### Data Stores

- **PostgreSQL** — Primary DB. Schema at `apps/api/database/postgres/schema.sql`.
- **Redis** — Sessions, caching, rate limiting.
- **Qdrant** — Vector embeddings for semantic search.

### Authentication

Keycloak OIDC via Passport.js. Supports multiple identity providers (.de, .at, .eu domains). Sessions stored in Redis.

### AI Providers

- **Mistral AI** — Primary text generation (EU-hosted).
- **Anthropic Claude via AWS Bedrock** — "Ultra" mode (EU region).
- **Flux (Black Forest Labs)** — Image generation.
- **AssemblyAI / Gladia** — Audio transcription.

## Development Conventions

### Expo Apps

Always use `npx expo install` (not `pnpm add`) for Expo native dependencies to ensure SDK version alignment:
```bash
cd apps/docs-expo && npx expo install <package-name>
cd apps/mobile && npx expo install <package-name>
```

### Styling

**Tailwind CSS v4** for new code. Existing CSS continues to work unchanged.

#### New Code (Tailwind)
- Use Tailwind utility classes for all new components and features
- Import the `cn()` utility from `@/utils/cn` for conditional classes:
  ```tsx
  import { cn } from '@/utils/cn';
  <div className={cn('bg-background p-md', isActive && 'border-primary-500')} />
  ```
- Theme tokens are mapped from CSS variables. Available utilities include:
  - **Colors**: `bg-primary-500`, `text-grey-800`, `border-secondary-600`, `bg-background`, `text-foreground`
  - **Spacing**: `p-xs`, `m-md`, `gap-lg` (xxs, xs, sm, md, lg, xl, 2xl)
  - **Shadows**: `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`
  - **Border radius**: `rounded-sm`, `rounded-md`, `rounded-lg`

#### Legacy Code (Plain CSS)
- Design tokens: `apps/web/src/assets/styles/common/variables.css`
- Global styles: `apps/web/src/assets/styles/common/`
- Component styles: `apps/web/src/assets/styles/components/`
- Feature styles: co-located in `apps/web/src/features/**/*.css`

#### Migration Strategy
- **Opportunistic migration**: Convert existing CSS to Tailwind when touching those files
- **New features**: Use Tailwind exclusively
- **Bug fixes in legacy code**: May use either approach, prefer Tailwind for significant changes

#### Theme & Dark Mode
- Dark mode: `[data-theme="dark"]` attribute (works with both CSS and Tailwind)
- CSS variables in `variables.css` remain the source of truth
- Always test UI changes in both light and dark modes

### State Management

Zustand for global state. TanStack Query (React Query v5) for server state/data fetching with axios.

### Commits

Conventional Commits enforced by commitlint: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, etc.

### TypeScript

Strict mode. The entire stack is TypeScript — frontend, backend, shared packages, and mobile.

### Code Quality

ESLint (flat config), Prettier, Husky pre-commit hooks (lint-staged), Knip for unused code detection.

## Deployment

### Test Environment
- **Test URL**: https://beta.gruenerator.de
- **Server**: gruenerator-test.netzbegruenung.verdigado.net
- **Branch**: `test-branch`

### Docker Images
- **Workflow**: "Build and Push Docker Images" (`build-images.yml`)
  - Triggers on push to `master` or `test-branch` (when app/service files change)
  - Manual dispatch with `force_all: true` to rebuild everything
  - Individual services: `build_web`, `build_api`, `build_docs`, `build_mcp`, `build_doku`
  - Registry: `ghcr.io/netzbegruenung/gruenerator-{web,api,docs,mcp,doku}`

### Deploying to Test
1. Merge changes into `test-branch` (e.g. via PR from `master`)
2. Build images run automatically on push, or trigger manually: `gh workflow run "Build and Push Docker Images" --ref test-branch`
3. Deploy runs automatically on push, or trigger manually: `gh workflow run "Deploy to Test Environment" --ref test-branch`
4. Deploy always force-recreates containers (`--force-recreate`)

### Production
- **Workflow**: "Deploy to Production" (`deploy-prod.yml`)
- **Branch**: `master`

### Docs Expo (Android APK)

The `apps/docs-expo` Expo 54 app is built locally as a debug APK:

```bash
# 1. Check project health
cd apps/docs-expo && npx expo-doctor

# 2. (Re)generate native project (always run after dependency changes)
cd apps/docs-expo && npx expo prebuild --platform android --clean

# 3. Build the debug APK
cd apps/docs-expo/android && ./gradlew assembleDebug

# 4. APK output location:
#    apps/docs-expo/android/app/build/outputs/apk/debug/app-debug.apk
# Copy to Windows Downloads (WSL):
cp apps/docs-expo/android/app/build/outputs/apk/debug/app-debug.apk /mnt/c/Users/morit/Downloads/gruenerator-docs-debug.apk

# 5. Install on connected device via USB (WSL → Windows ADB)
ADB=/mnt/c/Users/morit/AppData/Local/Android/Sdk/platform-tools/adb.exe
$ADB install -r 'C:\Users\morit\Downloads\gruenerator-docs-debug.apk'

# 6. Set up Metro dev server for on-device debugging
$ADB reverse tcp:8081 tcp:8081
cd apps/docs-expo && npx expo start --port 8081 --localhost
```

**Notes:**
- Use `npx expo-doctor` (not `expo doctor`) — the local CLI doesn't support it.
- `npx expo install --check` validates dependency versions against SDK 54.
- Metro config overrides (`unstable_enableSymlinks`, `watchFolders`) are required for pnpm monorepo support — expo-doctor warnings about these are expected.
- The `android/` directory is regenerated by prebuild and should not be committed (add to `.gitignore` if needed).
- TypeScript check: `npx tsc --noEmit --project apps/docs-expo/tsconfig.json`
- **URI scheme**: The app uses `gruenerator://` (not `gruenerator-docs://`). Both `app.json` scheme and `auth.ts` `makeRedirectUri` must match.
- **ADB in WSL**: USB devices aren't accessible from WSL — use Windows `adb.exe` with Windows-style paths (`C:\...`), not `/mnt/c/...`.
- **ADB reverse ports are ephemeral**: They reset after app uninstall/reinstall or ADB daemon restarts. Always re-run `adb reverse` after reinstalling.
- **Signature conflicts on reinstall**: `expo prebuild --clean` regenerates the debug keystore. Must `adb uninstall` before `adb install` (no `-r`) to avoid signature mismatch.
- **Yjs/lib0 dependency**: `isomorphic-webcrypto` is required for the Yjs collaboration layer used by BlockNoteEditor DOM components. If missing, the DOM bundle fails silently and documents show blank pages.
