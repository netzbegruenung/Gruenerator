/**
 * @doc, saved-text and @link picks stay in the thread they were picked in
 * (#4861), like cloud files (threadCloudFiles.ts) and reader hand-offs
 * (threadNotebookSources.ts) do. Only the REFS are stored: every turn reads them
 * again through the same access check as the pick itself — saved texts are
 * owner-scoped, collaborative documents go through the doc-mention permission
 * query, links through the crawler's URL validation — so a stored ref never
 * grants anything by itself.
 *
 * Stored in `chat_threads.mention_refs`, scoped to the thread owner.
 * Deliberately NOT in `chat_thread_attachments`: that table holds the thread's
 * own uploads, and trashing or purging the thread deletes what it points at.
 */

import { z } from 'zod';

import { readMentionedDocs } from './contextEnrichmentService.js';
import { readSavedTextTitles } from './documentContextService.js';

const MENTION_REFS_PER_KIND = 5;

const threadMentionRefsSchema = z.object({
  texts: z.array(z.string().uuid()),
  docs: z.array(z.string().uuid()),
  links: z.array(z.string().url().max(2048)),
});
export type ThreadMentionRefs = z.infer<typeof threadMentionRefsSchema>;

export const NO_MENTION_REFS: ThreadMentionRefs = { texts: [], docs: [], links: [] };

const KINDS = ['texts', 'docs', 'links'] as const;

function mergeIds(stored: string[], picked: string[]): string[] {
  return [...new Set([...picked, ...stored])].slice(0, MENTION_REFS_PER_KIND);
}

/** This turn's picks first, then the thread's earlier ones; duplicates
 *  collapse, the oldest fall off past the cap. Picks that do not parse as a
 *  ref (legacy fixture ids, malformed URLs) are not carried. */
export function mergeThreadMentionRefs(
  stored: ThreadMentionRefs,
  picked: ThreadMentionRefs
): ThreadMentionRefs {
  const valid = threadMentionRefsSchema.shape;
  const out = { ...NO_MENTION_REFS };
  for (const kind of KINDS) {
    const usable = picked[kind].filter((ref) => valid[kind].element.safeParse(ref).success);
    out[kind] = mergeIds(stored[kind], usable);
  }
  return out;
}

export function sameThreadMentionRefs(a: ThreadMentionRefs, b: ThreadMentionRefs): boolean {
  return KINDS.every((kind) => a[kind].join('\n') === b[kind].join('\n'));
}

export function isEmptyThreadMentionRefs(refs: ThreadMentionRefs): boolean {
  return KINDS.every((kind) => refs[kind].length === 0);
}

/**
 * F0: the chips a user message keeps for a reload (`mentionChips` in its
 * metadata), restored by messagesController.
 */
export const persistedMentionChipsSchema = z.array(
  z.object({ kind: z.enum(['text', 'doc', 'link']), id: z.string(), title: z.string() })
);
export type MentionChip = z.infer<typeof persistedMentionChipsSchema>[number];

/** This turn's picks as chips. Titles come from the same access checks that
 *  gate the content, so only what this user can read gets a chip. */
export async function mentionChipsFor(
  userId: string,
  picked: { texts: readonly string[]; docs: readonly string[]; links: readonly string[] }
): Promise<MentionChip[]> {
  const [texts, docs] = await Promise.all([
    readSavedTextTitles(userId, picked.texts),
    picked.docs.length > 0 ? readMentionedDocs(picked.docs, userId) : [],
  ]);
  const titled = (rows: Array<{ id: string; title: string }>, ids: readonly string[]) =>
    ids.flatMap((id) => rows.filter((r) => r.id === id));
  return [
    ...titled(texts, picked.texts).map((r) => ({
      kind: 'text' as const,
      id: r.id,
      title: r.title,
    })),
    ...titled(docs, picked.docs).map((r) => ({ kind: 'doc' as const, id: r.id, title: r.title })),
    ...picked.links.map((url) => ({
      kind: 'link' as const,
      id: url,
      title: url.replace(/^https?:\/\//, ''),
    })),
  ];
}

/** The stored column, or no refs when it is empty or does not parse. */
export function parseThreadMentionRefs(raw: unknown): ThreadMentionRefs {
  if (!raw) return NO_MENTION_REFS;
  try {
    const parsed = threadMentionRefsSchema.safeParse(
      typeof raw === 'string' ? JSON.parse(raw) : raw
    );
    return parsed.success ? parsed.data : NO_MENTION_REFS;
  } catch {
    return NO_MENTION_REFS;
  }
}
