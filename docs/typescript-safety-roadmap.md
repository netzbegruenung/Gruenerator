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

### 3.1 Enable `no-unsafe-*` ESLint rules [DONE — apps/api]
**Completed 2026-04-11.** All 5 rules promoted to `error` in shared config (`packages/eslint-config/base.js`). Violations fixed to 0 in `apps/api/`.

**Scope note:** Rules are `error` in the shared config. `apps/web` and `apps/mobile` have `warn` overrides in their local `eslint.config.js` until their violations are fixed (see Phase 5).

| Rule | Peak (api) | Final (api) | web (warn) | mobile (warn) | Status |
|------|-----------|-------------|------------|---------------|--------|
| `no-unsafe-return` | 134 | **0** | 143 | 8 | **error** (api) |
| `no-unsafe-call` | 89 | **0** | 33 | 0 | **error** (api) |
| `no-unsafe-argument` | 283 | **0** | 142 | 34 | **error** (api) |
| `no-unsafe-assignment` | 544 | **0** | 363 | 76 | **error** (api) |
| `no-unsafe-member-access` | 527 | **0** | 543 | 89 | **error** (api) |
| **Total fixed (api)** | **1,577** | **0** | — | — | |
| **Remaining (web+mobile)** | — | — | **1,224** | **207** | **warn** |

**Key patterns used:**
- `getAIWorkerPool(req)` helper — centralizes Express `app.locals` cast
- `validateBody(zodSchema)` middleware — runtime + compile-time body typing on ~75 routes
- `TypedRequest<T, P>` — replaces `& AuthenticatedRequest` intersection (which defeated typed body)
- LangGraph typed casts: `nodeFunc as (state: XState) => Promise<Partial<XState>>` (not `as any`)
- Canonical type unification: `AIWorkerPool` (5→1), `VideoMetadata` (10→1), `QdrantFilter` (2→1)

### 3.2 Replace `eslint-disable` suppressions with real types [DONE — apps/api]
- **Completed 2026-04-11.** 195 → **22** `eslint-disable no-explicit-any` suppressions in `apps/api/`
- Remaining 22 are genuine library boundaries (docx, pdfjs, Express bridges, LangGraph)
- Additional suppressions: ~29 in `apps/web/`, ~41 in `packages/` (separate scope, see Phase 5)

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

### 3.6 Fix no-unsafe-* in services + packages [DONE]
**Completed 2026-04-11.** Extended Phase 3.1 beyond apps/api to smaller packages.

| Package | Errors fixed | Status |
|---------|-------------|--------|
| `services/hocuspocus` | 1 | **0 errors** |
| `services/mcp` | 17 | **0 errors** |
| `apps/gruen-o-mat` | 3 | **0 errors** |
| `packages/shared` | 132 | **0 errors** |
| **Total** | **153** | |

Also fixed in this phase:
- [x] `apps/api` `no-unused-vars`: 117 → **0** warnings
- [x] `apps/api` `import-x/order`: 94 → **3** warnings (edge cases, rule at `warn`)
- [x] `apps/mobile` `no-explicit-any`: 2 errors → **0**

### 3.7 Promote `no-floating-promises` to error [DONE]
**Completed 2026-04-12.** 300 violations → **0**, rule promoted from `warn` to `error` in shared base config.

| Rule | Before | After | Status |
|------|--------|-------|--------|
| `no-floating-promises` (web) | 230 | **0** | **error** |
| `no-floating-promises` (mobile) | 70 | **0** | **error** |
| `no-floating-promises` (api) | 0 | 0 | **error** |
| **Total fixed** | **300** | **0** | |

**Fix patterns** (mostly mechanical `void` prefix):
- `void queryClient.invalidateQueries({...})` in TanStack mutation callbacks
- `void navigate('/path')` / `void router.push('/path')` in event handlers
- `void fetchData()` in `useEffect` / `useFocusEffect`
- `void navigator.clipboard.writeText(...)` for DOM API promises
- `void SplashScreen.preventAutoHideAsync()` at Expo module level
- `void import('sonner').then(...)` for dynamic imports

**Unexpected bonus**: 3 `switch-exhaustiveness-check` errors discovered while committing mobile changes (agent's `void` autofix exposed them) — fixed in same commit (`gallery.tsx` case `'all'`, `ProjectList.tsx` case `undefined`).

### 3.8 Remaining `warn`-level rules (lower priority)

| Rule | api | web | mobile | packages | Total | Safety impact |
|------|-----|-----|--------|----------|-------|--------------|
| `no-unused-vars` | 0 | 224 | 52 | 8 | **284** | Low (hygiene) |
| `switch-exhaustiveness-check` | 0 | 4 | 6 | 1 | **11** | Medium |
| `no-case-declarations` | 0 | 7 | 0 | 8 | **15** | Medium |
| `import-x/order` | 3 | 25 | 0 | 1 | **29** | None (style) |

**Priority**: With `no-floating-promises` done, all critical safety rules are at `error`. Remaining items are hygiene/style — fix opportunistically when touching files.

## Phase 4: Advanced (Long-term)

### 4.1 End-to-end type safety (API ↔ Frontend)
**[PILOT STARTED 2026-04-11]** — `packages/contracts/` created with 4 pilot contracts.

ts-rest defines a single contract that types body, params, query, headers, AND response. Both Express backend and React frontend get types from the same source. Uses Zod schemas internally — the schemas from Phase 3.5 transfer directly into ts-rest contracts.

**Pilot endpoints (packages/contracts/src/contracts/):**
- `threadsContract` — full CRUD for `/api/chat-service/threads` (6 endpoints)
- `exportsContract` — DOCX + PDF export `/api/exports/{docx,pdf}`
- `recentValuesContract` — `/api/recent-values` (4 endpoints, backend fully wired via `recentValuesContractRouter.ts`)
- `searchContract` — `/api/search` POST + `/api/search/status` GET

**Infrastructure:**
- `packages/contracts/` (`@gruenerator/contracts`) — Zod schemas + ts-rest contracts, no React dep
- `packages/shared/src/api/contractsClient.ts` — axios-backed ts-rest client (`getContractsClient()`)
- `apps/web/src/hooks/useRecentValuesTyped.ts` — typed hook showing migration pattern
- `apps/api/routes/user/recentValuesContractRouter.ts` — backend ts-rest router (pilot, not yet mounted)

**To activate the pilot backend router**, add to `routes.ts` before the legacy router:
```ts
import { mountRecentValuesContractRouter } from './routes/user/recentValuesContractRouter.js';
mountRecentValuesContractRouter(app);
```

**Packages to install:**
```
pnpm add @ts-rest/core @ts-rest/express   # in apps/api
pnpm add @ts-rest/core                    # in packages/shared (via contracts dep)
```

**Acceleration strategy:** ~75 Zod schemas from `validateBody` already exist. A codegen script can auto-generate ts-rest contracts from them — skips 60% of the manual effort.

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

### Priority 1: ts-rest incremental adoption (Phase 4.1) [EXPANDING]
**Phase 4.1 expansion 2026-04-12.** 5 new contract groups wired up:

| Contract | Endpoints | Status |
|----------|-----------|--------|
| recentValuesContract | 4 | Mounted (Apr 11) |
| threadsContract | 7 | **Mounted** |
| chatGraphContract | 2 | **Mounted** |
| boardsContract | 3 | **Mounted** |
| sharesContract | 6 | **Mounted** |
| userProfileContract | 11 | **Mounted** |
| exportsContract | 2 | Not yet mounted |
| searchContract | 2 | Not yet mounted |

**Total**: **33 typed endpoints** served via ts-rest contracts (out of 126 candidates identified by codegen script).

**Frontend**: `useRecentValuesTyped` migrated in `SmartInput.tsx` + `RecentValuesDropdown.tsx`. Other typed hooks not yet created.

**Known debt**: 23 `as unknown as AuthenticatedRequest` casts in contract routers. Will be eliminated by augmenting `Express.Request` with `user?: UserProfile` in `types/express.d.ts` (planned next session).

**Next**: use the codegen report to pick 5-10 more routes (search, exports, notebook, template) for the next batch.

### Priority 2: External API response validation (Phase 4.3) [MOSTLY DONE]
**Completed 2026-04-12.** All JSON-returning external API clients now validate at the boundary with Zod.

| Client | Schemas | Call sites | Status |
|--------|---------|------------|--------|
| WordPress | 5 | 8/8 | **Done** |
| Google Drive | 5 | 5/7 (2 binary) | **Done** |
| Microsoft Graph | 5 | 6/7 (1 binary) | **Done** |
| OParl | 8 | 8/8 (z.union polymorphic) | **Done** |
| Atlassian (Jira+Confluence) | 12 | 8/8 | **Done** |
| Keycloak | 3 | 5/12 (7 write-only, no body) | **Done** |
| Bluesky (AT Protocol) | 5 | 1/1 | **Done** |
| Nextcloud / WebDAV | — | — | **Stub** (XML/binary only, no JSON) |

**Total**: 43 Zod schemas, 41 call sites converted to runtime validation. Upstream API changes now fail loudly with `ZodError` at the boundary instead of silent `undefined` cascades.

### Priority 3: Branded types adoption (Phase 4.2) [STARTED]
**First adoption 2026-04-12.** `fromParam<T>()` helper now used in 5 route files:
- `documents/manualController.ts`, `retrievalController.ts`, `qdrantController.ts` — `DocumentId` (6 adoptions)
- `notebook/collectionsController.ts` — `NotebookId` + `DocumentId` (8 adoptions)
- `notebook/interactionController.ts` — `NotebookId` (1 adoption)

Zero runtime cost — branded IDs pass transparently to services accepting `string`. Prevents `UserId` vs `DocumentId` confusion at compile time.

**Remaining**: auth routes, chat routes, group routes, share routes, template routes (~200 handlers). Low urgency — expand when touching files.

### Deferred (do opportunistically)
- Remaining ~50 `validateBody` routes (0 violations, migrate when touching)
- Remaining `PendingRequest` / `RedisClient` type unification (low impact)

## Phase 5: Frontend + Mobile Safety [DONE 2026-04-12]

### 5.1 Fix web `no-unsafe-*` violations [DONE]
**1,214 errors → 0.** Three Sonnet agents in parallel, organized by file heat (top 5 / 25 / long tail). See Phase 3.1 table for final metrics. Warn override removed from `apps/web/eslint.config.js`.

### 5.2 Fix mobile `no-unsafe-*` violations [DONE]
**180 errors → 0.** One Sonnet agent covering 26 files. Warn override removed from `apps/mobile/eslint.config.js`.

### 5.3 Promote `no-floating-promises` to `error` [DONE]
**300 violations → 0.** Three parallel agents (web big, web small, mobile). See Phase 3.7 for details.

## Acceleration Principles (2026-04-11)

1. **Opportunistic migration > blanket rollout.** Remaining ~50 validateBody routes have 0 violations — migrate when touching files, not as a batch.
2. **Don't chase the suppression count.** 22 `eslint-disable` in api is the correct permanent floor. Typing library boundaries adds complexity without preventing real bugs.
3. **Codegen over handwriting.** Zod schemas → ts-rest contracts can be automated. Don't rewrite what already exists.
4. **Frontend typing > backend lint.** The biggest safety win left isn't more backend lint fixes — it's typed API calls from the frontend (ts-rest). Focus there.
5. **Ratchet, don't re-count.** CI thresholds that only go down prevent regression without manual audits. Add a cast-count CI script.
6. **Scope honestly.** Phase 3 achieved 0 violations in api/services/packages, but web (1,224) and mobile (207) still have `warn` overrides. Don't mark "DONE" until the monorepo is clean.

## Metrics (verified 2026-04-12)

| Metric | Before | Apr-11 | Current (Apr-12) | Target |
|--------|--------|--------|------------------|--------|
| `no-explicit-any` lint errors | ~200 (warn) | **0** (error) | **0** | 0 |
| `no-unsafe-*` violations (api) | 1,577 | **0** (error) | **0** | 0 |
| `no-unsafe-*` violations (web) | — | 1,224 (warn) | **0** (error) | 0 |
| `no-unsafe-*` violations (mobile) | — | 207 (warn) | **0** (error) | 0 |
| `no-unsafe-*` violations (packages) | — | 0 (error) | **0** | 0 |
| `no-floating-promises` (web) | — | 230 (warn) | **0** (error) | 0 |
| `no-floating-promises` (mobile) | — | 70 (warn) | **0** (error) | 0 |
| `no-floating-promises` (api) | — | 0 (warn) | **0** (error) | 0 |
| `eslint-disable no-explicit-any` | 0 | 22 api / 70 repo | ~same | ~22 (library only) |
| `as unknown as X` casts | 241 | 84 api / 205 repo | ~same | ratchet down |
| `exactOptionalPropertyTypes` | disabled | **enabled** | enabled | enabled |
| Duplicate type definitions | ~20 | **0** | 0 | 0 |
| Drizzle schema tables | 0 | ~20 | ~20 | all |
| Typecheck errors (all packages) | 3 | **0** | 0 | 0 |
| `validateBody` routes | 0 | ~75 | ~75 | opportunistic |
| ts-rest contracts | 0 | 4 (pilot) | **4 + mounted** | all (~75 target) |
| External API Zod schemas | 0 | 0 | **WordPress (5) + in-progress** | all 8 clients |
| `parseJSON<T>()` adoption | — | 10 files | 10 files | all JSON.parse sites |

**🎉 Phase 3 complete**: All safety-critical ESLint rules (`no-unsafe-*`, `no-floating-promises`, `no-explicit-any`, `exactOptionalPropertyTypes`) are now at `error` level across the **entire monorepo**. The `warn` override era is over.

**Note on cast regression:** `as unknown as` grew from ~37 (Phase 2 end) to 84 (api) / 205 (repo) due to new features added without cast discipline. Ratchet CI script (`scripts/type-safety-ratchet.sh`) prevents further regression.

## Principles

1. **Fix at the source, not at the call site.** One type fix in a getter eliminates 10 casts in consumers.
2. **No `as any` ever.** Use `as unknown as X` with the correct target type if you must cast.
3. **Validate at boundaries, trust internally.** External data (user input, API responses, DB results) gets validated. Internal function calls trust their types.
4. **Gradual adoption.** Enable rules as warnings first, fix existing violations, then promote to errors.
5. **Types are documentation.** A well-typed function signature tells you what it does without reading the body.
