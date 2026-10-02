import { type Href } from 'expo-router';

import { notebookIdForCollections } from '../config/notebooksConfig';
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
  /** Every collection a notebook thread asked, the primary one first. */
  notebookCollectionIds?: readonly string[];
  /** The thread's agent, unless it is the default one — reopened without it,
   *  the chat would answer as whichever agent was selected last. */
  agentId?: string | null;
}): { href: Href; withAnchor: boolean } {
  if (thread.threadType === 'notebook' && thread.notebookCollectionIds?.length) {
    return {
      href: routeWithParams('/notebook/[id]/chat', {
        id: notebookIdForCollections(thread.notebookCollectionIds),
        threadId: thread.id,
      }),
      withAnchor: true,
    };
  }
  return {
    href: routeWithParams('/(focused)/chat-conversation', {
      threadId: thread.id,
      ...(thread.agentId && { agentId: thread.agentId }),
    }),
    withAnchor: false,
  };
}

/** The screen on top, as `getCurrentRoute()` of the root container reports it. */
export type CurrentRoute = { name: string; params?: object } | undefined;

/**
 * How the drawer opens a conversation, given what is on screen.
 *
 * - `close`: that conversation is already open — a second copy of it on the
 *   stack would only be one more screen to back out of.
 * - `replace`: a chat is open and another chat is wanted. Switching threads is
 *   not going deeper, so back still leads where the chat was opened from, not
 *   through every thread looked at on the way.
 * - `push`: anything else. A notebook chat always pushes: it lives in its own
 *   stack beneath the root, and a replace there would take the screens under
 *   the chat with it.
 */
export function drawerOpenMode(
  current: CurrentRoute,
  target: { threadId: string; withAnchor: boolean }
): 'close' | 'replace' | 'push' {
  const openThreadId = (current?.params as { threadId?: unknown } | undefined)?.threadId;
  if (target.threadId !== 'new' && openThreadId === target.threadId) return 'close';
  if (current?.name === 'chat-conversation' && !target.withAnchor) return 'replace';
  return 'push';
}
