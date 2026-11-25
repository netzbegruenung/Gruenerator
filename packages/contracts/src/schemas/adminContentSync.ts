/**
 * Admin view of the content sync: run history and the mail switch.
 * Mirrors apps/api/routes/admin/adminContentSyncContractRouter.ts.
 */
import { z } from 'zod';

import { contentSyncSourceSchema } from './contentSync.js';

export const contentSyncRunStatusSchema = z.enum(['success', 'failed']);
export type ContentSyncRunStatus = z.infer<typeof contentSyncRunStatusSchema>;

export const contentSyncRunSchema = z.object({
  id: z.string(),
  sourceId: contentSyncSourceSchema,
  landesverband: z.string().nullable(),
  name: z.string(),
  status: contentSyncRunStatusSchema,
  recent: z.boolean(),
  dryRun: z.boolean(),
  stored: z.number(),
  updated: z.number(),
  skipped: z.number(),
  errors: z.number(),
  deadLinks: z.number(),
  failureMessage: z.string().nullable(),
  errorSamples: z.array(z.string()),
  deadLinkSamples: z.array(z.string()),
  runUrl: z.string().nullable(),
  startedAt: z.string(),
  durationMs: z.number(),
});
export type ContentSyncRun = z.infer<typeof contentSyncRunSchema>;

/** `problems`: only runs with hard errors or an aborted run. */
export const contentSyncRunFilterSchema = z.enum(['all', 'problems']);
export type ContentSyncRunFilter = z.infer<typeof contentSyncRunFilterSchema>;

export const adminContentSyncRunsQuerySchema = z.object({
  filter: contentSyncRunFilterSchema.default('all'),
});
export type AdminContentSyncRunsQuery = z.infer<typeof adminContentSyncRunsQuerySchema>;

export const adminContentSyncRunsResponseSchema = z.object({
  runs: z.array(contentSyncRunSchema),
});

export const contentSyncSettingsSchema = z.object({
  emailEnabled: z.boolean(),
});
export type ContentSyncSettings = z.infer<typeof contentSyncSettingsSchema>;

export const adminContentSyncErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
