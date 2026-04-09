# TypeScript Safety Roadmap

Long-term plan for making the Gruenerator codebase as type-safe as possible. Goal: "if it compiles, it works."

## Phase 1: Foundation (Done)

### 1.1 Ban `as any` (PR: current)
- [x] Escalate `@typescript-eslint/no-explicit-any` from `warn` to `error`
- [x] Fix or suppress all existing violations (~200 across the monorepo)
- [x] Fix root causes where possible: auth middleware signatures, Redis client types, Express request patterns

### 1.2 Strict compiler flags (PR: current)
- [x] `noUncheckedIndexedAccess: true` — array/object indexing returns `T | undefined`
- [x] `noFallthroughCasesInSwitch: true` — prevent missing `break` in switch
- [x] `@typescript-eslint/switch-exhaustiveness-check: error` — ensure all union variants handled

## Phase 2: Eliminate Unsafe Patterns (Next)

### 2.1 Type the database layer with Drizzle ORM
**Impact: High | Effort: Medium-High | ~57 files, ~1865 lines**

The biggest source of `as unknown as X` casts (~85 across 35 files) is untyped SQL query results from `PostgresService.query()` returning `Record<string, unknown>`. Drizzle ORM replaces raw SQL with a type-safe query builder AND eliminates the dual source of truth (`schema.sql` + `types.ts`) by making schema-as-code the single source.

#### Phase 2A: Foundation + Safe Services [DONE]

**Setup:**
- [x] Install `drizzle-orm` + `drizzle-kit` (dev) in `apps/api/package.json`
- [x] Create `apps/api/database/services/DrizzleService.ts` — singleton wrapping existing `pg.Pool`
- [x] Create `apps/api/drizzle.config.ts` — for future `drizzle-kit generate`
- [x] Create `apps/api/database/schema/index.ts` — barrel re-export

**Schema files:**
- [x] `database/schema/notifications.ts` — `notifications` (11 columns)
- [x] `database/schema/generators.ts` — `custom_prompts`, `saved_prompts`, `custom_generators`, `saved_generators`, `custom_generator_documents` (5 tables)
- [x] `database/schema/subtitler.ts` — `subtitler_projects`, `subtitler_shared_videos`, `subtitler_share_downloads` (3 tables)

**Service migrations:**
- [x] `services/notifications/NotificationService.ts` — 5 casts → 0
- [x] `routes/auth/userCustomPrompts.ts` — 5 casts → 0 (deleted stale local `CustomPromptRow` duplicate)
- [x] `services/subtitler/ProjectService.ts` — 7 casts → 0

#### Phase 2B–2D: Remaining tables + services (TODO)

See detailed plan in git history for Phase 2B (ProfileService, high-risk), 2C (all remaining tables), 2D (infrastructure switch).

### 2.2 Type AI SDK tool calls with Zod
**Impact: High | Effort: Low**

Tool call inputs from LLMs are currently cast with `toolCall.input as unknown as T`. The AI SDK supports Zod schemas that validate AND type inputs.

- [ ] Add Zod schemas to all `tool()` definitions in ChatGraph, SearchGraph, WebSearchGraph
- [ ] Remove `as unknown as SearchToolInput` etc. — the SDK provides typed, validated inputs
- [ ] Files: `searchDocuments.ts`, `scrapeUrl.ts`, `editImage.ts`, `aiSearchAgent.ts`, `gruenerator_ask.ts`

### 2.3 Fix service singleton types
**Impact: Medium | Effort: Low**

`getPostgresInstance()`, `getQdrantInstance()`, `mistralEmbeddingService` return weakly typed singletons, causing ~12 `as unknown as Service` casts.

- [ ] Fix return types on singleton getters to match their actual class
- [ ] Remove all `as unknown as PostgresService` / `QdrantService` / `MistralEmbeddingService` casts
- [ ] Files: `KnowledgeService.ts`, `PromptVectorService.ts`, `ProfileService.ts`, `sharedMediaService.ts`

## Phase 3: Tighten the Safety Net

### 3.1 Enable `no-unsafe-*` ESLint rules
**Impact: High | Effort: High (gradual)**

These rules catch `any` leaking through your code even when you don't write it explicitly (e.g., from untyped dependencies).

```
Phase A (warn):
- @typescript-eslint/no-unsafe-assignment
- @typescript-eslint/no-unsafe-return
- @typescript-eslint/no-unsafe-argument

Phase B (error, after fixing Phase A):
- @typescript-eslint/no-unsafe-member-access
- @typescript-eslint/no-unsafe-call
```

### 3.2 Replace `eslint-disable` suppressions with real types
**Impact: Medium | Effort: Ongoing**

Each `// eslint-disable-next-line @typescript-eslint/no-explicit-any` is a tech debt marker. Track and reduce over time.

- [ ] Create a tracking metric: `grep -r "no-explicit-any" --include="*.ts" | wc -l`
- [ ] Target: reduce by 20% per quarter
- [ ] Priority: fix suppressions in `services/` and `routes/` first (runtime code), leave `agents/langgraph/` for last (LangGraph's API is inherently untyped)

### 3.3 Enable `exactOptionalPropertyTypes`
**Impact: Medium | Effort: Medium**

Prevents `{ x: undefined }` when `x?:` means "property absent." Catches subtle bugs where optional fields are explicitly set to `undefined` instead of omitted.

**Audit (2026-04-09): 86 occurrences across 44 files.**

Top patterns:
- **Qdrant SDK options** (11): `offset ?? undefined`, `vectorsCount ?? undefined`, etc. — Qdrant SDK accepts `undefined` for optional params. Fix: use conditional spreading `...(offset != null && { offset })`
- **NotebookQAService** (9): `detectedPhrase ?? undefined`, `documentTitleFilter ?? undefined` — building search options. Fix: conditional spreading
- **Subtitler metadata** (6): `videoBitrate ?? undefined`, `audioBitrate ?? undefined` — FFmpeg options. Fix: conditional spreading
- **ChatGraphController** (4): `searchQuery ?? undefined`, `subQueries ?? undefined` — building graph state. Fix: conditional spreading
- **DocumentSearchService** (4): weight options. Fix: already uses conditional spreading but wraps in `?? undefined` — just remove the `?? undefined`
- **authMiddleware** (3): `chat_color ?? undefined`, `keycloak_id ?? undefined` — building user object. Fix: conditional spreading
- **React components** (12): `userDisplayName={user?.display_name ?? undefined}`, `originalImage ?? undefined` — JSX props. Fix: omit prop entirely when undefined
- **Other** (37): mixed patterns

Steps:
- [ ] Fix by pattern (conditional spreading), starting with the most concentrated files
- [ ] Enable `exactOptionalPropertyTypes` in tsconfig
- [ ] Fix any new errors

### 3.4 Typed Express middleware chain
**Impact: Medium | Effort: Medium**

Express 5's type system doesn't propagate middleware effects. When `requireAuth` runs before a handler, the handler should know `req.user` exists.

- [ ] Create typed route builder: `authenticatedRoute('/path', (req: AuthenticatedRequest, res) => ...)`
- [ ] This eliminates the need for `req as AuthenticatedRequest` casts in handlers
- [ ] Consider tRPC or Hono for new API routes (both have end-to-end type safety)

## Phase 4: Advanced (Long-term)

### 4.1 End-to-end type safety (API ↔ Frontend)
**Recommendation: ts-rest** (researched 2026-04-09)
- Best fit: designed for REST APIs, incremental adoption per route group
- `@ts-rest/core` contracts in `packages/shared/` with Zod schemas
- `@ts-rest/express` wraps existing Express routers — middleware compatible
- `@ts-rest/react-query` replaces raw axios calls with typed TanStack Query hooks
- Mobile: `@ts-rest/core` client works in any JS runtime
- No external codegen services, contracts are plain TypeScript + Zod
- Pilot route: `/api/releases` (small, self-contained)
- Migration: one route group at a time, old routes keep working

Steps:
- [ ] Add `@ts-rest/core` to `packages/shared/`, define first contract
- [ ] Add `@ts-rest/express` to `apps/api/`, wrap pilot route
- [ ] Add `@ts-rest/react-query` to `apps/web/`, replace axios calls
- [ ] Share contracts with `apps/mobile/` via workspace dependency
- [ ] Migrate remaining route groups incrementally

### 4.2 Branded types for domain values [STARTED]
- [x] Created `apps/api/utils/types/branded.ts` with `Brand<T, B>` utility
- [x] 9 branded ID types: `UserId`, `DocumentId`, `ThreadId`, `MessageId`, `GroupId`, `NotebookId`, `TemplateId`, `SharepicId`, `SiteId`
- [x] `fromParam<T>` helper for Express 5 route params
- [ ] Adopt in route handlers (start with document routes)
- [ ] Adopt in service layer (start with most error-prone boundaries)

### 4.3 `noPropertyAccessFromIndexSignature`
- [ ] Forces `obj["key"]` for index signatures, making it explicit when you're accessing a possibly-missing key
- [ ] Low priority — `noUncheckedIndexedAccess` already catches the runtime issues

### 4.4 Runtime validation at system boundaries
- [ ] Zod schemas for all API request bodies (partially done via AI SDK tools)
- [ ] Zod schemas for external API responses (Qdrant, Mistral, SearXNG, etc.)
- [ ] Typed environment variables with `t3-env` or similar

## Metrics

| Metric | Before (2026-04-09) | After Phase 1 | After Phase 2A | Target |
|--------|---------------------|---------------|----------------|--------|
| `no-explicit-any` lint errors | ~200 (warnings) | **0** (now errors) | 0 | 0 |
| `eslint-disable no-explicit-any` | 0 | ~150 | ~150 | ~30 (LangGraph only) |
| `catch (error: any)` | ~250 | **0** | 0 | 0 |
| `Record<string, any>` | ~100 | **0** | 0 | 0 |
| `as unknown as X` casts | 241 | 133 (61 files) | **116** (17 eliminated) | ≤ 6 |
| `@ts-expect-error` | 9 | 7 | 7 | < 5 |
| `?? undefined` patterns | 86 | 86 | 86 | 0 |
| Untyped DB queries | ~50 | ~50 | ~35 (Drizzle started) | 0 |
| Schema sources of truth | 2 (`schema.sql` + `types.ts`) | 2 | 2 (Drizzle coexists) | **1** |

## Principles

1. **Fix at the source, not at the call site.** One type fix in a getter eliminates 10 casts in consumers.
2. **No `as any` ever.** Use `as unknown as X` with the correct target type if you must cast.
3. **Validate at boundaries, trust internally.** External data (user input, API responses, DB results) gets validated. Internal function calls trust their types.
4. **Gradual adoption.** Enable rules as warnings first, fix existing violations, then promote to errors.
5. **Types are documentation.** A well-typed function signature tells you what it does without reading the body.
