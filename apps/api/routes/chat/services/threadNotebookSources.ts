/**
 * Notebook documents handed from the reader to the chat ("Mit KI
 * zusammenfassen" / "Im Chat besprechen") stay in that thread, like cloud files
 * do (threadCloudFiles.ts). Only the REFS are stored: every ref is re-authorized
 * on every turn with the reader's own access rules (resolveNotebookSources.ts),
 * so a stored ref never grants anything by itself.
 *
 * Stored in `chat_threads.notebook_source_refs`, scoped to the thread owner.
 * Deliberately NOT in `chat_thread_attachments`: trashing and purging a thread
 * delete the vectors of every `document_id` there, which would destroy the
 * referenced (real) document.
 */

import {
  NOTEBOOK_SOURCE_REFS_MAX,
  type NotebookSourceRef,
  notebookSourceRefSchema,
} from '@gruenerator/contracts';
import { z } from 'zod';

const threadNotebookSourcesSchema = z.array(notebookSourceRefSchema);

export const NO_NOTEBOOK_SOURCES: NotebookSourceRef[] = [];

export const notebookSourceKey = (ref: NotebookSourceRef): string =>
  'documentId' in ref ? ref.documentId : `${ref.collectionId}:${ref.sourceUrl}`;

/** This turn's refs first, then the thread's earlier ones; duplicates
 *  collapse, the oldest fall off past the cap. */
export function mergeThreadNotebookSources(
  stored: NotebookSourceRef[],
  picked: NotebookSourceRef[]
): NotebookSourceRef[] {
  const seen = new Set<string>();
  const out: NotebookSourceRef[] = [];
  for (const ref of [...picked, ...stored]) {
    const k = notebookSourceKey(ref);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(ref);
  }
  return out.slice(0, NOTEBOOK_SOURCE_REFS_MAX);
}

/** Identity and order. A user ref re-picked through another notebook counts as
 *  changed, so the newer access path gets stored. */
export function sameThreadNotebookSources(a: NotebookSourceRef[], b: NotebookSourceRef[]): boolean {
  const ident = (r: NotebookSourceRef) =>
    'documentId' in r ? `${r.documentId}@${r.notebookId ?? ''}` : notebookSourceKey(r);
  return a.map(ident).join('\n') === b.map(ident).join('\n');
}

/** The stored column, or no refs when it is empty or does not parse. */
export function parseThreadNotebookSources(raw: unknown): NotebookSourceRef[] {
  if (!raw) return NO_NOTEBOOK_SOURCES;
  try {
    const parsed = threadNotebookSourcesSchema.safeParse(
      typeof raw === 'string' ? JSON.parse(raw) : raw
    );
    return parsed.success ? parsed.data : NO_NOTEBOOK_SOURCES;
  } catch {
    return NO_NOTEBOOK_SOURCES;
  }
}
