import { AssistantRuntimeProvider, type LocalRuntimeOptions } from '@assistant-ui/react-native';
import {
  useAgentStore,
  createThreadHistoryAdapter,
  convertToThreadMessageLike,
  transformMessageLike,
  resumeChatTurn,
} from '@gruenerator/chat';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';

import { useChatVoiceAdapter } from '../hooks/useChatVoiceAdapter';
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
      transformMessageLike,
      resumeChatTurn
    );
  }, [threadId]);

  // The voice call writes into this runtime: it needs it, and the runtime needs
  // the adapter, so the adapter reads it through a ref set once both exist.
  const runtimeRef = useRef<ReturnType<typeof useMobileChatRuntime> | null>(null);
  const voiceAdapter = useChatVoiceAdapter(runtimeRef);
  const adapters = useMemo(
    () => ({
      ...(historyAdapter && { history: historyAdapter }),
      ...(voiceAdapter && { voice: voiceAdapter }),
    }),
    [historyAdapter, voiceAdapter]
  );

  const runtime = useMobileChatRuntime({ adapters });
  useEffect(() => {
    runtimeRef.current = runtime;
    return () => {
      runtimeRef.current = null;
    };
  }, [runtime]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadSetup threadId={threadId} />
      {children}
    </AssistantRuntimeProvider>
  );
}
