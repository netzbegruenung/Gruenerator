/**
 * Zod schemas for reporting objectionable content (user-generated project
 * posts/comments, AI chat output and the public Agents, Rezepte, Vorlagen and
 * studio assets). Each report is stored in `content_reports` and emailed to the
 * operator.
 */
import { z } from 'zod';

export const contentReportKindSchema = z.enum([
  'group_post',
  'group_comment',
  'chat_message',
  'group_share',
  'studio_asset',
  'user_agent',
  'user_text_form',
  'user_template',
]);

/** The kinds whose row carries a `moderation` column the reports can act on. */
export const moderatableReportKindSchema = contentReportKindSchema.extract([
  'studio_asset',
  'user_agent',
  'user_text_form',
  'user_template',
]);

/** F0: persisted in the `moderation` column of every moderatable table. */
export const moderationStateSchema = z.enum(['ok', 'hidden', 'removed']);

export const contentReportReasonSchema = z.enum([
  'offensive',
  'false_information',
  'harassment',
  'illegal',
  'other',
]);

export const contentReportStatusSchema = z.enum(['open', 'resolved', 'dismissed']);

export const contentReportResolutionSchema = z.enum(['removed', 'restored', 'dismissed']);

export const contentReportCreateSchema = z.object({
  kind: contentReportKindSchema,
  targetId: z.string().min(1).max(200),
  groupId: z.string().max(200).optional(),
  threadId: z.string().max(200).optional(),
  reason: contentReportReasonSchema,
  note: z.string().max(2000).optional(),
  /** Text of the reported content, for AI answers that are not persisted as rows. */
  excerpt: z.string().max(2000).optional(),
});

export const contentReportResponseSchema = z.object({
  success: z.literal(true),
});

export const contentReportErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
});

export type ContentReportKind = z.infer<typeof contentReportKindSchema>;
export type ModeratableReportKind = z.infer<typeof moderatableReportKindSchema>;
export type ModerationState = z.infer<typeof moderationStateSchema>;
export type ContentReportReason = z.infer<typeof contentReportReasonSchema>;
export type ContentReportStatus = z.infer<typeof contentReportStatusSchema>;
export type ContentReportResolution = z.infer<typeof contentReportResolutionSchema>;
export type ContentReportCreate = z.infer<typeof contentReportCreateSchema>;
export type ContentReportResponse = z.infer<typeof contentReportResponseSchema>;
export type ContentReportError = z.infer<typeof contentReportErrorSchema>;
