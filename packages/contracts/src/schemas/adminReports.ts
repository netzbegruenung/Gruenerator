/**
 * Admin queue over `content_reports`: reports grouped per target, resolved
 * per target. Mirrors apps/api/routes/admin/adminReportsContractRouter.ts.
 */
import { z } from 'zod';

import {
  contentReportKindSchema,
  contentReportReasonSchema,
  contentReportStatusSchema,
  moderationStateSchema,
} from './contentReport.js';
import { studioAssetKindSchema } from './studioAssets.js';

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
  moderation: moderationStateSchema,
  ownerId: z.string(),
  ownerName: z.string().nullable(),
  /** The owner moved it to the Papierkorb; moderation still applies to it. */
  trashed: z.boolean(),
});
export type AdminReportStudioAssetTarget = z.infer<typeof adminReportStudioAssetTargetSchema>;

/** What the queue shows of any moderatable target, whatever its kind. */
export const adminReportPreviewSchema = z.object({
  title: z.string(),
  /** Already the URL an admin can load; a removed asset's signed thumbnail is blocked. */
  thumbUrl: z.string().nullable(),
  href: z.string().nullable(),
  ownerId: z.string(),
  ownerName: z.string().nullable(),
  moderation: moderationStateSchema,
  trashed: z.boolean(),
});
export type AdminReportPreview = z.infer<typeof adminReportPreviewSchema>;

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
  /** Only for kind 'studio_asset'; null when the asset is gone. Kept for shipped clients — read `preview`. */
  target: adminReportStudioAssetTargetSchema.nullable(),
  /** Every moderatable kind; null for the others and when the target is gone. */
  preview: adminReportPreviewSchema.nullable(),
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
  moderation: moderationStateSchema.nullable(),
});
export type AdminReportResolveResponse = z.infer<typeof adminReportResolveResponseSchema>;

export const adminReportStatsResponseSchema = z.object({ open: z.number().int() });
export type AdminReportStatsResponse = z.infer<typeof adminReportStatsResponseSchema>;
