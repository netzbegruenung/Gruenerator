/**
 * Zod schemas for the instance-admin statistics view: how much was CREATED on
 * this deployment, over time. Counts only — no user id, no row, no content.
 * Mirrors apps/api/routes/admin/adminStatsContractRouter.ts.
 *
 * Two sources, published side by side because they answer different questions:
 *
 *  - `live` counts the content tables. It reaches back to the first row, but it
 *    only sees rows that still exist: purged trash, hard-deleted rows and deleted
 *    accounts are gone from it.
 *  - `counter` reads `platform_creation_daily`, a per-day tally written by
 *    database triggers at insert time. It holds no user id and never shrinks,
 *    but it starts on the day it was deployed.
 *
 * With a country filter, a cell behind fewer than `min_group_size` people is
 * `null` (suppressed), plus whatever else must be hidden so it cannot be
 * recovered by subtracting the published cells from the unfiltered view. That
 * only works on one fixed grid, which is why a country filter requires
 * `bucket: 'month'`.
 */
import { z } from 'zod';

/** What can be counted. Order is the display order. */
export const adminStatsKindSchema = z.enum([
  'active_users',
  'signups',
  'chats',
  'chat_messages',
  'documents',
  'designs',
  'ai_images',
  'notebooks',
  'text_generations',
  'reels',
  'podcasts',
  'explainables',
  'deep_research',
  'agents',
  'recipes',
  'templates',
  'projects',
  'project_posts',
]);
export type AdminStatsKind = z.infer<typeof adminStatsKindSchema>;

export const adminStatsBucketSchema = z.enum(['day', 'week', 'month']);
export type AdminStatsBucket = z.infer<typeof adminStatsBucketSchema>;

/** `unknown` = profiles without a locale; `all` = no filter, no suppression. */
export const adminStatsLocaleSchema = z.enum(['all', 'de', 'at', 'unknown']);
export type AdminStatsLocale = z.infer<typeof adminStatsLocaleSchema>;

export const adminStatsSourceSchema = z.enum(['live', 'counter']);
export type AdminStatsSource = z.infer<typeof adminStatsSourceSchema>;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** `null` = suppressed (country view only). */
const cellValueSchema = z.number().int().nonnegative().nullable();

export const adminStatsPointSchema = z.object({
  /** First day of the bucket (Europe/Berlin), YYYY-MM-DD. */
  bucket: isoDay,
  total: cellValueSchema,
  /** Empty for kinds without a subtype. */
  by_subtype: z.array(z.object({ subtype: z.string(), value: cellValueSchema })),
});
export type AdminStatsPoint = z.infer<typeof adminStatsPointSchema>;

export const adminStatsSeriesSchema = z.object({
  kind: adminStatsKindSchema,
  points: z.array(adminStatsPointSchema),
});
export type AdminStatsSeries = z.infer<typeof adminStatsSeriesSchema>;

export const adminStatsQuerySchema = z.object({
  /** Inclusive, YYYY-MM-DD. Omitted = since the first row. */
  from: isoDay.optional(),
  /** Inclusive, YYYY-MM-DD. Omitted = today. */
  to: isoDay.optional(),
  bucket: adminStatsBucketSchema.optional(),
  locale: adminStatsLocaleSchema.optional(),
});
export type AdminStatsQuery = z.infer<typeof adminStatsQuerySchema>;

export const getAdminStatsResponseSchema = z.object({
  success: z.literal(true),
  bucket: adminStatsBucketSchema,
  locale: adminStatsLocaleSchema,
  /** The window actually counted — snapped to whole months in a country view. */
  from: isoDay,
  to: isoDay,
  generated_at: z.string(),
  min_group_size: z.number().int(),
  suppressed_cells: z.number().int().nonnegative(),
  live: z.array(adminStatsSeriesSchema),
  counter: z.object({
    /** First day the trigger counter has data for; null before the first insert. */
    since: isoDay.nullable(),
    series: z.array(adminStatsSeriesSchema),
  }),
});
export type GetAdminStatsResponseDto = z.infer<typeof getAdminStatsResponseSchema>;

export const adminStatsErrorResponseSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
