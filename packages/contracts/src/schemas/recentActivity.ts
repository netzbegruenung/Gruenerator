/**
 * Zod schemas for GET /api/recent-activity (workplace "Zuletzt" section).
 * Mirrors the RecentActivityItem shape assembled in
 * apps/api/routes/workplace/recentActivityController.ts (aggregateRecentActivity).
 *
 * The backend derives its `RecentActivityItem` type from `recentActivityItemSchema`
 * (z.infer) so the aggregation and the wire contract cannot drift.
 */
import { z } from 'zod';

import { boardPreviewSchema } from './boards.js';

export const recentActivityItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  // ISO-ish date string (already stringified by the aggregation).
  date: z.string(),
  type: z.enum(['doc', 'board', 'image', 'video', 'canvas']),
  href: z.string(),
  emoji: z.string().optional(),
  boardType: z.enum(['kanban', 'whiteboard']).optional(),
  preview: boardPreviewSchema.optional(),
  thumbnailUrl: z.string().optional(),
  duration: z.number().optional(),
  creatorName: z.string().optional(),
  accessType: z.string().optional(),
  deleteEndpoint: z.string().optional(),
  content: z.string().optional(),
  documentType: z.string().optional(),
  blurhash: z.string().optional(),
});

export const recentActivityResponseSchema = z.object({
  items: z.array(recentActivityItemSchema),
});

export const recentActivityErrorSchema = z.object({
  error: z.string(),
});

export type RecentActivityItem = z.infer<typeof recentActivityItemSchema>;
export type RecentActivityResponse = z.infer<typeof recentActivityResponseSchema>;
