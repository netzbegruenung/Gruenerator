import { type GroupShareComment, type ReactionSummary } from '@gruenerator/contracts';

type ApplyReactions = (reactions: ReactionSummary[]) => ReactionSummary[];

/** Web caches `GET /content` as the raw bucket envelope (`useGroupSharing`). */
export type GroupContentBuckets = Record<string, unknown[]>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Replaces the reactions on the share meta of the row whose `share.shareId` matches. */
export function patchShareReactions(
  content: GroupContentBuckets,
  shareId: string,
  apply: ApplyReactions
): GroupContentBuckets {
  const patchRow = (row: unknown): unknown => {
    if (!isRecord(row) || !isRecord(row.share) || row.share.shareId !== shareId) return row;
    // Raw rows are unparsed; the schema defaults missing reactions to [] the same way.
    const current = Array.isArray(row.share.reactions)
      ? (row.share.reactions as ReactionSummary[])
      : [];
    return { ...row, share: { ...row.share, reactions: apply(current) } };
  };
  return Object.fromEntries(
    Object.entries(content).map(([bucket, rows]) => [
      bucket,
      Array.isArray(rows) ? rows.map(patchRow) : rows,
    ])
  );
}

/** Replaces the reactions of one comment (top-level or reply) in the flat comment list. */
export function patchCommentReactions(
  comments: GroupShareComment[],
  commentId: string,
  apply: ApplyReactions
): GroupShareComment[] {
  return comments.map((c) => (c.id === commentId ? { ...c, reactions: apply(c.reactions) } : c));
}
