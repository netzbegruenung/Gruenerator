/**
 * Comments on user agents (Agentura detail page). Same shape as group share
 * comments; reactions on the agent itself ride along in the list response so
 * the page needs one query.
 */
import { z } from 'zod';

import { reactionSummariesSchema } from './entityReactions.js';
import { GROUP_COMMENT_MAX } from './groups.js';

export const agentCommentSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  /** Kommentar oberster Ebene, auf den geantwortet wird; null = selbst oben. */
  parentId: z.string().nullable(),
  userId: z.string().nullable(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string(),
  reactions: reactionSummariesSchema.default([]),
});
export type AgentComment = z.infer<typeof agentCommentSchema>;

export const createAgentCommentBodySchema = z.object({
  body: z.string().trim().min(1, 'Kommentar ist leer.').max(GROUP_COMMENT_MAX),
  parentId: z.string().uuid().nullish(),
});

export const agentCommentsResponseSchema = z.object({
  success: z.literal(true),
  reactions: reactionSummariesSchema,
  comments: z.array(agentCommentSchema),
});
export type AgentCommentsResponse = z.infer<typeof agentCommentsResponseSchema>;

export const agentCommentResponseSchema = z.object({
  success: z.literal(true),
  comment: agentCommentSchema,
});

export const agentCommentErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
});
