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
- **`apps/api`** — Express 5, Node.js cluster mode. AI runs in-process via `services/ai/aiService.ts` (still reachable as `app.locals.aiWorkerPool` — the `worker_threads` pool it replaced is gone). Routes in `routes/`, logic in `services/`. See `CLAUDE-routing.md`.
  - **Chat: contract router is the only handler.** `routes/chat/chatGraphContractRouter.ts` (+ `agents/langgraph/ChatGraph/` nodes: classifier → search → respond) handles `/api/chat-service/*`; tools are executed by `routes/chat/services/intentExecutionService.ts` (calling services directly — there is no LangChain tool registry). **When debugging chat behavior (intent, tool calls, prompts), check the contract router & ChatGraph nodes first** — confirm via backend logs `[ChatGraph:Classifier]` / `[chatGraphContractRouter]`.
  - **Before restructuring anything in the chat stack, read `docs/chat-architecture-evaluation.md`.** It records what the architecture actually is (the compiled LangGraph graphs have zero callers — the routers hand-sequence the nodes), which duplicates are deliberate vs. drift, what the AI SDK v7 already provides that we hand-rolled, and why Deep Agents was evaluated and declined. Note `/docs/` is gitignored — edits there need `git add -f`.
- **`apps/docs`** — **Deprecated** collaborative editor. New docs features → `apps/web/src/features/docs/` + `packages/docs/`.
- **`apps/mobile`** — Expo 57 / React Native 0.86 with Expo Router.
- **`apps/desktop`** — Tauri 2 wrapper around web frontend. **ALWAYS build the desktop app from `master`, never from a feature branch.** The build bundles the web frontend, but the running app talks to the *deployed production* backend (`gruenerator.eu`). A branch frontend ships calls to endpoints / response shapes prod doesn't have yet → they 404 and the app hangs on loading skeletons. Land desktop changes on `master` first (PR + deploy backend), then build.
- **`packages/chat`** — Shared chat UI, runtime adapters (Assistant UI), stores, hooks. Consumed at `/chat`. Composer controls (modes/models) are defined once here and rendered per-platform — see `CLAUDE-chat.md`; never hardcode mode/model/tool lists in an app.
- **`packages/shared`** — Shared stores (Zustand), hooks, API clients, feature modules. Components in `src/components/`.
- **`packages/sites`** — Embedded candidate-site builder (Home / Login / Demo / Edit pages, editor components, stores). Consumed by `apps/web` at `/sites/*` via `apps/web/src/features/sites/`. No standalone shell; auth/apiClient injected via `<SitesProvider>`.
- **`packages/sites-design`** — Design tokens + presentational components for the site builder (consumed by `packages/sites` and the public candidate sites).
- **`packages/canvas-editor`** — Config-driven react-konva editor. Per-instance Zustand stores via `CanvasStoreProvider`. **Editor UI follows the "Canva-Layout in Grünerator-Grün" design — see `packages/canvas-editor/CLAUDE.md` (mandatory `--editor-*` token layer, no `dark:` utilities, tokens in 4 files).**
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

**Debugging the PRODUCTION bundle locally** (bundle-only bugs: chunk init order, lazy-load timing): the bypass is baked in at BUILD time (`import.meta.env` is inlined), so set `VITE_E2E_AUTH_BYPASS=true` in `apps/web/.env` BEFORE `pnpm build:web`, then serve with `cd apps/web && VITE_E2E_AUTH_BYPASS=true VITE_DEV_AUTH_BYPASS_TOKEN=<token> npx vite preview --port 3101`. The preview proxy (vite.config `preview.proxy`) forwards `/api` to the local backend on :3001, attaches the `x-dev-auth-bypass` header AND rewrites the `origin` header to `http://localhost:3000` — the backend's CORS allowlist only accepts :3000, so without the rewrite every API call fails with "Not allowed by CORS". Port 3000 is often taken by a running dev server; any other port works because of the rewrite. In worktrees, `.env` files are untracked — copy them from the main checkout first.

### AI Providers

Mistral AI (primary, EU), self-hosted GPT-OSS/Gemma via LiteLLM/verdigado, Seeweb/Regolo AI (EU; also transcription via faster-whisper, with Mistral Voxtral as fallback), Scaleway (EU/Paris; liefert Mistral Medium 3.5 und Whisper), Flux/BFL (images). NOT used in production: Together AI (historical fine-tuning experiment only, see `CLAUDE-finetuning.md`), AssemblyAI, Gladia, Bedrock/Claude. No ultra/pro/privacy mode flags — model routing is type-based in `providerSelector.ts`; explicit model choice exists only in Playground, mobile chat, and agent configs.

**Scaleway ist ein Upstream, kein `ProviderName`.** Mistral Medium 3.5 läuft auf Scaleway, die Mistral-API ist der Fallback; die Weiche steht in `routeMistralModel` (`services/ai/providerInstances.ts`) — eine Ebene UNTER dem Lane-Namen. Grund: alles Policy-Relevante prüft `provider === 'mistral'` (`isAgenticToolCapable`, Kontextfenster, Fallback-Ketten), ein Geschwister-Provider hätte das fürs Hauptmodell still abgeschaltet. Deshalb brauchen die ~20 Aufrufer, die `mistral-medium-2604` hart benennen, keine Änderung. **Zwei Ausnahmen bleiben bewusst auf der Mistral-API:** Denk-Anfragen (`providerOptions.mistral` erreicht einen OpenAI-kompatiblen Client nie — stiller Verlust; roh erzwungen liefert Scaleway leeren `content`, weil das Reasoning gegen `max_tokens` zählt) und alles außer Medium (Pixtral, Small, Embeddings). Scaleways Whisper kann **nur Segment-**, keine Wort-Zeitstempel — `WORD_TIMESTAMP_CHAIN` in `services/transcription/providerPolicy.ts` hält es aus dem Untertitel-Pfad heraus, weil eine wortlose Antwort kein Fehler ist und die Fallback-Schleife sie sonst als Erfolg akzeptieren würde.

**Websuche: Linkup** (`LinkupService.ts`, `LINKUP_API_KEY`). Die `linkup-*` Skills gelten auch für unseren Integrations-Code: `depth` ist eine Kostenentscheidung — `fast`/`standard` als Default, `deep` nur für „erst URL finden, dann scrapen".

## Development Conventions

### Git Safety

- **NEVER `git stash`/`git stash pop`** — causes merge conflicts, loses work. Commit to a branch instead.
- **Before PR**: `git fetch origin master` to ensure fresh remote ref.
- **Regular merge only** (not squash). `test-branch` is long-lived; squash breaks commit identity.
- **PR merges require admin.** `gh pr merge` fails — ask user to merge via GitHub UI.
- **Worktree weg, sobald alles gepusht ist** — nicht erst nach dem Merge. Ein offener PR braucht kein lokales Verzeichnis, er lebt auf `origin`. Kriterium: `git status --porcelain` **und** `git log @{u}..` beide leer → `git worktree remove <pfad>` (Branch bleibt stehen). Nach dem Merge zusätzlich `git branch -d <br> && git worktree prune`. Nie `--force`, nie fremde Worktrees — andere Agenten arbeiten parallel.

### Agent-Skills & versionsgenaue Doku

**Bevor du Code gegen eine Library änderst (AI SDK, Tailwind v4, LangGraph, Drizzle, Zod, Qdrant, Expo, Tiptap, Better Auth, Linkup, …): erst die versionsgenaue Quelle lesen, nicht aus dem Gedächtnis schreiben.** Welche Skill bzw. welches `llms.txt` — und die Fallen dabei — stehen in `CLAUDE-agent-docs.md`. Ein Tool-Call ist billiger als ein Debug-Zyklus an einer umbenannten API.

### Expo Apps

Expo-Skills sind als Plugin `expo@claude-plugins-official` installiert (user scope) — siehe *Agent-Skills & versionsgenaue Doku*. Use `npx expo install` (not `pnpm add`). See `CLAUDE-expo.md`. Always use `expo-image` (not RN `Image`) — RN can't render SVGs.

**React version is decoupled between web and mobile — never use a single global override.** RN bundles `react-native-renderer` pinned to one EXACT React version; React's runtime check rejects any mismatch (symptoms: `Incompatible React versions`, then cascading `Maximum call stack size exceeded` / `Cannot read property 'ErrorBoundary' of undefined` / phantom "missing default export" route warnings). So:
- `apps/mobile` pins `react`/`react-dom` to the **exact** version the Expo SDK ships. Bump it **only** via `npx expo install react react-dom` during an SDK upgrade — never independently. Dependabot ignores react/react-dom for `/apps/mobile` entirely (`.github/dependabot.yml`).
- Web/api/gruen-o-mat track their own react (`^`/latest) — separate Vite/Metro bundles never share a React runtime, so they need not match mobile.
- Do **not** add `react`/`react-dom` to root `pnpm.overrides`: a global override forces mobile to web's version and breaks RN. Shared `packages/*` declare react as `peerDependency: ^19.0.0`, so they inherit each consumer's react — no override needed for dedup.

### Styling & UI

See `CLAUDE-styling.md` for Tailwind v4, theme/dark mode, CSS variables, shadcn/ui setup, docs app conventions.

### Barrierefreiheit

Zielstandard WCAG 2.2 AA im Rahmen von EN 301 549. **Vor Farb-, Karten-, Fokus- oder ARIA-Änderungen `CLAUDE-a11y.md` lesen** — dort stehen die Prüfmittel je Ebene, die Farbregeln (ein Token kann nicht `bg-` und `text-` in beiden Modi bedienen; `opacity` frisst den Kontrast von allem darin) und das Messrezept, ohne das jede Nachmessung zwanzigmal die Loginseite prüft und grün meldet. Öffentliche Selbstauskunft: `documentation/docs/ueber-den-gruenerator/barrierefreiheit.md` — bei behobenen oder neuen Mängeln dort das Stand-Datum und die Liste nachziehen.

### State Management

Zustand (global state). TanStack Query v5 (server state/fetching) with axios.

### Naming, IDs & Renames

**Drei Frozen-Stufen — jeden Rename zuerst einordnen:**

- **F0 — extern eingefroren (Rename existiert nicht):** DB-Tabellen/-Spalten, Contract-Feldnamen und `z.enum`-Werte, MCP-Tool-Namen, Qdrant-Collections, Redis-/localStorage-Keys, Env-Vars, IDs in persistierten Inhalten (z. B. Mention-Tokens), CI-Job-Namen in Required Checks. Änderung nur **additiv**: Neues emittieren UND Altes tolerant weiterlesen, Deprecation mit Datum. Grund: ausgelieferte Mobile-Binaries, externe MCP-Clients und Nutzerdaten sprechen das alte Format weiter — der Compiler sieht nur den aktuellen Quellstand. URLs sind F0 mit Sonderrecht: neuer Pfad erlaubt, alter Pfad leitet für immer weiter (Slug-Suffix-/Redirect-Muster).
- **F1 — intern eingefroren:** Registry-IDs (Tool-, Agent-, Intent-, Notebook-IDs, Icon-/Theme-Keys). Werden nicht umbenannt, auch wenn sie semantisch veralten — ein Kommentar in der Registry ist billiger als jede Migration. Notausgang nur mit Begründung im PR: Alias mit Ablaufdatum (Vorbild: `LEGACY_ID_ALIASES` + zustand-persist `version`/`migrate` in `sidebarFavouritesStore.ts`).
- **F2 — frei:** Code-Symbole, Datei-/Ordnernamen, Anzeigenamen, Doku-Prosa. IDE-Rename/`git mv` genügt — genau dafür halten F0/F1 sie von der Persistenz entkoppelt. Anzeigenamen leben an genau einer Stelle (Registry-`title` bzw. der eine JSX-String, den das UI-Label-Manifest kennt).

**Registry-Pflicht für neue ID-Mengen:** als `as const`-Registry mit exportierter Literal-Union anlegen (`type FooId = (typeof FOOS)[number]['id']`); Konsumenten leiten ab und deklarieren nie neu. Zuordnung: Wire-querende Mengen → benanntes, exportiertes `z.enum` in `@gruenerator/contracts` (nie inline duplizieren); rein Client-seitige → Config-Registry (Vorbilder: `documentation/src/nav/sections.ts`, `packages/shared/src/agents/`); Doku-Präsentation → `sections.ts`. Accessoren nehmen die Union, nicht `string`.

**Persist-Konvention:** Jeder zustand-persist-Store wird mit `version` + `migrate` angelegt. DB-Umbauten mit ID-Semantik: expand → backfill/dual-write → contract; bei Spalten-Änderungen alle Queries greppen.

**Sprachregelungen (Produkt-Wording):** Plural **„Grüneratoren"**, Singular **„Grünerator-Agent"** (nie „Agent" allein — „der Grünerator" meint das Produkt); **„Rezepte"** (nicht „Skills"); **„Projekte"** (nicht „Gruppen"/„Spaces"). Neue Produktnamen hier eintragen, bevor das Feature gebaut wird.

### Parteiinterne Inhalte gehören nicht in dieses Repo

**Dieses Repo ist öffentlich, und `packages/shared` landet im Web-Bundle und in jeder ausgelieferten Mobile-Binary.** Was dort hineingerät, ist veröffentlicht — `.gitignore` kommt zu spät, und eine ausgelieferte Binary holt man nicht zurück.

Betroffen sind **Rezept-Prompts und Agenten-Personas**: `agents/skills/*.md` und `agents/definitions/*.md` in `packages/shared` tragen nur Frontmatter. Der Prompttext liegt im privaten Repo `netzbegruenung/gruenerator-intern` und wird zur Laufzeit aus `INTERN_CONTENT_DIR` gelesen (`apps/api/services/skills/internalPrompts.ts`) — Rezepte in `respondNode`, Personas in `routes/chat/agents/agentLoader.ts`. Dasselbe gilt für Korpus-Rohdaten und Sprachanalysen unter `documentation/docs/intern/`.

Die LV-Agenten (`lvPrAgents.ts` / `lvBuergerAgents.ts`) bleiben bewusst im Repo: sie bauen ihre `systemRole` aus einem Template, das generische Handwerksregeln plus regionale Themenliste enthält — kein Korpuswissen, keine Gegner-Frames.

`pnpm check:internal` (in `pnpm ci` und in der CI) bewacht die Grenze. Neue interne Pfade in `PRIVATE_PREFIXES` in `scripts/check-internal-content.mjs` eintragen — **nicht** nur in `.gitignore`: eine bereits getrackte Datei ignoriert git weiter fröhlich mit (genau so lagen 26 Dateien aus `documentation/docs/intern/` auf `origin/master`, obwohl der Pfad seit Langem in `.gitignore` stand).

### Commits

Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`). Atomic: one logical change per commit.

**Subject nach dem Doppelpunkt klein schreiben** — commitlint (`subject-case`) bricht sonst ab. lint-staged hat dann schon formatiert und re-staged: Commit einfach neu absetzen, es geht nichts verloren.

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

**`pnpm.overrides` hat zwei Ausfallarten, und für jede gibt es einen eigenen Check.** Ein Override *ersetzt* den Bereich, den ein Paket selbst deklariert, und pnpm prüft danach nicht mehr nach — bei regulären `dependencies` warnt es auch nicht (nur unerfüllte `peerDependencies` meldet es). (1) Manifest und Lockfile driften auseinander, weil Dependabot `pnpm.overrides` nicht editieren kann → `pnpm overrides:check` / `overrides:fix`, läuft im `guards`-Job vor dem Install. (2) Das Override rutscht **unter** den Bereich, den ein Abhängiger fordert → `pnpm overrides:ranges` (`scripts/check-override-ranges.mjs`), hängt am `typecheck`-Job, weil es `node_modules` braucht. Fall 2 trifft Paketfamilien, die gemeinsam versioniert sind und einzeln in den Overrides stehen (`@assistant-ui/*`, `@tiptap/*`, `@blocknote/*`): Dependabot hebt das eine Paket, die Geschwister-Pins bleiben stehen — und weil der alte Caret die alte Version weiterhin erlaubt, merkt es niemand bis der Bundler mit `MISSING_EXPORT` abbricht. **Ein Override einer Familie nie allein heben.** Bewusste Rückwärts-Pins (zod 3, `@expo/dom-webview`, `http-proxy-middleware`) stehen mit Begründung in `DELIBERATE` im Check.

**Knip** (`pnpm knip`, nicht in CI) findet toten Code — die Entry-Punkte in `knip.json` sind load-bearing: was knip nicht als Entry kennt, sieht es als „unbenutzt" und alles darunter gleich mit. Dynamisch geladene Dateien müssen deshalb explizit als Entry stehen (`apps/api/workers/aiWorker.ts` wird über einen berechneten Pfad in `new Worker()` geladen; `apps/mobile/app/**` kommt aus dem Expo Router; Web-Worker unter `apps/web/src/services/*.worker.ts`). Tests/Skripte gehören als **Entry** eingetragen, nicht in `ignore` — sonst zählen ihre Importe nicht als Nutzung und die Deps, die nur sie brauchen, gelten als unbenutzt. `apps/desktop` (Tauri-Wrapper) und `apps/wordpress` (Einstiege liegen in PHP) sind bewusst per `ignoreWorkspaces` ausgenommen.

**Cache-Soundness in `turbo.json` — die `^`-Kanten sind load-bearing, nicht kosmetisch.** Turbo hasht für einen Task nur die **eigenen** Dateien seines Pakets plus die Hashes der per `dependsOn` verketteten Tasks. Unsere Pakete lesen sich aber gegenseitig über tsconfig-`paths` **im Quelltext** (`apps/web/tsconfig.json` bildet `@gruenerator/shared` auf `../../packages/shared/src` ab, es gibt keine Project References). Ohne `^`-Kante fällt der Hash eines Konsumenten deshalb nicht aus, wenn sich die Quelle seiner Abhängigkeit ändert — Turbo liefert einen Cache-Treffer und ein echter Typfehler bleibt still grün. Gemessen am `web#typecheck`-Hash gegen eine Änderung in `packages/shared`: mit `^typecheck` `e0c91092…` → `7c2d8ba7…`, ohne die Kante zweimal `0d31e29f…`.

Konsequenzen:

- `typecheck` **und** `lint` tragen `dependsOn: ["^typecheck"]`. Bei `lint` sieht die Kante falsch aus, ist es aber nicht: ESLint läuft hier voll typ-bewusst (`projectService` + `no-floating-promises`/`no-unsafe-*` in `packages/eslint-config/base.js`) und liest dieselben fremden Quellen. `^lint` genügt nicht, weil die Hälfte der Zwischenpakete (`canvas-editor`, `collab`, `docs`, `presentations`, `sheets`, `voice`, `wolke`, `sites-design`) gar kein `lint`-Skript hat und die Hash-Kette dort abreißen würde — `typecheck` haben sie alle.
- Wer eine `^`-Kante entfernen will, weil sie „nur serialisiert": vorher den Hash messen (`turbo run <task> --dry=json`, Feld `hash`), nicht bloß prüfen, ob der Task isoliert grün läuft. `--only` beweist nur, dass die Reihenfolge egal ist, nichts über die Korrektheit des Caches.

**Check-Budget.** `pnpm ci` fasst typecheck/lint/test in **einen** Turbo-Aufruf, danach `format:check` (Prettier läuft mit `--cache --cache-strategy content`: 19,6 s → 4,1 s warm). Auf einem M5/10 Kerne kostet ein kalter Voll-Typecheck ~64 s, ein kalter Voll-Lint ~287 s (`web` 287 s, `api` 281 s, `mobile` 236 s dominieren), die Testsuite ~114 s. Bei ~5 parallelen Agenten auf 16 GB bleibt es trotzdem bei:

- Während der Arbeit paketweise: `pnpm --filter @gruenerator/<pkg> exec tsc --noEmit`, `npx eslint <dateien>`, `npx vitest run <eine.vitest.ts>`.
- Voll-Check (`pnpm ci`) **einmal am Ende**, in einem Worktree — nicht als Zwischenstand, nicht als Statusbericht.
- Nie ganze Test-Verzeichnisse (`vitest run routes/chat agents/langgraph …` = 113 Dateien / 275 s / ~9 Forks).
- `--force` nur nach Änderungen an Build-Outputs geteilter Pakete, dann mit `--filter`. Nie als Reflex am Ende.

### Frontend component testing

`apps/web` and `packages/chat` have a jsdom vitest lane (`*.vitest.tsx`) running **alongside** the fast node lane (`*.vitest.ts`) — never flip the whole config to jsdom. Pick the tool by component shape: **RTL** for render/branching/interaction, **MSW** for `getContractsClient()` data hooks (success/error/empty branches), **axe** (`axe` from `test-utils`) wherever `aria-*`/`role=` is hand-written. Full guide, reference tests, the component→tool matrix, the sweep plan, and the load-bearing gotchas (react aliased + react-query inlined in the dom project) live in **`apps/web/CLAUDE-testing.md`** — read it before adding component tests. jsdom is pinned exactly in `pnpm.overrides` (now `30.0.0`, was `26.1.0` while jsdom 29 broke against the `undici >=8.5.0` override) so the three vitest lanes and jest-expo's `jest-environment-jsdom` share one copy — a bump therefore needs the override line too, see `pnpm overrides:fix`.

### Newsletter

See `CLAUDE-newsletter.md`. Landesverband notebooks: see `CLAUDE-landesverband.md`.

## Deployment

See `CLAUDE-deployment.md` for Docker images, test/prod environments, deploying steps, and shared package checklist.
