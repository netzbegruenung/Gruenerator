import { useAuiState } from '@assistant-ui/react';
import { useSyncExternalStore } from 'react';

import { useCurrentUserId } from '../context/CurrentUserContext';
import {
  getThreadAccessType,
  isThreadTeamChat,
  subscribeThreadTags,
} from '../runtime/GrueneratorThreadListAdapter';
import { useAgentStore } from '../stores/chatStore';

import { mayReplaceTurn, type SenderMessage } from './mayReplaceTurn';

export { mayReplaceTurn };

export function useMayReplaceTurn(): boolean {
  const currentUserId = useCurrentUserId();
  const threadId = useAgentStore((s) => s.currentThreadId);
  const ownerOverride = useSyncExternalStore(
    subscribeThreadTags,
    () => !!threadId && !isThreadTeamChat(threadId) && getThreadAccessType(threadId) === 'owner',
    () => false
  );
  return useAuiState((s) =>
    mayReplaceTurn(
      s.thread.messages as readonly SenderMessage[],
      s.message.id,
      currentUserId,
      ownerOverride
    )
  );
}
