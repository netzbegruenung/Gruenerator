import { buildChatThreadSlug, extractSlugSuffix } from '@gruenerator/shared/utils';

import {
  getNotebookCollectionIds,
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
 *
 * A thread that asked several collections belongs to the aggregate, web's only
 * multi-source notebook, which lives at `/wissen`. Its first collection alone
 * names a narrower notebook (`grundsatz-system` is the Grüne notebook's).
 */
export function buildNotebookThreadPath(
  collectionIds: readonly string[],
  remoteId: string
): string {
  if (collectionIds.length > 1) return `/wissen?thread=${remoteId}`;
  const slug = collectionIds[0].replace(/-system$/, '');
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
    const collectionIds = getNotebookCollectionIds(remoteId);
    if (collectionIds.length) return buildNotebookThreadPath(collectionIds, remoteId);
  }
  const suffix = getThreadSlugSuffix(remoteId);
  return suffix ? `/chat/${buildChatThreadSlug(title, suffix)}` : `/chat/${remoteId}`;
}

/**
 * The read-only archive view of a shared thread — where a read-only
 * group share opens instead of the live chat.
 */
export function buildSharedThreadPath(remoteId: string, title: string | null): string {
  const suffix = getThreadSlugSuffix(remoteId);
  return suffix
    ? `/chat/geteilt/${buildChatThreadSlug(title, suffix)}`
    : `/chat/geteilt/${remoteId}`;
}

/**
 * Whether an in-app path (the host's `location.pathname`) names this thread.
 * Compared by slug suffix, not by the full path: the title half of the slug is
 * cosmetic and lags a rename, and legacy links carry the bare remote id.
 */
export function pathNamesThread(path: string | null | undefined, remoteId: string): boolean {
  if (!path) return false;
  const last = path.split('/').pop() ?? '';
  if (last === remoteId) return true;
  const suffix = getThreadSlugSuffix(remoteId);
  return suffix !== null && extractSlugSuffix(last) === suffix;
}
