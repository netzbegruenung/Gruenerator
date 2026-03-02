import { useLocalRuntime, type LocalRuntimeOptions } from '@assistant-ui/react-native';
import {
  createGrueneratorModelAdapter,
  useAgentStore,
  useChatConfigStore,
  createChatApiClient,
  type GrueneratorAdapterConfig,
  type StreamMetadata,
} from '@gruenerator/chat';
import { useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/shallow';

export function useMobileChatRuntime() {
  const { selectedAgentId, selectedModel, enabledTools, useDeepAgent, selectedNotebookId } =
    useAgentStore(
      useShallow((s) => ({
        selectedAgentId: s.selectedAgentId,
        selectedModel: s.selectedModel,
        enabledTools: s.enabledTools,
        useDeepAgent: s.useDeepAgent,
        selectedNotebookId: s.selectedNotebookId,
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
      enabledTools,
      threadId: useAgentStore.getState().currentThreadId,
      useDeepAgent,
      selectedNotebookId,
    }),
    [selectedAgentId, selectedModel, enabledTools, useDeepAgent, selectedNotebookId]
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
  needsCompactionRef.current = needsCompaction;
  const compactionSummaryRef = useRef(compactionState.summary);
  compactionSummaryRef.current = compactionState.summary;

  const onComplete = useCallback(
    (_metadata: StreamMetadata) => {
      const tid = useAgentStore.getState().currentThreadId;
      if (tid) {
        incrementMessageCount();
        incrementMessageCount();

        if (needsCompactionRef.current && !compactionSummaryRef.current) {
          triggerCompaction(tid, runtimeApiClient);
        }
      }
    },
    [incrementMessageCount, triggerCompaction, runtimeApiClient]
  );

  const modelAdapter = useMemo(
    () => createGrueneratorModelAdapter(getConfig, { onThreadCreated, onComplete }),
    [getConfig, onThreadCreated, onComplete]
  );

  const runtimeOptions: LocalRuntimeOptions = useMemo(
    () => ({ unstable_humanToolNames: ['ask_human'] }),
    []
  );

  return useLocalRuntime(modelAdapter, runtimeOptions);
}
