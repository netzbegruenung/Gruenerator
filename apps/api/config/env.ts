/**
 * Typed Environment Variables
 * Zod-validated env schema — parsed once at startup, throws on missing required vars.
 * Import `env` instead of reading `process.env` directly.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coerce "true"/"false" strings to booleans. */
const boolFlag = (defaultValue: boolean) =>
  z
    .string()
    .transform((v) => v === 'true')
    .default(defaultValue ? 'true' : 'false');

/** Coerce a string to a number with a required default. */
const numStr = (defaultValue: number) => z.coerce.number().default(defaultValue);

/**
 * Fusionsarme des server-seitigen Hybrid-Pfads (`HYBRID_SERVER_FUSION`, #3118).
 * `as const`-Registry statt Inline-Liste: `z.enum` und die exportierte
 * Literal-Union kommen aus EINER Quelle, und beide `HybridConfig`-Interfaces
 * (`config/vectorConfig.ts`, `QdrantService/operations/types.ts`) leiten davon
 * ab, statt die fünf Namen ein drittes und viertes Mal zu tippen.
 *
 * `sparse_only` ist ein Diagnosearm, kein Auslieferungskandidat: sein `score`
 * ist ein BM25-Wert und keine Kosinus-Ähnlichkeit, und die Pipeline dahinter
 * rechnet in Kosinus weiter.
 */
export const HYBRID_SERVER_FUSIONS = [
  'rrf',
  'rrf_weighted',
  'dbsf',
  'dense_rescore',
  'sparse_only',
] as const;

export type ServerFusion = (typeof HYBRID_SERVER_FUSIONS)[number];

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const envSchema = z.object({
  // ── Runtime ────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: numStr(3001),
  HOST: z.string().default('127.0.0.1'),
  WORKER_COUNT: numStr(2),

  // ── Session / Auth core ────────────────────────────────────────────────
  SESSION_SECRET: z.string().optional(),
  /**
   * Signing key for search-image proxy handles. Optional: falls back to
   * SESSION_SECRET, and with neither set the proxy stays off and search images
   * remain plain links. Set it separately only to rotate proxy handles without
   * invalidating every session.
   */
  SEARCH_IMAGE_PROXY_SECRET: z.string().optional(),
  /**
   * Signing key for thumbnail URLs (`/api/thumbs/...`). Optional: falls back to
   * SESSION_SECRET so existing deployments boot, and with neither set no
   * thumbnail URLs are minted at all (surfaces show their placeholder).
   *
   * Set this separately and rotate THIS one — rotating SESSION_SECRET to
   * invalidate a leaked thumbnail URL would log out every user on the platform.
   * During a rotation move the old value to `_PREVIOUS` for one deploy so URLs
   * already sitting in cached list responses keep resolving.
   */
  MEDIA_URL_SIGNING_SECRET: z.string().optional(),
  MEDIA_URL_SIGNING_SECRET_PREVIOUS: z.string().optional(),
  /**
   * Where generated thumbnail variants are cached. Defaults to
   * `apps/api/uploads/thumb-cache`. Point it elsewhere to size or wipe the
   * derived-image cache independently of the uploads it is derived from — every
   * file under it is reproducible, so it can be deleted at any time.
   */
  THUMBNAIL_CACHE_DIR: z.string().optional(),
  ADMIN_TOKEN: z.string().optional(),
  // Comma-separated emails elevated to is_admin = true at session-parse time.
  // Runtime override — no DB write. Empty/unset → no overrides.
  ADMIN_EMAILS: z.string().optional(),
  ALLOW_DEV_AUTH_BYPASS: boolFlag(false),
  DEV_AUTH_BYPASS_TOKEN: z.string().optional(),
  /**
   * Schaltet `requireAiConsent` von „beobachten" auf „abweisen" (403).
   *
   * Steht bewusst auf `false`, bis das Mobile-Release mit dem Einwilligungs-
   * Dialog im Store und hinreichend verbreitet ist: eine bereits installierte
   * Binary kennt das Gate nicht, fragt also nie — und bekäme ab dem Deploy auf
   * jede KI-Funktion eine Absage. Bis dahin protokolliert die Middleware nur,
   * wie viele Aufrufe die Durchsetzung treffen würde.
   */
  ENFORCE_AI_CONSENT: boolFlag(false),
  /**
   * Directory the chat decision journal is written to, one JSON file per turn
   * (utils/decisionLog.ts). Lets the live eval lane render the same decision
   * map the simulated lane produces, without putting decision ids on the wire.
   *
   * Honoured ONLY when NODE_ENV === 'development': elsewhere the middleware is
   * never constructed, so a stray value is inert rather than dangerous. Unset
   * (the default) means no journal is bound anywhere and every `recordDecision`
   * stays the no-op it is in production.
   */
  CHAT_DECISION_LOG_DIR: z.string().optional(),

  /**
   * Root of the party-internal content checkout, holding `skills/<mention>.md`
   * (recipe prompts) and `agents/<identifier>.md` (system-agent personas).
   * Deliberately outside the public repo: `packages/shared` ships only the
   * frontmatter, so the prompt text reaches neither git nor the web/mobile
   * bundle. Salt rolls the directory onto the server; see
   * services/skills/internalPrompts.ts and CLAUDE-deployment.md.
   *
   * Unset falls back to the gitignored `.external/gruenerator-intern` checkout
   * used in development. A missing directory is a no-op, not a crash: recipes
   * run on the agent's base systemRole, agents on a generic substitute.
   */
  INTERN_CONTENT_DIR: z.string().optional(),

  // ── URLs & domains ─────────────────────────────────────────────────────
  BASE_URL: z.string().optional(),
  AUTH_BASE_URL: z.string().optional(),
  WEB_BASE_URL: z.string().optional(),
  PRIMARY_DOMAIN: z.string().default('gruenerator.eu'),
  /**
   * Which instance this deployment serves — see `@gruenerator/shared/instances`.
   * Unset means `production`, so an existing deployment behaves exactly as it
   * did before instances existed. An unknown value falls back to that default
   * too rather than failing the boot: a typo must not take the API down.
   */
  INSTANCE_ID: z.string().optional(),

  // External: Abgeordnetenwatch API (public, no key). Override only for testing.
  ABGEORDNETENWATCH_BASE_URL: z.string().default('https://www.abgeordnetenwatch.de/api/v2'),

  // ── Database (Postgres) ────────────────────────────────────────────────
  DATABASE_URL: z.string().optional(),
  POSTGRES_HOST: z.string().optional(),
  POSTGRES_PORT: numStr(5432),
  POSTGRES_USER: z.string().optional(),
  POSTGRES_PASSWORD: z.string().optional(),
  POSTGRES_DATABASE: z.string().optional(),
  POSTGRES_SSL: boolFlag(false),
  POSTGRES_SSL_REJECT_UNAUTHORIZED: boolFlag(true),
  POSTGRES_AUTO_CREATE_DB: boolFlag(true),
  // Legacy PG* aliases — optional, consumed by PostgresService/config.ts
  PGHOST: z.string().optional(),
  PGPORT: numStr(5432),
  PGUSER: z.string().optional(),
  PGPASSWORD: z.string().optional(),
  PGDATABASE: z.string().optional(),

  // ── Redis ──────────────────────────────────────────────────────────────
  REDIS_URL: z.string().optional(),

  // ── Better Auth ────────────────────────────────────────────────────────
  BETTER_AUTH_URL: z.string().optional(),
  // Explicit override for the session-cookie scope in production. Normally
  // unset: the scope is derived from BETTER_AUTH_URL, so an instance with its
  // own database narrows its cookie automatically. Set this only where the
  // cookie must span more or less than the deployment's own host. NOT related
  // to PRIMARY_DOMAIN — that is the brand domain, identical on every instance.
  // See `betterAuth.ts` → deriveCookieDomain.
  COOKIE_DOMAIN: z.string().optional(),

  // ── MCP server (authenticated, OAuth) ──────────────────────────────────
  MCP_SERVER_ENABLED: boolFlag(false),
  MCP_SERVER_PUBLIC_URL: z.string().optional(),
  MCP_SERVER_RATE_LIMIT: numStr(60),

  // ── Keycloak ───────────────────────────────────────────────────────────
  KEYCLOAK_BASE_URL: z.string().default('https://user.netzbegruenung.de'),
  KEYCLOAK_REALM: z.string().default('gruenerator'),
  KEYCLOAK_CLIENT_ID: z.string().default('Gruenerator'),
  KEYCLOAK_CLIENT_SECRET: z.string().optional(),
  KEYCLOAK_ISSUER: z.string().optional(),
  KEYCLOAK_REALM_PUBLIC_KEY_URL: z.string().optional(),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().optional(),
  KEYCLOAK_ADMIN_USERNAME: z.string().optional(),
  KEYCLOAK_ADMIN_PASSWORD: z.string().optional(),
  MOBILE_CLIENT_ID: z.string().optional(),

  // ── AI providers ───────────────────────────────────────────────────────
  MISTRAL_API_KEY: z.string().optional(),
  // Regional inference: 'eu' pins every request to api.eu.mistral.ai, so
  // inference happens in EU/EFTA data centres and the payload never leaves the
  // region. Costs 1.1× list price. Three surfaces do NOT exist regionally and
  // stay on the global endpoint regardless (see providerInstances.ts):
  // /v1/files, /v1/conversations (Agents) and /v1/audio/voices.
  MISTRAL_REGION: z.enum(['eu', 'global']).default('eu'),
  LITELLM_API_KEY: z.string().optional(),
  LITELLM_BASE_URL: z.string().optional(),
  REGOLO_API_KEY: z.string().optional(),
  REGOLO_DEFAULT_MODEL: z.string().optional(),
  // GreenPT — OpenAI-compatible, https://api.greenpt.ai/v1
  GREENPT_API_KEY: z.string().optional(),
  GREENPT_DEFAULT_MODEL: z.string().optional(),
  // Scaleway Generative APIs (Paris) — OpenAI-compatible. NOT a selectable
  // lane: it serves the models Mistral does not publish (Gemma 4).
  // The base URL embeds the Scaleway project id, so it is configuration, not a
  // constant — a second project (staging, another org) needs no code change.
  SCALEWAY_API_KEY: z.string().optional(),
  SCALEWAY_BASE_URL: z.string().optional(),
  /**
   * Ob Mistral Medium 3.5 über Scaleway laufen darf. Standard AUS: der
   * Scaleway-Upstream lieferte im Betrieb fehlerhafte Antworten, deshalb geht
   * das Hauptmodell wieder direkt an die Mistral-API. Die Scaleway-Maschinerie
   * (Routing-Tabelle, Fallback-Fetch, Denk-Lane) bleibt vollständig erhalten;
   * `SCALEWAY_MISTRAL_ROUTING=true` schaltet sie ohne Code-Änderung zurück.
   * Betrifft NUR den `mistral`-Lane-Umweg — Gemma 4 auf `provider: 'scaleway'`
   * ist unabhängig davon. Siehe services/ai/providerInstances.ts.
   */
  SCALEWAY_MISTRAL_ROUTING: boolFlag(false),
  // Cortecs Sky Inference — OpenAI-kompatibler Router, seit 21.08.2026 der Host
  // der Gemma-Lane (`provider: 'cortecs'`). Vermittelt an Unteranbieter und
  // nennt den gewählten im Header `x-cortecs-provider`; `gemma-4-26b-a4b-it`
  // ging dort gemessen an Scaleway. VORAUSBEZAHLT: ein leeres Guthaben lässt
  // JEDE Anfrage mit HTTP 401 scheitern, deshalb ist Auto-Top-up im Cortecs-
  // Konto Betriebsvoraussetzung und nicht Komfort.
  CORTECS_API_KEY: z.string().optional(),
  CORTECS_BASE_URL: z.string().optional(),
  BFL_API_KEY: z.string().optional(),

  // ── Web Search Providers ───────────────────────────────────────────────
  // Linkup (https://docs.linkup.so) — when set, replaces SearXNG for @web
  // and replaces the deep-research orchestrator for @recherche.
  LINKUP_API_KEY: z.string().optional(),
  // Route SIMPLE web searches (no domain scope, no time window, no images,
  // ≤10 results) to GreenPT's link search first, with Linkup as the fallback.
  // A separate flag rather than a key check on purpose: GREENPT_API_KEY is
  // already set in production for chat and transcription, so gating on the key
  // alone would swap the chat's search engine without anyone deciding to.
  // The throttle it has to contain is documented in GreenPTSearchService.ts.
  GREENPT_SEARCH_ENABLED: boolFlag(false),

  // Reranking on GreenPT (`green-rerank`) instead of Regolo. ON by default,
  // unlike the search flag above: this one is a host swap for identical weights
  // (both serve Qwen3-Reranker-4B), so there is no quality trade to opt into —
  // only the `impact` measurement to gain. The flag exists as a rollback lever
  // that needs no code change, and as the two arms of the retrieval eval.
  GREENPT_RERANK_ENABLED: boolFlag(true),

  // No DEEP_AGENT_* switches. Which lane the subagent runs on and whether the
  // lead delegates in parallel are RESEARCH decisions with measurements behind
  // them, not deployment settings — they live in
  // `services/research/deepAgent/models.ts`, where the numbers that justify them
  // are. A knob here would let a deployment silently pick a lane nobody
  // measured, and the failure (a thin report) looks like the agent being weak.

  // ── Image / Flux ───────────────────────────────────────────────────────
  FLUX_BACKEND: z.string().optional(),
  FLUX_MAX_RETRIES: numStr(3),
  FLUX_BASE_DELAY: numStr(1000),
  FLUX_MAX_DELAY: numStr(30000),
  UNSPLASH_ACCESS_KEY: z.string().optional(),

  // ── Voice / Transcription ──────────────────────────────────────────────
  // 'auto' applies the duration rule (services/transcription/providerPolicy);
  // naming a provider pins every request to it. An enum because as a free
  // string a typo silently matched neither branch of the old provider chain.
  // 'regolo' is still ACCEPTED but no longer selectable: it left the
  // transcription chain, and an env var is externally frozen — a deployment
  // that still pins it must degrade to the normal rules, not fail to boot.
  TRANSCRIPTION_PROVIDER: z
    .enum(['auto', 'voxtral', 'greenpt', 'regolo'])
    .default('auto')
    .transform((provider) => (provider === 'regolo' ? ('auto' as const) : provider)),
  // KugelAudio (Berlin) serves the whole text-to-speech path since 09/2026;
  // Mistral Speech is gone. KUGELAUDIO_BASE_URL is an escape hatch only — the
  // vendor default host api.kugelaudio.com is geo-routed and may leave the EU,
  // so the service pins the EU host itself and this var is the only way past it.
  KUGELAUDIO_API_KEY: z.string().optional(),
  KUGELAUDIO_BASE_URL: z.string().optional(),
  // An integer, not a UUID: KugelAudio numbers its voices where Mistral named
  // them. Coerced because env values arrive as strings.
  KUGELAUDIO_DEFAULT_VOICE_ID: z.coerce.number().int().optional(),
  VISION_DEFAULT_MODEL: z.string().optional(),

  // ── Monitoring / External services ────────────────────────────────────
  SENTRY_DSN: z.string().optional(),
  // Langfuse LLM observability (self-hosted). Tracing is a no-op unless all
  // three are set. .trim() defends against trailing newlines in pasted secrets.
  LANGFUSE_PUBLIC_KEY: z.string().trim().optional(),
  LANGFUSE_SECRET_KEY: z.string().trim().optional(),
  LANGFUSE_BASE_URL: z.string().trim().optional(),
  // Optional deploy identifier (image tag / commit sha) stamped onto traces.
  // Not part of the kill-switch triple — absence just leaves traces unversioned.
  LANGFUSE_RELEASE: z.string().trim().optional(),
  APIFY_TOKEN: z.string().optional(),
  EVENT_REGISTRY_API_KEY: z.string().optional(),
  POLITPRO_API_KEY: z.string().optional(),
  NLP_SERVICE_URL: z.string().optional(),

  // ── Nango ──────────────────────────────────────────────────────────────
  NANGO_SECRET_KEY: z.string().optional(),
  NANGO_SERVER_URL: z.string().default('http://nango:3003'),

  // ── Canva Connect API (direct OAuth2 + PKCE, no Nango) ──────────────────
  CANVA_CLIENT_ID: z.string().optional(),
  CANVA_CLIENT_SECRET: z.string().optional(),
  CANVA_REDIRECT_URI: z.string().optional(),

  // ── MCP ────────────────────────────────────────────────────────────────
  MCP_URL: z.string().optional(),
  BUNDESTAG_MCP_URL: z.string().optional(),

  // ── Gruene API ─────────────────────────────────────────────────────────
  GRUENE_API_BASEURL: z.string().optional(),
  GRUENE_API_KEY: z.string().optional(),
  GRUENE_API_USERNAME: z.string().optional(),
  GRUENE_API_PASSWORD: z.string().optional(),

  // ── Email (Brevo SMTP) ─────────────────────────────────────────────────
  // .trim() defends against trailing whitespace/newlines pasted into GitHub
  // Actions secrets — that exact bug caused getaddrinfo ENOTFOUND on every
  // content-sync email send until Apr 2026. Port is z.coerce.number() so
  // Number("587\n") still parses correctly there.
  BREVO_SMTP_HOST: z.string().trim().optional(),
  BREVO_SMTP_PORT: numStr(587),
  BREVO_SMTP_USER: z.string().trim().optional(),
  BREVO_SMTP_PASS: z.string().trim().optional(),
  EMAIL_FROM: z.string().trim().optional(),

  // ── Credential encryption ──────────────────────────────────────────────
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),

  // ── OCR ────────────────────────────────────────────────────────────────
  OCR_PROVIDER: z.string().optional(),
  // Client deadline for one Docling conversion request against GreenPT's
  // Documents API. 50 MB / 1000 pages is the validation ceiling; 10 min covers
  // worst-case scan-heavy PDFs.
  DOCLING_MAX_WAIT_MS: numStr(600_000),
  REMBG_URL: z.string().optional(),

  // ── Hocuspocus / Yjs ──────────────────────────────────────────────────
  HOCUSPOCUS_ENABLED: boolFlag(false),
  YJS_ENABLED: boolFlag(false),

  // ── Scraping / crawling ────────────────────────────────────────────────
  CRAWLER_MODE: z.string().optional(),
  CONTENT_SYNC_EMAIL: z.string().trim().optional(),
  TEST_EMAIL_TO: z.string().trim().optional(),
  BACKUP_DIR: z.string().optional(),
  STATS_OUTPUT_PATH: z.string().optional(),
  SYNC_SUMMARY_PATH: z.string().optional(),
  // API base the content-sync CI run POSTs its article events to.
  CONTENT_SYNC_API_URL: z.string().trim().optional(),

  // ── GitHub CI (content sync) ───────────────────────────────────────────
  GITHUB_REPOSITORY: z.string().optional(),
  GITHUB_RUN_ID: z.string().optional(),
  GITHUB_SERVER_URL: z.string().optional(),

  // ── Logging ────────────────────────────────────────────────────────────
  LOG_LEVEL: z.string().default('info'),
  LOG_AI_REQUESTS: boolFlag(true),
  LOG_PERFORMANCE: boolFlag(true),
  LOG_FULL_RESPONSES: boolFlag(false),
  VERBOSE_LOGGING: boolFlag(false),
  DEBUG_MODE: boolFlag(false),
  DEBUG_LOGGING: boolFlag(false),
  ENABLE_DEBUG: boolFlag(false),
  ENABLE_VERBOSE: boolFlag(false),
  ENABLE_TELEMETRY: boolFlag(true),
  MEM0_TELEMETRY: z.string().optional(),

  // ── Rate limiting ──────────────────────────────────────────────────────
  DISABLE_RATE_LIMITS: boolFlag(false),
  ENABLE_RATE_LIMIT_ANALYTICS: boolFlag(false),
  RATE_LIMIT_MAX_REQUESTS: numStr(250),
  RATE_LIMIT_TIME_WINDOW: numStr(60000),
  RATE_LIMIT_MAX_CONCURRENT: numStr(10),

  // ── AI Worker pool ─────────────────────────────────────────────────────
  AI_WORKER_COUNT: numStr(1),
  REQUEST_TIMEOUT: numStr(120000),
  INTERNAL_TIMEOUT: numStr(110000),
  MAX_RETRIES: numStr(3),
  RETRY_BASE_DELAY: numStr(1000),
  RETRY_MAX_DELAY: numStr(120000),
  USE_BACKUP_ON_FAIL: boolFlag(true),
  BACKUP_RETRY_COUNT: numStr(2),
  PROGRESS_UPDATES: boolFlag(true),
  VALIDATE_RESPONSES: boolFlag(true),
  DELAY_RESPONSE_MS: numStr(0),

  // ── Vector / Qdrant ────────────────────────────────────────────────────
  QDRANT_URL: z.string().optional(),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_BASIC_AUTH_USERNAME: z.string().optional(),
  QDRANT_BASIC_AUTH_PASSWORD: z.string().optional(),

  // ── Vector search tuning ───────────────────────────────────────────────
  VECTOR_SEARCH_THRESHOLD: z.coerce.number().default(0.3),
  VECTOR_MIN_THRESHOLD: z.coerce.number().default(0.2),
  VECTOR_MAX_THRESHOLD: z.coerce.number().default(0.8),
  VECTOR_DEFAULT_LIMIT: numStr(5),
  VECTOR_MAX_LIMIT: numStr(100),
  VECTOR_CHUNK_MULTIPLIER: z.coerce.number().default(3.0),
  VECTOR_SINGLE_WORD_ADJ: z.coerce.number().default(0.0),
  VECTOR_TWO_WORDS_ADJ: z.coerce.number().default(0.05),
  VECTOR_MANY_WORDS_ADJ: z.coerce.number().default(-0.1),
  VECTOR_MANY_WORDS_THRESHOLD: numStr(5),

  // ── Hybrid search tuning ───────────────────────────────────────────────
  HYBRID_MIN_VECTOR_ONLY_THRESHOLD: z.coerce.number().default(0.55),
  HYBRID_MIN_VECTOR_WITH_TEXT_THRESHOLD: z.coerce.number().default(0.35),
  HYBRID_MIN_FINAL_SCORE: z.coerce.number().default(0.008),
  HYBRID_MIN_VECTOR_ONLY_FINAL_SCORE: z.coerce.number().default(0.01),
  HYBRID_CONFIDENCE_BOOST: z.coerce.number().default(1.2),
  HYBRID_CONFIDENCE_PENALTY: z.coerce.number().default(0.7),
  HYBRID_ENABLE_DYNAMIC_THRESHOLDS: boolFlag(true),
  HYBRID_ENABLE_CONFIDENCE_WEIGHTING: boolFlag(true),
  HYBRID_ENABLE_QUALITY_GATE: boolFlag(true),

  /**
   * Hauptschalter des server-seitigen Query-API-Pfads. `false` schickt JEDE
   * Sammlung zurück auf die client-seitige Alt-Fusion, ohne Qdrant anzufassen:
   * der Rückwärtsgang, der keine Migration braucht, und der Referenzarm jeder
   * Messung aus #3118.
   *
   * Bleibt an, obwohl der ausgelieferte Arm `rrf` die Alt-Fusion auf dem
   * qa-Pfad nicht erreicht (kommunalwiki roh 50 % / 0,642 gegen 60 % / 0,720):
   * auf der manuellen Suche findet erst der Sparse-Vektor die Einwort-Anfragen
   * (`rrf` 2 von 3 auf Rang 1, `dbsf` 3 von 3, Alt-Fusion vor der Migration
   * 0 von 3). Abschalten hieße, kommunalwikis BM25 ganz aufzugeben. Die
   * Alt-Fusion wurde auf dem manuellen und dem Notebook-Pfad nicht gemessen.
   */
  HYBRID_SERVER_SIDE_ENABLED: boolFlag(true),

  /**
   * Welche Fusion der Server-Pfad benutzt. Siehe HYBRID_SERVER_FUSIONS.
   * Default bleibt `rrf`, obwohl die Messreihe in #3118 (2026-09-02) `dbsf`
   * auf dem qa-Pfad vorn sieht (10 kommunalwiki-Fälle roh: Hit@1 80 % /
   * MRR@10 0,813 gegen `rrf` 50 % / 0,642): auf dem Notebook-Pfad, der die
   * 0,35-Schwelle in `NotebookQAService` läuft, kehrt sich das um (`dbsf`
   * 30 % / 0,361 gegen `rrf` 50 % / 0,567), weil die Schwelle für Kosinus-
   * werte geschrieben ist.
   *
   * Die Schwelle kennt den Wertebereich inzwischen (#3166: `filterAndSortResults`
   * schneidet auf `dense_similarity ?? similarity`) — `dbsf` blieb trotzdem
   * draussen, weil es mit Join auf dem Notebook-Pfad weiterhin zwei Fälle
   * gegen den ausgelieferten Zustand verliert (Hit@1 50 % → 30 %) und dabei
   * sogar hinter seine eigene #3169-Referenz zurückfällt (MRR@10
   * 0,361 → 0,350). Die Zahlen stehen in
   * `evals/retrieval/hybrid-dense-join-2026-09-02.md`.
   *
   * Die ganze Messreihe lief mit `HYBRID_ENABLE_QUALITY_GATE=false`; `dbsf`
   * mit eingeschaltetem Gatter ist nie gemessen (siehe hybridSearch.ts, das
   * Gatter ist nur für `rrf` als unschädlich belegt). Die qa-Arme liefen mit
   * Tiefe `fast`, die Notebook-Arme mit `deep` (der Produktionsstufe des Chats);
   * ohne Verlauf schreibt `deep` nicht um, die Zahlen sind also vergleichbar,
   * aber nicht dieselbe Stufe. Ein Gatter-Arm ist inzwischen gemessen
   * (`tune-join-rrf-gate.json`, 02.09.2026): identisch zum Nicht-Gatter-Lauf
   * (53,8 % / 0,665 GESAMT, `kommunalwiki-system` unverändert 60 % / 0,692) —
   * das Gatter läuft auf `rrf` und entfernt dort nichts.
   */
  HYBRID_SERVER_FUSION: z.enum(HYBRID_SERVER_FUSIONS).default('rrf'),

  /**
   * Limit der Sparse-Vorabholung als Vielfaches der dichten. 0 lässt die
   * Sparse-Vorabholung ganz weg — zusammen mit `dense_rescore` ist das der
   * dicht-nur-Kontrollarm über den Query-API-Pfad.
   */
  HYBRID_SERVER_SPARSE_FACTOR: z.coerce.number().min(0).default(1.0),

  /** Gewicht der dichten Vorabholung bei `rrf_weighted`; sparse bekommt 1 − dies. */
  HYBRID_SERVER_RRF_WEIGHT_DENSE: z.coerce.number().min(0).max(1).default(0.7),

  /**
   * Holt je Treffer den dichten Kosinus und den BM25-Wert über einen zweiten
   * und dritten Eintrag desselben `queryBatch` zurück (#3166). `false` ist
   * exakt der Zustand vor diesem PR — der Rückwärtsgang ohne Deploy und der
   * Referenzarm der Messung.
   *
   * Die Batch geht nur auf den fusionierenden Armen raus (`rrf`,
   * `rrf_weighted`, `dbsf`): bei `dense_rescore` IST der äussere `score`
   * schon der Kosinus, bei `sparse_only` der BM25-Wert — dort kostet ein
   * Join einen Rundlauf für nichts und wird nicht gebaut. `false` blendet
   * trotzdem auf ALLEN fünf Armen aus: `joinOn` gated auch
   * `denseFromScore`/`textFromScore` (`hybridSearch.ts:334–335`), also leert
   * es auch `originalVectorScore` auf `dense_rescore` und `originalTextScore`
   * auf `sparse_only`.
   *
   * Der Default steht auf `true`, WEIL die Messung ihn setzt (Regel R1 in der
   * Spec). Bleibt der Join hinter dem ausgelieferten Zustand zurück, geht er
   * als `false` in den Merge und der Code bleibt inert stehen.
   */
  HYBRID_SERVER_SCORE_JOIN: boolFlag(true),

  // ── Scoring ────────────────────────────────────────────────────────────
  SCORING_MAX_SIMILARITY_WEIGHT: z.coerce.number().default(0.6),
  SCORING_AVG_SIMILARITY_WEIGHT: z.coerce.number().default(0.4),
  SCORING_DIVERSITY_BONUS_RATE: z.coerce.number().default(0.02),
  SCORING_MAX_DIVERSITY_BONUS: z.coerce.number().default(0.1),
  SCORING_MAX_FINAL_SCORE: z.coerce.number().default(1.0),

  // ── Content excerpts ───────────────────────────────────────────────────
  /**
   * Wie viel von JEDEM getroffenen Chunk in `relevant_content` landet
   * (`extractRelevantExcerpt` / `extractMatchedExcerpt` in `BaseSearchService`).
   *
   * Gemessen am aktiven Pfad: indexiert wird mit `maxTokens: 400`
   * (`TextChunker`), ein Chunk ist damit rund 1400 Zeichen — live an einem
   * 8-Seiten-PDF 21 118 Zeichen auf 16 Chunks, also 1320 im Schnitt. 300 gab dem
   * Modell also ein Fünftel der Einheit zurück, die wir eingebettet, gesucht und
   * bewertet haben.
   *
   * Das ist derselbe Fehler, den `SNIPPET_CHARS` in `sourceRegistry.ts` eine
   * Ebene höher schon hinter sich hat: dort stand 320 unter der Chunk-Größe,
   * "numerische und tabellarische Antworten landeten knapp hinter dem Schnitt",
   * und das Modell meldete "dazu steht nichts in den Quellen". Live am
   * 24.08.2026 wieder, eine Ebene tiefer: die Frage nach den Löschfristen traf
   * die Tabelle mit acht Zeilen, und das 300-Zeichen-Fenster schnitt sie nach
   * der zweiten ab.
   *
   * 1800 deckt einen ganzen Chunk — für kürzere Chunks ist die Kappung damit
   * wirkungslos, sie schneidet nur noch, was wirklich zu lang ist. Die Zahl war
   * bis zum 02.09.2026 1500 und deckte damit nicht einmal den Fließtext-Pfad
   * (1600 Zeichen); der Wächter in `config/searchExcerptBudget.vitest.ts` maß
   * gegen eine Token-Schätzung (400 × 3,3 = 1320) und meldete das grün. Er hält
   * jetzt gegen die tatsächlichen Chunk-Grenzen aus `chunkBudget.ts`. Die
   * Anzeige-Pfade haben eigene, engere Deckel und wachsen NICHT mit
   * (`highlightSnippet` 400, Notebook-Sammlungen 200, Recherche 500,
   * `line-clamp-3` in der Dokumentübersicht).
   */
  CONTENT_MAX_EXCERPT_LENGTH: numStr(1800),
  CONTENT_EXCERPT_SENTENCE_BOUNDARY: z.coerce.number().default(0.7),
  CONTENT_MAX_CHUNKS_PER_DOC: numStr(10),

  // ── Embeddings ─────────────────────────────────────────────────────────
  EMBEDDING_MAX_DIMENSIONS: numStr(10000),
  EMBEDDING_MAX_VALUE: z.coerce.number().default(100),
  EMBEDDING_MIN_VALUE: z.coerce.number().default(-100),
  EMBEDDING_VALIDATION_TIMEOUT: numStr(5000),
  EMBEDDING_CACHE_SIZE: numStr(500),
  EMBEDDING_CACHE_TTL: numStr(3600000),
  MISTRAL_EMBEDDING_CONCURRENCY: numStr(3),

  // ── Caches ─────────────────────────────────────────────────────────────
  CACHE_RESULTS_SIZE: numStr(200),
  CACHE_RESULTS_TTL: numStr(900000),
  CACHE_EMBEDDINGS_SIZE: numStr(500),
  CACHE_EMBEDDINGS_TTL: numStr(3600000),
  RESULTS_CACHE_SIZE: numStr(200),
  RESULTS_CACHE_TTL: numStr(900000),
  SEARCH_CACHE_SIZE: numStr(200),
  SEARCH_CACHE_TTL: numStr(900000),

  // ── Timeouts ───────────────────────────────────────────────────────────
  TIMEOUT_SEARCH_DEFAULT: numStr(15000),
  TIMEOUT_EMBEDDING: numStr(10000),

  // ── Validation limits ──────────────────────────────────────────────────
  VALIDATION_MAX_QUERY_LENGTH: numStr(10000),
  VALIDATION_MAX_USER_ID_LENGTH: numStr(100),
  VALIDATION_MAX_DOCUMENT_IDS: numStr(1000),
  VALIDATION_MAX_DOCUMENT_ID_LENGTH: numStr(100),
  VALIDATION_MAX_MESSAGE_LENGTH: numStr(50000),
  VALIDATION_MAX_CONTENT_TYPE_LENGTH: numStr(50),

  // ── Performance ────────────────────────────────────────────────────────
  PERF_MAX_CONCURRENT_SEARCHES: numStr(10),
  PERF_BATCH_SIZE: numStr(10),
  PERF_MAX_RETRIES: numStr(3),
  PERF_RETRY_DELAY: numStr(1000),

  // ── Quality scoring ────────────────────────────────────────────────────
  QUALITY_SCORING_ENABLED: boolFlag(true),
  QUALITY_MIN_CHUNK: z.coerce.number().default(0.3),
  QUALITY_WEIGHT_READABILITY: z.coerce.number().default(0.3),
  QUALITY_WEIGHT_COMPLETENESS: z.coerce.number().default(0.25),
  QUALITY_WEIGHT_STRUCTURE: z.coerce.number().default(0.25),
  QUALITY_WEIGHT_DENSITY: z.coerce.number().default(0.2),
  QUALITY_FILTER_ENABLED: boolFlag(true),
  QUALITY_MIN_RETRIEVAL: z.coerce.number().default(0.4),
  QUALITY_BOOST_FACTOR: z.coerce.number().default(1.2),

  // ── Metadata enrichment ────────────────────────────────────────────────
  METADATA_ENRICHMENT_ENABLED: boolFlag(true),
  METADATA_DETECT_TYPES: boolFlag(true),
  METADATA_DETECT_MARKDOWN: boolFlag(true),
  METADATA_EXTRACT_PAGES: boolFlag(true),

  // ── Adaptive chunking ──────────────────────────────────────────────────
  ADAPTIVE_CHUNKING_ENABLED: boolFlag(false),
  CHUNK_DEFAULT_SIZE: numStr(400),
  CHUNK_OVERLAP_SIZE: numStr(100),

  // ── Retrieval / Query intent ───────────────────────────────────────────
  QUERY_INTENT_ENABLED: boolFlag(true),
  USE_GERMAN_PATTERNS: boolFlag(true),

  // ── Rerank ─────────────────────────────────────────────────────────────
  RERANK_INPUT_LIMIT: numStr(16),
  RERANK_OUTPUT_LIMIT: numStr(8),
  RERANK_MIN_RELEVANCE: z.coerce.number().default(0.2),
  RERANK_MMR_LAMBDA: z.coerce.number().default(0.7),
  RERANK_MMR_KEEP_TOP: numStr(2),
  RERANK_MERGE_OVERFETCH: numStr(16),
  RERANK_WEB_SCORE_CEILING: z.coerce.number().default(0.8),
  RERANK_DIP_SCORE_CEILING: z.coerce.number().default(0.8),
});

// ---------------------------------------------------------------------------
// Parse & export
// ---------------------------------------------------------------------------

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables — check server logs for details');
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
