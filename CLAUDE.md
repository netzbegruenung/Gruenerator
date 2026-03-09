# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Environment**: This project is developed on **WSL2** (Windows Subsystem for Linux). ADB, Gradle, and other Android tools use Windows executables via `/mnt/c/`. See platform-specific notes throughout.

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

> **WSL RAM constraint**: `pnpm typecheck` is expensive. Only run typechecks on **newly created files** (`npx tsc --noEmit <file>`) or **before pushing**. Do not run full-project typechecks during routine edits.

## Architecture

### Monorepo Layout

- **`apps/web`** — React 19 + Vite 7 frontend. Feature-sliced design with 26 feature modules in `src/features/`. Routes defined in `src/config/routes.ts`.
- **`apps/api`** — Express 5 backend running in Node.js cluster mode. AI calls are offloaded to a dedicated worker pool (`workers/aiWorkerPool.ts`). Routes in `routes/`, business logic in `services/`. See [Express 5 Route Typing](#express-5-route-typing) below.
- **`apps/docs`** — Collaborative document editor with Hocuspocus real-time sync.
- **`apps/sites`** — Site builder/management interface.
- **`apps/mobile`** — Expo 55 / React Native 0.83 app with Expo Router.
- **`apps/desktop`** — Tauri 2 wrapper around the web frontend.
- **`packages/chat`** — Shared chat UI components, runtime adapters (Assistant UI), stores, and hooks. Consumed by `apps/web` at `/chat`.
- **`packages/shared`** — Shared stores (Zustand), hooks, API clients, and feature modules (sharepic, image-studio, subtitle-editor, media-library, search). Shared components in `src/components/`.
- **`services/mcp`** — Model Context Protocol server. See [MCP Server](#mcp-server) below.
- **`services/comfyui`** — ComfyUI workflows for local GPU image generation.

### Data Stores

- **PostgreSQL** — Primary DB. Schema at `apps/api/database/postgres/schema.sql`.
- **Redis** — Sessions, caching, rate limiting.
- **Qdrant** — Vector embeddings for semantic search.

### MCP Server

The Grünerator MCP server (`services/mcp`) provides semantic search over Green party documents via the Model Context Protocol.

- **Public URL**: `https://mcp.gruenerator.eu`
- **Transport**: Streamable HTTP (`POST /mcp`) — requires `Accept: application/json, text/event-stream` header
- **Collections**: `oesterreich`, `deutschland`, `bundestagsfraktion`, `gruene-de`, `gruene-at`, `kommunalwiki`, `boell-stiftung`, `examples`

#### Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with uptime, cache stats, request counts |
| `GET /metrics` | Detailed metrics (memory, performance breakdown) |
| `GET /.well-known/mcp.json` | Auto-discovery manifest |
| `GET /config/:client` | Client-specific config (`claude`, `cursor`, `vscode`, `chatgpt`) |
| `GET /info` | Server info with all tools, resources, and collections |
| `POST /mcp` | MCP protocol endpoint (JSON-RPC over Streamable HTTP) |

#### Available MCP Tools

| Tool | Description |
|------|-------------|
| `gruenerator_search` | Hybrid/vector/text search across party program collections |
| `gruenerator_person_search` | Look up Green politicians with enriched Bundestag DIP API data |
| `gruenerator_examples_search` | Find social media examples (Instagram/Facebook) |
| `gruenerator_get_filters` | Get available filter values for a collection before filtering |
| `gruenerator_cache_stats` | View embedding and search cache statistics |
| `get_client_config` | Generate MCP client configurations |

#### Testing with curl

```bash
# Health check
curl -s https://mcp.gruenerator.eu/health | jq

# Initialize MCP session
curl -s -D - https://mcp.gruenerator.eu/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0.0"}}}'
# → Note the Mcp-Session-Id header in the response

# Call a tool (replace SESSION_ID)
curl -s https://mcp.gruenerator.eu/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: SESSION_ID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"gruenerator_search","arguments":{"query":"Klimaschutz","collection":"deutschland","limit":3}}}'
```

#### Testing in Claude Code

The MCP server is configured as a remote MCP server in this project. Tools are deferred-loaded — use `ToolSearch` to activate them, then call directly:

```
ToolSearch: "select:mcp__claude_ai_Gr_nerator__gruenerator_search"
→ then call mcp__claude_ai_Gr_nerator__gruenerator_search with query + collection
```

### Adding a New Landesverband Notebook

All Landesverbände share a single Qdrant collection (`landesverbaende_documents`) and are distinguished by `defaultFilter` on the `landesverband` metadata field. Adding a new one requires touching **9 files** (8 modified + 1 new).

#### Naming Conventions

| Concept | Pattern | Example (MV) |
|---------|---------|--------------|
| System collection ID | `{name}-system` | `mecklenburg-vorpommern-system` |
| Notebook ID | `{name}-notebook` | `mecklenburg-vorpommern-notebook` |
| Collection key | `{name}` | `mecklenburg-vorpommern` |
| Page config key | `camelCase` | `mecklenburgVorpommern` |
| URL path | `/gruene-{name}` | `/gruene-mecklenburg-vorpommern` |
| Scraper source IDs | `{name}-lv`, `{name}-fraktion` | `mecklenburg-vorpommern-lv` |

#### Files to Modify

1. **`apps/api/config/systemCollectionsConfig.ts`** — Add `{name}-system` entry to `SYSTEM_COLLECTIONS` with `qdrantCollection: 'landesverbaende_documents'` and `defaultFilter` matching the scraper `shortName` values (e.g., `['MV', 'MV-F']`).

2. **`apps/api/routes/chat/agents/directSearch.ts`** — Add `{name}` entry to `COLLECTION_MAP` pointing to `landesverbaende_documents` and the system ID.

3. **`apps/api/config/notebookCollectionMap.ts`** — Add `{name}-notebook: ['{name}']` to `NOTEBOOK_COLLECTION_MAP`.

4. **`apps/web/src/features/notebook/config/notebooksConfig.js`** — Add gallery card to `PRODUCTION_NOTEBOOKS` with `category: 'landesebene'`.

5. **`apps/web/src/features/notebook/config/notebookPagesConfig.js`** — (a) Add standalone page config with `camelCase` key. (b) Add to the `gruenerator` multi-source `collections` array.

6. **`apps/web/src/config/routes.ts`** — (a) Add lazy component via `createNotebookPage('camelCaseKey')`. (b) Add to `GrueneratorenBundle`. (c) Add route entry `{ path: '/gruene-{name}', ... }`.

7. **`packages/chat/src/lib/mentionables.ts`** — Add to `notebookMentionables` array with a short `mention` alias (e.g., `'mv'`).

8. **`apps/api/scrape-{name}.ts`** (NEW) — Runner script based on `scrape-berlin.ts` template. Sources should match the IDs from `landesverbaendeConfig.ts`.

#### Prerequisite: Scraper Config

Before adding the notebook, ensure the scraper config exists in `apps/api/config/landesverbaendeConfig.ts`. The `shortName` field (e.g., `'MV'`, `'MV-F'`) becomes the `defaultFilter` value in the system collection.

#### Verification

```bash
pnpm typecheck          # No type errors
pnpm lint               # No lint violations
pnpm build:web          # Frontend builds
# Then manually: visit /gruene-{name}, check /notebook gallery, type @alias in chat
```

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

**Before creating a PR**, always run `git fetch origin master` (or the target branch) to ensure the local remote ref is up to date. This prevents PRs from being based on stale data.

**Always use regular merge** (not squash merge) when merging PRs. `test-branch` is a long-lived branch that is reused across releases. Squash merges create new commit SHAs, so the original commits remain "unknown" to git — subsequent PRs from the same branch accumulate all old commits as if they were new. Regular merges preserve commit identity and keep the history clean.

**PR merges require admin access.** `gh pr merge` will fail because branch protection rules require admin privileges. Always ask the user to merge the PR manually via the GitHub UI or with their admin credentials.

### Expo Apps

**Load Expo skills** when working on `apps/mobile` or `apps/docs-expo`. These skills contain up-to-date API references beyond the LLM's training cutoff:
- `upgrading-expo:upgrading-expo` — SDK upgrade procedures and breaking changes
- `expo-app-design:building-ui` — UI patterns, navigation, animations
- `expo-app-design:data-fetching` — Network requests, caching, offline support
- `expo-deployment:deployment` — App Store / Play Store deployment

Always use `npx expo install` (not `pnpm add`) for Expo native dependencies to ensure SDK version alignment:
```bash
cd apps/docs-expo && npx expo install <package-name>
cd apps/mobile && npx expo install <package-name>
```

### expo-image (Expo Apps)

**Always use `expo-image`** (`import { Image } from 'expo-image'`) instead of React Native's built-in `Image` component in all Expo apps (`apps/mobile`, `apps/docs-expo`). React Native's `Image` cannot render SVGs — robot avatar URLs (`https://gruenerator.eu/images/profileimages/{id}.svg`) appear as blank space. `expo-image` handles SVGs, WebP, animated images, and has better caching/performance.

```tsx
// WRONG — SVGs render as blank
import { Image } from 'react-native';

// CORRECT — supports SVG, WebP, animated formats
import { Image } from 'expo-image';
<Image source={{ uri: url }} style={styles.image} contentFit="cover" />
```

### Expo SDK 55 (Current)

Both `apps/mobile` and `apps/docs-expo` run **Expo SDK 55** (React Native 0.83, React 19.2). Key differences from SDK 54:

- **New versioning**: All `expo-*` packages now share the SDK major version (e.g. `expo-image@~55.0.5` instead of `~3.0.11`)
- **`newArchEnabled`** — Removed from `app.json`. New Architecture is the only option since SDK 53.
- **`edgeToEdgeEnabled`** — Removed from `app.json`. Mandatory on Android 16+ (API 36).
- **`softwareKeyboardLayoutMode: "adjustNothing"`** — Removed from valid schema values. Use `react-native-keyboard-controller` instead.
- **`resolver.unstable_enablePackageExports`** — Now default in Metro. Removed from `metro.config.js`.
- **`expo-av`** — Removed from Expo Go. Use `expo-audio` + `expo-video` instead.
- **`expo-constants`** — Implicit dependency, no need to list in `package.json` (but keep if directly imported).

#### Upgrading SDK

```bash
cd apps/mobile  # or apps/docs-expo
npx expo install expo@^<version>.0.0 --fix
# Then manually: pnpm add react@<expected> react-dom@<expected>
# Remove newArchEnabled, edgeToEdgeEnabled from app.json
# Remove unstable_enablePackageExports from metro.config.js
# Delete android/ and ios/ dirs (CNG regenerates them)
npx expo-doctor@latest  # Verify
```

### expo-file-system (SDK 55+)

`expo-file-system` uses a **class-based API** (`File`, `Directory`, `Paths`). The legacy function-based API (`cacheDirectory`, `writeAsStringAsync`, `EncodingType`) is deprecated and throws at runtime — use `expo-file-system/legacy` only as a last resort.

```tsx
import { File, Directory, Paths } from 'expo-file-system';

// Write bytes to cache
const file = new File(Paths.cache, 'export.pdf');
file.write(new Uint8Array(buffer));   // accepts string or Uint8Array
file.write('Hello, world!');          // string defaults to UTF-8

// Read
const text = file.textSync();         // sync
const text2 = await file.text();      // async
const bytes = await file.bytes();     // Uint8Array
const b64 = await file.base64();      // base64 string

// File properties (no async needed)
file.exists;   // boolean
file.size;     // number (bytes)
file.uri;      // file:// URI (read-only, changes on move/rename)
file.type;     // MIME type string

// Download
const downloaded = await File.downloadFileAsync(url, new Directory(Paths.cache, 'downloads'));

// Directories
Paths.cache;     // Directory — system-clearable cache
Paths.document;  // Directory — persistent storage
Paths.bundle;    // Directory — bundled assets (read-only)
```

### Keyboard Handling in Tab Navigators

**Never use `KeyboardStickyView`** inside a Bottom Tab navigator. It positions from the **window bottom** (absolute), but the tab content area doesn't reach the window bottom — the tab bar sits below it. When the keyboard opens and Android hides the tab bar, `KeyboardStickyView`'s translation overshoots by the tab bar height, creating a gap between the input and the keyboard.

**Use `KeyboardAvoidingView`** from `react-native-keyboard-controller` instead. It works within the flex layout by adding padding, not by absolute-positioning from the window bottom. Wrap the screen content (not just the input):

```tsx
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

// WRONG — KeyboardStickyView creates gap equal to tab bar height
<KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
  <ComposerRoot>...</ComposerRoot>
</KeyboardStickyView>

// CORRECT — KeyboardAvoidingView wraps the screen content
<KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
  <ThreadRoot style={{ flex: 1 }}>
    <ThreadMessages ... />
    <ComposerRoot style={{ paddingBottom: insets.bottom }}>
      ...
    </ComposerRoot>
  </ThreadRoot>
</KeyboardAvoidingView>
```

The `paddingBottom: insets.bottom` on the composer handles safe area when the keyboard is closed. When the keyboard opens, `KeyboardAvoidingView` adds padding that pushes the composer above the keyboard.

### Assistant UI ComposerInput (React Native)

**Never use `ComposerInput` from `@assistant-ui/react-native` directly.** It renders a fully controlled `<TextInput value={text} />` that reads every keystroke back from the store. On Android, the async JS→native round-trip causes the cursor to jump back one character when typing fast, making input feel laggy.

Instead, use an **uncontrolled `TextInput`** that writes to the store but never reads `value` back:

```tsx
import { useAui } from '@assistant-ui/react-native';

// WRONG — controlled, cursor jumps on fast typing
<ComposerInput multiline />

// CORRECT — uncontrolled, syncs to store without reading back
const aui = useAui();
const inputRef = useRef<TextInput>(null);
<TextInput
  ref={inputRef}
  multiline
  onChangeText={(v) => aui.composer().setText(v)}
/>
// Clear natively on send:
inputRef.current?.clear();
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

#### Tailwind v4 Gotchas

**`max-w-*` uses spacing scale, not legacy named sizes.** In Tailwind v4, `max-w-md` maps to `var(--spacing-md)` (16px), NOT `28rem` (448px) like in v3. This project defines custom spacing tokens (`--spacing-sm: 12px`, `--spacing-md: 16px`, `--spacing-lg: 24px`, etc.), which override the v3 named sizes. **Always use explicit values for max-width:**
```tsx
// WRONG — resolves to 16px in this project
<DialogContent className="sm:max-w-md">

// CORRECT — explicit rem value
<DialogContent className="sm:max-w-[28rem]">
```

Affected utilities: `max-w-sm` (12px), `max-w-md` (16px), `max-w-lg` (24px), `max-w-xl` (32px), `max-w-2xl` (48px). Unaffected: `max-w-3xl` through `max-w-7xl` (no spacing tokens defined), `max-w-screen-*`, `max-w-[arbitrary]`.

**`fixed` does not set `inset: 0`.** In v3, `fixed` implicitly set `inset: 0`, so `w-full` on a fixed element meant viewport width. In v4, it doesn't — `w-full` computes from the element's containing block. For centered fixed dialogs, use:
```tsx
// WRONG (v3 pattern) — w-full computes to ~0px
<div className="fixed top-[50%] left-[50%] w-full translate-x-[-50%] translate-y-[-50%]">

// CORRECT (v4 pattern) — explicit inset + margin auto centering
<div className="fixed inset-0 m-auto h-fit w-full max-w-[32rem]">
```

**`mx-auto` in flex column collapses width.** A child with `mx-auto` inside a `display: flex; flex-direction: column` parent collapses to content width (auto margins absorb free space on the cross axis). Add `w-full` to fill the parent:
```tsx
// WRONG — collapses to content width
<main className="flex flex-col">
  <div className="mx-auto max-w-screen-2xl px-md">

// CORRECT — fills parent, max-width caps on wide screens
<main className="flex flex-col">
  <div className="w-full mx-auto max-w-screen-2xl px-md">
```

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
- **Use semantic color tokens instead of hardcoded grey pairs.** Prefer `text-foreground` over `text-grey-800 dark:text-grey-100`, and `text-foreground-heading` over manual dark overrides. This keeps dark mode automatic:
  ```tsx
  // WRONG — hardcoded light/dark pair
  <h2 className="text-grey-800 dark:text-grey-100">

  // CORRECT — semantic token, auto-adapts
  <h2 className="text-foreground">
  ```
  Available semantic tokens: `text-foreground` (body), `text-foreground-heading` (headings), `bg-background`, `bg-background-alt`, `bg-background-pure`

#### CSS Variable Names — Do NOT Invent Variables

This project uses specific CSS variable names defined in `variables.css`. **Never use generic-sounding variable names that don't exist.** Common mistakes:

| Wrong (undefined)       | Correct (defined)                                      |
|-------------------------|--------------------------------------------------------|
| `--text-primary`        | `--font-color` or Tailwind `text-foreground`           |
| `--text-tertiary`       | `--font-color-muted` or Tailwind `text-grey-400`       |
| `--border-default`      | `--border-subtle` or Tailwind `border-grey-200 dark:border-grey-700` |
| `--border-color`        | `--card-border` / `--border-subtle` or Tailwind border tokens |
| `--border-radius`       | Use Tailwind `rounded-lg` directly                     |
| `--border-radius-medium`| Use Tailwind `rounded-lg` directly                     |
| `--background-hover`    | `--hover-color-alt` or Tailwind `bg-hover-alt`         |
| `--background-active`   | No variable — use Tailwind `bg-grey-100 dark:bg-grey-800` |
| `--background-subtle`   | No variable — use Tailwind `bg-grey-100`               |
| `--bg-color`            | `--background-color` or Tailwind `bg-background`       |
| `--primary-color`       | `--primary-600` or Tailwind `text-primary-600`         |

When in doubt, **prefer Tailwind utility classes** over CSS variables. Only use `var(--...)` for variables confirmed in `variables.css`.

### shadcn/ui Components

**Prefer shadcn/ui** for new UI components whenever possible. Add components to the appropriate package (`packages/chat` for chat UI, `apps/web` for web-only UI). For chat features, **prefer Assistant UI (`@assistant-ui/react`)** primitives and components — use its built-in thread, composer, message, and runtime APIs before building custom alternatives.

#### Adding Components via CLI

Both `apps/web` and `packages/chat` have `components.json` configured for the shadcn CLI:

```bash
# Add a component to apps/web
cd apps/web && npx shadcn@latest add <component-name>

# Add a component to packages/chat
cd packages/chat && npx shadcn@latest add <component-name>
```

**After running the CLI, always adapt the generated output:**
1. **Fix import order** — ESLint requires external packages (e.g., `radix-ui`) before `react`. The CLI generates `react` first.
2. **Replace standard shadcn tokens** with project theme tokens. The project does NOT define standard shadcn color tokens like `bg-popover`, `text-popover-foreground`. Use the project's custom tokens instead:
   - `bg-popover` → `bg-background-pure`
   - `text-popover-foreground` → (remove, inherits from parent)
   - `bg-foreground text-background` → `bg-grey-900 text-white dark:bg-grey-700 dark:text-grey-200`
   - `border` (bare) → `border border-grey-200 dark:border-grey-700`
   - `shadow-md` → `shadow-lg` (matching existing dropdown-menu pattern)
3. **Remove `"use client"`** — not needed in Vite (only relevant for Next.js RSC).
4. Reference existing components (`dropdown-menu.tsx`, `dialog.tsx`) as the canonical style guide.

#### `apps/web` Config (`apps/web/components.json`)
- `aliases.utils` → `@/utils/cn` (not the default `@/lib/utils`)
- `aliases.ui` → `@/components/ui`
- `style` → `new-york`
- Components land in `apps/web/src/components/ui/`

#### `packages/chat` Caveat

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

### Locale-Aware Backend Code

The platform serves both **German (`de-DE`)** and **Austrian (`de-AT`)** users. All backend code that generates content, searches documents, or constructs prompts **must be locale-aware**. Never hardcode party names or collection lists.

#### Rules
1. **Party name**: Use `{{partyName}}` placeholder in prompt strings — `assemblePromptGraphAsync` / `localizePlaceholders()` replaces it with the locale-specific name (`Bündnis 90/Die Grünen` for DE, `Die Grünen – Die Grüne Alternative` for AT). Also available: `{{partyNameShort}}`, `{{partyNameGenitive}}`.
2. **Qdrant collections**: Filter by locale before searching. Austrian collections: `oesterreich_gruene_documents`, `gruene_at_documents`. German collections: `grundsatz_documents`, `bundestag_content`, `kommunalwiki_documents`, `gruene_de_documents`.
3. **Web search queries**: Never append a hardcoded party name to search queries. Use locale-aware party name or omit it.
4. **`enrichRequest()` requires `req` as 3rd argument** for locale extraction: `enrichRequest(body, options, req)`. Passing `req` inside the options object does NOT work — the function only reads locale from the 3rd parameter.
5. **Direct `aiWorkerPool.processRequest` calls** bypass the localization pipeline entirely. Prefer routing through `assemblePromptGraphAsync` when possible, or call `localizePlaceholders(prompt, extractLocaleFromRequest(req))` manually.

#### Locale utilities (`services/localization/index.ts`)
- `extractLocaleFromRequest(req)` — reads locale from user profile → `x-user-locale` header → `Accept-Language` → defaults `de-DE`
- `localizePlaceholders(text, locale)` — replaces `{{partyName}}`, `{{partyNameGenitive}}`, `{{partyNameShort}}`
- `getDefaultCollectionsForLocale(locale)` — returns chat-facing collection names per locale

### Gender-Neutral Language (Gendern)

All user-facing German text **must use gender-neutral language** with the **Genderstern (`*`)**. This is the standard form for Green Party communications.

#### Rules
1. **Role labels**: Use `*in` (singular) or `*innen` (plural) — e.g. `Eigentümer*in`, `Bearbeiter*in`, `Betrachter*in`, `Autor*in`
2. **Articles + role**: When a gendered article (`der/die`) precedes the role, rephrase to avoid it — e.g. "Nur der Ersteller kann..." → "Nur die erstellende Person kann...", "Du bist nicht der Besitzer" → "Du bist nicht Besitzer*in"
3. **Placeholders/labels**: Prefer neutral constructions — e.g. "Name des Erstellers" → "Name der erstellenden Person"
4. **Exceptions**: Standard legal text (Impressum, Datenschutz) and compound nouns that aren't role-based (e.g. "Mitgliederversammlung") can remain unchanged
5. **Email templates**: Permission labels in notification emails must also be gendered (`Eigentümer*in`, not `Eigentümer`)

### Newsletter Writing Style

Newsletters are sent via Brevo (Sendinblue) and archived in Docusaurus at `documentation/docs/newsletter/`. When writing new newsletters, follow the established voice:

#### Tone & Voice
- **Personal "du"-Ansprache** — direct, informal, like talking to a friend
- **Mix of "ich" (Moritz) and "wir" (the project/community)** — personal voice for decisions and plans, collective voice for shared goals
- **Conversational, almost spoken language** — short sentences, rhetorical pauses, sentence fragments for emphasis ("Und dann? Fand TikTok ohne uns statt.")
- **Sign-off**: First name only ("Moritz"), no formal closing

#### Structure
- **Rhetorical question headers** — section titles are questions ("Was heißt das?", "Wie machen wir das?", "Warum so schnell?")
- **Short paragraphs** — many single-sentence paragraphs for dramatic effect
- **Vision first, then practical** — lead with big-picture motivation, follow with concrete how-to
- **Clear call-to-action** — each newsletter has a specific ask (beta testing, feedback, conversations)

#### Content Patterns
- **Political urgency as motivator** — connect features to democratic values and Green principles
- **Balanced tech optimism** — pro-innovation but acknowledges risks (CO2, KI-Bloat, data privacy)
- **Technical concepts explained simply** — no jargon without plain-language explanation
- **Green values woven naturally** — European sovereignty, data privacy, open source, sustainability
- **Self-aware about project status** — honest about being a "Freizeit-Projekt", acknowledges early-stage bugs
- **Branded language** — "Grünerieren" as a verb, "Grünerierung" as a noun

#### Formatting
- **Brevo template variables**: `{{ contact.VORNAME | default : " " }}` for personalization
- **Emoji**: Used sparingly, only for CTAs (e.g., `👉` before a link)
- **Links**: Inline where relevant, newsletter subscription at `fax.gruenerator.de`
- **Archive filename convention**: `YYYY-MM-thema-in-kebab-case.md` (e.g., `2026-01-jahr-der-daten.md`)

### Code Quality

ESLint (flat config), Prettier, Husky pre-commit hooks (lint-staged), Knip for unused code detection.

- **`allowDefaultProject`**: Do not add files to `packages/eslint-config/base.js` `allowDefaultProject` if they are already discovered by TypeScript's project service (causes a parsing error). Only list files that no `tsconfig.json` covers.

## Deployment

### Test Environment
- **Test URL**: https://beta.gruenerator.eu
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

The `apps/docs-expo` Expo 55 app is built locally as a debug APK.
- **Android package**: `de.gruenerator.docs`

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

# 6. Set up Metro dev server for on-device debugging (always use port 8082, mirror to 8081)
$ADB reverse tcp:8082 tcp:8082
$ADB reverse tcp:8081 tcp:8082
cd apps/docs-expo && npx expo start --port 8082 --localhost
```

**Notes:**
- Use `npx expo-doctor` (not `expo doctor`) — the local CLI doesn't support it.
- `npx expo install --check` validates dependency versions against SDK 55.
- Metro config overrides (`unstable_enableSymlinks`, `watchFolders`) are required for pnpm monorepo support — expo-doctor warnings about these are expected.
- The `android/` directory is regenerated by prebuild and should not be committed (add to `.gitignore` if needed).
- TypeScript check: `npx tsc --noEmit --project apps/docs-expo/tsconfig.json`
- **URI scheme**: The docs app uses `gruenerator-docs://` (distinct from `apps/mobile` which uses `gruenerator://`). Both `app.json` scheme and `auth.ts` `makeRedirectUri` must match. This mirrors the Tauri desktop convention (`apps/desktop` → `gruenerator://`, `apps/docs-desktop` → `gruenerator-docs://`).
- **ADB in WSL**: USB devices aren't accessible from WSL — use Windows `adb.exe` with Windows-style paths (`C:\...`), not `/mnt/c/...`.
- **ADB reverse ports are ephemeral**: They reset after app uninstall/reinstall or ADB daemon restarts. Always re-run `adb reverse` after reinstalling.
- **Signature conflicts on reinstall**: `expo prebuild --clean` regenerates the debug keystore. Must `adb uninstall` before `adb install` (no `-r`) to avoid signature mismatch.
- **Yjs/lib0 dependency**: `isomorphic-webcrypto` is required for the Yjs collaboration layer used by BlockNoteEditor DOM components. If missing, the DOM bundle fails silently and documents show blank pages.
- **Fast debug builds**: Pass `-PreactNativeArchitectures=arm64-v8a` to `./gradlew assembleDebug` to build only for the target device arch. The default builds all 4 archs (armeabi-v7a, arm64-v8a, x86, x86_64) which is ~4x slower.
- **Avoid unnecessary `prebuild --clean`**: Only needed when native dependencies change. Incremental `./gradlew assembleDebug` reuses Gradle caches and is much faster.
- **Always use port 8082 for Metro in WSL**: Port 8081 is permanently occupied by ADB reverse tunnels. Always start Metro on 8082 and mirror both ports: `adb reverse tcp:8082 tcp:8082 && adb reverse tcp:8081 tcp:8082` (device app defaults to 8081, this redirects it to 8082).
- **Expo dev client doesn't auto-connect**: After installing a fresh debug APK, the Expo dev client shows its launcher instead of loading the app. Deep-link it to Metro: `$ADB shell am start -a android.intent.action.VIEW -d "exp+gruenerator://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" de.gruenerator.app`
- **DOM component debugging**: `console.log` inside `'use dom'` components goes to the WebView console (Chrome DevTools → Remote Devices), NOT Metro terminal. Render debug state on-screen instead.
- **Hot reload works for JS/TS changes**: When Metro is running, editing TypeScript/JSX files triggers hot reload on the device — no need to rebuild the APK. Only rebuild (`./gradlew assembleDebug`) when native dependencies change. A full APK rebuild for pure JS changes wastes time.
- **Metro cache stale after `--clear` restart**: When restarting Metro with `--clear`, the first bundle takes longer but is fresh. A `Bundled Xms (1 module)` line after changes usually means the cache is stale — restart Metro if this happens.
- **Docs Expo domains**: API is at `docs.gruenerator.eu/api`, Hocuspocus at `docs.gruenerator.eu/hocuspocus` (NOT `gruenerator.eu`).
