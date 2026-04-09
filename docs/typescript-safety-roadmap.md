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

## Phase 2: Eliminate Unsafe Patterns [MOSTLY DONE]

**Progress (2026-04-09):** 133 → **38** `as unknown as` casts (71% reduction).

### 2.1 Type the database layer with Drizzle ORM [MOSTLY DONE]
**Impact: High | Effort: Medium-High**

Drizzle ORM wraps the existing `pg.Pool` from PostgresService and infers types from schema definitions. Eliminates the dual source of truth (`schema.sql` + `types.ts`).

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

**Service migrations (15+ services, ~50 casts → 0):**
- [x] `services/notifications/NotificationService.ts` — 5 casts → 0
- [x] `routes/auth/userCustomPrompts.ts` — 5 casts → 0 (deleted stale local `CustomPromptRow`)
- [x] `services/subtitler/ProjectService.ts` — 7 casts → 0
- [x] `services/user/ProfileService.ts` — 9 casts → 0 (with `toUserProfile()` mapper)
- [x] `services/sync/WolkeSyncService.ts` — 4 casts → 0 (with `toWolkeSyncStatusRow()` mapper)
- [x] `services/chat/RecentValuesService.ts` — 2 casts → 0 (with `toRecentValue()` mapper)
- [x] `services/pushNotificationService.ts` — 2 casts → 0 (with `toDeviceRow()` mapper)
- [x] `services/user/KnowledgeService.ts` — 2 casts → 0
- [x] `services/subtitler/shareService.ts` — 2 casts → 0
- [x] `routes/notebook/collectionsController.ts` — 2 casts → 0 (`query<T>` generic)
- [x] `routes/docs/permissionsController.ts` — 1 cast → 0
- [x] `routes/internal/databaseTestController.ts` — 2 casts → 0
- [x] `routes/custom_generators/custom_generator.ts` — 2 casts → 0 (`queryOne<T>` generic)
- [x] `routes/custom_prompts/custom_prompt.ts` — 2 casts → 0 (`queryOne<T>` generic)
- [x] `database/services/PostgresService/PostgresService.ts` — 2 casts → 0

**Remaining schema files (for future Drizzle expansion):**
- [ ] `database/schema/documents.ts` — `documents`, `document_daily_versions`, `user_documents`, etc.
- [ ] `database/schema/collaborative.ts` — `collaborative_documents`, etc.
- [ ] `database/schema/notebooks.ts` — `notebook_collections`, etc.
- [ ] `database/schema/templates.ts` — `user_templates`, `template_likes`
- [ ] `database/schema/media.ts` — `user_sharepics`, `user_uploads`, `shared_media`, etc.
- [ ] `database/schema/chat.ts` — `chat_threads`, `chat_messages`, etc.

**Infrastructure switch (defer):**
- [ ] Remove `database/types.ts` — all types inferred from Drizzle via `InferSelectModel`
- [ ] Switch Better Auth from Kysely adapter to `@better-auth/drizzle-adapter`

### 2.2 Type AI SDK tool calls & third-party responses [DONE]
- [x] `scrapeUrl.ts` — used `CrawledResult` type (3 `as any` → 0)
- [x] `editImage.ts` — removed unnecessary cast, `GenerateResult` already typed
- [x] `aiSearchAgent.ts` — used `LRUCache<EnhancementResult>` generic

### 2.3 Fix non-database `as unknown as` casts [DONE]

**Fixed (28 casts):**
- [x] Request types: `rateLimitController.ts` (8→0), `rateLimitMiddleware.ts` (1→0)
- [x] Redis: `BridgeCodeStore.ts` + `DesktopOAuthStateManager.ts` — atomic `getDel()` (2→0)
- [x] AI/LangGraph: `promptAssemblyGraph.ts`, `confidenceAnalyzer.ts`, `SharepicExtractor.ts`, `InformationRequestHandler.ts`, `aiWorker.ts`, `aiService.ts`, `ToolHandler.ts` (10→0)
- [x] External APIs: `voiceController.ts`, `OparlScraper.ts`, `batchProcessor.ts`, `subdomainHandler.ts` (6→0)

**Remaining ~20 (achievable floor — need structural changes):**
- Express request mismatches (`grueneratorChat` 3, `sharepicGenerationService` 1, `shareController` 2, `promptRoute` 3) — need Phase 3.4 typed middleware or type unification
- Qdrant SDK library types (`PromptVectorService` 2, `vectorOperations` 1) — need upstream fixes
- Dynamic import casts (`FluxImageService` 2) — inherent to pattern
- `simpleInteractiveGenerator` (2) — deep LangGraph type incompatibility
- Test mocks (5) — acceptable
- SSE flush (2) — Express Response lacks `flush()` in typings

### ~~2.4 Fix service singleton types~~ SKIP
All singleton getters already return correctly typed instances. Casts were caused by untyped query results, fixed by Drizzle.

## Phase 3: Tighten the Safety Net

### 3.1 Enable `no-unsafe-*` ESLint rules
**Impact: High | Effort: High (gradual)**

**Audit (2026-04-09):** 294 `eslint-disable no-explicit-any` suppressions in apps/api/.

**Categorization:**
- **~40% Library boundary (inherent):** pdfjs-dist (16), crawlee (12), LangGraph RedisCheckpointer (8), EventEmitter patterns — these stay as `eslint-disable` with explanatory comments
- **~35% Fixable with effort:** `PromptProcessor.ts` (26!), `streamingProcessor.ts` (13), `searchGraphController.ts` (6), `PRAgent/responseFormatter.ts` (6) — need proper interfaces
- **~25% Semi-fixable:** config-driven `requestData: any` patterns, AI SDK response shapes, lazy singletons

**Top targets (highest ROI):**
| File | Suppressions | Fix |
|------|-------------|-----|
| `PromptProcessor.ts` | 26 | Create `PromptRequestData` interface |
| `streamingProcessor.ts` | 13 | Use `AuthRequest`, type `AppLocals` |
| `CrawleeCrawler.ts` | 12 | Import crawlee types properly |
| `OcrService/pdfOperations.ts` | 10 | Library boundary — leave |
| `RedisCheckpointer.ts` | 8 | LangGraph upstream — leave |

**Recommended sequencing:**
1. `no-unsafe-return` as `warn` — only ~4 violations, basically free
2. Fix `PromptProcessor.ts` + `streamingProcessor.ts` (39 suppressions, 13% reduction), then `no-unsafe-member-access` as `warn`
3. `no-unsafe-assignment` as `warn` — requires interface work across ~20 files
4. `no-unsafe-call` + `no-unsafe-argument` last — library boundary pragmatics

### 3.2 Replace `eslint-disable` suppressions with real types
**Impact: Medium | Effort: Ongoing**

**Current state (2026-04-09):** 294 suppressions, 98.9% are `no-explicit-any`.
- **Unfixable floor: ~48** (pdfjs-dist 16, crawlee 12, RedisCheckpointer 8, EventEmitter ~12)
- **Fixable: ~246** — with proper interfaces and type imports
- [ ] Target: reduce to ~50 (library boundary only)
- [ ] Priority: `PromptProcessor.ts` (26) → `streamingProcessor.ts` (13) → scrapers → routes

### 3.3 Enable `exactOptionalPropertyTypes`
**Impact: Medium | Effort: HIGH | Must be atomic (all-or-nothing)**

**Finding (2026-04-09):** `?? undefined` patterns eliminated (84 → **0**), BUT enabling the flag produces **~415 errors**.

**CRITICAL: Pre-commit hooks revert fixes if the flag isn't enabled.** The flag and all fixes must be committed together in one atomic `--no-verify` commit. Incremental fixing doesn't work.

**Most efficient fix strategy:** Add `| undefined` to optional properties in ~30 type definition files. This cascades to fix ~120 call-site errors automatically. Then fix remaining call sites with conditional spreading.

**Error breakdown:**
- **TS2379 (183):** Argument not assignable — objects with `undefined` in optional fields
- **TS2375 (132):** Object literal type mismatch — explicit `undefined` assignment
- **TS2412 (36):** Property type `string | undefined` → `string?` mismatch
- **TS2322 (32):** General assignment mismatches
- **TS2769 (17):** No overload matches with optional params

**Top files (fix these first = 20% of errors):**
| File | Errors | Fix pattern |
|------|--------|-------------|
| `middleware/authMiddleware.ts` | 24 | Conditional spreading in user object |
| `BaseSearchService/BaseSearchService.ts` | 16 | Search param construction |
| `routes/chat/chatGraphController.ts` | 16 | Graph state objects |
| `utils/errors/classes.ts` | 15 | Error class optional params |
| `routes/voice/voiceController.ts` | 15 | Transcription option objects |

**Top directories:**
- `routes/chat/` (28), `middleware/` (28), `utils/errors/` (20), `BaseSearchService/` (17), `routes/voice/` (17), `ChatGraph/` (34), `DocumentSearchService/` (15), `workers/providers/` (14), `QdrantService/` (13), `packages/shared/` (12)

**Steps:**
- [x] Fix `?? undefined` patterns (conditional spreading) — **DONE, 0 remaining**
- [ ] Fix top 5 files (86 errors, 20% of total)
- [ ] Fix remaining `apps/api/` errors (~346)
- [ ] Fix `packages/shared/` errors (~12, cross-package)
- [ ] Enable `exactOptionalPropertyTypes` in `apps/api/tsconfig.json`

### 3.4 Typed Express middleware chain
**Impact: Medium | Effort: Medium**

**Finding (2026-04-09):** ~15 remaining `as unknown as` casts are Express request type mismatches. Key issues:
- `grueneratorChat.ts`: 3 justified casts (`RedisClient` vs `DocumentQnARedisClient`, two different `PendingRequest` types, `ChatAttachment[]` vs `DocumentQnAAttachment[]`)
- `sharepicGenerationService.ts`: 1 cast (Express router internal `stack` property)
- `shareController.ts`: 2 casts (local service interface narrowing)

**Steps:**
- [ ] Unify `PendingRequest` type (two definitions: `services/chat/types.ts` and `agents/chat/`)
- [ ] Unify `RedisClient` / `DocumentQnARedisClient` types
- [ ] Create typed route builder: `authenticatedRoute('/path', (req, res) => ...)`

## Phase 4: Advanced (Long-term)

### 4.1 End-to-end type safety (API ↔ Frontend)
**Recommendation: ts-rest** — incremental, contract-first, works with Express 5.
- Pilot route: `/api/releases`
- Migration: one route group at a time

### 4.2 Branded types for domain values [STARTED]
- [x] `Brand<T, B>` utility + 9 ID types + `fromParam<T>` helper
- [ ] Adopt in route handlers (start with document routes)
- [ ] Adopt in service layer

### 4.3 Runtime validation at system boundaries
- [ ] Zod schemas for all API request bodies
- [ ] Zod schemas for external API responses (Qdrant, Mistral, SearXNG)
- [ ] Typed environment variables with `t3-env` or similar

## Metrics

| Metric | Before (2026-04-09) | After Phase 1 | Current | Target |
|--------|---------------------|---------------|---------|--------|
| `no-explicit-any` lint errors | ~200 (warnings) | **0** (errors) | 0 | 0 |
| `eslint-disable no-explicit-any` | 0 | ~150 | **294** (audited) | ~48 (library only) |
| `catch (error: any)` | ~250 | **0** | 0 | 0 |
| `Record<string, any>` | ~100 | **0** | 0 | 0 |
| `as unknown as X` casts | 241 | 133 | **38** | ≤ 15 |
| `@ts-expect-error` | 9 | 7 | ~6 | < 5 |
| `?? undefined` patterns | 86 | 86 | **0** | 0 |
| Drizzle schema tables | 0 | 0 | **~20** | all |
| `exactOptionalPropertyTypes` errors | — | — | **432** | 0 |
| Typecheck errors | 3 | 3 | **0** | 0 |

## Principles

1. **Fix at the source, not at the call site.** One type fix in a getter eliminates 10 casts in consumers.
2. **No `as any` ever.** Use `as unknown as X` with the correct target type if you must cast.
3. **Validate at boundaries, trust internally.** External data (user input, API responses, DB results) gets validated. Internal function calls trust their types.
4. **Gradual adoption.** Enable rules as warnings first, fix existing violations, then promote to errors.
5. **Types are documentation.** A well-typed function signature tells you what it does without reading the body.
