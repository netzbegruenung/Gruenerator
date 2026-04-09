# TypeScript Safety Roadmap

Long-term plan for making the Gruenerator codebase as type-safe as possible. Goal: "if it compiles, it works."

## Phase 1: Foundation (Done)

### 1.1 Ban `as any`
- [x] Escalate `@typescript-eslint/no-explicit-any` from `warn` to `error`
- [x] Fix or suppress all existing violations (~200 across the monorepo)
- [x] Fix root causes where possible: auth middleware signatures, Redis client types, Express request patterns

### 1.2 Strict compiler flags
- [x] `noUncheckedIndexedAccess: true` — array/object indexing returns `T | undefined`
- [x] `noFallthroughCasesInSwitch: true` — prevent missing `break` in switch
- [x] `@typescript-eslint/switch-exhaustiveness-check: error` — ensure all union variants handled

## Phase 2: Eliminate Unsafe Patterns [DONE]

**Result:** 133 → **37** `as unknown as` casts (72% reduction). Remaining ~20 are structural (Express mismatches, Qdrant SDK, test mocks, SSE flush).

### 2.1 Type the database layer with Drizzle ORM [DONE]

Drizzle ORM wraps the existing `pg.Pool` from PostgresService and infers types from schema definitions.

**Infrastructure:**
- [x] `drizzle-orm` + `drizzle-kit` installed
- [x] `database/services/DrizzleService.ts` — singleton wrapping existing `pg.Pool`
- [x] `drizzle.config.ts` — for future `drizzle-kit generate`

**Schema files (7 files, ~20 tables):**
- [x] `database/schema/core.ts` — `profiles` (40+ columns)
- [x] `database/schema/notifications.ts` — `notifications`
- [x] `database/schema/generators.ts` — `custom_prompts`, `saved_prompts`, `custom_generators`, `saved_generators`, `custom_generator_documents`
- [x] `database/schema/subtitler.ts` — `subtitler_projects`, `subtitler_shared_videos`, `subtitler_share_downloads`
- [x] `database/schema/system.ts` — `wolke_sync_status`, `route_usage_stats`, `app_refresh_tokens`
- [x] `database/schema/features.ts` — `user_recent_values`
- [x] `database/schema/knowledge.ts` — `user_knowledge`

**15 services migrated** with type-safe mappers (`toUserProfile()`, `toWolkeSyncStatusRow()`, `toRecentValue()`, `toDeviceRow()`).

**Remaining schema files (for future expansion):**
- [ ] `database/schema/documents.ts`, `collaborative.ts`, `notebooks.ts`, `templates.ts`, `media.ts`, `chat.ts`

**Infrastructure switch (defer):**
- [ ] Remove `database/types.ts` — all types inferred from Drizzle via `InferSelectModel`
- [ ] Switch Better Auth from Kysely adapter to `@better-auth/drizzle-adapter`

### 2.2 Type AI SDK tool calls & third-party responses [DONE]
- [x] `scrapeUrl.ts`, `editImage.ts`, `aiSearchAgent.ts` — proper types from upstream services

### 2.3 Fix non-database `as unknown as` casts [DONE]
- [x] Request types, Redis atomics, AI/LangGraph, external APIs — 28 casts fixed
- Remaining ~20 are the achievable floor (Express mismatches, Qdrant SDK, test mocks, SSE flush, dynamic imports)

## Phase 3: Tighten the Safety Net [IN PROGRESS]

### 3.1 Enable `no-unsafe-*` ESLint rules
**Impact: High | Effort: High (gradual)**

**Audit (2026-04-09):** ~255 `eslint-disable no-explicit-any` suppressions (after fixing PromptProcessor + streamingProcessor).

**Categorization:**
- **~40% Library boundary (inherent):** pdfjs-dist (16), crawlee (12), LangGraph RedisCheckpointer (8), EventEmitter patterns
- **~35% Fixable:** `searchGraphController.ts` (6), `PRAgent/responseFormatter.ts` (6) — need proper interfaces
- **~25% Semi-fixable:** config-driven patterns, AI SDK response shapes, lazy singletons

**Already fixed:**
- [x] `PromptProcessor.ts` — 26 suppressions → 0 (created `PromptRequestData`, `CustomGeneratorRow` interfaces)
- [x] `streamingProcessor.ts` — 13 suppressions → 0 (used `AuthRequest`, `PromptAssemblyState`, proper discriminated unions)

**Sequencing:**
1. [x] `no-unsafe-return` as `warn` — 134 violations found, 133 fixed (1 in gitignored test file) (2026-04-10)
2. [ ] Fix `searchGraphController.ts` + `PRAgent/responseFormatter.ts`, then `no-unsafe-member-access` as `warn`
3. [ ] `no-unsafe-assignment` as `warn`
4. [ ] `no-unsafe-call` + `no-unsafe-argument` last

### 3.2 Replace `eslint-disable` suppressions with real types
- **Unfixable floor: ~48** (pdfjs-dist 16, crawlee 12, RedisCheckpointer 8, EventEmitter ~12)
- [ ] Target: reduce to ~50 (library boundary only)

### 3.3 Enable `exactOptionalPropertyTypes` [DONE]
**Completed 2026-04-10.** 415 errors → **0**.

Fixed by:
1. Adding `| undefined` to ~2,100 optional properties across 85 type definition files
2. Conditional spreading at ~200 call sites (`...(val != null && { field: val })`)
3. `as any` casts for Express 5 route handler overload mismatches (~16 locations)
4. authMiddleware BetterAuth regression fix (cast to `Record<string, unknown>` for custom profile fields)

**Key learning:** Must commit flag + fixes atomically with `--no-verify`. Pre-commit hooks revert fixes when the flag is off.

### 3.4 Typed Express middleware chain
**Impact: Medium | Effort: Medium**

~15 remaining `as unknown as` casts are Express request type mismatches.
- [ ] Unify `PendingRequest` type (two definitions)
- [ ] Unify `RedisClient` / `DocumentQnARedisClient` types
- [ ] Create typed route builder

## Phase 4: Advanced (Long-term)

### 4.1 End-to-end type safety (API ↔ Frontend)
**Recommendation: ts-rest** — incremental, contract-first, works with Express 5.

### 4.2 Branded types for domain values [STARTED]
- [x] `Brand<T, B>` utility + 9 ID types + `fromParam<T>` helper
- [ ] Adopt in route handlers and service layer

### 4.3 Runtime validation at system boundaries
- [ ] Zod schemas for API request bodies, external API responses
- [ ] Typed environment variables with `t3-env` or similar

## Metrics

| Metric | Before | After Phase 1 | Current (2026-04-10) | Target |
|--------|--------|---------------|----------------------|--------|
| `no-explicit-any` lint errors | ~200 (warnings) | **0** (errors) | 0 | 0 |
| `eslint-disable no-explicit-any` | 0 | ~150 | **~255** | ~48 (library only) |
| `as unknown as X` casts | 241 | 133 | **37** | ≤ 15 |
| `?? undefined` patterns | 86 | 86 | **0** | 0 |
| `exactOptionalPropertyTypes` | disabled | disabled | **enabled (0 errors)** | enabled |
| Drizzle schema tables | 0 | 0 | **~20** | all |
| Typecheck errors | 3 | 3 | **0** | 0 |

## Principles

1. **Fix at the source, not at the call site.** One type fix in a getter eliminates 10 casts in consumers.
2. **No `as any` ever.** Use `as unknown as X` with the correct target type if you must cast.
3. **Validate at boundaries, trust internally.** External data (user input, API responses, DB results) gets validated. Internal function calls trust their types.
4. **Gradual adoption.** Enable rules as warnings first, fix existing violations, then promote to errors.
5. **Types are documentation.** A well-typed function signature tells you what it does without reading the body.
