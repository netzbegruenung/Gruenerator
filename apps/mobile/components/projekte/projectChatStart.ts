import { useAgentStore } from '@gruenerator/chat';

import { routeWithParams } from '../../types/routes';

import type { Href } from 'expo-router';

/**
 * The route that opens a new chat filed in a Projekt, with `text` as its first
 * turn. `teamShared` only counts in a team Projekt: a personal Projekt (and the
 * system Projekt) is a solo workspace with nobody to share with.
 */
export function projectChatRoute(opts: {
  groupId: string;
  text: string;
  teamShared: boolean;
  solo: boolean;
}): Href {
  return routeWithParams('/(focused)/chat-conversation', {
    threadId: 'new',
    initialMessage: opts.text,
    groupId: opts.groupId,
    ...(!opts.solo && opts.teamShared && { teamShared: '1' }),
  });
}

/** A new Projekt chat begins fresh (web: #5676): no agent, recipe or connector
 *  left over from the chat the person was in before. */
export function resetForProjectChat(): void {
  useAgentStore.getState().resetChatContext();
}
