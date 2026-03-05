import { useAuiState, useRemoteThreadListRuntime } from '@assistant-ui/react-native';
import {
  fromThreadMessageLike,
  getAutoStatus,
  generateId,
} from '@assistant-ui/react-native/internal';
import {
  createGrueneratorThreadListAdapter,
  getDefaultAgent,
  useAgentStore,
  useChatConfigStore,
  createChatApiClient,
  type ChatApiClient,
} from '@gruenerator/chat';
import { useMemo, useRef } from 'react';

import { convertToThreadMessageLike, type LoadedMessage } from '../providers/MobileChatProvider';
import { configureMobileChat, getMobileChatApiClient } from '../services/chatConfig';

import { useMobileChatRuntime } from './useMobileChatRuntime';

function createHistoryAdapter(remoteId: string, apiClient: ChatApiClient) {
  return {
    async load() {
      try {
        const msgs = await apiClient.get<LoadedMessage[]>(
          `/api/chat-service/messages?threadId=${remoteId}`
        );
        const converted = convertToThreadMessageLike(msgs);
        const conv = converted.map((m) =>
          fromThreadMessageLike(
            m,
            generateId(),
            getAutoStatus(false, false, false, false, undefined)
          )
        );
        return {
          messages: conv.map((m, idx) => ({
            parentId: idx > 0 ? conv[idx - 1]!.id : null,
            message: m,
          })),
        };
      } catch (error) {
        console.warn('[DrawerHistory] Failed to load messages:', error);
        return { messages: [] };
      }
    },
    async append() {
      // Backend persists messages via the SSE stream handler
    },
  };
}

function useDrawerRuntimeHook() {
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);

  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const apiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  const historyAdapter = useMemo(() => {
    if (!remoteId) return undefined;
    return createHistoryAdapter(remoteId, apiClient);
  }, [remoteId, apiClient]);

  return useMobileChatRuntime(
    historyAdapter ? { adapters: { history: historyAdapter } } : undefined
  );
}

export function useChatDrawerRuntime() {
  const configuredRef = useRef(false);
  if (!configuredRef.current) {
    configureMobileChat();
    configuredRef.current = true;
  }

  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const apiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  const adapter = useMemo(
    () =>
      createGrueneratorThreadListAdapter(apiClient, getDefaultAgent(), {
        onDelete: (remoteId) => {
          if (useAgentStore.getState().currentThreadId === remoteId) {
            useAgentStore.getState().setCurrentThread(null);
          }
        },
      }),
    [apiClient]
  );

  return useRemoteThreadListRuntime({
    runtimeHook: useDrawerRuntimeHook,
    adapter,
  });
}
