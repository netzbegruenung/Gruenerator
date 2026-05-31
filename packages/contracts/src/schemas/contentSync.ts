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
]);

export type ContentSyncSource = z.infer<typeof contentSyncSourceSchema>;

/** 200 — a completed sync run. Mirrors the per-source scraper SyncResult counts. */
export const contentSyncResultSchema = z.object({
  success: z.literal(true),
  sourceId: contentSyncSourceSchema,
  name: z.string(),
  stored: z.number(),
  updated: z.number(),
  skipped: z.number(),
  errors: z.number(),
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

/** 409 — a sync for this source is already running. */
export const contentSyncBusyResponseSchema = z.object({
  error: z.string(),
});

/** 200 — the list of source ids n8n is allowed to trigger. */
export const contentSyncSourcesResponseSchema = z.object({
  sources: z.array(contentSyncSourceSchema),
});
