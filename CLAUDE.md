# CLAUDE.md

> **NEVER `git checkout -- <file>` without explicit user permission.** Other agents may be working concurrently.

> **Environment**: WSL2. ADB/Gradle use Windows executables via `/mnt/c/`.

> Behavioral guidelines (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) live in `~/.claude/CLAUDE.md` and apply to all projects.

## Project Overview

Grünerator: AI content creation platform for Die Grünen. pnpm monorepo (web, mobile, desktop, API). EU-hosted infrastructure.

## Commands

All from repo root (pnpm + Turborepo):

```bash
pnpm install                  # Install all deps
pnpm dev:web                  # Frontend (localhost:3000)
pnpm dev:backend              # Backend (requires Postgres, Redis, Keycloak)
pnpm build                    # Build all
pnpm build:web                # Build web only
pnpm typecheck                # TS check all packages
pnpm lint                     # ESLint all packages
pnpm format:check             # Prettier check
pnpm ci                       # Full CI: typecheck + lint + format:check + test
pnpm test                     # All tests
```

Single workspace: `pnpm --filter @gruenerator/api test:auth`, `pnpm --filter @gruenerator/desktop dev`

## Architecture

### Monorepo Layout

- **`apps/web`** — React 19 + Vite 7. Feature-sliced design, 26 modules in `src/features/`. Routes: `src/config/routes.ts`.
- **`apps/api`** — Express 5, Node.js cluster mode. AI via worker pool (`workers/aiWorkerPool.ts`). Routes in `routes/`, logic in `services/`. See `CLAUDE-routing.md`.
- **`apps/docs`** — **Deprecated** collaborative editor. New docs features → `apps/web/src/features/docs/` + `packages/docs/`.
- **`apps/sites`** — Site builder.
- **`apps/mobile`** — Expo 55 / React Native 0.83 with Expo Router.
- **`apps/desktop`** — Tauri 2 wrapper around web frontend.
- **`packages/chat`** — Shared chat UI, runtime adapters (Assistant UI), stores, hooks. Consumed at `/chat`.
- **`packages/shared`** — Shared stores (Zustand), hooks, API clients, feature modules. Components in `src/components/`.
- **`packages/canvas-editor`** — Config-driven react-konva editor. Per-instance Zustand stores via `CanvasStoreProvider`.
- **`services/hocuspocus`** — Hocuspocus WebSocket server for Yjs collab. Zero cross-package deps (inline utils).
- **`services/mcp`** — MCP server (`https://mcp.gruenerator.eu`). See `CLAUDE-mcp.md`.
- **`services/comfyui`** — ComfyUI workflows for local GPU image gen.

### Page Layout Modes

`layoutMode` in `routes.ts` (type `LayoutMode` in `PageLayout.tsx`): `default` (full header + `mt-lg`), `fullscreen` (header + `pt-12` + `h-dvh`), `immersive` (no header, `h-dvh`), `sidebarOnly` (SidebarToggle only), `noChrome` (bare content).

### Database & Migrations

- **PostgreSQL**: Schema at `apps/api/database/postgres/schema.sql`. Migrations in `database/postgres/migrations/`, auto-run on startup via `PostgresService.init()`. No `BEGIN`/`COMMIT` in migrations (runner wraps in transaction).
- **Redis**: Sessions, caching, rate limiting.
- **Qdrant**: Vector embeddings for semantic search.

### Content Sync & Scraping

Scrapers in `apps/api/services/scrapers/`. Automated via GitHub Actions (`content-sync.yml`): hourly for Landesverbände, daily for rest. Entry: `apps/api/update-all-content.ts`.

**NEVER full rescrape** (`--force` on all). Only targeted subsets (e.g. PDFs via `reprocess-pdfs.ts`). `satzungen_documents` is dormant — exclude.

### Authentication

Keycloak OIDC via Passport.js. Multiple IdPs (.de, .at, .eu). Sessions in Redis.

**Better Auth**: Config at `apps/api/config/betterAuth.ts`. Tables use `ba_` prefix, snake_case columns. `fields` mapping must cover every camelCase→snake_case column or Kysely queries fail.

**Dev Auth Bypass**: `VITE_E2E_AUTH_BYPASS=true` + token in `apps/web/.env`, `ALLOW_DEV_AUTH_BYPASS=true` + token in root `.env`. Production fail-fast: `ALLOW_DEV_AUTH_BYPASS=true` in prod → HTTP 500.

### AI Providers

Mistral AI (primary, EU), Anthropic Claude via Bedrock (Ultra, EU), GPT-OSS via Together AI (fine-tuned, see `CLAUDE-finetuning.md`), Flux/BFL (images), AssemblyAI/Gladia (transcription).

## Development Conventions

### Git Safety

- **NEVER `git stash`/`git stash pop`** — causes merge conflicts, loses work. Commit to a branch instead.
- **Before PR**: `git fetch origin master` to ensure fresh remote ref.
- **Regular merge only** (not squash). `test-branch` is long-lived; squash breaks commit identity.
- **PR merges require admin.** `gh pr merge` fails — ask user to merge via GitHub UI.

### Expo Apps

Load Expo skills for `apps/mobile` or `apps/docs-expo`. Use `npx expo install` (not `pnpm add`). See `CLAUDE-expo.md`. Always use `expo-image` (not RN `Image`) — RN can't render SVGs.

### Styling & UI

See `CLAUDE-styling.md` for Tailwind v4, theme/dark mode, CSS variables, shadcn/ui setup, docs app conventions.

### State Management

Zustand (global state). TanStack Query v5 (server state/fetching) with axios.

### Commits

Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`). Atomic: one logical change per commit.

### TypeScript

Strict mode, entire stack. `import { type Foo }` (inline style, not `import type`). Never use `undefined` — widen to `| null` or omit optional fields.

### Backend Routing & Typing

See `CLAUDE-routing.md` for Express 5 route typing, `TypedRequest`/`AuthRequest`, AI worker pool access, locale-aware backend rules.

### External API Clients & SSRF

Validate user-provided URLs via `validateUrlForFetch()` from `utils/validation/urlSecurity.ts`. Use validated `url` from result. Use `new URL()` for normalization. CodeQL scans PRs for SSRF.

### Database Column Type Changes

When changing column type via migration, grep all queries for that column and update type casts. `$1::uuid` on a `TEXT` column fails at runtime.

### Code Quality

ESLint (flat config), Prettier, Husky pre-commit (lint-staged), Knip (unused code). Don't add files to `allowDefaultProject` if already discovered by TS project service.

### Newsletter

See `CLAUDE-newsletter.md`. Landesverband notebooks: see `CLAUDE-landesverband.md`.

## Deployment

See `CLAUDE-deployment.md` for Docker images, test/prod environments, deploying steps, and shared package checklist.
