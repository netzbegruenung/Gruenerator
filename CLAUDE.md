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
- **`services/mcp`** — Model Context Protocol server (`https://mcp.gruenerator.eu`). See `CLAUDE-mcp.md` for endpoints, tools, and testing.
- **`services/comfyui`** — ComfyUI workflows for local GPU image generation.

### Data Stores

- **PostgreSQL** — Primary DB. Schema at `apps/api/database/postgres/schema.sql`.
- **Redis** — Sessions, caching, rate limiting.
- **Qdrant** — Vector embeddings for semantic search.

### Adding a New Landesverband Notebook

See `CLAUDE-landesverband.md` for the full 9-file checklist, naming conventions, and verification steps.

### Hocuspocus Awareness (Real-time Collaboration)

Both `apps/docs` and `apps/web` (boards) use **Hocuspocus** for real-time Yjs collaboration. Key rules:

- **Writing**: Use `provider.awareness.setLocalStateField('fieldName', data)` with separate top-level fields. Do NOT nest under `user` — `useCollaboration.ts` periodically resets the `user` field, wiping nested data.
- **Reading**: Use `awareness.on('change', handler)` with `setTimeout(0)` inside — without the timeout, `getStates()` returns stale data.
- **Self-filtering**: Do NOT use `provider.on('awarenessChange', ({ states }))` — the `states` Map uses sequential index keys (0, 1, 2...), not real Yjs clientIDs.

Reference implementations: `useCollaborators()` in `packages/docs/src/hooks/useCollaboration.ts:146-199`, `useDocumentChat()` in `packages/docs/src/hooks/useDocumentChat.ts:64-101`, `useBoardCursors()` in `apps/web/src/features/boards/hooks/useBoardCursors.ts`.

### Authentication

Keycloak OIDC via Passport.js. Supports multiple identity providers (.de, .at, .eu domains). Sessions stored in Redis.

**Dev Auth Bypass** (for Playwright MCP testing): Set `VITE_E2E_AUTH_BYPASS=true` + `VITE_DEV_AUTH_BYPASS_TOKEN=local-dev-bypass-token` in `apps/web/.env`, and `ALLOW_DEV_AUTH_BYPASS=true` + `DEV_AUTH_BYPASS_TOKEN=local-dev-bypass-token` in root `.env`. Frontend returns mock user, backend skips Keycloak when `x-dev-auth-bypass` header matches, Vite proxy auto-injects the header. Production fail-fast: `ALLOW_DEV_AUTH_BYPASS=true` in prod → HTTP 500 on all requests.

### AI Providers

- **Mistral AI** — Primary text generation (EU-hosted).
- **Anthropic Claude via AWS Bedrock** — "Ultra" mode (EU region).
- **Flux (Black Forest Labs)** — Image generation.
- **AssemblyAI / Gladia** — Audio transcription.

## Development Conventions

### Git Safety

**NEVER use `git stash` or `git stash pop`.** These commands are absolutely forbidden — they silently lose uncommitted work and cause merge conflicts that corrupt multiple files. There are no exceptions. If you need to preserve work, commit it to a branch instead.

**Before creating a PR**, always run `git fetch origin master` (or the target branch) to ensure the local remote ref is up to date. This prevents PRs from being based on stale data.

**Always use regular merge** (not squash merge) when merging PRs. `test-branch` is a long-lived branch that is reused across releases. Squash merges create new commit SHAs, so the original commits remain "unknown" to git — subsequent PRs from the same branch accumulate all old commits as if they were new. Regular merges preserve commit identity and keep the history clean.

**PR merges require admin access.** `gh pr merge` will fail because branch protection rules require admin privileges. Always ask the user to merge the PR manually via the GitHub UI or with their admin credentials.

### Expo Apps

**Load Expo skills** when working on `apps/mobile` or `apps/docs-expo`. Always use `npx expo install` (not `pnpm add`) for Expo native dependencies. See `CLAUDE-expo.md` for SDK 55 details, expo-file-system API, keyboard handling, ComposerInput workaround, and APK build instructions.

Skills: `upgrading-expo:upgrading-expo`, `expo-app-design:building-ui`, `expo-app-design:data-fetching`, `expo-deployment:deployment`.

### expo-image (Expo Apps)

**Always use `expo-image`** (`import { Image } from 'expo-image'`) instead of React Native's built-in `Image` in all Expo apps. React Native's `Image` cannot render SVGs — robot avatar URLs appear as blank space.

### Styling

**Tailwind CSS v4** for new code. Existing CSS continues to work unchanged. Import `cn()` from `@/utils/cn` for conditional classes.

Theme tokens: **Colors** (`bg-primary-500`, `text-foreground`, `bg-background`), **Spacing** (`p-xs` through `p-2xl`), **Shadows** (`shadow-sm` through `shadow-xl`), **Radius** (`rounded-sm`/`md`/`lg`).

#### Tailwind v4 Gotchas

**`max-w-*` uses spacing scale, not legacy named sizes.** `max-w-md` = 16px (not 28rem). Always use explicit values: `max-w-[28rem]`. Affected: `max-w-sm` through `max-w-2xl`.

**`fixed` does not set `inset: 0`.** Use `fixed inset-0 m-auto h-fit w-full max-w-[32rem]` for centered dialogs (not `fixed top-[50%] left-[50%] translate-*`).

**`mx-auto` in flex column collapses width.** Add `w-full` alongside `mx-auto` inside `flex flex-col` parents.

#### Legacy Code & Migration
- Design tokens: `apps/web/src/assets/styles/common/variables.css`
- **Opportunistic migration**: Convert CSS to Tailwind when touching files. New features use Tailwind exclusively.

#### Theme & Dark Mode
- Dark mode: `[data-theme="dark"]` attribute. Always test both modes.
- **Use semantic tokens**: `text-foreground` (not `text-grey-800 dark:text-grey-100`), `text-foreground-heading`, `bg-background`, `bg-background-alt`, `bg-background-pure`.

#### CSS Variable Names — Do NOT Invent Variables

| Wrong (undefined)       | Correct (defined)                                      |
|-------------------------|--------------------------------------------------------|
| `--text-primary`        | `--font-color` or `text-foreground`                    |
| `--text-tertiary`       | `--font-color-muted` or `text-grey-400`                |
| `--border-default/color`| `--border-subtle` / `--card-border` or Tailwind border tokens |
| `--border-radius*`      | Use `rounded-lg` directly                              |
| `--background-hover`    | `--hover-color-alt` or `bg-hover-alt`                  |
| `--background-active/subtle` | Use `bg-grey-100 dark:bg-grey-800`                |
| `--bg-color`            | `--background-color` or `bg-background`                |
| `--primary-color`       | `--primary-600` or `text-primary-600`                  |

Prefer Tailwind utilities over `var(--)`. Only use variables confirmed in `variables.css`.

### shadcn/ui Components

**Prefer shadcn/ui** for new UI components. For chat features, **prefer Assistant UI (`@assistant-ui/react`)** primitives first. Always add via CLI:

```bash
cd apps/web && npx shadcn@latest add <component-name>
cd packages/chat && npx shadcn@latest add <component-name>
```

**Post-CLI adaptations:** (1) Fix import order (external before `react`). (2) Replace shadcn tokens: `bg-popover` → `bg-background-pure`, `border` → `border border-grey-200 dark:border-grey-700`, `shadow-md` → `shadow-lg`. (3) Remove `"use client"`. (4) Reference `dropdown-menu.tsx`/`dialog.tsx` as style guide.

**`apps/web` config**: `aliases.utils` → `@/utils/cn`, `style` → `new-york`, components in `src/components/ui/`.

**`packages/chat` caveat**: Replace `@/` path aliases with relative imports after generation — Vite resolves `@/` from the consuming app.

### Docs App

`apps/docs` and `packages/docs` use **`@blocknote/shadcn`** for the editor UI. Dark mode via `data-theme` attribute.

- **Avatars**: Use `getAvatarDisplayProps()` and `getRobotAvatarPath()` from `@gruenerator/shared/avatar`.

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
router.get('/:id', async (req: AuthRequest<{ id: string }>, res: Response) => {
  const { id } = req.params; // correctly typed as string
});

// For complex cases, use the getParam() bridge helper:
import { getParam } from '../../utils/params.js';
const id = getParam(req.params, 'id'); // safely extracts string from string | string[]
```

Custom request types (`AuthRequest`, `AuthenticatedRequest`, `DocumentRequest`, `SubtitlerRequest`) all accept an optional params generic `P`.

### Locale-Aware Backend Code

The platform serves both **German (`de-DE`)** and **Austrian (`de-AT`)** users. All backend code that generates content, searches documents, or constructs prompts **must be locale-aware**. Never hardcode party names or collection lists.

#### Rules
1. **Party name**: Use `{{partyName}}` placeholder in prompts — replaced by `localizePlaceholders()`. Also: `{{partyNameShort}}`, `{{partyNameGenitive}}`.
2. **Qdrant collections**: Filter by locale. Austrian: `oesterreich_gruene_documents`, `gruene_at_documents`. German: `grundsatz_documents`, `bundestag_content`, `kommunalwiki_documents`, `gruene_de_documents`.
3. **Web search**: Never hardcode party name in queries. Use locale-aware name or omit.
4. **`enrichRequest(body, options, req)`**: `req` must be 3rd argument (not inside options).
5. **Direct `aiWorkerPool.processRequest`**: Bypasses localization. Prefer `assemblePromptGraphAsync` or call `localizePlaceholders()` manually.

Utilities in `services/localization/index.ts`: `extractLocaleFromRequest(req)`, `localizePlaceholders(text, locale)`, `getDefaultCollectionsForLocale(locale)`.

### Gender-Neutral Language (Gendern)

All user-facing German text **must use gender-neutral language** with the **Genderstern (`*`)**. This is the standard form for Green Party communications.

1. **Role labels**: `*in` (singular) / `*innen` (plural) — e.g. `Eigentümer*in`, `Bearbeiter*in`
2. **Articles + role**: Rephrase to avoid gendered articles — "Nur der Ersteller kann..." → "Nur die erstellende Person kann..."
3. **Placeholders/labels**: Prefer neutral constructions — "Name des Erstellers" → "Name der erstellenden Person"
4. **Exceptions**: Legal text (Impressum, Datenschutz) and non-role compound nouns unchanged
5. **Email templates**: Permission labels must also be gendered

### Newsletter Writing Style

See `CLAUDE-newsletter.md` for tone, structure, content patterns, and formatting conventions.

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

#### Adding a New Shared Package (Docker Checklist)

When creating or extracting a new `packages/*` workspace, **three files must be updated** or Docker builds will fail:

1. **Every Dockerfile that transitively depends on the new package** — add `COPY packages/<name>/package.json` and `COPY packages/<name>`. Use `pnpm --filter <app> list --depth 1 --json | grep @gruenerator` for the full dependency tree.
2. **`.github/workflows/build-images.yml`** — add `'packages/<name>/**'` to `dorny/paths-filter` entries.
3. **`.gitignore`** — verify the path isn't matched by a broad pattern (e.g., `docs/` matches `*/docs/`; use `/docs/`).

### Deploying to Test
1. Merge changes into `test-branch` (e.g. via PR from `master`)
2. Build images run automatically on push, or trigger manually: `gh workflow run "Build and Push Docker Images" --ref test-branch`
3. Deploy runs automatically on push, or trigger manually: `gh workflow run "Deploy to Test Environment" --ref test-branch`
4. Deploy always force-recreates containers (`--force-recreate`)

### Production
- **Workflow**: "Deploy to Production" (`deploy-prod.yml`)
- **Branch**: `master`

### Docs Expo (Android APK)

See `CLAUDE-expo.md` for full build, install, and debug instructions.
