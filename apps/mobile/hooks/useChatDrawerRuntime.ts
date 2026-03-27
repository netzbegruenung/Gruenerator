import { useAuiState, useRemoteThreadListRuntime } from '@assistant-ui/react-native';
import {
  createGrueneratorThreadListAdapter,
  getDefaultAgent,
  useAgentStore,
  useChatConfigStore,
  createChatApiClient,
  createThreadHistoryAdapter,
  convertToThreadMessageLike,
  transformMessageLike,
} from '@gruenerator/chat';
import { useMemo, useRef } from 'react';

import { configureMobileChat } from '../services/chatConfig';

import { useMobileChatRuntime } from './useMobileChatRuntime';

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
    return createThreadHistoryAdapter(remoteId, apiClient, convertToThreadMessageLike, transformMessageLike);
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
