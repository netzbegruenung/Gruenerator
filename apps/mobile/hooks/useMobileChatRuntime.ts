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
import { useNotebookFilterStore } from '../stores/notebookFilterStore';

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
    pinnedConnector,
    activeSkillMention,
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
      pinnedConnector: s.pinnedConnector,
      activeSkillMention: s.activeSkillMention,
    }))
  );
  // Notebook filter selection (facets, sources, depth) — only honoured while it
  // belongs to the notebook being asked, so it can't leak between notebooks.
  const notebookFilterState = useNotebookFilterStore(
    useShallow((s) => ({
      notebookId: s.notebookId,
      keywordFilters: s.keywordFilters,
      collectionIds: s.collectionIds,
      depth: s.depth,
    }))
  );
  const notebookScope =
    selectedNotebookId && notebookFilterState.notebookId === selectedNotebookId
      ? notebookFilterState
      : null;

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
        ? (notebookScope?.collectionIds ??
          (getResearchCollectionIds(selectedNotebookId).length > 0
            ? getResearchCollectionIds(selectedNotebookId)
            : [selectedNotebookId]))
        : undefined,
      notebookFilters: notebookScope?.keywordFilters,
      notebookMode: notebookScope?.depth,
      threadMode,
      searchMode,
      customSystemPrompt,
      customRoleName,
      customEnabledTools,
      // Without this the "+" sheet's Konnektoren section is decoration: the
      // adapter injects the connector's mention token and its forcedTool from
      // exactly this field, and mobile never sent it.
      pinnedConnector,
      // Likewise for recipes: the `/mention` is stripped from the text, so this
      // is what carries the recipe's prompt fragment and scoping to the server.
      activeSkillMention,
    }),
    [
      selectedAgentId,
      selectedModel,
      enabledTools,
      selectedNotebookId,
      notebookScope,
      threadMode,
      searchMode,
      customSystemPrompt,
      customRoleName,
      customEnabledTools,
      pinnedConnector,
      activeSkillMention,
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
