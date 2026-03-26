import { AssistantRuntimeProvider } from '@assistant-ui/react-native';
import {
  useAgentStore,
  createThreadHistoryAdapter,
  convertToThreadMessageLike,
  transformMessageLike,
} from '@gruenerator/chat';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

import { useMobileChatRuntime } from '../hooks/useMobileChatRuntime';
import { configureMobileChat, getMobileChatApiClient } from '../services/chatConfig';

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
      loadCompactionState(threadId, apiClient);
    } else {
      useAgentStore.getState().setCurrentThread(null);
    }
  }, [threadId, loadCompactionState]);

  return null;
}

export function MobileChatProvider({
  children,
  threadId,
}: MobileChatProviderProps) {
  const configuredRef = useRef<boolean>(null);
  if (configuredRef.current == null) {
    configureMobileChat();
    configuredRef.current = true;
  }

  const historyAdapter = useMemo(() => {
    if (!threadId || threadId === 'new') return undefined;
    const apiClient = getMobileChatApiClient();
    return createThreadHistoryAdapter(threadId, apiClient, convertToThreadMessageLike, transformMessageLike);
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
