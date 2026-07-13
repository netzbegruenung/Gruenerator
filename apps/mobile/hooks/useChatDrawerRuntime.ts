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
import { isUnauthorizedError } from '@gruenerator/shared/api';
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
    return createThreadHistoryAdapter(
      remoteId,
      apiClient,
      convertToThreadMessageLike,
      transformMessageLike
    );
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

  const adapter = useMemo(() => {
    const base = createGrueneratorThreadListAdapter(apiClient, getDefaultAgent(), {
      onDelete: (remoteId) => {
        if (useAgentStore.getState().currentThreadId === remoteId) {
          useAgentStore.getState().setCurrentThread(null);
        }
      },
    });
    // On web a 401 from list() drives the atomic teardown+redirect. Mobile has
    // no such redirect (mobileOnUnauthorized only warns), so keep the prior
    // graceful behavior here: a dead session yields an empty drawer, not an
    // error state in the RN runtime.
    return {
      ...base,
      list: async () => {
        try {
          return await base.list();
        } catch (error) {
          if (isUnauthorizedError(error)) return { threads: [] };
          throw error;
        }
      },
    };
  }, [apiClient]);

  return useRemoteThreadListRuntime({
    runtimeHook: useDrawerRuntimeHook,
    adapter,
  });
}
