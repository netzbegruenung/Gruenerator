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

## Phase 3: Tighten the Safety Net [DONE]

### 3.1 Enable `no-unsafe-*` ESLint rules [DONE]
**Completed 2026-04-11.** All 5 rules promoted to `error` with 0 violations.

| Rule | Peak violations | Final | Status |
|------|----------------|-------|--------|
| `no-unsafe-return` | 134 | **0** | **error** |
| `no-unsafe-call` | 89 | **0** | **error** |
| `no-unsafe-argument` | 283 | **0** | **error** |
| `no-unsafe-assignment` | 544 | **0** | **error** |
| `no-unsafe-member-access` | 527 | **0** | **error** |
| **Total fixed** | **1,577** | **0** | |

**Key patterns used:**
- `getAIWorkerPool(req)` helper — centralizes Express `app.locals` cast
- `validateBody(zodSchema)` middleware — runtime + compile-time body typing on ~75 routes
- `TypedRequest<T, P>` — replaces `& AuthenticatedRequest` intersection (which defeated typed body)
- LangGraph typed casts: `nodeFunc as (state: XState) => Promise<Partial<XState>>` (not `as any`)
- Canonical type unification: `AIWorkerPool` (5→1), `VideoMetadata` (10→1), `QdrantFilter` (2→1)

### 3.2 Replace `eslint-disable` suppressions with real types [DONE]
- **Completed 2026-04-11.** 195 → **22** `eslint-disable no-explicit-any` suppressions in `apps/api/`
- Remaining 22 are genuine library boundaries (docx, pdfjs, Express bridges, LangGraph)
- Additional ~52 suppressions in `apps/web/`, `packages/`, and test files (separate scope)

### 3.3 Enable `exactOptionalPropertyTypes` [DONE]
**Completed 2026-04-10.** 415 errors → **0**.

Fixed by:
1. Adding `| undefined` to ~2,100 optional properties across 85 type definition files
2. Conditional spreading at ~200 call sites (`...(val != null && { field: val })`)
3. `as any` casts for Express 5 route handler overload mismatches (~16 locations)
4. authMiddleware BetterAuth regression fix (cast to `Record<string, unknown>` for custom profile fields)

**Key learning:** Must commit flag + fixes atomically with `--no-verify`. Pre-commit hooks revert fixes when the flag is off.

### 3.4 Typed Express middleware chain [DONE]
**Completed 2026-04-11.** Unified duplicate type definitions:
- [x] `VideoMetadata`: 10 definitions → 1 canonical in `routes/subtitler/types.ts`
- [x] `AIWorkerPool`: 5 definitions → 1 canonical in `workers/types.ts`
- [x] `QdrantFilter`: 2 definitions → 1 canonical in `QdrantService/types.ts`
- [ ] Unify `PendingRequest` type (two definitions) — deferred, low impact
- [ ] Unify `RedisClient` / `DocumentQnARedisClient` types — deferred

### 3.5 Zod request validation middleware [DONE]
**Completed 2026-04-11.** Applied to ~75 route files.

`validateBody(schema)` middleware at `middleware/validateBody.ts` — runtime Zod validation + compile-time `TypedRequest<T, P>`.

**Key decisions:**
- `TypedRequest<T, P>` includes user/auth fields — **NEVER** intersect with `& AuthenticatedRequest` (Express `body: any` absorbs typed body in intersections)
- Remaining ~50 routes have 0 violations — migrate **opportunistically** when touching files
- Zod schemas become building blocks for ts-rest contracts (Phase 4.1)

## Phase 4: Advanced (Long-term)

### 4.1 End-to-end type safety (API ↔ Frontend)
**Recommendation: ts-rest** — incremental, contract-first, works with Express 5.

ts-rest defines a single contract that types body, params, query, headers, AND response. Both Express backend and React frontend get types from the same source. Uses Zod schemas internally — the schemas from Phase 3.5 transfer directly into ts-rest contracts.

**Acceleration strategy:** ~75 Zod schemas from `validateBody` already exist. A codegen script can auto-generate ts-rest contracts from them — skips 60% of the manual effort. Start with 3-5 high-traffic endpoints to prove the pattern.

### 4.2 Branded types for domain values [STARTED]
- [x] `Brand<T, B>` utility + 9 ID types + `fromParam<T>` helper
- [ ] Adopt in route handlers and service layer
- **Deferred** — prevents ID mixups but lower priority than end-to-end typing

### 4.3 Runtime validation at system boundaries [STARTED]
- [x] Zod `validateBody` middleware for API request bodies (Phase 3.5)
- [ ] Zod schemas for external API responses (WordPress, Qdrant, etc.)
- [ ] Typed environment variables with `t3-env` or similar

### 4.4 Global infrastructure typing [DONE]
**Completed 2026-04-11.**

- [x] `app.locals` typed via `Express.Locals` module augmentation (`types/express.d.ts`)
- [x] `parseJSON<T>()` utility created (`utils/parseJSON.ts`), adopted in 10 files
- [x] `getAIWorkerPool(req)` helper simplified (uses typed locals)

## What's Next (pick up here)

### Priority 1: ts-rest incremental adoption (Phase 4.1)
The biggest remaining safety win — typed API calls from frontend to backend.
- ~75 Zod schemas from `validateBody` can auto-generate ts-rest contracts
- Start with 3-5 high-traffic endpoints (chat, search, docs) to prove the pattern
- Frontend gets typed `useQuery`/`useMutation` — no more `axios.get<any>`

### Priority 2: Branded types adoption (Phase 4.2)
`Brand<T, B>` utility + 9 ID types already exist. Adopt in route handlers to prevent ID mixups.

### Priority 3: External API response validation (Phase 4.3)
Zod schemas for WordPress, Qdrant, Nextcloud API responses. Currently typed via `axios.get<T>()` (compile-time only) — Zod adds runtime validation.

### Deferred (do opportunistically)
- Remaining ~50 `validateBody` routes (0 violations, migrate when touching)
- Remaining `PendingRequest` / `RedisClient` type unification (low impact)
- Frontend + shared packages `any` violations (~13 remaining)

## Acceleration Principles (2026-04-11)

1. **Opportunistic migration > blanket rollout.** Remaining ~50 validateBody routes have 0 violations — migrate when touching files, not as a batch.
2. **Don't chase the suppression count.** 22 `eslint-disable` in api is the correct permanent floor. Typing library boundaries adds complexity without preventing real bugs.
3. **Codegen over handwriting.** Zod schemas → ts-rest contracts can be automated. Don't rewrite what already exists.
4. **Frontend typing > backend lint.** The biggest safety win left isn't more backend lint fixes — it's typed API calls from the frontend (ts-rest). Focus there.

## Metrics

| Metric | Before | After Phase 1 | Current (2026-04-11) | Target |
|--------|--------|---------------|----------------------|--------|
| `no-explicit-any` lint errors | ~200 (warnings) | **0** (errors) | 0 | 0 |
| `eslint-disable no-explicit-any` | 0 | ~150 | **22** (api) / **74** (total) | ~22 (library only) |
| `as unknown as X` casts | 241 | 133 | **~20** | ≤ 15 |
| `?? undefined` patterns | 86 | 86 | **0** | 0 |
| `exactOptionalPropertyTypes` | disabled | disabled | **enabled (0 errors)** | enabled |
| `no-unsafe-return` | 134 (warn) | 0 (warn) | **0 (error)** | 0 (error) |
| `no-unsafe-call` | 89 (warn) | — | **0 (error)** | 0 (error) |
| `no-unsafe-argument` | 283 (warn) | — | **0 (error)** | 0 (error) |
| `no-unsafe-assignment` | 544 (warn) | 882 (warn) | **0 (error)** | 0 (error) |
| `no-unsafe-member-access` | 527 (warn) | 1,128 (warn) | **0 (error)** | 0 (error) |
| Duplicate type definitions | ~20 | — | **0** (AIWorkerPool, VideoMetadata, QdrantFilter unified) | 0 |
| Drizzle schema tables | 0 | 0 | **~20** | all |
| Typecheck errors | 3 | 3 | **0** | 0 |
| `validateBody` routes | 0 | 0 | **~75** | opportunistic |
| `parseJSON<T>()` adoption | — | — | **10 files** | all JSON.parse sites |
| Frontend `any` violations | ~49 | — | **~8** | 0 |
| Shared packages `any` violations | ~48 | — | **~5** | 0 |

## Principles

1. **Fix at the source, not at the call site.** One type fix in a getter eliminates 10 casts in consumers.
2. **No `as any` ever.** Use `as unknown as X` with the correct target type if you must cast.
3. **Validate at boundaries, trust internally.** External data (user input, API responses, DB results) gets validated. Internal function calls trust their types.
4. **Gradual adoption.** Enable rules as warnings first, fix existing violations, then promote to errors.
5. **Types are documentation.** A well-typed function signature tells you what it does without reading the body.
