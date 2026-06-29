import { useLocalRuntime, type LocalRuntimeOptions } from '@assistant-ui/react-native';
import {
  createGrueneratorModelAdapter,
  useAgentStore,
  useChatConfigStore,
  createChatApiClient,
  type GrueneratorAdapterConfig,
  type StreamMetadata,
} from '@gruenerator/chat';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/shallow';

import { getResearchCollectionIds } from '../config/notebooksConfig';

interface MobileChatRuntimeOptions {
  adapters?: LocalRuntimeOptions['adapters'];
}

export function useMobileChatRuntime(opts?: MobileChatRuntimeOptions) {
  const {
    selectedAgentId,
    selectedModel,
    enabledTools,
    selectedNotebookId,
    threadMode,
    searchMode,
    customSystemPrompt,
    customRoleName,
    customEnabledTools,
  } = useAgentStore(
    useShallow((s) => ({
      selectedAgentId: s.selectedAgentId,
      selectedModel: s.selectedModel,
      enabledTools: s.enabledTools,
      selectedNotebookId: s.selectedNotebookId,
      threadMode: s.threadMode,
      searchMode: s.searchMode,
      customSystemPrompt: s.customSystemPrompt,
      customRoleName: s.customRoleName,
      customEnabledTools: s.customEnabledTools,
    }))
  );
  const incrementMessageCount = useAgentStore((s) => s.incrementMessageCount);
  const needsCompaction = useAgentStore((s) => s.needsCompaction);
  const compactionState = useAgentStore((s) => s.compactionState);
  const triggerCompaction = useAgentStore((s) => s.triggerCompaction);

  const getConfig = useCallback(
    (): GrueneratorAdapterConfig => ({
      agentId: selectedAgentId,
      modelId: selectedModel,
      // Web search is removed from the mobile app; the shared store may still
      // carry web: true from web/legacy state, so force it off here.
      enabledTools: { ...enabledTools, web: false },
      threadId: useAgentStore.getState().currentThreadId,
      selectedNotebookId,
      // Notebook mode scopes RAG by collection id. System notebooks resolve to
      // their `*-system` ids via the research map; user notebooks (UUIDs) return
      // [] there, so pass the UUID itself as the single collection.
      selectedNotebookCollectionIds: selectedNotebookId
        ? getResearchCollectionIds(selectedNotebookId).length > 0
          ? getResearchCollectionIds(selectedNotebookId)
          : [selectedNotebookId]
        : undefined,
      threadMode,
      searchMode,
      customSystemPrompt,
      customRoleName,
      customEnabledTools,
    }),
    [
      selectedAgentId,
      selectedModel,
      enabledTools,
      selectedNotebookId,
      threadMode,
      searchMode,
      customSystemPrompt,
      customRoleName,
      customEnabledTools,
    ]
  );

  const onThreadCreated = useCallback((newThreadId: string) => {
    useAgentStore.getState().setCurrentThread(newThreadId);
  }, []);

  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const runtimeApiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  const needsCompactionRef = useRef(needsCompaction);
  const compactionSummaryRef = useRef(compactionState.summary);
  useEffect(() => {
    needsCompactionRef.current = needsCompaction;
    compactionSummaryRef.current = compactionState.summary;
  }, [needsCompaction, compactionState.summary]);

  const onComplete = useCallback(
    (_metadata: StreamMetadata) => {
      const tid = useAgentStore.getState().currentThreadId;
      if (tid) {
        incrementMessageCount();
        incrementMessageCount();

        if (needsCompactionRef.current && !compactionSummaryRef.current) {
          void triggerCompaction(tid, runtimeApiClient);
        }
      }
    },
    [incrementMessageCount, triggerCompaction, runtimeApiClient]
  );

  const callbacks = useMemo(() => ({ onThreadCreated, onComplete }), [onThreadCreated, onComplete]);
  /* eslint-disable react-hooks/refs -- callbacks are only invoked asynchronously, not during render */
  const modelAdapter = useMemo(
    () => createGrueneratorModelAdapter(getConfig, callbacks),
    [getConfig, callbacks]
  );
  /* eslint-enable react-hooks/refs */

  const runtimeOptions: LocalRuntimeOptions = useMemo(
    () => ({
      unstable_humanToolNames: ['ask_human'],
      adapters: opts?.adapters,
    }),
    [opts?.adapters]
  );

  return useLocalRuntime(modelAdapter, runtimeOptions);
}
