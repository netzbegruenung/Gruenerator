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
  resumeChatTurn,
} from '@gruenerator/chat';
import { isUnauthorizedError } from '@gruenerator/shared/api';
import { useMemo } from 'react';

import { useDrawerStore } from './useDrawerStore';
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
      transformMessageLike,
      resumeChatTurn
    );
  }, [remoteId, apiClient]);

  return useMobileChatRuntime(
    historyAdapter ? { adapters: { history: historyAdapter } } : undefined
  );
}

// assistant-ui calls this as a hook inside its own runtime component; the
// compiler only objects to passing a `use*`-named value (#4419).
const drawerRuntimeHook = useDrawerRuntimeHook;

export function useChatDrawerRuntime() {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const apiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );
  const listRevision = useDrawerStore((s) => s.listRevision);

  // A new adapter is assistant-ui's only way to reload a remote thread list
  // (RemoteThreadListAdapter docs; no refresh API, assistant-ui#2170). Threads
  // are created by each chat screen's own runtime, which this drawer runtime
  // never hears about, so the list is rebuilt whenever the drawer opens.
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
      // Read here, not only listed below: the compiler keys its memo on what the
      // callback reads, so a dependency it never reads would not rebuild it.
      listRevision,
      list: async () => {
        try {
          return await base.list();
        } catch (error) {
          if (isUnauthorizedError(error)) return { threads: [] };
          throw error;
        }
      },
    };
  }, [apiClient, listRevision]);

  return useRemoteThreadListRuntime({
    runtimeHook: drawerRuntimeHook,
    adapter,
  });
}
