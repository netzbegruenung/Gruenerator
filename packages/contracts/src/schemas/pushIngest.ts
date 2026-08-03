/**
 * Zod schemas for the external push-ingest API (`/api/v1/push/*`).
 *
 * This is the WordPress-plugin ↔ Grünerator boundary. A WordPress site with the
 * `gruenerator-sync` plugin POSTs an article here the moment it is published,
 * instead of waiting to be scraped. The same endpoint serves two targets,
 * discriminated by `target`:
 *
 *   - `landesverband` — push into a curated Landesverband system collection
 *     (identified by `sourceId`; scoped by the API key's `landesverbaende`).
 *   - `notebook`      — push into a user notebook (identified by `notebookId`;
 *     scoped by the API key user's edit permission on that notebook).
 *
 * These schemas are the single source of truth: TS types are derived via
 * `z.infer`, and `contentType` is a closed `z.enum`, never a free string.
 */
import { z } from 'zod';

/** Landesverband content types — mirrors LandesverbandContentType in the API config. */
export const pushContentTypeSchema = z.enum([
  'presse',
  'beschluss',
  'antrag',
  'blog',
  'wahlprogramm',
]);
export type PushContentType = z.infer<typeof pushContentTypeSchema>;

/** Fields shared by every ingest payload regardless of target. */
const articleFields = {
  /** Article title. */
  title: z.string().trim().min(1, 'title is required'),
  /** Plain-text body (HTML stripped client-side). Min length matches the chunker floor. */
  contentText: z.string().trim().min(100, 'contentText must be at least 100 characters'),
  /** Canonical article URL — the stable dedup/update/delete key. */
  sourceUrl: z.string().url('sourceUrl must be a valid URL'),
  /** Stable id from the source CMS (e.g. WordPress post id). For traceability. */
  externalId: z.string().trim().min(1).nullish(),
  /** ISO-8601 publication timestamp. */
  publishedAt: z.string().datetime({ offset: true }).nullish(),
  /** Short summary/teaser. */
  excerpt: z.string().trim().max(2000).nullish(),
  /** Category/tag names from the source. */
  categories: z.array(z.string().trim()).default([]),
  /** Author display name. */
  author: z.string().trim().max(200).nullish(),
  /** Featured image URL (validated for SSRF before any fetch). */
  featuredImageUrl: z.string().url().nullish(),
};

/** Ingest into a Landesverband system collection. */
export const pushIngestLandesverbandSchema = z.object({
  target: z.literal('landesverband'),
  /** Grünerator LV source id, e.g. 'sachsen-anhalt-lv' (must exist in landesverbaendeConfig). */
  sourceId: z.string().trim().min(1, 'sourceId is required'),
  contentType: pushContentTypeSchema,
  ...articleFields,
});

/** Ingest into a user notebook. */
export const pushIngestNotebookSchema = z.object({
  target: z.literal('notebook'),
  /** User-notebook id (UUID) or Notion-style slug suffix. */
  notebookId: z.string().trim().min(1, 'notebookId is required'),
  ...articleFields,
});

/** POST /api/v1/push/articles — discriminated on `target`. */
export const pushIngestBodySchema = z.discriminatedUnion('target', [
  pushIngestLandesverbandSchema,
  pushIngestNotebookSchema,
]);
export type PushIngestBody = z.infer<typeof pushIngestBodySchema>;

/** What the ingest pipeline did with the article. */
export const pushActionSchema = z.enum(['stored', 'updated', 'skipped', 'deleted']);
export type PushAction = z.infer<typeof pushActionSchema>;

/** 200 — successful ingest. */
export const pushIngestResponseSchema = z.object({
  ok: z.literal(true),
  action: pushActionSchema,
  /** Document id created/updated (LV path returns null — it is chunk-addressed by url). */
  documentId: z.string().nullable(),
  /** Number of vectors written (null when skipped). */
  vectors: z.number().nullable(),
  /** Why the action was 'skipped', when applicable. */
  reason: z.string().nullable(),
});
export type PushIngestResponse = z.infer<typeof pushIngestResponseSchema>;

/** POST /api/v1/push/articles/delete — discriminated on `target`. */
export const pushDeleteLandesverbandSchema = z.object({
  target: z.literal('landesverband'),
  sourceId: z.string().trim().min(1),
  sourceUrl: z.string().url(),
});
export const pushDeleteNotebookSchema = z.object({
  target: z.literal('notebook'),
  notebookId: z.string().trim().min(1),
  sourceUrl: z.string().url(),
});
export const pushDeleteBodySchema = z.discriminatedUnion('target', [
  pushDeleteLandesverbandSchema,
  pushDeleteNotebookSchema,
]);
export type PushDeleteBody = z.infer<typeof pushDeleteBodySchema>;

/** 200 — delete result. */
export const pushDeleteResponseSchema = z.object({
  ok: z.literal(true),
  action: pushActionSchema,
  /** How many Qdrant points / notebook links were removed. */
  removed: z.number(),
});
export type PushDeleteResponse = z.infer<typeof pushDeleteResponseSchema>;

/** GET /api/v1/push/ping — connection test for the plugin. */
export const pushPingResponseSchema = z.object({
  ok: z.literal(true),
  userId: z.string(),
  /** Landesverband codes this key may write to ('*' = all). */
  landesverbaende: z.union([z.literal('*'), z.array(z.string())]),
  permissions: z.array(z.string()),
});
export type PushPingResponse = z.infer<typeof pushPingResponseSchema>;

/** Shared error envelope. */
export const pushErrorSchema = z.object({ error: z.string() });
export type PushError = z.infer<typeof pushErrorSchema>;
