/**
 * Admin queue over `content_reports`: reports grouped per target, resolved
 * per target. Mirrors apps/api/routes/admin/adminReportsContractRouter.ts.
 */
import { z } from 'zod';

import {
  contentReportKindSchema,
  contentReportReasonSchema,
  contentReportStatusSchema,
} from './contentReport.js';
import { studioAssetKindSchema, studioAssetModerationSchema } from './studioAssets.js';

export const adminReportActionSchema = z.enum(['remove', 'restore', 'dismiss']);
export type AdminReportAction = z.infer<typeof adminReportActionSchema>;

export const adminReportErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});

export const adminReportListQuerySchema = z.object({
  status: contentReportStatusSchema.default('open'),
  kind: contentReportKindSchema.optional(),
});
export type AdminReportListQuery = z.infer<typeof adminReportListQuerySchema>;

export const adminReportStudioAssetTargetSchema = z.object({
  id: z.string(),
  title: z.string(),
  src: z.string(),
  thumbUrl: z.string().nullable(),
  kind: studioAssetKindSchema,
  moderation: studioAssetModerationSchema,
  ownerId: z.string(),
  ownerName: z.string().nullable(),
  /** The owner moved it to the Papierkorb; moderation still applies to it. */
  trashed: z.boolean(),
});
export type AdminReportStudioAssetTarget = z.infer<typeof adminReportStudioAssetTargetSchema>;

export const adminReportGroupSchema = z.object({
  kind: contentReportKindSchema,
  targetId: z.string(),
  reportCount: z.number().int(),
  reasons: z.array(z.object({ reason: contentReportReasonSchema, count: z.number().int() })),
  latestAt: z.string(),
  notes: z.array(z.object({ note: z.string(), createdAt: z.string() })),
  status: contentReportStatusSchema,
  /** From the newest report that carries one; for kinds without a stored target. */
  excerpt: z.string().nullable(),
  groupId: z.string().nullable(),
  threadId: z.string().nullable(),
  /** Only for kind 'studio_asset'; null when the asset is gone or in the Papierkorb. */
  target: adminReportStudioAssetTargetSchema.nullable(),
});
export type AdminReportGroup = z.infer<typeof adminReportGroupSchema>;

export const adminReportListResponseSchema = z.object({
  reports: z.array(adminReportGroupSchema),
});
export type AdminReportListResponse = z.infer<typeof adminReportListResponseSchema>;

export const adminReportResolveBodySchema = z.object({
  kind: contentReportKindSchema,
  targetId: z.string().min(1).max(200),
  action: adminReportActionSchema,
});
export type AdminReportResolveBody = z.infer<typeof adminReportResolveBodySchema>;

export const adminReportResolveResponseSchema = z.object({
  resolved: z.number().int(),
  moderation: studioAssetModerationSchema.nullable(),
});
export type AdminReportResolveResponse = z.infer<typeof adminReportResolveResponseSchema>;

export const adminReportStatsResponseSchema = z.object({ open: z.number().int() });
export type AdminReportStatsResponse = z.infer<typeof adminReportStatsResponseSchema>;
