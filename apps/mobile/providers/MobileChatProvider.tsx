import { AssistantRuntimeProvider, type LocalRuntimeOptions } from '@assistant-ui/react-native';
import {
  useAgentStore,
  createThreadHistoryAdapter,
  convertToThreadMessageLike,
  transformMessageLike,
} from '@gruenerator/chat';
import { type ReactNode, useEffect, useMemo } from 'react';

import { useMobileChatRuntime } from '../hooks/useMobileChatRuntime';
import { getMobileChatApiClient } from '../services/chatConfig';

interface MobileChatProviderProps {
  children: ReactNode;
  threadId?: string | null;
}

function ThreadSetup({ threadId }: { threadId?: string | null }) {
  const loadCompactionState = useAgentStore((s) => s.loadCompactionState);

  useEffect(() => {
    if (threadId && threadId !== 'new') {
      useAgentStore.getState().setCurrentThread(threadId);
      const apiClient = getMobileChatApiClient();
      void loadCompactionState(threadId, apiClient);
    } else {
      useAgentStore.getState().setCurrentThread(null);
    }
  }, [threadId, loadCompactionState]);

  return null;
}

export function MobileChatProvider({ children, threadId }: MobileChatProviderProps) {
  const historyAdapter = useMemo(() => {
    if (!threadId || threadId === 'new') return undefined;
    const apiClient = getMobileChatApiClient();
    return createThreadHistoryAdapter(
      threadId,
      apiClient,
      convertToThreadMessageLike,
      transformMessageLike
    );
  }, [threadId]);

  const runtime = useMobileChatRuntime(
    historyAdapter ? { adapters: { history: historyAdapter } } : undefined
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadSetup threadId={threadId} />
      {children}
    </AssistantRuntimeProvider>
  );
}
