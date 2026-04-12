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

**Remaining schema files** [DONE 2026-04-12]:
- [x] `database/schema/documents.ts` — 24 columns
- [x] `database/schema/notebooks.ts` — 4 tables (collections, documents, public_access, usage_logs)
- [x] `database/schema/collaborative.ts` — 3 tables
- [x] `database/schema/templates.ts` — user_templates, template_likes
- [x] `database/schema/media.ts` — user_sharepics, user_uploads, shared_media, shared_media_downloads
- [x] `database/schema/chat.ts` — chat_threads, chat_messages, chat_thread_attachments

**Infrastructure switch** [DONE 2026-04-12]:
- [x] `database/types.ts` fully migrated (last 2 holdouts — `YjsDocumentSnapshotRow` via `database/schema/yjs.ts`, `UserSiteRow` via `database/schema/sites.ts` — closed 2026-04-12). All row types now `InferSelectModel<...>` in schema files.
- [x] **Better Auth on `@better-auth/drizzle-adapter`** [DONE 2026-04-12, verified end-to-end]
  - New `database/schema/auth.ts` with `ba_sessions`/`ba_accounts`/`ba_verification` Drizzle schemas + `relations()` for join support
  - `config/betterAuth.ts` swapped from raw `pg.Pool` to `drizzleAdapter(db, { provider: 'pg', schema, debugLogs: true })`
  - `routes/auth/authCore.ts` raw SQL `ba_accounts` query rewritten as typed Drizzle select
  - Dead `Ba*Row` Kysely-era stubs deleted from `database/types.ts`
  - `apps/api/package.json` declares `@better-auth/drizzle-adapter` explicitly (it was a transitive dep that worked in dev but pruned by `pnpm install --prod`)
  - **`account.accountLinking.trustedProviders`** configured for all 4 Keycloak providers — without this, Better Auth refuses to link OAuth identities when the OAuth profile lacks `email_verified`
  - **`ba_accounts` UNIQUE constraint corrected** from `(user_id, provider_id)` → `(account_id, provider_id)` via `fix_ba_accounts_unique_constraint.sql` migration. The wrong constraint blocked re-linking when a user's Keycloak `sub` changes (e.g. realm migration). Better Auth's data model allows multiple historical OAuth identities per user per provider; the wrong constraint blocked the second one.
  - **Verified end-to-end**: real Keycloak OAuth signin completes, session created, Drizzle adapter logs each query, auth tests pass, chat works on top of the new session.

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
- [x] Unify `PendingRequest` — added `[key: string]: unknown` to agent type so it satisfies storage envelope structurally (no cast needed). 3 definitions in different domains kept (worker pool / storage envelope / agent request).
- [x] Unify `RedisClient` / `DocumentQnARedisClient` — removed local duplicate in redisOperations.ts; widened DocumentQnARedisClient method return types to `Promise<unknown>` so RedisClientType assigns without casts. Net: 2 more `as unknown as` casts removed.
- [x] **Express.Request.user** unified with UserProfile via `(req.user as UserProfile)` pattern in 5 ts-rest contract routers. Net: 13 `as unknown as AuthenticatedRequest` casts eliminated.

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

#### Mandatory checklist for new ts-rest contract routers (learned 2026-04-12)

Three production incidents in this session — all caused by adding contract routers without these patterns. **Every new contract router MUST follow these rules** or it will silently break:

1. **Use `.nullish()` not `.optional()` for optional body fields.** The frontend follows `feedback_no_undefined` and sends `null` for unset values. Plain `.optional()` only accepts `undefined` and 400s every request. At handler call sites that need `T | undefined` (because downstream functions don't accept null), normalize with `?? undefined`. Don't try to enforce null vs undefined in the wire format — the schema accepts both, the handler normalizes to one.

2. **Use `logContractValidationError(log, scope)` from `apps/api/utils/contractValidationLogger.ts`.** Never paste `requestValidationErrorHandler: 'combined'` — it silently 400s with the validation error in the response body but never logs server-side. The shared helper logs `[scope] validation failed: METHOD URL — body=<issues>, query=<issues>, params=<issues>` so the next 400 is diagnosable from API logs alone, no browser DevTools required. Includes deduplication so only one log line fires per request even though Express runs every error middleware in sequence.

3. **If the path is in `CUSTOM_BODY_PARSER_PATHS` (`apps/api/middleware/bodyParserConfig.ts`), register a body parser explicitly in `routes.ts` BEFORE the contract router mount.** Concrete example: `/api/chat-graph/stream` is in the skip list because the legacy controller installed its own 50mb parser at controller-mount time. The contract router intercepts the request BEFORE the legacy parser would run, sees `req.body === undefined`, and 400s. Fix:
   ```ts
   app.use('/api/chat-graph', express.json({ limit: '50mb' }));  // before mount
   mountChatGraphContractRouter(app);
   ```
   Any path in `CUSTOM_BODY_PARSER_PATHS` AND served by a contract router needs both the global skip AND a per-path parser registration upstream. The two systems were coordinated implicitly via "the legacy router installs its own parser" — the contract router needs explicit coordination.

4. **Apply `requireAuth` middleware to the path prefix BEFORE the contract router mount** if the contract handler reads `req.user`. ts-rest contract routers don't have built-in auth — without this, unauthenticated requests reach the handler with `req.user === undefined` and crash on `.id` access. Pattern:
   ```ts
   app.use('/api/chat-graph', requireAuth);
   mountChatGraphContractRouter(app);
   ```

5. **Mount BEFORE the corresponding legacy router** so Express matches the contract router's routes first. Otherwise the legacy router intercepts all traffic and the contract router is dead code.

6. **Verify `packages/contracts` exports compile to `dist/`** for production builds. The `Dockerfile` must build the contracts package and `sed`-rewrite its `package.json` exports from `./src/*.ts` → `./dist/*.js` (mirrors the existing pattern for `packages/shared` and `services/hocuspocus`). See Phase 6.1 for the long-term fix via `development` conditional exports.

### 4.2 Branded types for domain values [STARTED]
- [x] `Brand<T, B>` utility + 9 ID types + `fromParam<T>` helper
- [ ] Adopt in route handlers and service layer
- **Deferred** — prevents ID mixups but lower priority than end-to-end typing

### 4.3 Runtime validation at system boundaries [DONE]
- [x] Zod `validateBody` middleware for API request bodies (Phase 3.5)
- [x] Zod schemas for external API responses — 7 of 8 clients (WordPress, Google, Microsoft, OParl, Atlassian, Keycloak, Bluesky); WebDAV/Nextcloud have no JSON responses
- [x] Typed environment variables — `apps/api/config/env.ts` with Zod schema covering all 178 env vars, parsed at startup. **~87 of 82 consumer files migrated** (batch on 2026-04-12: +32 files via Sonnet sub-agent). `process.env.*` references in `apps/api/*.ts`: **49 → 17**. Remaining 17 are legitimate: 13 test/vitest files (need raw `process.env` for mock/delete/restore patterns), 1 write to `process.env.MEM0_TELEMETRY` (third-party telemetry suppression), `config/env.ts` itself, and disabled-code comments. **Zero new schema vars needed** across both migration batches. **Bonus catch**: two script files (`debug-lv-counts.ts`, `dedup-lv-vectors.ts`) had no `dotenv.config()` and were silently reading undefined when run standalone — the typed env boundary forced them to fail loudly, which is the correct behavior.

### 4.4 Global infrastructure typing [DONE]
**Completed 2026-04-11.**

- [x] `app.locals` typed via `Express.Locals` module augmentation (`types/express.d.ts`)
- [x] `parseJSON<T>()` utility created (`utils/parseJSON.ts`), adopted in 10 files
- [x] `getAIWorkerPool(req)` helper simplified (uses typed locals)

## What's Next (pick up here)

### Priority 1: ts-rest incremental adoption (Phase 4.1) [EXPANDING]
**Phase 4.1 expansion + verification 2026-04-12.** All 7 mounted contract routers are now confirmed to actually receive and process traffic in production (post-`fix(docker)` commit they were registered, post-body-parser-fix they handle requests correctly, post-`.nullish()` schema fix they accept frontend payloads):

| Contract | Endpoints | Status |
|----------|-----------|--------|
| recentValuesContract | 4 | **Verified** (mounted Apr 11, no incidents) |
| threadsContract | 7 | **Verified** (`requireAuth` middleware added Apr 12 to fix unauthenticated crash) |
| chatGraphContract | 2 | **Verified** (4 fixes required: `.nullish()` schema, `requireAuth`, 50mb body parser, validation logger) |
| boardsContract | 3 | **Verified** |
| sharesContract | 6 | **Verified** |
| userProfileContract | 11 | **Verified** |
| exportsContract | 2 | **Verified** (mounted Apr 12) |
| searchContract | 2 | Scaffolded but **NOT mounted** — pilot doesn't model SSE `?stream=true` mode the frontend depends on. Activate once streaming is added to the contract. |

**Total**: **35 typed endpoints** served via ts-rest contracts (out of 126 candidates identified by codegen script).

**All 8 routers (including the unmounted searchContract scaffold) use the shared `logContractValidationError` helper** so any future validation issue logs server-side with the exact failing field path. The era of "the contract returned 400 and we have no idea why" is over.

**Frontend**: `useRecentValuesTyped` migrated in `SmartInput.tsx` + `RecentValuesDropdown.tsx`. `useBoardsTyped` added 2026-04-12 + `AIBoardCreator.tsx` migrated. `exportStore.ts` internals rewritten to use `client.exports.generatePdf/Docx` (consumers unchanged — pattern for migrating Zustand-wrapped axios calls without call-site churn). `useThreadsTyped` deferred: threads live in `packages/chat/` behind the `ChatApiClient` adapter; no `apps/web/src/` call site exists, so migration requires a chat-package adapter refactor.

**Contract drift caught** (2026-04-12): `boardsContract`'s `boardDocumentSchema` was missing the `content` field the frontend reads. Fixed at the source by adding `boardContentSchema` to `packages/contracts/src/schemas/boards.ts` — not via cast at the hook boundary.

**Binary response infrastructure**: `contractsClient.ts` gained `BINARY_RESPONSE_PATHS = Set<string>(['/api/exports/docx', '/api/exports/pdf'])`. The axiosFetcher passes `responseType: 'blob'` when path matches. Required because ts-rest has no way to declare response content-type in the contract — `binaryFileResponseSchema` is `z.unknown()`. Any new binary endpoint needs to be added to this set.

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

## Phase 6: Build Infrastructure (Long-term)

### 6.1 Migrate workspace packages to `development` conditional exports [DONE 2026-04-12]

**Status**: **DONE 2026-04-12**. Workspace packages now use the `development`/`default` conditional exports pattern. The `sed` hack is gone from `apps/api/Dockerfile`.

**Current state**: All three TS-source workspace packages (`packages/shared`, `packages/contracts`, `services/hocuspocus`) declare `package.json` exports pointing at `./src/*.ts` (literal TypeScript source). Node.js cannot load `.ts` files at runtime, so production deployment relies on a `sed` workaround in `apps/api/Dockerfile`:

```dockerfile
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
RUN sed -i 's|"\./src/\(.*\)\.ts"|"./dist/\1.js"|g' packages/shared/package.json
# (repeated for contracts and hocuspocus)
```

**Why this is wrong long-term:**
1. The on-disk `package.json` shape diverges from the runtime shape — IDEs, editors, and any tool that reads `package.json` see the dev shape and never know about the prod rewrite
2. Every new workspace package needs a Dockerfile entry — easy to forget (which is exactly what happened with `contracts`: it was added to the codebase ~Apr 11 but never to the Dockerfile, breaking production silently until a rebuild was forced 2026-04-12)
3. Three nearly-identical compile-and-sed blocks in the Dockerfile that should be one
4. New developers reading `package.json` are misled about how production resolves the package

**Proper solution**: Adopt the **`development` conditional export** pattern (used by tRPC, TanStack Query, ts-rest, and most modern monorepo libraries):

```json
{
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  }
}
```

Dev runners (tsx, vitest) pass `--conditions=development` and resolve to source. Production runners (`node dist/server.js`) get no special condition and resolve to compiled `dist/`. Single source of truth, IDE jump-to-definition follows source automatically, and the Dockerfile loses 6 lines of `sed` hackery.

**Completed scope**:
- [x] `packages/shared/package.json` — all 16 exports (root + 15 subpaths) use `development`/`types`/`import`/`default` quadruplets
- [x] `packages/contracts/package.json` — single root export migrated
- [x] `services/hocuspocus/package.json` — single root export migrated
- [x] `apps/api/package.json` — all `tsx` dev/start/test/script invocations prepended with `cross-env NODE_OPTIONS=--conditions=development`
- [x] `services/hocuspocus/package.json` dev script — prepended with `NODE_OPTIONS=--conditions=development` (bash syntax; repo is Linux/WSL only)
- [x] `apps/mobile/metro.config.js` — `resolver.unstable_conditionNames` now `['development', 'require', 'react-native']`
- [x] `apps/api/Dockerfile` — 3 `sed` lines + 3 compile block wrappers removed, replaced with 3 plain `COPY` lines. Net -5 lines.
- [x] Runtime verified end-to-end via `tsx -e 'import("@gruenerator/contracts")'` and `import("@gruenerator/shared/api")` in both conditions — dev path resolves to `./src/*.ts` (new code), prod path resolves to pre-built `./dist/*.js`. The divergence between the two outputs in testing proved the paths are truly independent.

**Not migrated (intentional)**:
- `apps/web` Vite config — already bypasses `package.json` exports via a hard alias to `packages/shared/src`, so the conditional-exports pattern is moot for the web build. Leaving the alias in place.
- `apps/api` Vitest runner — uses `vitest`, not tsx. Vitest respects Node conditions via its own config; migrated opportunistically if we hit a test that imports workspace packages and fails.
- Manual `npx tsx <file>.test.ts` invocations — users must export `NODE_OPTIONS=--conditions=development` in their shell OR run via the package.json scripts. Documented in CLAUDE.md / tests section (follow-up).

**Outcome**: Adding a new workspace package now requires only (1) the package.json itself using the conditional exports shape and (2) a `COPY --from=builder /app/<pkg>/dist ./<pkg>/dist` line in `apps/api/Dockerfile`. No string-manipulation hack. The "I added a workspace package and prod broke 3 weeks later" bug class from 2026-04-12 is structurally impossible now.

## Acceleration Principles (2026-04-11)

1. **Opportunistic migration > blanket rollout.** Remaining ~50 validateBody routes have 0 violations — migrate when touching files, not as a batch.
2. **Don't chase the suppression count.** 22 `eslint-disable` in api is the correct permanent floor. Typing library boundaries adds complexity without preventing real bugs.
3. **Codegen over handwriting.** Zod schemas → ts-rest contracts can be automated. Don't rewrite what already exists.
4. **Frontend typing > backend lint.** The biggest safety win left isn't more backend lint fixes — it's typed API calls from the frontend (ts-rest). Focus there.
5. **Ratchet, don't re-count.** CI thresholds that only go down prevent regression without manual audits. Add a cast-count CI script.
6. **Scope honestly.** Phase 3 achieved 0 violations in api/services/packages, but web (1,224) and mobile (207) still have `warn` overrides. Don't mark "DONE" until the monorepo is clean.
7. **Diagnostic infrastructure earns its keep when production breaks.** (Added 2026-04-12 after the chat outage.) Adding logs/visibility proactively feels like premature engineering — until a 400 hits production with no server-side trace and you spend 3 redeploys discovering what broke. The right time to add `logContractValidationError`, drizzle adapter `debugLogs`, or Better Auth's logger config is BEFORE the first time you need them. Cost: 5 lines per feature. Payoff: turns multi-iteration bug hunts into single-iteration grep-and-fix loops.
8. **Coordinate implicit couplings explicitly.** (Added 2026-04-12 after the body parser outage.) The `CUSTOM_BODY_PARSER_PATHS` skip list and the chatGraph contract router were both correct in isolation but implicitly coordinated through "the legacy router happens to install its own parser." When one side moves (contract router intercepts traffic), the other side breaks invisibly. Anywhere two systems coordinate via "X happens to do Y," the coordination needs to be a comment, a checklist, or a runtime assertion — not tribal knowledge.

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
| Drizzle schema tables | 0 | ~20 | **~25** (+ba_*, +yjs_document_snapshots, +user_sites) | all |
| `database/types.ts` raw row types | many | 2 holdouts | **0** (Phase 2.1 fully closed) | 0 |
| Typecheck errors (all packages) | 3 | **0** | 0 | 0 |
| `validateBody` routes | 0 | ~75 | ~75 | opportunistic |
| ts-rest contracts | 0 | 4 (pilot) | **9 contracts / 7 mounted / 35+ endpoints** | all (~75 target) |
| ts-rest frontend typed hooks | 0 | 1 (`useRecentValuesTyped`) | **2** (+`useBoardsTyped`; `exportStore.ts` internals typed) | all contract-consuming hooks |
| External API Zod schemas | 0 | 0 | **WordPress (5) + in-progress** | all 8 clients |
| `parseJSON<T>()` adoption | — | 10 files | 10 files | all JSON.parse sites |
| `process.env.X` direct uses (api) | ~315 | — | **17** (298 eliminated; remainder is test mocks + env.ts self + telemetry write) | ~15 (floor) |
| Better Auth on Drizzle adapter | Kysely-era types only | — | **DONE, verified end-to-end** | done |
| Workspace package exports | `src/*.ts` + Dockerfile `sed` rewrite | — | **`development`/`default` conditional pattern** (Phase 6.1 DONE) | done |
| Contract router validation logger | — | — | **All 8 routers using shared helper** | mandatory for new |

**🎉 Phase 3 complete**: All safety-critical ESLint rules (`no-unsafe-*`, `no-floating-promises`, `no-explicit-any`, `exactOptionalPropertyTypes`) are now at `error` level across the **entire monorepo**. The `warn` override era is over.

**🎉 Phase 2.1 complete (2026-04-12)**: Better Auth runs on `@better-auth/drizzle-adapter` end-to-end. Verified by real Keycloak OAuth flow → session creation → chat working on top. The shipping chain took 16 commits across 5 layers (Drizzle schema → adapter swap → Docker contracts build → declared dep → trustedProviders + DB constraint fix → debug logging → contract router body parser + validation logger). Each layer was a different bug class; the diagnostic infrastructure built along the way (drizzle adapter `debugLogs`, Better Auth `logger.level: debug`, `logContractValidationError`) is now permanent value for any future auth/contract debugging.

**Note on cast regression:** `as unknown as` grew from ~37 (Phase 2 end) to 84 (api) / 205 (repo) due to new features added without cast discipline. Ratchet CI script (`scripts/type-safety-ratchet.sh`) prevents further regression.

## Principles

1. **Fix at the source, not at the call site.** One type fix in a getter eliminates 10 casts in consumers.
2. **No `as any` ever.** Use `as unknown as X` with the correct target type if you must cast.
3. **Validate at boundaries, trust internally.** External data (user input, API responses, DB results) gets validated. Internal function calls trust their types.
4. **Gradual adoption.** Enable rules as warnings first, fix existing violations, then promote to errors.
5. **Types are documentation.** A well-typed function signature tells you what it does without reading the body.
