import { useLocalRuntime, type LocalRuntimeOptions } from '@assistant-ui/react-native';
import {
  createGrueneratorModelAdapter,
  useAgentStore,
  useChatConfigStore,
  createChatApiClient,
  type GrueneratorAdapterConfig,
  type StreamMetadata,
} from '@gruenerator/chat';
import { useCallback, useMemo } from 'react';

import { getResearchCollectionIds } from '../config/notebooksConfig';
import { useNotebookFilterStore } from '../stores/notebookFilterStore';
import { usePreferencesStore } from '../stores/preferencesStore';

interface MobileChatRuntimeOptions {
  adapters?: LocalRuntimeOptions['adapters'];
}

/**
 * Builds the request config at send time instead of subscribing to it.
 *
 * Two runtimes use this hook — the root drawer runtime (mounted around every
 * screen) and the per-conversation one. Subscribing to the agent, notebook and
 * preference stores re-rendered both on every write to any of those fields:
 * opening a chat writes agent/notebook/mode, every finished turn writes the
 * message count, every thread switch reloads the compaction state. Each of those
 * rebuilt the model adapter and re-pushed options into both runtimes — in the
 * middle of the push animation. The adapter calls `getConfig()` once at the
 * start of each run, so reading the stores there sends exactly what a
 * subscription would have, with nothing to re-render in between.
 */
function readAdapterConfig(): GrueneratorAdapterConfig {
  const agent = useAgentStore.getState();
  const notebookFilter = useNotebookFilterStore.getState();
  const { notebookDepth, notebookAnswerMode } = usePreferencesStore.getState();
  const { selectedNotebookId } = agent;
  // Notebook filter selection (facets, sources) — only honoured while it belongs
  // to the notebook being asked, so it can't leak between notebooks. The depth is
  // not scoped that way: it is a standing preference, not a filter.
  const notebookScope =
    selectedNotebookId && notebookFilter.notebookId === selectedNotebookId ? notebookFilter : null;

  return {
    agentId: agent.selectedAgentId,
    modelId: agent.selectedModel,
    enabledTools: agent.enabledTools,
    threadId: agent.currentThreadId,
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
    notebookMode: notebookDepth,
    notebookAnswerMode,
    threadMode: agent.threadMode,
    searchMode: agent.searchMode,
    customSystemPrompt: agent.customSystemPrompt,
    customRoleName: agent.customRoleName,
    customRoleRef: agent.customRoleRef,
    customEnabledTools: agent.customEnabledTools,
    // Without this the "+" sheet's Konnektoren section is decoration: the
    // adapter injects the connector's mention token and its forcedTool from
    // exactly this field, and mobile never sent it.
    pinnedConnector: agent.pinnedConnector,
    // Likewise for recipes: the `/mention` is stripped from the text, so this
    // is what carries the recipe's prompt fragment and scoping to the server.
    activeSkillMention: agent.activeSkillMention,
    // A user recipe is resolved by row id, not by name: two people may own a
    // recipe called the same thing, and the mention alone cannot tell them
    // apart. Null for system recipes, which have no row.
    activeRecipeId: agent.activeRecipeId,
  };
}

export function useMobileChatRuntime(opts?: MobileChatRuntimeOptions) {
  const onThreadCreated = useCallback((newThreadId: string) => {
    useAgentStore.getState().mintThreadFromDraft(newThreadId);
  }, []);

  const fetchFn = useChatConfigStore((s) => s.fetch);
  const onUnauthorized = useChatConfigStore((s) => s.onUnauthorized);
  const runtimeApiClient = useMemo(
    () => createChatApiClient(fetchFn, onUnauthorized),
    [fetchFn, onUnauthorized]
  );

  const onComplete = useCallback(
    (_metadata: StreamMetadata) => {
      const store = useAgentStore.getState();
      const tid = store.currentThreadId;
      if (tid) {
        // Before the increments, as the old render-time ref saw it: compaction
        // fires on the turn after the one that crossed the threshold.
        const { needsCompaction, compactionState } = store;
        store.incrementMessageCount();
        store.incrementMessageCount();

        if (needsCompaction && !compactionState.summary) {
          void store.triggerCompaction(tid, runtimeApiClient);
        }
      }
    },
    [runtimeApiClient]
  );

  const callbacks = useMemo(() => ({ onThreadCreated, onComplete }), [onThreadCreated, onComplete]);
  const modelAdapter = useMemo(
    () => createGrueneratorModelAdapter(readAdapterConfig, callbacks),
    [callbacks]
  );

  const runtimeOptions: LocalRuntimeOptions = useMemo(
    () => ({
      unstable_humanToolNames: ['ask_human'],
      adapters: opts?.adapters,
    }),
    [opts?.adapters]
  );

  return useLocalRuntime(modelAdapter, runtimeOptions);
}
