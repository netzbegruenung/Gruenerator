import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatApiClient } from '../context/ChatContext';

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

export type Provider = 'mistral' | 'litellm';

export type ModelId = 'mistral' | 'litellm';

export type ToolKey = 'search' | 'web' | 'examples' | 'research';

export interface ModelOption {
  id: ModelId;
  name: string;
  description: string;
  model: string;
  provider: Provider;
  icon: 'sparkles' | 'server';
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'EU-gehostet',
    model: 'mistral',
    provider: 'mistral',
    icon: 'sparkles',
  },
  {
    id: 'litellm',
    name: 'GPT-OSS',
    description: 'Selbst gehostet',
    model: 'gpt-oss:120b',
    provider: 'litellm',
    icon: 'server',
  },
];

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

interface AgentState {
  selectedAgentId: string | null;
  selectedProvider: Provider;
  selectedModel: ModelId;
  currentThreadId: string | null;
  enabledTools: Record<ToolKey, boolean>;
  useDeepAgent: boolean;
  selectedNotebookId: string;
  compactionState: CompactionState;
  compactionLoading: boolean;
  messageCount: number;
  needsCompaction: boolean;
  pendingMessage: string | null;
  pendingNewThread: boolean;
  setSelectedAgent: (agentId: string | null) => void;
  setSelectedProvider: (provider: Provider) => void;
  setSelectedModel: (model: ModelId) => void;
  setCurrentThread: (threadId: string | null) => void;
  toggleTool: (tool: ToolKey) => void;
  setAllTools: (enabled: boolean) => void;
  toggleDeepAgent: () => void;
  setSelectedNotebook: (notebookId: string) => void;
  setPendingMessage: (message: string | null) => void;
  setPendingNewThread: (v: boolean) => void;
  setCompactionState: (state: CompactionState) => void;
  loadCompactionState: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
  triggerCompaction: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
  incrementMessageCount: () => void;
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
      selectedProvider: 'mistral',
      selectedModel: 'mistral',
      currentThreadId: null,
      enabledTools: { ...DEFAULT_ENABLED_TOOLS },
      useDeepAgent: false,
      selectedNotebookId: 'gruenerator-notebook',
      compactionState: { ...DEFAULT_COMPACTION_STATE },
      compactionLoading: false,
      messageCount: 0,
      needsCompaction: false,
      pendingMessage: null,
      pendingNewThread: false,

      setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),

      setSelectedProvider: (provider) => set({ selectedProvider: provider }),

      setSelectedModel: (model) => {
        const modelOption = MODEL_OPTIONS.find((m) => m.id === model);
        if (modelOption) {
          set({ selectedModel: model, selectedProvider: modelOption.provider });
        }
      },

      setCurrentThread: (threadId) =>
        set({
          currentThreadId: threadId,
          compactionState: { ...DEFAULT_COMPACTION_STATE },
          messageCount: 0,
          needsCompaction: false,
        }),

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

      toggleDeepAgent: () => set((state) => ({ useDeepAgent: !state.useDeepAgent })),

      setSelectedNotebook: (notebookId) => set({ selectedNotebookId: notebookId }),

      setPendingMessage: (message) => set({ pendingMessage: message }),

      setPendingNewThread: (v) => set({ pendingNewThread: v }),

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
    }),
    {
      name: 'gruenerator-chat-store',
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version === 0) {
          const old = persisted.selectedModel;
          if (
            old === 'auto' ||
            old === 'mistral-large' ||
            old === 'mistral-medium' ||
            old === 'magistral-medium'
          ) {
            persisted.selectedModel = 'mistral';
          }
        }
        if (version < 2) {
          persisted.selectedNotebookId = persisted.selectedNotebookId || 'gruenerator-notebook';
        }
        return persisted;
      },
      partialize: (state) => ({
        selectedAgentId: state.selectedAgentId,
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        currentThreadId: state.currentThreadId,
        enabledTools: state.enabledTools,
        useDeepAgent: state.useDeepAgent,
        selectedNotebookId: state.selectedNotebookId,
      }),
    }
  )
);
