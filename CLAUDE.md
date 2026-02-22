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
- **`apps/api`** — Express 5 backend running in Node.js cluster mode. AI calls are offloaded to a dedicated worker pool (`workers/aiWorkerPool.ts`). Routes in `routes/`, business logic in `services/`. See [Express 5 Route Typing](#express-5-route-typing) below.
- **`apps/docs`** — Collaborative document editor with Hocuspocus real-time sync.
- **`apps/sites`** — Site builder/management interface.
- **`apps/mobile`** — Expo 54 / React Native app with Expo Router.
- **`apps/desktop`** — Tauri 2 wrapper around the web frontend.
- **`packages/chat`** — Shared chat UI components, runtime adapters (Assistant UI), stores, and hooks. Consumed by `apps/web` at `/chat`.
- **`packages/shared`** — Shared stores (Zustand), hooks, API clients, and feature modules (sharepic, image-studio, subtitle-editor, media-library, search). Shared components in `src/components/`.
- **`services/mcp`** — Model Context Protocol server.
- **`services/comfyui`** — ComfyUI workflows for local GPU image generation.

### Data Stores

- **PostgreSQL** — Primary DB. Schema at `apps/api/database/postgres/schema.sql`.
- **Redis** — Sessions, caching, rate limiting.
- **Qdrant** — Vector embeddings for semantic search.

### Authentication

Keycloak OIDC via Passport.js. Supports multiple identity providers (.de, .at, .eu domains). Sessions stored in Redis.

#### Dev Auth Bypass (Playwright MCP Testing)

For local Playwright MCP testing without Keycloak, set these env vars and restart dev servers:

| File | Env Vars |
|------|----------|
| `apps/web/.env` | `VITE_E2E_AUTH_BYPASS=true`, `VITE_DEV_AUTH_BYPASS_TOKEN=local-dev-bypass-token` |
| `.env` (root, symlinked to `apps/api/.env`) | `ALLOW_DEV_AUTH_BYPASS=true`, `DEV_AUTH_BYPASS_TOKEN=local-dev-bypass-token` |

**How it works:**
- **Frontend** (`useAuth.ts` queryFn): When `VITE_E2E_AUTH_BYPASS=true`, returns mock authenticated user with all feature flags enabled — no `/api/auth/status` call
- **Backend** (`authMiddleware.ts`): When `x-dev-auth-bypass` header matches `DEV_AUTH_BYPASS_TOKEN`, attaches mock `req.user` and skips Keycloak session check
- **Vite proxy** (`vite.config.ts`): Automatically injects `x-dev-auth-bypass` header on all `/api/*` requests when bypass is active

**Safety:** Backend has a production fail-fast guard — if `ALLOW_DEV_AUTH_BYPASS=true` in production, ALL requests return HTTP 500. `VITE_*` vars are compile-time only and don't exist in production builds. To disable: remove `VITE_E2E_AUTH_BYPASS` from `apps/web/.env` and restart.

### AI Providers

- **Mistral AI** — Primary text generation (EU-hosted).
- **Anthropic Claude via AWS Bedrock** — "Ultra" mode (EU region).
- **Flux (Black Forest Labs)** — Image generation.
- **AssemblyAI / Gladia** — Audio transcription.

## Development Conventions

### Git Safety

**Never use `git stash` or `git stash pop`** without explicit user permission. These commands can silently lose uncommitted work and are almost never necessary.

### Expo Apps

Always use `npx expo install` (not `pnpm add`) for Expo native dependencies to ensure SDK version alignment:
```bash
cd apps/docs-expo && npx expo install <package-name>
cd apps/mobile && npx expo install <package-name>
```

### KeyboardStickyView in Nested Navigators

When using `KeyboardStickyView` (from `react-native-keyboard-controller`) inside nested navigators (e.g., Bottom Tabs > Material Top Tabs), **always set offsets to zero** and handle bottom insets externally via `paddingBottom`:

```tsx
// CORRECT — handle insets externally
<KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
  <View style={{ paddingBottom: insets.bottom + 16 }}>

// WRONG — causes double-counting with nested navigators
<KeyboardStickyView offset={{ closed: Math.max(insets.bottom, 24), opened: 0 }}>
```

The reason: `KeyboardStickyView` positions from the **window bottom** (absolute). Nested tab navigators each add their own safe area handling, so using `insets.bottom` as an offset causes compounding — the input bar ends up behind the Android gesture bar.

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

### shadcn/ui Components

**Prefer shadcn/ui** for new UI components whenever possible. Add components to the appropriate package (`packages/chat` for chat UI, `apps/web` for web-only UI). For chat features, **prefer Assistant UI (`@assistant-ui/react`)** primitives and components — use its built-in thread, composer, message, and runtime APIs before building custom alternatives.

When adding shadcn/ui components to `packages/chat` (or any shared package), **always replace `@/` path aliases with relative imports** after generation. Vite resolves `@/` using the consuming app's alias, not the package's `tsconfig.json` paths, so `@/lib/utils` will fail at runtime.

```tsx
// WRONG — breaks when consumed by apps/web via Vite
import { cn } from "@/lib/utils"

// CORRECT — works in any consuming context
import { cn } from "../../lib/utils"
```

### Docs App (Mantine)

`apps/docs` uses **Mantine v8** (not Tailwind/shadcn). `MantineProvider` lives in each page component (e.g., `EditorPage.tsx`) with `forceColorScheme={colorScheme}`.

- **Color**: Mantine defaults to blue. Always pass `color="var(--primary-600)"` on `Button`, `Badge`, etc. to use the Grünerator green (`#316049`). Destructive actions use `color="red"`.
- **z-index**: Modals use `z-index: 1000`. Mantine `Select`/`Combobox` dropdowns default to ~300 and render in a portal — pass `comboboxProps={{ zIndex: 1100 }}` inside modals.
- **Avatars**: Use `getAvatarDisplayProps()` and `getRobotAvatarPath()` from `@gruenerator/shared/avatar` — renders robot SVGs (`/images/profileimages/{1-9}.svg`) or initials. Don't use Mantine `Avatar`.

### State Management

Zustand for global state. TanStack Query (React Query v5) for server state/data fetching with axios.

### Commits

Conventional Commits enforced by commitlint: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, etc.

### TypeScript

Strict mode. The entire stack is TypeScript — frontend, backend, shared packages, and mobile.

- **Type-only imports**: ESLint enforces `consistent-type-imports` with inline style. Always use `import { type Foo } from './types'` (not `import type { Foo }`). Auto-fixable with `eslint --fix`.

### Express 5 Route Typing

Express 5 changed `req.params` values from `string` to `string | string[]`. All route handlers must declare their params explicitly:

```typescript
// Pass route params as a generic to the request type:
router.get('/:id', async (req: AuthRequest<{ id: string }>, res: Response) => {
  const { id } = req.params; // correctly typed as string
});

// Custom request types (AuthRequest, AuthenticatedRequest, DocumentRequest,
// SubtitlerRequest) all accept an optional params generic P:
router.delete('/:groupId/content/:contentId',
  async (req: AuthRequest<{ groupId: string; contentId: string }>, res: Response) => { ... }
);

// For complex cases, use the getParam() bridge helper:
import { getParam } from '../../utils/params.js';
const id = getParam(req.params, 'id'); // safely extracts string from string | string[]
```

### Code Quality

ESLint (flat config), Prettier, Husky pre-commit hooks (lint-staged), Knip for unused code detection.

- **`allowDefaultProject`**: Do not add files to `packages/eslint-config/base.js` `allowDefaultProject` if they are already discovered by TypeScript's project service (causes a parsing error). Only list files that no `tsconfig.json` covers.

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

# 3. Build the debug APK (single-arch for speed — device is arm64-v8a)
cd apps/docs-expo/android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a

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
- **Fast debug builds**: Pass `-PreactNativeArchitectures=arm64-v8a` to `./gradlew assembleDebug` to build only for the target device arch. The default builds all 4 archs (armeabi-v7a, arm64-v8a, x86, x86_64) which is ~4x slower.
- **Avoid unnecessary `prebuild --clean`**: Only needed when native dependencies change. Incremental `./gradlew assembleDebug` reuses Gradle caches and is much faster.
- **Metro port conflicts in WSL**: Port 8081 is often occupied. Use 8082 and mirror both: `adb reverse tcp:8082 tcp:8082 && adb reverse tcp:8081 tcp:8082` (device app defaults to 8081).
- **DOM component debugging**: `console.log` inside `'use dom'` components goes to the WebView console (Chrome DevTools → Remote Devices), NOT Metro terminal. Render debug state on-screen instead.
- **Hot reload works for JS/TS changes**: When Metro is running, editing TypeScript/JSX files triggers hot reload on the device — no need to rebuild the APK. Only rebuild (`./gradlew assembleDebug`) when native dependencies change. A full APK rebuild for pure JS changes wastes time.
- **Metro cache stale after `--clear` restart**: When restarting Metro with `--clear`, the first bundle takes longer but is fresh. A `Bundled Xms (1 module)` line after changes usually means the cache is stale — restart Metro if this happens.
- **Docs Expo domains**: API is at `docs.gruenerator.eu/api`, Hocuspocus at `docs.gruenerator.eu/hocuspocus` (NOT `gruenerator.eu`).
