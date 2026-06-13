# CLAUDE.md

> **NEVER `git checkout -- <file>` without explicit user permission.** Other agents may be working concurrently.

> **Environment**: WSL2. ADB/Gradle use Windows executables via `/mnt/c/`.

> Behavioral guidelines (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) live in `~/.claude/CLAUDE.md` and apply to all projects.

## Project Overview

Grünerator: AI content creation platform for Die Grünen. pnpm monorepo (web, mobile, desktop, API). EU-hosted infrastructure.

**Locale: Austria (de-AT) is a first-class audience alongside Germany (de-DE).** Default to AT-aware code, not DE-with-AT-toggle. When adding agents, tag `audience: 'de-DE' | 'de-AT' | 'all'` explicitly — leaving it undefined defaults to `'all'` for backward compat, not as a way to skip the decision. System prompts with DE-specific terminology must fork via `userLocale === 'de-AT'`; the `## LÄNDERKONTEXT: ÖSTERREICH` block in `systemPrompt.ts` is the established seam. Notebook routing falls back to `oesterreich-notebook` for AT users when an agent has no `defaultNotebookId`.

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
  - **Chat: contract router is the only handler.** `routes/chat/chatGraphContractRouter.ts` (+ `agents/langgraph/ChatGraph/` nodes: classifier → search → respond) handles `/api/chat-service/*`; tools are executed by `routes/chat/services/intentExecutionService.ts` (calling services directly — there is no LangChain tool registry). **When debugging chat behavior (intent, tool calls, prompts), check the contract router & ChatGraph nodes first** — confirm via backend logs `[ChatGraph:Classifier]` / `[chatGraphContractRouter]`.
- **`apps/docs`** — **Deprecated** collaborative editor. New docs features → `apps/web/src/features/docs/` + `packages/docs/`.
- **`apps/mobile`** — Expo 56 / React Native 0.85 with Expo Router.
- **`apps/desktop`** — Tauri 2 wrapper around web frontend.
- **`packages/chat`** — Shared chat UI, runtime adapters (Assistant UI), stores, hooks. Consumed at `/chat`. Composer controls (modes/models) are defined once here and rendered per-platform — see `CLAUDE-chat.md`; never hardcode mode/model/tool lists in an app.
- **`packages/shared`** — Shared stores (Zustand), hooks, API clients, feature modules. Components in `src/components/`.
- **`packages/sites`** — Embedded candidate-site builder (Home / Login / Demo / Edit pages, editor components, stores). Consumed by `apps/web` at `/sites/*` via `apps/web/src/features/sites/`. No standalone shell; auth/apiClient injected via `<SitesProvider>`.
- **`packages/sites-design`** — Design tokens + presentational components for the site builder (consumed by `packages/sites` and the public candidate sites).
- **`packages/canvas-editor`** — Config-driven react-konva editor. Per-instance Zustand stores via `CanvasStoreProvider`.
- **`services/hocuspocus`** — Hocuspocus WebSocket server for Yjs collab. Zero cross-package deps (inline utils).
- **`services/mcp`** — MCP server (`https://mcp.gruenerator.eu`). See `CLAUDE-mcp.md`.
- **`services/comfyui`** — ComfyUI workflows for local GPU image gen.

### Page Layout Modes

`layoutMode` in `routes.ts` (type `LayoutMode` in `PageLayout.tsx`): `default` (full header + `mt-lg`), `fullscreen` (header + `pt-12` + `h-dvh`), `immersive` (no header, `h-dvh`), `sidebarOnly` (SidebarToggle only), `noChrome` (bare content).

### Resource URLs — Notion-style slugs, never bare UUIDs

User-facing/shareable resource URLs use a Notion-style slug — `slugifyName(name)` + a stable randomized 6-char suffix — **not** a raw UUID. Helpers live in `packages/shared/src/utils/slug.ts` (`slugifyName`, `generateSlugSuffix`, `buildNotebookSlug`/`buildGroupSlug`, `extractSlugSuffix`); reuse them, don't invent a new scheme. The suffix is the stable lookup key (immutable on rename); the name prefix is cosmetic. Store it as a `slug_suffix` column/field, generate it on create, backfill existing rows at boot, and keep a raw-UUID fallback so legacy links keep resolving (extract the suffix → resolve by it; else treat as UUID). Reference impls: notebooks (`NotebookResolver` + `resolveCollection`) and groups (`useGroupResolver` + `resolveGroup`).

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

**React version is decoupled between web and mobile — never use a single global override.** RN bundles `react-native-renderer` pinned to one EXACT React version; React's runtime check rejects any mismatch (symptoms: `Incompatible React versions`, then cascading `Maximum call stack size exceeded` / `Cannot read property 'ErrorBoundary' of undefined` / phantom "missing default export" route warnings). So:
- `apps/mobile` pins `react`/`react-dom` to the **exact** version the Expo SDK ships. Bump it **only** via `npx expo install react react-dom` during an SDK upgrade — never independently. Dependabot ignores react/react-dom for `/apps/mobile` entirely (`.github/dependabot.yml`).
- Web/api/gruen-o-mat track their own react (`^`/latest) — separate Vite/Metro bundles never share a React runtime, so they need not match mobile.
- Do **not** add `react`/`react-dom` to root `pnpm.overrides`: a global override forces mobile to web's version and breaks RN. Shared `packages/*` declare react as `peerDependency: ^19.0.0`, so they inherit each consumer's react — no override needed for dedup.

### Styling & UI

See `CLAUDE-styling.md` for Tailwind v4, theme/dark mode, CSS variables, shadcn/ui setup, docs app conventions.

### State Management

Zustand (global state). TanStack Query v5 (server state/fetching) with axios.

### Commits

Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`). Atomic: one logical change per commit.

### TypeScript

Strict mode, entire stack. `import { type Foo }` (inline style, not `import type`). Never use `undefined` — widen to `| null` or omit optional fields.

**Type-safety rules** (full rationale in `~/.claude/projects/-home-morit-gruenerator/memory/feedback_typescript_advanced_patterns.md`):

1. **Defaulted generics for shared infra** — stores/hooks/factories shared across heterogeneous configs use `<T extends Record<string, unknown> = Record<string, unknown>>`. Existing call sites resolve to the default unchanged; opt-in stronger typing flows via inference from typed callbacks.
2. **Discriminated unions — never destructure** — `const { type, data } = obj` breaks narrowing. Keep `obj.type`/`obj.data` access through the if-chain so each branch auto-narrows.
3. **Existential types via render closure** — for arrays of `Item<T1, T2, TInner>` where `TInner` varies per element, capture `TInner` inside `defineItem`'s closure and expose only a `render()` method. `Item<T1, T2>` (no third generic) sits cleanly in the array.
4. **Boundary casts vs type holes** — a cast at a true type boundary IS the assertion (e.g. `Record<string, unknown>` → typed extraction, async heterogeneous-config loader). A cast in a flow path where a discriminated union or constraint would suffice is a hole. Don't remove the former; do remove the latter.
5. **Documented escape hatches** — computed property keys widen to `string` (`as Partial<State>` is the workaround); Immer `Draft<T>` conditional fails for unconstrained generics (`as (typeof state.field)[number]` at the push); one localized contravariance bridge cast at hook→provider boundaries when generic flows into a default-typed slot. Always comment why.

### Runtime types — Zod & Drizzle

Two canonical sources of truth. **Always derive TS types from them; never hand-duplicate the shape.**

- **Zod (HTTP boundaries):** define request/response schemas with `z.object({...})`. Use `validateBody(schema)` middleware on Express routes; handler receives `TypedRequest<z.infer<typeof schema>>`. Never `& AuthenticatedRequest` (collapses body to `any`); `TypedRequest<T>` already includes auth fields. For response types and cross-package contracts, prefer `z.infer<typeof schema>` over hand-written interfaces.
- **Drizzle (database):** schemas in `apps/api/database/schema/*.ts` as `pgTable(...)`, re-exported from `database/schema/index.ts`. Derive row types via `type Row = InferSelectModel<typeof tableName>` next to the schema; never declare a row interface by hand. **Migrations are raw SQL in `apps/api/database/postgres/migrations/`, auto-run on startup via `PostgresService.init()` — NOT `drizzle-kit migrate`.** Schema files are the type source; SQL files are the runtime DDL. Keep them in sync.

**Type-safety pass on bigger refactors:** Any non-trivial feature change (new endpoint, new dispatcher branch, new shared type) MUST audit the 4 layers before finishing:
1. **Contract (`@gruenerator/contracts/contracts/*Contract.ts`)** — is the endpoint contracted via ts-rest? If yes, frontend uses `getContractsClient()` and gets typed `result.body` per status code. If no, audit whether it should be (especially user-facing endpoints triggered from typed UI).
2. **Zod schema (`@gruenerator/contracts/schemas/*.ts`)** — is the request/response shape a Zod schema, with TS types derived via `z.infer`? Free-string fields (`z.string()`) representing a fixed set MUST be `z.enum([...])`. No hand-written response interfaces alongside a schema.
3. **Drizzle (`apps/api/database/schema/*.ts`)** — does the table use `pgTable(...)` with `InferSelectModel`? Service layer uses the inferred row type; never re-declares a parallel interface.
4. **ts-rest server (`*ContractRouter.ts`)** — every contract has a matching `initServer().router(contract, {...})` mounted via `createExpressEndpoints`. No silent legacy duplicate route on the same path.

Symptom of a missed pass: a frontend interface that duplicates a backend schema's shape, a `z.string()` field whose values are actually a closed set, or a typed-UI button that POSTs through raw `apiClient` instead of the contracts client.

### Backend Routing & Typing

See `CLAUDE-routing.md` for Express 5 route typing, `TypedRequest`/`AuthRequest`, AI worker pool access, locale-aware backend rules.

### External API Clients & SSRF

Validate user-provided URLs via `validateUrlForFetch()` from `utils/validation/urlSecurity.ts`. Use validated `url` from result. Use `new URL()` for normalization. CodeQL scans PRs for SSRF.

### Database Column Type Changes

When changing column type via migration, grep all queries for that column and update type casts. `$1::uuid` on a `TEXT` column fails at runtime.

### Code Quality

ESLint (flat config), Prettier, Husky pre-commit (lint-staged), Knip (unused code). Don't add files to `allowDefaultProject` if already discovered by TS project service.

**Typecheck only when finished.** During a multi-file implementation, do NOT run `pnpm typecheck`/build after each change — keep editing and run a single consolidated typecheck (and lint) pass at the very end, fixing all surfaced errors together.

### Newsletter

See `CLAUDE-newsletter.md`. Landesverband notebooks: see `CLAUDE-landesverband.md`.

## Deployment

See `CLAUDE-deployment.md` for Docker images, test/prod environments, deploying steps, and shared package checklist.
