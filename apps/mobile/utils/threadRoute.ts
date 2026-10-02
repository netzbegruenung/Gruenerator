import { type Href } from 'expo-router';

import { notebookIdForCollection } from '../config/notebooksConfig';
import { routeWithParams } from '../types/routes';

/**
 * Where a stored conversation opens. A notebook thread goes back to its
 * notebook chat — opened as a plain chat it would answer its next question
 * without the notebook's sources.
 *
 * `withAnchor` is part of the answer because it is only right for the notebook:
 * pushed with an anchor, a plain chat would get `(focused)`'s first screen slid
 * in beneath it.
 */
export function threadRoute(thread: {
  id: string;
  threadType?: string | null;
  notebookCollectionId?: string | null;
}): { href: Href; withAnchor: boolean } {
  if (thread.threadType === 'notebook' && thread.notebookCollectionId) {
    return {
      href: routeWithParams('/notebook/[id]/chat', {
        id: notebookIdForCollection(thread.notebookCollectionId),
        threadId: thread.id,
      }),
      withAnchor: true,
    };
  }
  return {
    href: routeWithParams('/(focused)/chat-conversation', { threadId: thread.id }),
    withAnchor: false,
  };
}
