/**
 * Zod schemas for board comment + reaction endpoints (/api/board-comments/*).
 * Mirrors apps/api/routes/boards/boardCommentsController.ts.
 */
import { z } from 'zod';

// ── Building blocks ───────────────────────────────────────────────────────────

export const commentBlockSchema = z.object({
  type: z.enum(['text', 'mention', 'link', 'code']),
  text: z.string().optional(),
  userId: z.string().optional(),
  displayName: z.string().optional(),
  url: z.string().optional(),
});

export const commentReactionSchema = z.object({
  id: z.string(),
  comment_id: z.string(),
  user_id: z.string(),
  emoji: z.string(),
  created_at: z.string(),
});

// Bare board_comments row (the shape `UPDATE ... RETURNING *` produces).
export const boardCommentRowSchema = z.object({
  id: z.string(),
  board_id: z.string(),
  card_id: z.string(),
  parent_id: z.string().nullable(),
  user_id: z.string(),
  content: z.string().nullable(),
  blocks: z.array(commentBlockSchema),
  mentioned_user_ids: z.array(z.string()),
  is_edited: z.boolean(),
  edited_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

// A reply: row + author + reactions (replies never nest further, no reply_count).
export const boardCommentReplySchema = boardCommentRowSchema.extend({
  author_name: z.string().nullable(),
  author_avatar_robot_id: z.number().nullable(),
  reactions: z.array(commentReactionSchema),
});

// A top-level comment: reply shape + reply_count + nested replies.
export const boardCommentSchema = boardCommentReplySchema.extend({
  reply_count: z.number().optional(),
  replies: z.array(boardCommentReplySchema),
});

// ── Request bodies ────────────────────────────────────────────────────────────

export const createCommentBodySchema = z.object({
  blocks: z.array(commentBlockSchema),
  parentId: z.string().optional(),
});

export const updateCommentBodySchema = z.object({
  blocks: z.array(commentBlockSchema),
});

export const addReactionBodySchema = z.object({
  emoji: z.string().min(1),
});

// ── Response schemas ──────────────────────────────────────────────────────────

export const commentListResponseSchema = z.array(boardCommentSchema);

export const commentCountResponseSchema = z.object({
  count: z.number(),
});

export const reactionAlreadyExistsResponseSchema = z.object({
  already_exists: z.literal(true),
});

export const boardCommentSuccessResponseSchema = z.object({
  success: z.literal(true),
});

export const boardCommentErrorResponseSchema = z.object({
  error: z.string(),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type CommentBlock = z.infer<typeof commentBlockSchema>;
export type CommentReaction = z.infer<typeof commentReactionSchema>;
export type BoardCommentRow = z.infer<typeof boardCommentRowSchema>;
export type BoardComment = z.infer<typeof boardCommentSchema>;
export type BoardCommentReply = z.infer<typeof boardCommentReplySchema>;
