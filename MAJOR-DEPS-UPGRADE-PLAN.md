# Major Dependency Upgrade Strategy

## Context

After patching 7 security vulnerabilities and updating 20+ patch/minor dependencies, 15 major version upgrades remain. This plan organizes them into a safe, phased rollout based on thorough codebase analysis of actual usage patterns, risk levels, and ecosystem readiness.

**Guiding principles**: Safety first. Each phase is independently deployable. Verify before proceeding to the next. Group coupled dependencies together.

---

## Phase 0: Remove Dead Dependencies (zero risk)

These packages are declared but never imported. Removing them reduces install time and attack surface.

| Package                              | Workspace  | Evidence                                                                                                             |
| ------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `body-parser` + `@types/body-parser` | `apps/api` | Zero imports — Express 5 bundles body-parser v2 via `express.json()` / `express.urlencoded()` in `server.ts:199-211` |
| `babel-jest` + `@babel/core`         | `apps/web` | Jest config exists but uses `--passWithNoTests` and has zero test files                                              |

**Investigate before removing:**
| Package | Workspace | Status |
|---------|-----------|--------|
| `@ai-sdk/react` | `apps/web` | No imports found in `apps/web/src/` or `packages/chat/src/`. Chat uses `@assistant-ui/react` exclusively. Verify with `pnpm knip` before removing. |

**Files to modify:**

- `apps/api/package.json` — remove `body-parser`, `@types/body-parser`
- `apps/web/package.json` — remove `babel-jest`, `@babel/core`; remove `jest` config block
- `pnpm-lock.yaml` — regenerate

**Verification:** `pnpm install && pnpm typecheck && pnpm build:web`

---

## Phase 1: Drop-in Upgrades (no code changes needed)

All verified to require zero code changes. Grouped by coupling.

### 1a. Dev tooling

| Package     | Current | Target | Workspaces     | Why safe                                                                               |
| ----------- | ------- | ------ | -------------- | -------------------------------------------------------------------------------------- |
| `cross-env` | 7.0.3   | 10.x   | api, web, root | Pure CLI tool, zero API surface. Only drops old Node support.                          |
| `dotenv`    | 16.6.1  | 17.x   | root, mcp      | api/docs/hocuspocus already on v17. `quiet` option silently ignored in v17 (verified). |

### 1b. Backend infra

| Package         | Current | Target | Workspaces | Why safe                                                                                                     |
| --------------- | ------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `connect-redis` | 8.1.0   | 9.0.0  | api        | Already using `redis` v5 client. v9 only drops old Node/old client support. Single usage in `server.ts:358`. |

### 1c. Build tooling

| Package                | Current | Target | Workspaces       | Why safe                                                                                                  |
| ---------------------- | ------- | ------ | ---------------- | --------------------------------------------------------------------------------------------------------- |
| `@vitejs/plugin-react` | 4.7.0   | 5.x    | web, docs, sites | All 3 vite configs use identical minimal config: `react({ jsxRuntime: 'automatic' })`. Already on Vite 7. |

### 1d. Type alignment

| Package       | Current | Target | Workspaces                | Why safe                                                                                       |
| ------------- | ------- | ------ | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `@types/node` | 22.x    | 24.x   | hocuspocus, mcp, remotion | Aligns with the v24 already used by web/docs/sites. All services run on same Node 20+ runtime. |

**Files to modify:**

- `package.json` (root) — `cross-env`, `dotenv`
- `apps/api/package.json` — `cross-env`, `connect-redis`
- `apps/web/package.json` — `cross-env`, `@vitejs/plugin-react`
- `apps/docs/package.json` — `@vitejs/plugin-react`
- `apps/sites/package.json` — `@vitejs/plugin-react`
- `services/mcp/package.json` — `dotenv`
- `services/hocuspocus/package.json` — `@types/node`
- `services/mcp/package.json` — `@types/node`
- `services/remotion/package.json` — `@types/node`
- `pnpm-lock.yaml` — regenerate

**Verification:** `pnpm install && pnpm typecheck && pnpm lint && pnpm build`

---

## Phase 2: Low-Risk Upgrades (minimal code changes, thorough verification)

### 2a. Sentry 9 → 10 (coupled: node + react)

| Package         | Current | Target | Workspaces |
| --------------- | ------- | ------ | ---------- |
| `@sentry/node`  | 9.47.1  | 10.x   | api        |
| `@sentry/react` | 9.47.1  | 10.x   | web, sites |

**Why low risk:**

- API uses only `Sentry.init()` + `setupExpressErrorHandler()` in `instrument.ts` and `server.ts:536`. `tracesSampleRate: 0`. Points to GlitchTip, not Sentry Cloud.
- Web uses only `Sentry.init()` + `captureException()` in a custom ErrorBoundary. No BrowserTracing, no Replay.
- Sites uses `captureException()`, `captureMessage()`, `setUser()`, `addBreadcrumb()` — all stable core APIs.

**Required checks:**

- Verify `setupExpressErrorHandler` still exists in v10 (may be renamed to `expressErrorHandler`)
- Verify GlitchTip envelope format compatibility with Sentry SDK v10

**Files to modify:**

- `apps/api/package.json`, `apps/web/package.json`, `apps/sites/package.json`
- Possibly `apps/api/server.ts` if method name changed

**Verification:** `pnpm typecheck` → deploy to beta → verify error reporting works (trigger a test error)

---

## Phase 3: Medium-Risk Upgrades (code changes required)

### 3a. TUS upload server 1 → 2

| Package           | Current | Target | Workspace |
| ----------------- | ------- | ------ | --------- |
| `@tus/server`     | 1.10.2  | 2.x    | api       |
| `@tus/file-store` | 1.5.1   | 2.x    | api       |

**Why medium risk — silent runtime regression if not handled:**

- Event names changed: `POST_CREATE` → `post-create`, `POST_FINISH` → `post-finish`
- `respectForwardedHeaders` option may be renamed/restructured
- All usage contained in single file: `apps/api/services/subtitler/tusService.ts`

**Required code changes in `tusService.ts`:**

```typescript
// Before:
tusServer.on('POST_CREATE', (req, res, upload) => { ... });
tusServer.on('POST_FINISH', (req, res, upload) => { ... });

// After:
tusServer.on('post-create', (req, res, upload) => { ... });
tusServer.on('post-finish', (req, res, upload) => { ... });
```

Also check constructor options against v2 API docs.

**Files to modify:**

- `apps/api/package.json` — both packages
- `apps/api/services/subtitler/tusService.ts` — event names + options

**Verification:** `pnpm typecheck` → deploy to beta → test subtitle upload flow end-to-end

---

## Deferred (blocked or needs separate planning)

### ESLint 10 — BLOCKED by ecosystem

`eslint-plugin-react` supports max `^9.7`, `eslint-plugin-react-hooks` supports max `^9.0`, `eslint-plugin-import-x` supports max `^9.0`. Only `typescript-eslint` supports ESLint 10.

**Action:** Wait for plugin ecosystem to catch up. Monitor monthly.

### React 19.1 → 19.2

Affects **every workspace** (8+ apps/packages). Has pnpm overrides pinning to 19.1.0. This is a monorepo-wide coordinated upgrade that deserves its own PR with full regression testing.

**Action:** Separate PR. Remove overrides, bump all workspaces, full test pass.

### Expo/React Native packages (SDK 54 constraint)

All pinned by Expo SDK 54's `bundledNativeModules.json`:

- `@react-native-async-storage/async-storage` 2.2 → 3.0
- `react-native-screens` 4.16 → 4.24
- `@expo/metro-runtime` 6.1 → 55.0
- Plus: `react-native-gesture-handler`, `react-native-reanimated`, `react-native-svg`, etc.

**Action:** Wait for Expo SDK 55. Use `npx expo install --fix` after SDK upgrade.

### @ai-sdk/react 2 → 3

If confirmed unused by `pnpm knip`, remove entirely instead of upgrading. If used transitively, upgrade together with the `ai` SDK in a dedicated PR.

### Docusaurus 3.8 → 3.9

Low priority. Only affects `documentation/` workspace. Minor bump, but Docusaurus minors sometimes break themes/plugins.

**Action:** Upgrade when next touching docs site.

---

## Execution order summary

```
Phase 0  ──►  Phase 1a/1b/1c/1d  ──►  Phase 2a  ──►  Phase 3a
(remove)      (drop-in bumps)          (Sentry)       (TUS)
   │               │                      │              │
   └── commit ─────┘── commit ────────────┘── commit ────┘── commit
       & verify        & verify               & verify       & verify
```

Each phase = 1 commit. Verify typecheck + build after each. Deploy to beta after Phase 2a and 3a.
Phase 0 and 1 can potentially be combined into a single commit if preferred, since neither requires code changes.

---

## Verification checklist (after all phases)

1. `pnpm typecheck` — all 12 packages pass
2. `pnpm lint` — no new lint errors
3. `pnpm build` — all builds succeed
4. Deploy to beta.gruenerator.de
5. Smoke test: health endpoint, chat, subtitle upload, error reporting
6. Monitor GlitchTip for new error patterns after Sentry upgrade
