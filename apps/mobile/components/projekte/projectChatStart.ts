import { useAgentStore } from '@gruenerator/chat';

import { routeWithParams } from '../../types/routes';

import type { Href } from 'expo-router';

/**
 * The route that opens a new chat filed in a Projekt, with `text` as its first
 * turn. `teamShared` off keeps the chat private; it is still filed in the
 * Projekt and reads its instructions, knowledge and recipes (as on the web).
 */
export function projectChatRoute(opts: {
  groupId: string;
  text: string;
  teamShared: boolean;
  /** Unique per start (defaults to now). */
  handoff?: string;
}): Href {
  return routeWithParams('/(focused)/chat-conversation', {
    threadId: 'new',
    initialMessage: opts.text,
    groupId: opts.groupId,
    handoff: opts.handoff ?? String(Date.now()),
    ...(opts.teamShared && { teamShared: '1' }),
  });
}

/** A new Projekt chat begins fresh (web: #5676): no agent, recipe or connector
 *  left over from the chat the person was in before. */
export function resetForProjectChat(): void {
  useAgentStore.getState().resetChatContext();
}
