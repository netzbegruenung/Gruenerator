import { buildChatThreadSlug } from '@gruenerator/shared/utils';

import {
  getNotebookCollectionId,
  getThreadSlugSuffix,
  getThreadType,
} from '../runtime/GrueneratorThreadListAdapter';

/**
 * Where a notebook conversation lives: its notebook page, carrying the thread
 * id so the page can load that conversation's history.
 *
 * Goes straight to the canonical `/notebooks/…` route. The older targets went
 * through redirects that dropped the query string, so the thread id never
 * arrived and every notebook thread opened as a blank start page. System
 * collections are named `<slug>-system`; where slug and collection differ, the
 * page resolver's collection-id lookup catches it.
 */
export function buildNotebookThreadPath(collectionId: string, remoteId: string): string {
  const slug = collectionId.replace(/-system$/, '');
  return `/notebooks/${slug}?thread=${remoteId}`;
}

/**
 * The in-app path a thread row opens.
 *
 * Falls back to the bare remote id for rows that predate the slug-suffix
 * backfill — ChatThreadRouting resolves those through the adapter's fetch().
 */
export function buildThreadPath(remoteId: string, title: string | null): string {
  if (getThreadType(remoteId) === 'notebook') {
    const collectionId = getNotebookCollectionId(remoteId);
    if (collectionId) return buildNotebookThreadPath(collectionId, remoteId);
  }
  const suffix = getThreadSlugSuffix(remoteId);
  return suffix ? `/chat/${buildChatThreadSlug(title, suffix)}` : `/chat/${remoteId}`;
}
