/**
 * Emoji reactions on group posts, group comments, board comments, marketplace
 * items and their comments.
 * Writing accepts only REACTION_EMOJIS; reading tolerates any string
 * (legacy board reactions such as 💡).
 */
import { z } from 'zod';

export const REACTION_EMOJIS = ['👍', '👎', '😄', '🎉', '😕', '❤️', '🚀', '👀'] as const;

export const reactionEmojiSchema = z.enum(REACTION_EMOJIS);

export const reactionEntityTypeSchema = z.enum([
  'group_share',
  'group_comment',
  'board_comment',
  /** Legacy: an agent's row uuid, stored as the item `('agent', id)`. */
  'agent',
  /** Legacy: an entity comment id (the comment was copied with the same id). */
  'agent_comment',
  /** Legacy: an entity comment id (the comment was copied with the same id). */
  'template_comment',
  'entity_comment',
  /** A marketplace item; the request names its kind in `itemType`, `entityId` is its ref. */
  'marketplace_item',
]);

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
