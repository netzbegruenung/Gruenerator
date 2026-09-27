import { type GroupShareComment } from '@gruenerator/contracts';

export interface GroupCommentThread {
  comment: GroupShareComment;
  replies: GroupShareComment[];
}

/**
 * Kommentare eines Beitrags als Threads: Kommentare oberster Ebene in
 * Reihenfolge, jeweils mit ihren Antworten darunter. Eine Antwort, deren
 * Kommentar nicht (mehr) in der Liste steht, steht selbst oben.
 */
export function threadComments(comments: GroupShareComment[]): GroupCommentThread[] {
  const ids = new Set(comments.map((c) => c.id));
  const threads = new Map<string, GroupCommentThread>();
  for (const c of comments) {
    if (!c.parentId || !ids.has(c.parentId)) threads.set(c.id, { comment: c, replies: [] });
  }
  for (const c of comments) {
    if (c.parentId && ids.has(c.parentId)) threads.get(c.parentId)?.replies.push(c);
  }
  return [...threads.values()];
}

/** „@Vorname “ — Antworten beginnen mit einer Erwähnung der Person, der geantwortet wird. */
export function replyMention(authorName: string): string {
  return `@${authorName.split(' ')[0]} `;
}
