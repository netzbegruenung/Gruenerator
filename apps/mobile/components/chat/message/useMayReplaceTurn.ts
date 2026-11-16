import { useAuiState } from '@assistant-ui/react-native';
import {
  getThreadAccessType,
  isThreadTeamChat,
  mayReplaceTurn,
  subscribeThreadTags,
  useAgentStore,
} from '@gruenerator/chat';
import { useAuthStore } from '@gruenerator/shared/stores';
import { useSyncExternalStore } from 'react';

interface SenderMessage {
  role: string;
  metadata?: unknown;
}

/**
 * Edit and regenerate replace the sender's own turn. In a team chat the server
 * refuses them on a teammate's turn (`not_your_message`), so the buttons stay
 * away — the same rule as web's `useMayReplaceTurn`, which reads the web
 * runtime's store and so cannot be used here.
 */
export function useMayReplaceTurn(): boolean {
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
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
