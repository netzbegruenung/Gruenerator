import { type GroupShareComment } from '@gruenerator/contracts';

interface Threadable {
  id: string;
  parentId: string | null;
}

export interface GroupCommentThread<T extends Threadable = GroupShareComment> {
  comment: T;
  replies: T[];
}

/**
 * Kommentare eines Beitrags als Threads: Kommentare oberster Ebene in
 * Reihenfolge, jeweils mit ihren Antworten darunter. Eine Antwort hängt am
 * obersten Kommentar ihrer Kette, der in der Liste steht — fehlt ihr Kommentar
 * (gelöscht oder verborgen), steht sie selbst oben, und ihre Antworten bleiben
 * unter ihr. Kein Kommentar geht verloren, auch nicht in einer Elternschleife.
 */
export function threadComments<T extends Threadable>(comments: T[]): GroupCommentThread<T>[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const parentOf = (c: T): T | null => (c.parentId ? (byId.get(c.parentId) ?? null) : null);
  const rootOf = (comment: T): T => {
    const seen = new Set<string>();
    let current = comment;
    let parent = parentOf(current);
    while (parent && !seen.has(current.id)) {
      seen.add(current.id);
      current = parent;
      parent = parentOf(current);
    }
    return current;
  };

  const roots = new Map(comments.map((c) => [c.id, rootOf(c)]));
  const threads = new Map<string, GroupCommentThread<T>>();
  for (const c of comments) {
    if (roots.get(c.id) === c) threads.set(c.id, { comment: c, replies: [] });
  }
  for (const c of comments) {
    const root = roots.get(c.id);
    if (root && root !== c) threads.get(root.id)?.replies.push(c);
  }
  return [...threads.values()];
}

/** „@Vorname “ — Antworten beginnen mit einer Erwähnung der Person, der geantwortet wird. */
export function replyMention(authorName: string): string {
  return `@${authorName.split(' ')[0]} `;
}
