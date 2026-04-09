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

## Phase 2: Eliminate Unsafe Patterns [IN PROGRESS]

**Current state (2026-04-09):** 133 → **46** `as unknown as` casts (65% reduction).

### 2.1 Type the database layer with Drizzle ORM [MOSTLY DONE]
**Impact: High | Effort: Medium-High**

Drizzle ORM wraps the existing `pg.Pool` from PostgresService and infers types from schema definitions. Eliminates the dual source of truth (`schema.sql` + `types.ts`).

#### Phase 2A: Foundation + Safe Services [DONE]

**Infrastructure created:**
- [x] `drizzle-orm` + `drizzle-kit` installed
- [x] `database/services/DrizzleService.ts` — singleton wrapping existing `pg.Pool`
- [x] `drizzle.config.ts` — for future `drizzle-kit generate`

**Schema files (7 files, ~20 tables):**
- [x] `database/schema/core.ts` — `profiles` (40+ columns)
- [x] `database/schema/notifications.ts` — `notifications` (11 columns)
- [x] `database/schema/generators.ts` — `custom_prompts`, `saved_prompts`, `custom_generators`, `saved_generators`, `custom_generator_documents` (5 tables)
- [x] `database/schema/subtitler.ts` — `subtitler_projects`, `subtitler_shared_videos`, `subtitler_share_downloads` (3 tables)
- [x] `database/schema/system.ts` — `wolke_sync_status`, `route_usage_stats`, `app_refresh_tokens`
- [x] `database/schema/features.ts` — `user_recent_values`
- [x] `database/schema/knowledge.ts` — `user_knowledge`

**Service migrations (12 services, ~45 casts → 0):**
- [x] `services/notifications/NotificationService.ts` — 5 casts → 0
- [x] `routes/auth/userCustomPrompts.ts` — 5 casts → 0 (deleted stale local `CustomPromptRow` duplicate)
- [x] `services/subtitler/ProjectService.ts` — 7 casts → 0
- [x] `services/user/ProfileService.ts` — 9 casts → 0 (with `toUserProfile()` mapper)
- [x] `services/sync/WolkeSyncService.ts` — 4 casts → 0 (with `toWolkeSyncStatusRow()` mapper)
- [x] `services/chat/RecentValuesService.ts` — 2 casts → 0
- [x] `services/pushNotificationService.ts` — 2 casts → 0
- [x] `services/user/KnowledgeService.ts` — 2 casts → 0
- [x] `services/subtitler/shareService.ts` — 2 casts → 0
- [x] `routes/notebook/collectionsController.ts` — 2 casts → 0 (query<T> generic)
- [x] `routes/docs/permissionsController.ts` — 1 cast → 0
- [x] `routes/internal/databaseTestController.ts` — 2 casts → 0

#### Phase 2B–2D: Remaining tables (TODO)

**Schema files still needed:**
- [ ] `database/schema/documents.ts` — `documents`, `document_daily_versions`, `user_documents`, `user_document_metadata`, `grundsatz_documents`
- [ ] `database/schema/collaborative.ts` — `collaborative_documents`, `collaborative_documents_init`, etc.
- [ ] `database/schema/notebooks.ts` — `notebook_collections`, `notebook_collection_documents`, etc.
- [ ] `database/schema/templates.ts` — `user_templates`, `template_likes`
- [ ] `database/schema/media.ts` — `user_sharepics`, `user_uploads`, `shared_media`, etc.
- [ ] `database/schema/chat.ts` — `chat_threads`, `chat_messages`, etc.
- [ ] `database/schema/monitor.ts` — `monitor_snapshots`, `monitor_articles`, etc.
- [ ] `database/schema/presentations.ts` — `collaborative_presentations`, `presentation_slides`, etc.

**Infrastructure switch (defer to after all tables migrated):**
- [ ] Remove `database/types.ts` — all types inferred from Drizzle via `InferSelectModel`
- [ ] Switch Better Auth from Kysely adapter to `@better-auth/drizzle-adapter`
- [ ] Evaluate `drizzle-kit generate` as migration system replacement

### 2.2 Type AI SDK tool calls & third-party responses [DONE]
**Impact: Medium | Effort: Low | 3 files**

- [x] `scrapeUrl.ts` — used `CrawledResult` type from CrawlingService (3 `as any` → 0)
- [x] `editImage.ts` — removed unnecessary cast, `GenerateResult` already typed
- [x] `aiSearchAgent.ts` — used `LRUCache<EnhancementResult>` generic

### 2.3 Fix non-database `as unknown as` casts [MOSTLY DONE]
**Impact: Medium | Effort: Medium | ~46 casts across 26 files → ~20 remaining**

**Fixed:**
- [x] Request type casts: `rateLimitController.ts` (8→0), `rateLimitMiddleware.ts` (1→0)
- [x] Redis: `BridgeCodeStore.ts` + `DesktopOAuthStateManager.ts` — atomic `getDel()` (2→0)
- [x] AI/LangGraph: `promptAssemblyGraph.ts`, `confidenceAnalyzer.ts`, `SharepicExtractor.ts`, `InformationRequestHandler.ts`, `aiWorker.ts`, `aiService.ts`, `ToolHandler.ts` (10→0)
- [x] External APIs: `voiceController.ts`, `OparlScraper.ts`, `batchProcessor.ts`, `subdomainHandler.ts` (6→0)

**Remaining ~20 (acceptable floor):**
- Express request structural mismatches (grueneratorChat, sharepicGenerationService, shareController) — need Phase 3.4
- Qdrant SDK library types (PromptVectorService, vectorOperations) — need upstream fixes
- Dynamic import casts (FluxImageService) — inherent to pattern
- Test mocks (5) — acceptable per roadmap
- SSE flush (2) — Express Response lacks `flush()` in typings

### ~~2.4 Fix service singleton types~~ SKIP
**Finding (2026-04-09):** All singleton getters already return correctly typed instances. Casts were caused by untyped query results, fixed by Drizzle in 2.1.

## Phase 3: Tighten the Safety Net

### 3.1 Enable `no-unsafe-*` ESLint rules
**Impact: High | Effort: High (gradual)**

**Status (2026-04-09):** NOT enabled. ~294 `eslint-disable no-explicit-any` suppressions exist.

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

**Current state (2026-04-09):** 294 suppressions, 98.9% are `no-explicit-any`.

- [ ] Audit: categorize as fixable vs inherent (LangGraph) vs library boundary
- [ ] Target: reduce by 20% per quarter
- [ ] Priority: `services/` and `routes/` first, `agents/langgraph/` last

### 3.3 Enable `exactOptionalPropertyTypes`
**Impact: Medium | Effort: HIGH (revised upward)**

**Finding (2026-04-09):** `?? undefined` patterns eliminated (84 → 0), BUT enabling the flag produces **432 errors** across `apps/api/` and `packages/shared/`. The `?? undefined` patterns were only ~20% of the issue. The remaining errors are `string | undefined` being assigned to `string?` properties — a pervasive pattern in AI provider adapters, search services, and shared packages.

**Revised steps:**
- [x] Fix `?? undefined` patterns (conditional spreading) — **DONE, 0 remaining**
- [ ] Fix `string | undefined` → `string?` assignment errors in `apps/api/` (~200 errors)
- [ ] Fix same errors in `packages/shared/` (~200 errors)
- [ ] Enable `exactOptionalPropertyTypes` in `tsconfig.base.json`

### 3.4 Typed Express middleware chain
**Impact: Medium | Effort: Medium**

**Finding (2026-04-09):** ~18 `as unknown as` casts in route handlers are Express request type mismatches. These are the bulk of the "achievable floor" casts. Key files: `grueneratorChat.ts` (3 justified casts — `RedisClient` vs `DocumentQnARedisClient`, two different `PendingRequest` types, `ChatAttachment[]` vs `DocumentQnAAttachment[]`).

- [ ] Unify `PendingRequest` type (currently two definitions: `services/chat/types.ts` and `agents/chat/`)
- [ ] Create typed route builder: `authenticatedRoute('/path', (req: AuthenticatedRequest, res) => ...)`
- [ ] Consider tRPC or Hono for new API routes

## Phase 4: Advanced (Long-term)

### 4.1 End-to-end type safety (API ↔ Frontend)
**Recommendation: ts-rest** (researched 2026-04-09)
- `@ts-rest/core` contracts in `packages/shared/` with Zod schemas
- `@ts-rest/express` wraps existing Express routers
- `@ts-rest/react-query` replaces raw axios calls
- Pilot route: `/api/releases` (small, self-contained)

### 4.2 Branded types for domain values [STARTED]
- [x] Created `apps/api/utils/types/branded.ts` with `Brand<T, B>` utility
- [x] 9 branded ID types + `fromParam<T>` helper
- [ ] Adopt in route handlers (start with document routes)
- [ ] Adopt in service layer

### 4.3 `noPropertyAccessFromIndexSignature`
- [ ] Low priority — `noUncheckedIndexedAccess` already catches runtime issues

### 4.4 Runtime validation at system boundaries
- [ ] Zod schemas for all API request bodies
- [ ] Zod schemas for external API responses (Qdrant, Mistral, SearXNG)
- [ ] Typed environment variables with `t3-env` or similar

## Metrics

| Metric | Before (2026-04-09) | After Phase 1 | Current | Target |
|--------|---------------------|---------------|---------|--------|
| `no-explicit-any` lint errors | ~200 (warnings) | **0** (errors) | 0 | 0 |
| `eslint-disable no-explicit-any` | 0 | ~150 | ~294 | ~30 (LangGraph only) |
| `catch (error: any)` | ~250 | **0** | 0 | 0 |
| `Record<string, any>` | ~100 | **0** | 0 | 0 |
| `as unknown as X` casts | 241 | 133 | **~46** | ≤ 15 |
| `@ts-expect-error` | 9 | 7 | ~6 | < 5 |
| `?? undefined` patterns | 86 | 86 | **0** | 0 |
| Untyped DB queries | ~50 | ~50 | **~15** | 0 |
| Schema sources of truth | 2 | 2 | 2 (Drizzle coexists) | **1** |
| Drizzle schema tables | 0 | 0 | **~20** | all |
| `exactOptionalPropertyTypes` errors | — | — | **432** | 0 |

## Principles

1. **Fix at the source, not at the call site.** One type fix in a getter eliminates 10 casts in consumers.
2. **No `as any` ever.** Use `as unknown as X` with the correct target type if you must cast.
3. **Validate at boundaries, trust internally.** External data (user input, API responses, DB results) gets validated. Internal function calls trust their types.
4. **Gradual adoption.** Enable rules as warnings first, fix existing violations, then promote to errors.
5. **Types are documentation.** A well-typed function signature tells you what it does without reading the body.
