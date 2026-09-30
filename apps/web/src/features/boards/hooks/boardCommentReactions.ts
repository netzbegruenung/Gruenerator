import { type BoardComment, type ReactionSummary } from '@gruenerator/contracts';

type ApplyReactions = (reactions: ReactionSummary[]) => ReactionSummary[];

/**
 * Replaces `reactionSummaries` of one comment (top-level or reply) in the cached
 * thread. The legacy `reactions` rows stay as they are; the invalidate after the
 * toggle refreshes them.
 */
export function patchBoardCommentReactions(
  comments: BoardComment[],
  commentId: string,
  apply: ApplyReactions
): BoardComment[] {
  return comments.map((c) => {
    if (c.id === commentId) return { ...c, reactionSummaries: apply(c.reactionSummaries) };
    if (!c.replies.some((r) => r.id === commentId)) return c;
    return {
      ...c,
      replies: c.replies.map((r) =>
        r.id === commentId ? { ...r, reactionSummaries: apply(r.reactionSummaries) } : r
      ),
    };
  });
}

/**
 * The contracts client does not validate responses, so the schema's `.default([])`
 * never runs: a backend from before reactions sends comments without the field.
 */
export function withReactionSummaries(comments: BoardComment[]): BoardComment[] {
  return comments.map((c) => ({
    ...c,
    reactionSummaries: c.reactionSummaries ?? [],
    replies: c.replies.map((r) => ({ ...r, reactionSummaries: r.reactionSummaries ?? [] })),
  }));
}
