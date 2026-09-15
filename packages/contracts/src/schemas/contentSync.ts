/**
 * Zod schemas for the internal content-sync endpoint.
 *
 * This is the n8n ↔ Grünerator boundary: n8n's HTTP Request nodes POST to
 * `/api/internal/content-sync/source/:sourceId` to trigger a scraper run and
 * read back the SyncResult counts. The `contentSyncSourceSchema` enum is the
 * single source of truth for the set of valid sources — the API router, the
 * `/sources` listing, and (via the generated contract) any TS caller all read
 * it from here instead of re-declaring a `string[]`.
 */
import { z } from 'zod';

export const contentSyncSourceSchema = z.enum([
  'landesverbaende',
  'gruenblog',
  'gruene-at',
  'kommunalwiki',
  'boell-stiftung',
  'bundestag',
  'social-media',
  'abgeordnetenwatch',
  'grundsatz',
  'gruene-de',
  'oesterreich',
]);

export type ContentSyncSource = z.infer<typeof contentSyncSourceSchema>;

/**
 * Request body for syncSource. `landesverband` scopes a `landesverbaende` run to
 * one Landesverband (shortName prefix, e.g. "BE") — mirrors update-all-content.ts's
 * `--landesverband` flag, including its own email notification. `recent` mirrors
 * `--recent` (incremental discovery) where the underlying scraper supports it.
 */
export const contentSyncRequestSchema = z.object({
  landesverband: z.string().optional(),
  recent: z.boolean().optional(),
  forceUpdate: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  /**
   * Run the sync as a background job: respond 202 with a jobId immediately and
   * expose the outcome via GET /jobs/:jobId. Long full runs (LV BE/HE nightly)
   * exceed the reverse proxy's ~5 min timeout, so synchronous callers get a 504
   * while the sync keeps running server-side — CI polls the job instead.
   */
  background: z.boolean().optional(),
  /** CI run URL, included in the per-LV notification email when provided. */
  runUrl: z.string().optional(),
  /**
   * Recipient for a `landesverband` run when that LV has no entry in
   * landesverbaendeContacts.json. The backend's own CONTENT_SYNC_EMAIL env is
   * not deployed (it's currently only a CI variable), so the caller (CI)
   * passes it through explicitly rather than the server silently going quiet.
   */
  fallbackEmail: z.string().optional(),
});

export type ContentSyncRequest = z.infer<typeof contentSyncRequestSchema>;

/** 200 — a completed sync run. Mirrors the per-source scraper SyncResult counts. */
export const contentSyncResultSchema = z.object({
  success: z.literal(true),
  sourceId: contentSyncSourceSchema,
  name: z.string(),
  stored: z.number(),
  updated: z.number(),
  skipped: z.number(),
  errors: z.number(),
  /**
   * Stichprobe der Meldungen hinter `errors`, serverseitig gedeckelt. Optional,
   * weil ein Backend-Stand vor diesem Feld schlicht nichts sendet — die Zahl
   * bleibt die verbindliche Angabe, das hier ist die Diagnosehilfe.
   */
  errorSamples: z.array(z.string()).optional(),
  /**
   * Links die Quelle selbst noch auflistet, aber nicht mehr ausliefert (HTTP
   * 403/404/410). Getrennt von `errors`, weil keine Änderung auf unserer Seite
   * sie je auf 0 bringt: sechs davon wiederholen sich in jedem nächtlichen Lauf
   * (#2971), und in `errors` gezählt gewöhnen sie den Leser daran, die eine Zahl
   * zu übersehen, die „hier ist etwas kaputt" heißen soll. Optional, weil ein
   * Backend-Stand vor diesem Feld schlicht nichts sendet.
   */
  deadLinks: z.number().optional(),
  /** URLs hinter `deadLinks`, serverseitig gedeckelt wie `errorSamples`. */
  deadLinkSamples: z.array(z.string()).optional(),
  /**
   * Warum übersprungen wurde, als Zähler je Grund (`too_old`, `unchanged`,
   * `too_short`, …). Die Summe `skipped` verbirgt, was ein Lauf kostet: ein vor
   * dem Abruf verworfenes Dokument ist gratis, ein `too_old` nach dem Abruf
   * wird jede Nacht neu geholt (#3200). Optional, weil ein Backend-Stand vor
   * diesem Feld schlicht nichts sendet.
   */
  skipReasons: z.record(z.string(), z.number()).optional(),
  fetchErrors: z.number(),
  durationMs: z.number(),
});

export type ContentSyncResult = z.infer<typeof contentSyncResultSchema>;

/** 500 — a sync that started but threw (or timed out). Keeps `sourceId`/`durationMs` for n8n logging. */
export const contentSyncFailureSchema = z.object({
  success: z.literal(false),
  sourceId: contentSyncSourceSchema,
  error: z.string(),
  durationMs: z.number(),
});

export type ContentSyncFailure = z.infer<typeof contentSyncFailureSchema>;

/** 202 — a `background: true` sync was accepted; poll GET /jobs/:jobId for the outcome. */
export const contentSyncAcceptedSchema = z.object({
  accepted: z.literal(true),
  jobId: z.string(),
  sourceId: contentSyncSourceSchema,
});

export type ContentSyncAccepted = z.infer<typeof contentSyncAcceptedSchema>;

/**
 * 200 — background job status. `result` is absent while `status` is
 * `running`; afterwards it carries the same body a synchronous call would
 * have returned (result on `completed`, failure on `failed`).
 */
export const contentSyncJobStatusSchema = z.object({
  jobId: z.string(),
  sourceId: contentSyncSourceSchema,
  status: z.enum(['running', 'completed', 'failed']),
  startedAt: z.string(),
  result: z.union([contentSyncResultSchema, contentSyncFailureSchema]).optional(),
});

export type ContentSyncJobStatus = z.infer<typeof contentSyncJobStatusSchema>;

/** 404 — unknown or expired (TTL'd out of Redis) job id. */
export const contentSyncJobNotFoundSchema = z.object({
  error: z.string(),
});

/**
 * 400 — the request asks for something this source cannot do. Currently only
 * `dryRun: true` against a source with no dry-run branch: forwarding the flag
 * there would store for real while the report says "Dry Run" (#2970), so the
 * call is refused instead of quietly lying about what it did.
 */
export const contentSyncBadRequestSchema = z.object({
  error: z.string(),
});

/** 409 — a sync for this source is already running. */
export const contentSyncBusyResponseSchema = z.object({
  error: z.string(),
});

/** 200 — the list of source ids n8n is allowed to trigger. */
export const contentSyncSourcesResponseSchema = z.object({
  sources: z.array(contentSyncSourceSchema),
});

/** 200 — the rendered content-stats docs page, queried live from Qdrant. */
export const contentStatsResponseSchema = z.object({
  markdown: z.string(),
  totalPoints: z.number(),
});
