/**
 * Comments on marketplace items (Agents, Rezepte, Vorlagen, Sticker and
 * Hintergründe, official ones included), one model for all of them. The list
 * carries the reactions on the item itself, so a detail page needs one query.
 */
import { z } from 'zod';

import { entityCommentTypeSchema } from './entityLikes.js';
import { reactionSummariesSchema } from './entityReactions.js';
import { GROUP_COMMENT_MAX } from './groups.js';

export const entityCommentSchema = z.object({
  id: z.string(),
  entityType: entityCommentTypeSchema,
  entityId: z.string(),
  /** Kommentar oberster Ebene, auf den geantwortet wird; null = selbst oben. */
  parentId: z.string().nullable(),
  userId: z.string().nullable(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string(),
  reactions: reactionSummariesSchema.default([]),
});
export type EntityComment = z.infer<typeof entityCommentSchema>;

export const createEntityCommentBodySchema = z.object({
  body: z.string().trim().min(1, 'Kommentar ist leer.').max(GROUP_COMMENT_MAX),
  parentId: z.string().guid().nullish(),
});

export const entityCommentsResponseSchema = z.object({
  success: z.literal(true),
  /** Reactions on the item itself. */
  reactions: reactionSummariesSchema,
  comments: z.array(entityCommentSchema),
});
export type EntityCommentsResponse = z.infer<typeof entityCommentsResponseSchema>;

export const entityCommentResponseSchema = z.object({
  success: z.literal(true),
  comment: entityCommentSchema,
});

export const entityCommentErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
