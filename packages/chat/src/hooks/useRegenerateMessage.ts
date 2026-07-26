import { useMessageRuntime } from '@assistant-ui/react';
import { useCallback } from 'react';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';

/**
 * Re-run the last assistant turn.
 *
 * Signals the backend to REPLACE (not append) the turn before asking
 * assistant-ui to re-run the adapter — shared by the action bar and the
 * error banner so a retry after a failure behaves exactly like a regenerate.
 */
export function useRegenerateMessage(): () => void {
  const messageRuntime = useMessageRuntime();

  return useCallback(() => {
    const threadId = useAgentStore.getState().currentThreadId;
    if (threadId) useChatConfigStore.getState().signalRegenerate(threadId);
    messageRuntime.reload();
  }, [messageRuntime]);
}
