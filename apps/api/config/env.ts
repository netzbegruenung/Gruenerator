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
  ADMIN_TOKEN: z.string().optional(),
  // Comma-separated emails elevated to is_admin = true at session-parse time.
  // Runtime override — no DB write. Empty/unset → no overrides.
  ADMIN_EMAILS: z.string().optional(),
  ALLOW_DEV_AUTH_BYPASS: boolFlag(false),
  DEV_AUTH_BYPASS_TOKEN: z.string().optional(),

  // ── URLs & domains ─────────────────────────────────────────────────────
  BASE_URL: z.string().optional(),
  AUTH_BASE_URL: z.string().optional(),
  WEB_BASE_URL: z.string().optional(),
  PRIMARY_DOMAIN: z.string().default('gruenerator.eu'),

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
  LITELLM_API_KEY: z.string().optional(),
  LITELLM_BASE_URL: z.string().optional(),
  IONOS_API_TOKEN: z.string().optional(),
  REGOLO_API_KEY: z.string().optional(),
  REGOLO_DEFAULT_MODEL: z.string().optional(),
  BFL_API_KEY: z.string().optional(),

  // ── Web Search Providers ───────────────────────────────────────────────
  // Linkup (https://docs.linkup.so) — when set, replaces SearXNG for @web
  // and replaces the deep-research orchestrator for @recherche.
  LINKUP_API_KEY: z.string().optional(),

  // ── Image / Flux ───────────────────────────────────────────────────────
  FLUX_BACKEND: z.string().optional(),
  FLUX_MAX_RETRIES: numStr(3),
  FLUX_BASE_DELAY: numStr(1000),
  FLUX_MAX_DELAY: numStr(30000),
  UNSPLASH_ACCESS_KEY: z.string().optional(),

  // ── Voice / Transcription ──────────────────────────────────────────────
  TRANSCRIPTION_PROVIDER: z.string().optional(),
  VOXTRAL_DEFAULT_VOICE_ID: z.string().optional(),
  VISION_DEFAULT_MODEL: z.string().optional(),

  // ── Monitoring / External services ────────────────────────────────────
  SENTRY_DSN: z.string().optional(),
  APIFY_TOKEN: z.string().optional(),
  EVENT_REGISTRY_API_KEY: z.string().optional(),
  NLP_SERVICE_URL: z.string().optional(),

  // ── Nango ──────────────────────────────────────────────────────────────
  NANGO_SECRET_KEY: z.string().optional(),
  NANGO_SERVER_URL: z.string().default('http://nango:3003'),

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
  DOCLING_URL: z.string().optional(),
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

  // ── Scoring ────────────────────────────────────────────────────────────
  SCORING_MAX_SIMILARITY_WEIGHT: z.coerce.number().default(0.6),
  SCORING_AVG_SIMILARITY_WEIGHT: z.coerce.number().default(0.4),
  SCORING_DIVERSITY_BONUS_RATE: z.coerce.number().default(0.02),
  SCORING_MAX_DIVERSITY_BONUS: z.coerce.number().default(0.1),
  SCORING_MAX_FINAL_SCORE: z.coerce.number().default(1.0),

  // ── Content excerpts ───────────────────────────────────────────────────
  CONTENT_MAX_EXCERPT_LENGTH: numStr(300),
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
