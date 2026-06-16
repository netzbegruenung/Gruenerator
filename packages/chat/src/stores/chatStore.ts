import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  TEXT_MODELS,
  TEXT_MODEL_BY_ID,
  type TextModelId,
  type TextModelOption,
  type TextProvider,
} from '@gruenerator/shared/models';
import { AUTO_MODEL_ID, type AutoModelId, type SelectedModel } from '../lib/resolveAutoModel';
import { useReelLiveStore } from './reelLiveStore';
import { useSharepicLiveStore } from './sharepicLiveStore';
import type { ChatApiClient } from '../context/ChatContext';

export const MODEL_OPTIONS = TEXT_MODELS;
export { AUTO_MODEL_ID };
export type ModelId = TextModelId;
export type ModelOption = TextModelOption;
export type Provider = TextProvider;
export type { AutoModelId, SelectedModel };

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

export type ToolKey = 'search' | 'web' | 'examples' | 'pressemitteilung_examples' | 'research';

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
    model: 'verdigado-pro',
  },
];

interface ThreadSettings {
  customSystemPrompt: string | null;
  customEnabledTools: Record<string, boolean> | null;
}

interface AgentState {
  selectedAgentId: string | null;
  selectedProvider: Provider;
  selectedModel: SelectedModel;
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
  /** Mention key of the active /skill (e.g. 'instagram'). Composer sets this
   *  when a skill mention is inserted; cleared on agent change / new thread.
   *  Sent to backend so it appends only the relevant skill's prompt fragment. */
  activeSkillMention: string | null;
  setActiveSkillMention: (mention: string | null) => void;
  setSelectedAgent: (agentId: string | null) => void;
  setSelectedProvider: (provider: Provider) => void;
  setSelectedModel: (model: SelectedModel) => void;
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
  /** Clear per-thread chat context (skill mention, custom prompt/role/tools,
   *  thread mode) while keeping the selected agent. Used when switching agents
   *  so the new agent starts from a clean thread. */
  resetThreadContext: () => void;
  /** Full blank-slate reset for a NEW chat: `resetThreadContext()` plus
   *  deselecting the agent. The single source of truth for "new chat" used by
   *  every new-chat surface (workplace composer, /chat overview, ChatPage). */
  resetChatContext: () => void;
  loadThreadSettings: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
  saveThreadSettings: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
}

const DEFAULT_ENABLED_TOOLS: Record<ToolKey, boolean> = {
  search: true,
  web: true,
  examples: true,
  pressemitteilung_examples: true,
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
      selectedModel: AUTO_MODEL_ID,
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
      activeSkillMention: null,

      setActiveSkillMention: (mention) => set({ activeSkillMention: mention }),

      setSelectedAgent: (agentId) => set({ selectedAgentId: agentId, activeSkillMention: null }),

      resetThreadContext: () =>
        set({
          activeSkillMention: null,
          customSystemPrompt: null,
          customRoleName: null,
          customEnabledTools: null,
          threadMode: 'chat',
        }),

      resetChatContext: () =>
        set({
          selectedAgentId: null,
          activeSkillMention: null,
          customSystemPrompt: null,
          customRoleName: null,
          customEnabledTools: null,
          threadMode: 'chat',
        }),

      setSelectedProvider: (provider) => set({ selectedProvider: provider }),

      setSelectedModel: (model) => {
        if (model === AUTO_MODEL_ID) {
          set({ selectedModel: model });
          return;
        }
        const modelOption =
          model in TEXT_MODEL_BY_ID ? TEXT_MODEL_BY_ID[model as TextModelId] : undefined;
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
          activeSkillMention: null,
        });
        // The Sharepic-Modus (docked artifact panel) is thread-scoped: a
        // variant from the old thread must not stay pinned — nor be sent as
        // the currentSharepic edit target — in the new one.
        useSharepicLiveStore.getState().setActiveVariant(null);
        // Same for Reel-Modus: a stale activeReel would inject the old
        // thread's transcript into the new one, hijack bare edit verbs into
        // subtitle edits of the old reel, and bind the wrong reel to the new
        // thread on the first successful edit.
        useReelLiveStore.getState().setActiveReel(null);
      },

      setCurrentThreadTitle: (title) => set({ currentThreadTitle: title }),

      toggleTool: (tool) =>
        set((state) => {
          const next = !state.enabledTools[tool];
          return {
            enabledTools: {
              ...state.enabledTools,
              [tool]: next,
              // The merged "Recherche" tool gates both backend search paths;
              // keep the internal `web` gate key in lockstep so disabling the
              // single toggle stops the auto web search too.
              ...(tool === 'research' ? { web: next } : {}),
            },
          };
        }),

      setAllTools: (enabled) =>
        set({
          enabledTools: {
            search: enabled,
            web: enabled,
            examples: enabled,
            pressemitteilung_examples: enabled,
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
      version: 13,
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
          const def = current ? TEXT_MODEL_BY_ID[current as TextModelId] : undefined;
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
        if (version < 10) {
          const tools = (state.enabledTools as Record<string, boolean> | undefined) ?? {};
          if (tools.pressemitteilung_examples === undefined) {
            state.enabledTools = { ...tools, pressemitteilung_examples: true };
          }
        }
        if (version < 11) {
          state.enabledTools = { ...DEFAULT_ENABLED_TOOLS };
        }
        if (version < 12) {
          // 'Automatisch' is the new default selection (notebooks resolve to
          // Mistral Medium 3.5, general chat keeps Gemma). Move users still on
          // the old implicit default (gemma-litellm); explicit choices stay.
          if (state.selectedModel === 'gemma-litellm') {
            state.selectedModel = AUTO_MODEL_ID;
          }
        }
        if (version < 13) {
          // selectedAgentId / threadMode are no longer persisted. Drop any stale
          // values so existing localStorage doesn't restore the last agent into
          // a fresh chat (the initializer defaults fill in: null / 'chat').
          delete state.selectedAgentId;
          delete state.threadMode;
        }
        return state;
      },
      partialize: (state) => ({
        // selectedAgentId and threadMode are deliberately NOT persisted: they are
        // transient chat context. The URL (/agents/:slug) is the source of truth
        // for the active agent; persisting it leaked the last agent into new chats.
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        currentThreadId: state.currentThreadId,
        selectedNotebookId: state.selectedNotebookId,
        searchMode: state.searchMode,
        // Survive a reload that happens between text generation and the first
        // user message (no thread exists yet, so server-side persistence
        // hasn't kicked in). Cleared once the backend confirms thread_created.
        pendingInitialAssistantMessage: state.pendingInitialAssistantMessage,
      }),
    }
  )
);
