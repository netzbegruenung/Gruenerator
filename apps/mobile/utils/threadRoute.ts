import { type Href } from 'expo-router';

import { notebookIdForCollection } from '../config/notebooksConfig';
import { routeWithParams } from '../types/routes';

/**
 * Where a stored conversation opens. A notebook thread goes back to its
 * notebook chat — opened as a plain chat it would answer its next question
 * without the notebook's sources.
 */
export function threadRoute(thread: {
  id: string;
  threadType?: string | null;
  notebookCollectionId?: string | null;
}): Href {
  if (thread.threadType === 'notebook' && thread.notebookCollectionId) {
    return routeWithParams('/(focused)/notebook-chat', {
      notebookId: notebookIdForCollection(thread.notebookCollectionId),
      threadId: thread.id,
    });
  }
  return routeWithParams('/(focused)/chat-conversation', { threadId: thread.id });
}
