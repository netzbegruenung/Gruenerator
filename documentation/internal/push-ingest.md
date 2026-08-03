# Push-based content ingest (WordPress plugin → Grünerator)

> **Audience: internal / interns.** This explains the push-ingest feature end to
> end — why it exists, how the backend works, how the WordPress plugin works, how
> to issue a key, and how to test it. Pair it with the high-level plan if you want
> the original design rationale.

## Why this exists

Landesverband (LV) content used to reach Grünerator only by **polling**: a GitHub
Actions workflow ran the `LandesverbandScraper` hourly, crawled every LV
WordPress site, diffed against Qdrant, and re-embedded what changed. That is slow
(the LV job once hit a 50-minute timeout), fragile (HTML/selector drift), and has
up-to-an-hour latency.

The push feature flips it around: a small WordPress plugin (`gruenerator-sync`)
calls Grünerator **the moment an article is published**, so it is searchable in
seconds. The scraper stays as an automatic backstop.

## The two targets

One endpoint, two destinations (chosen per request via a discriminated `target`):

| Target          | Where it lands                                                                               | Identified by                         | Authorized by                                                     |
| --------------- | -------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| `landesverband` | Curated LV system collection (`landesverbaende_documents`, filtered by `landesverband` code) | `sourceId` (e.g. `sachsen-anhalt-lv`) | API key scope `landesverbaende` includes the source's `shortName` |
| `notebook`      | A user notebook (shared `documents` collection + notebook link)                              | `notebookId` (UUID or slug)           | API key user has **edit** rights on that notebook                 |

## Backend architecture

```
WordPress plugin
   │  POST /api/v1/push/articles            (Bearer <api key>)
   ▼
requireApiKey + apiKeyRateLimit('push')     (routes.ts prefix)
   ▼
pushIngestContractRouter  (thin: auth + scope, dispatch on body.target)
   ├── target=landesverband ─► ingestLandesverbandArticle()
   │        └─ createDocumentProcessor() → DocumentProcessor.processAndStoreDocument()
   │                                       (SAME pipeline the scraper uses)
   │        └─ touchPushHeartbeat(sourceId)
   └── target=notebook ──────► ingestNotebookArticle()
            └─ processUrlContent() → documents collection
            └─ addDocumentsToCollection(notebookId, [docId], userId)
```

Key idea: **one pipeline, no drift.** The LV push path reuses the exact
`DocumentProcessor` the scraper uses, wired through a shared
`createDocumentProcessor()` factory so a pushed article and a scraped article get
the _same_ deterministic Qdrant point ids and the same dedup-by-`source_url`.

### Files (backend)

- `packages/contracts/src/schemas/pushIngest.ts` — Zod schemas (the spec). The
  `contentType` is a closed `z.enum`; the body is a `z.discriminatedUnion` on
  `target`. TS types are `z.infer`-derived.
- `packages/contracts/src/contracts/pushIngestContract.ts` — ts-rest contract
  (`ping`, `ingestArticle`, `deleteArticle`).
- `apps/api/services/pushIngestion/`
  - `documentProcessorFactory.ts` — shared DocumentProcessor wiring +
    `generateLvPointId` (the parity-critical id function).
  - `landesverbandTarget.ts` — `ingestLandesverbandArticle` / `deleteLandesverbandArticle`.
  - `notebookTarget.ts` — `ingestNotebookArticle` / `deleteNotebookArticle`.
  - `pushHeartbeat.ts` — `touchPushHeartbeat`, `getPushActiveSourceIds` (the
    "code decides" switchover).
  - `errors.ts` — `PushIngestError` (carries the HTTP status for the router).
- `apps/api/routes/v1/pushIngestContractRouter.ts` — thin router, mounted in
  `routes.ts` behind `requireApiKey` + `apiKeyRateLimit('push')`.
- `apps/api/database/schema/lvPushHeartbeat.ts` +
  `apps/api/database/postgres/migrations/create_lv_push_heartbeat.sql` — the
  heartbeat table (auto-migrated on boot).
- `apps/api/scripts/createLvIngestKey.ts` — issue an API key.

### The "plugin is default, code decides" heartbeat

When an LV pushes, the service upserts `lv_push_heartbeat.last_push_at`. Before the
scheduled scraper crawls a source, it calls `getPushActiveSourceIds()` and **skips
any source pushed within `LV_PUSH_FRESHNESS_HOURS` (default 26h)** — unless
`--force`. If pushes go silent, the window lapses and the scraper resumes
automatically. No manual per-LV flag; nothing is ever left un-synced.

Only the `landesverband` target touches the heartbeat (user notebooks are never
scraped).

## The WordPress plugin (`wordpress-plugin/gruenerator-sync/`)

Minimal, PHP 8.1+, PSR-4, no custom DB tables (one option + the queue).

- **Trigger:** `transition_post_status` (not raw `save_post`, so autosaves and
  revisions don't leak). Publish in a mapped category → enqueue a push. Any exit
  from "published" (unpublish/trash/delete) → enqueue a delete by URL.
- **Queue:** Action Scheduler if bundled (reliable, retries), else a wp-cron
  fallback — so saving a post never blocks on the network.
- **Payload:** title, plain-text body (`wp_strip_all_tags(apply_filters('the_content', …))`),
  excerpt, permalink (the dedup key), post id, publish time, categories, author,
  featured image URL.
- **Settings screen** (Settings → Grünerator Sync): API base URL, write-only API
  key, target + source id / notebook id, category→content-type map, post types,
  plus **Test connection** and **Resync all published**, and a status panel.
- **Security:** `manage_options` + nonces on every action; the API key is stored
  write-only (never echoed back) and can be set via the `GRUENERATOR_SYNC_API_KEY`
  wp-config constant.

### Key files (plugin)

`gruenerator-sync.php` (bootstrap + PHP guard + autoload) · `src/Plugin.php`
(wiring) · `src/Settings/Settings.php` (typed option access) ·
`src/Settings/SettingsPage.php` (admin UI + test/resync) · `src/Sync/PostObserver.php`
(lifecycle hooks) · `src/Sync/Queue.php` (AS/cron enqueue) · `src/Sync/PushJob.php`
(background workers) · `src/Sync/Payload.php` (WP_Post → body) · `src/Http/Client.php`
(API client) · `uninstall.php` (cleanup).

## Issuing an API key

Run on the backend host (writes the row directly; plaintext shown once):

```bash
# Landesverband target, scoped to Sachsen-Anhalt:
pnpm --filter @gruenerator/api exec tsx scripts/createLvIngestKey.ts \
  --user <USER_UUID> --label "Grüne LSA WordPress" --lv LSA

# User-notebook target (no LV scope; the user must have edit rights on the notebook):
pnpm --filter @gruenerator/api exec tsx scripts/createLvIngestKey.ts \
  --user <USER_UUID> --label "My WP site" --lv '*'
```

Keys live in the existing `api_keys` table with
`scopes = { permissions: ['ingest:articles'], landesverbaende: [...] | '*' }`.

## API reference (the durable seam)

All routes require `Authorization: Bearer <key>` and are under `/api/v1/push`.

- `GET /ping` → `{ ok, userId, landesverbaende, permissions }` — connection test.
- `POST /articles` — body is the discriminated union; returns
  `{ ok, action: 'stored'|'updated'|'skipped', documentId, vectors, reason }`.
- `POST /articles/delete` — `{ target, sourceId|notebookId, sourceUrl }`; returns
  `{ ok, action: 'deleted'|'skipped', removed }`.

The contract is the **only** coupling to the plugin — change it additively, never
reshape a field. Breaking changes get a new path.

## Testing without the plugin

```bash
# 1. Issue a key (above), copy the printed grun_… value.
# 2. Ingest a Landesverband article:
curl -sS -X POST http://localhost:3001/api/v1/push/articles \
  -H "Authorization: Bearer grun_…" -H 'Content-Type: application/json' \
  -d '{"target":"landesverband","sourceId":"sachsen-anhalt-lv","contentType":"presse",
       "title":"Test","contentText":"<150+ chars of body text …>",
       "sourceUrl":"https://gruene-lsa.de/presse/test","categories":["Pressemitteilungen"]}'
# → {"ok":true,"action":"stored",...}; re-run → action "updated"/"skipped".
# 3. Delete it:
curl -sS -X POST http://localhost:3001/api/v1/push/articles/delete \
  -H "Authorization: Bearer grun_…" -H 'Content-Type: application/json' \
  -d '{"target":"landesverband","sourceId":"sachsen-anhalt-lv","sourceUrl":"https://gruene-lsa.de/presse/test"}'
```

Heartbeat check: after a push, run
`pnpm --filter @gruenerator/api run update:all -- --landesverband LSA` and confirm
the log shows `Push-active sources skipped: …`. `--force` scrapes anyway.

Unit tests: `pnpm --filter @gruenerator/api exec vitest run services/pushIngestion`.

## Building / releasing the plugin

```bash
cd wordpress-plugin/gruenerator-sync
composer install --no-dev   # bundles Action Scheduler + update checker into vendor/
composer lint               # PHPCS (WordPress-Extra)
composer analyse            # PHPStan level 6
# zip the folder (excluding dev files) → upload via Plugins → Add New → Upload
```

Auto-update is wired to GitHub releases of `netzbegruenung/gruenerator-sync`
(tag = version). Without `vendor/` the plugin still runs (wp-cron fallback, no
auto-update) — fine for quick testing, not for production.

## Troubleshooting

- **401 on every call** — missing/invalid/revoked key, or no `Authorization` header.
- **403 `missing scope`** — the key lacks `ingest:articles`.
- **403 `not authorized for Landesverband`** — key's `landesverbaende` scope
  doesn't include the source's `shortName`.
- **404 `Unknown notebook`** — wrong notebook id/slug, or the key's user can't edit it.
- **422 `Unknown sourceId`** — the `sourceId` isn't in `landesverbaendeConfig.ts`.
- **Article not appearing** — check `contentText` ≥ 100 chars; check the plugin's
  status panel; confirm the post's category is in the map (or the map is empty).
- **Scraper still running for a pushed LV** — heartbeat older than
  `LV_PUSH_FRESHNESS_HOURS`, or the run used `--force`.
