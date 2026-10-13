/** Comments on Vorlagen (community templates and the Grünerator catalogue). */
import { z } from 'zod';

import { GROUP_COMMENT_MAX } from './groups.js';

export const templateCommentSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  /** Kommentar oberster Ebene, auf den geantwortet wird; null = selbst oben. */
  parentId: z.string().nullable(),
  userId: z.string().nullable(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string(),
});
export type TemplateComment = z.infer<typeof templateCommentSchema>;

export const createTemplateCommentBodySchema = z.object({
  body: z.string().trim().min(1, 'Kommentar ist leer.').max(GROUP_COMMENT_MAX),
  parentId: z.string().uuid().nullish(),
});

export const templateCommentsResponseSchema = z.object({
  success: z.literal(true),
  comments: z.array(templateCommentSchema),
});

export const templateCommentResponseSchema = z.object({
  success: z.literal(true),
  comment: templateCommentSchema,
});

export const templateCommentErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
