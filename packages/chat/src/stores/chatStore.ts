import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  MODEL_OPTIONS,
  MODEL_BY_ID,
  type ModelId,
  type ModelOption,
  type Provider,
} from '@gruenerator/shared/models';
import type { ChatApiClient } from '../context/ChatContext';

export { MODEL_OPTIONS };
export type { ModelId, ModelOption, Provider };

export interface CompactionState {
  summary: string | null;
  compactedUpToMessageId: string | null;
  compactionUpdatedAt: Date | null;
}

interface CompactionResponse {
  threadId: string;
  messageCount: number;
  compactionState: CompactionState;
  config: {
    threshold: number;
    keepRecent: number;
  };
  needsCompaction: boolean;
}

interface TriggerCompactionResponse {
  success: boolean;
  skipped: boolean;
  reason?: string;
  messageCount?: number;
  summarizedCount?: number;
  compactionState: CompactionState;
}

export type ToolKey = 'search' | 'web' | 'examples' | 'research';

export type ThreadMode = 'chat' | 'notebook' | 'search' | 'eigener';
export type SearchMode = 'web' | 'deep';

export interface ProviderOption {
  id: Provider;
  name: string;
  description: string;
  model: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: 'mistral',
    name: 'Mistral AI',
    description: 'Schnell & zuverlässig',
    model: 'mistral',
  },
  {
    id: 'litellm',
    name: 'GPT-OSS',
    description: 'Selbst gehostet',
    model: 'gpt-oss:120b',
  },
];

interface ThreadSettings {
  customSystemPrompt: string | null;
  customEnabledTools: Record<string, boolean> | null;
}

interface AgentState {
  selectedAgentId: string | null;
  selectedProvider: Provider;
  selectedModel: ModelId;
  currentThreadId: string | null;
  currentThreadTitle: string | null;
  enabledTools: Record<ToolKey, boolean>;
  selectedNotebookId: string;
  compactionState: CompactionState;
  compactionLoading: boolean;
  messageCount: number;
  needsCompaction: boolean;
  pendingMessage: string | null;
  pendingDraft: string | null;
  pendingInitialAssistantMessage: string | null;
  chatViewMode: 'overview' | 'thread';
  threadMode: ThreadMode;
  searchMode: SearchMode;
  customSystemPrompt: string | null;
  customRoleName: string | null;
  customEnabledTools: Record<string, boolean> | null;
  setSelectedAgent: (agentId: string | null) => void;
  setSelectedProvider: (provider: Provider) => void;
  setSelectedModel: (model: ModelId) => void;
  setCurrentThread: (threadId: string | null) => void;
  setCurrentThreadTitle: (title: string | null) => void;
  toggleTool: (tool: ToolKey) => void;
  setAllTools: (enabled: boolean) => void;
  setSelectedNotebook: (notebookId: string) => void;
  setPendingMessage: (message: string | null) => void;
  setPendingDraft: (draft: string | null) => void;
  setPendingInitialAssistantMessage: (message: string | null) => void;
  setChatViewMode: (mode: 'overview' | 'thread') => void;
  setThreadMode: (mode: ThreadMode) => void;
  setSearchMode: (mode: SearchMode) => void;
  setCompactionState: (state: CompactionState) => void;
  loadCompactionState: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
  triggerCompaction: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
  incrementMessageCount: () => void;
  setCustomSystemPrompt: (prompt: string | null) => void;
  setCustomRoleName: (name: string | null) => void;
  setCustomEnabledTools: (tools: Record<string, boolean> | null) => void;
  loadThreadSettings: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
  saveThreadSettings: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
}

const DEFAULT_ENABLED_TOOLS: Record<ToolKey, boolean> = {
  search: true,
  web: true,
  examples: true,
  research: true,
};

const DEFAULT_COMPACTION_STATE: CompactionState = {
  summary: null,
  compactedUpToMessageId: null,
  compactionUpdatedAt: null,
};

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
      selectedAgentId: null,
      selectedProvider: 'litellm',
      selectedModel: 'gemma-litellm',
      currentThreadId: null,
      currentThreadTitle: null,
      enabledTools: { ...DEFAULT_ENABLED_TOOLS },
      selectedNotebookId: 'gruenerator-notebook',
      compactionState: { ...DEFAULT_COMPACTION_STATE },
      compactionLoading: false,
      messageCount: 0,
      needsCompaction: false,
      pendingMessage: null,
      pendingDraft: null,
      pendingInitialAssistantMessage: null,
      chatViewMode: 'overview' as const,
      threadMode: 'chat' as ThreadMode,
      searchMode: 'web' as SearchMode,
      customSystemPrompt: null,
      customRoleName: null,
      customEnabledTools: null,

      setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),

      setSelectedProvider: (provider) => set({ selectedProvider: provider }),

      setSelectedModel: (model) => {
        const modelOption = MODEL_OPTIONS.find((m) => m.id === model);
        if (modelOption) {
          set({ selectedModel: model, selectedProvider: modelOption.provider });
        }
      },

      setCurrentThread: (threadId) => {
        if (useAgentStore.getState().currentThreadId === threadId) return;
        set({
          currentThreadId: threadId,
          currentThreadTitle: null,
          compactionState: { ...DEFAULT_COMPACTION_STATE },
          messageCount: 0,
          needsCompaction: false,
        });
      },

      setCurrentThreadTitle: (title) => set({ currentThreadTitle: title }),

      toggleTool: (tool) =>
        set((state) => ({
          enabledTools: {
            ...state.enabledTools,
            [tool]: !state.enabledTools[tool],
          },
        })),

      setAllTools: (enabled) =>
        set({
          enabledTools: {
            search: enabled,
            web: enabled,
            examples: enabled,
            research: enabled,
          },
        }),

      setSelectedNotebook: (notebookId) => set({ selectedNotebookId: notebookId }),

      setPendingMessage: (message) => set({ pendingMessage: message }),

      setPendingDraft: (draft) => set({ pendingDraft: draft }),

      setPendingInitialAssistantMessage: (message) =>
        set({ pendingInitialAssistantMessage: message }),

      setChatViewMode: (mode) => set({ chatViewMode: mode }),

      setThreadMode: (mode) => set({ threadMode: mode }),

      setSearchMode: (mode) => set({ searchMode: mode }),

      setCompactionState: (state) => set({ compactionState: state }),

      loadCompactionState: async (threadId: string, apiClient: ChatApiClient) => {
        set({ compactionLoading: true });
        try {
          const response = await apiClient.get<CompactionResponse>(
            `/api/chat-service/summarize?threadId=${threadId}`
          );
          set({
            compactionState: response.compactionState,
            messageCount: response.messageCount,
            needsCompaction: response.needsCompaction,
            compactionLoading: false,
          });
        } catch (error) {
          console.error('Failed to load compaction state:', error);
          set({
            compactionLoading: false,
            compactionState: { ...DEFAULT_COMPACTION_STATE },
          });
        }
      },

      triggerCompaction: async (threadId: string, apiClient: ChatApiClient) => {
        set({ compactionLoading: true });
        try {
          const response = await apiClient.post<TriggerCompactionResponse>(
            '/api/chat-service/summarize',
            { threadId }
          );
          if (response.success && !response.skipped) {
            set({
              compactionState: response.compactionState,
              needsCompaction: false,
            });
          }
          set({ compactionLoading: false });
        } catch (error) {
          console.error('Failed to trigger compaction:', error);
          set({ compactionLoading: false });
        }
      },

      incrementMessageCount: () =>
        set((state) => ({
          messageCount: state.messageCount + 1,
          needsCompaction: state.messageCount + 1 >= 50 && !state.compactionState.summary,
        })),

      setCustomSystemPrompt: (prompt) => set({ customSystemPrompt: prompt }),

      setCustomRoleName: (name) => set({ customRoleName: name }),

      setCustomEnabledTools: (tools) => set({ customEnabledTools: tools }),

      loadThreadSettings: async (threadId: string, apiClient: ChatApiClient) => {
        try {
          const response = await apiClient.get<ThreadSettings>(
            `/api/chat-service/threads/${threadId}/settings`
          );
          if (useAgentStore.getState().currentThreadId !== threadId) return;
          set({
            customSystemPrompt: response.customSystemPrompt ?? null,
            customEnabledTools: response.customEnabledTools ?? null,
          });
        } catch {
          // Thread may not exist yet
        }
        const state = useAgentStore.getState();
        if (
          state.currentThreadId === threadId &&
          state.threadMode === 'eigener' &&
          !state.customSystemPrompt
        ) {
          set({ threadMode: 'chat', customRoleName: null });
        }
      },

      saveThreadSettings: async (threadId: string, apiClient: ChatApiClient) => {
        const state = useAgentStore.getState();
        try {
          await apiClient.patch<{ success: boolean }>(
            `/api/chat-service/threads/${threadId}/settings`,
            {
              customSystemPrompt: state.customSystemPrompt,
              customEnabledTools: state.customEnabledTools,
            }
          );
        } catch (error) {
          console.error('Failed to save thread settings:', error);
        }
      },
    }),
    {
      name: 'gruenerator-chat-store',
      storage: createJSONStorage(() => {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage;
        }
        // No-op storage for environments without localStorage (React Native)
        // Mobile apps should configure their own persistence
        const mem = new Map<string, string>();
        return {
          getItem: (key: string) => mem.get(key) ?? null,
          setItem: (key: string, value: string) => mem.set(key, value),
          removeItem: (key: string) => mem.delete(key),
        };
      }),
      version: 9,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version === 0) {
          const old = state.selectedModel;
          if (
            old === 'auto' ||
            old === 'mistral-large' ||
            old === 'mistral-medium' ||
            old === 'magistral-medium'
          ) {
            state.selectedModel = 'mistral';
          }
        }
        if (version < 2) {
          state.selectedNotebookId = state.selectedNotebookId || 'gruenerator-notebook';
        }
        if (version < 3) {
          state.threadMode = state.threadMode || 'chat';
          state.searchMode = state.searchMode || 'web';
        }
        if (version < 5) {
          const validIds = new Set(['gpt-oss-regolo', 'litellm', 'gemma-regolo', 'qwen-regolo']);
          if (!validIds.has(state.selectedModel as string)) {
            state.selectedModel = 'gemma-litellm';
          }
        }
        if (version < 6) {
          if (state.selectedModel === 'gemma-regolo') {
            state.selectedModel = 'gemma-litellm';
          }
          const validIds = new Set([
            'gpt-oss-regolo',
            'litellm',
            'gemma-litellm',
            'qwen-regolo',
            'qwen3.6-regolo',
          ]);
          if (!validIds.has(state.selectedModel as string)) {
            state.selectedModel = 'gemma-litellm';
          }
        }
        if (version < 7) {
          // Mistral Medium 3.5 added as selectable option. Existing valid IDs stay.
          const validIds = new Set([
            'mistral-medium-3.5',
            'gpt-oss-regolo',
            'litellm',
            'gemma-litellm',
            'qwen-regolo',
            'qwen3.6-regolo',
          ]);
          if (!validIds.has(state.selectedModel as string)) {
            state.selectedModel = 'gemma-litellm';
            state.selectedProvider = 'litellm';
          }
        }
        if (version < 8) {
          const current = state.selectedModel as string | undefined;
          const def = current ? MODEL_BY_ID[current as ModelId] : undefined;
          if (def?.offByDefault) {
            state.selectedModel = 'gemma-litellm';
            state.selectedProvider = 'litellm';
          }
        }
        if (version < 9) {
          if ((state.selectedModel as string) === 'gpt-oss-regolo') {
            state.selectedModel = 'litellm';
            state.selectedProvider = 'litellm';
          }
        }
        return state;
      },
      partialize: (state) => ({
        selectedAgentId: state.selectedAgentId,
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        currentThreadId: state.currentThreadId,
        enabledTools: state.enabledTools,
        selectedNotebookId: state.selectedNotebookId,
        threadMode: state.threadMode,
        searchMode: state.searchMode,
        // Survive a reload that happens between text generation and the first
        // user message (no thread exists yet, so server-side persistence
        // hasn't kicked in). Cleared once the backend confirms thread_created.
        pendingInitialAssistantMessage: state.pendingInitialAssistantMessage,
      }),
    }
  )
);
