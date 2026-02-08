import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatApiClient } from '../context/ChatContext';

interface Thread {
  id: string;
  title: string | null;
  agentId: string;
  createdAt: Date;
  updatedAt: Date;
}

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

export type ModelId = 'mistral-large' | 'mistral-medium' | 'pixtral-large' | 'litellm';

export type ToolKey = 'search' | 'web' | 'examples' | 'research';

export interface ModelOption {
  id: ModelId;
  name: string;
  description: string;
  model: string;
  provider: Provider;
  icon: 'sparkles' | 'zap' | 'eye' | 'server';
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'mistral-large',
    name: 'Mistral Large',
    description: 'Leistungsstark für komplexe Aufgaben',
    model: 'mistral-large-latest',
    provider: 'mistral',
    icon: 'sparkles',
  },
  {
    id: 'mistral-medium',
    name: 'Mistral Medium',
    description: 'Schnell & ausgewogen',
    model: 'mistral-medium-latest',
    provider: 'mistral',
    icon: 'zap',
  },
  {
    id: 'pixtral-large',
    name: 'Pixtral Large',
    description: 'Vision & Reasoning',
    model: 'pixtral-large-latest',
    provider: 'mistral',
    icon: 'eye',
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
    model: 'mistral-large-latest',
  },
  {
    id: 'litellm',
    name: 'GPT-OSS',
    description: 'Selbst gehostet',
    model: 'gpt-oss:120b',
  },
];

interface AgentState {
  selectedAgentId: string;
  selectedProvider: Provider;
  selectedModel: ModelId;
  currentThreadId: string | null;
  threads: Thread[];
  enabledTools: Record<ToolKey, boolean>;
  compactionState: CompactionState;
  compactionLoading: boolean;
  messageCount: number;
  needsCompaction: boolean;
  setSelectedAgent: (agentId: string) => void;
  setSelectedProvider: (provider: Provider) => void;
  setSelectedModel: (model: ModelId) => void;
  setCurrentThread: (threadId: string | null) => void;
  addThread: (thread: Thread) => void;
  updateThread: (threadId: string, updates: Partial<Thread>) => void;
  deleteThread: (threadId: string) => void;
  clearThreads: () => void;
  toggleTool: (tool: ToolKey) => void;
  setAllTools: (enabled: boolean) => void;
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
      selectedAgentId: 'gruenerator-universal',
      selectedProvider: 'mistral',
      selectedModel: 'mistral-large',
      currentThreadId: null,
      threads: [],
      enabledTools: { ...DEFAULT_ENABLED_TOOLS },
      compactionState: { ...DEFAULT_COMPACTION_STATE },
      compactionLoading: false,
      messageCount: 0,
      needsCompaction: false,

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

      addThread: (thread) =>
        set((state) => ({
          threads: [thread, ...state.threads],
          currentThreadId: thread.id,
          compactionState: { ...DEFAULT_COMPACTION_STATE },
          messageCount: 0,
          needsCompaction: false,
        })),

      updateThread: (threadId, updates) =>
        set((state) => ({
          threads: state.threads.map((t) =>
            t.id === threadId ? { ...t, ...updates, updatedAt: new Date() } : t
          ),
        })),

      deleteThread: (threadId) =>
        set((state) => ({
          threads: state.threads.filter((t) => t.id !== threadId),
          currentThreadId: state.currentThreadId === threadId ? null : state.currentThreadId,
          compactionState:
            state.currentThreadId === threadId
              ? { ...DEFAULT_COMPACTION_STATE }
              : state.compactionState,
        })),

      clearThreads: () =>
        set({
          threads: [],
          currentThreadId: null,
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
      partialize: (state) => ({
        selectedAgentId: state.selectedAgentId,
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        currentThreadId: state.currentThreadId,
        threads: state.threads,
        enabledTools: state.enabledTools,
      }),
    }
  )
);
