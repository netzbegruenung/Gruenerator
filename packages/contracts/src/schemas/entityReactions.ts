/**
 * Emoji reactions on group posts, group comments and board comments.
 * Writing accepts only REACTION_EMOJIS; reading tolerates any string
 * (legacy board reactions such as 💡).
 */
import { z } from 'zod';

export const REACTION_EMOJIS = ['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀'] as const;

export const reactionEmojiSchema = z.enum(REACTION_EMOJIS);

export const reactionEntityTypeSchema = z.enum(['group_share', 'group_comment', 'board_comment']);

export const reactionSummarySchema = z.object({
  emoji: z.string(),
  count: z.number().int().nonnegative(),
  reacted: z.boolean(),
});

export const reactionSummariesSchema = z.array(reactionSummarySchema);

export const reactionsResponseSchema = z.object({
  reactions: reactionSummariesSchema,
});

export const reactionErrorResponseSchema = z.object({
  error: z.string(),
});

export type ReactionEmoji = z.infer<typeof reactionEmojiSchema>;
export type ReactionEntityType = z.infer<typeof reactionEntityTypeSchema>;
export type ReactionSummary = z.infer<typeof reactionSummarySchema>;
export type ReactionsResponse = z.infer<typeof reactionsResponseSchema>;
