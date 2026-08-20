import { buildChatThreadSlug } from '@gruenerator/shared/utils';

import {
  getNotebookCollectionId,
  getThreadSlugSuffix,
  getThreadType,
} from '../runtime/GrueneratorThreadListAdapter';

/**
 * The in-app path a thread row opens.
 *
 * Falls back to the bare remote id for rows that predate the slug-suffix
 * backfill — ChatThreadRouting resolves those through the adapter's fetch().
 */
export function buildThreadPath(remoteId: string, title: string | null): string {
  if (getThreadType(remoteId) === 'notebook') {
    const collectionId = getNotebookCollectionId(remoteId);
    if (collectionId) {
      return collectionId.endsWith('-system')
        ? `/gruene-${collectionId.replace('-system', '')}?thread=${remoteId}`
        : `/notebook/${collectionId}?thread=${remoteId}`;
    }
  }
  const suffix = getThreadSlugSuffix(remoteId);
  return suffix ? `/chat/${buildChatThreadSlug(title, suffix)}` : `/chat/${remoteId}`;
}
