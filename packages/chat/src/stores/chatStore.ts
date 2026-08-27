import { type NotebookDepth, type RoleRef, type SearchMode } from '@gruenerator/contracts';
import { isApiErrorWithStatus } from '@gruenerator/shared/api';
import {
  TEXT_MODELS,
  TEXT_MODEL_BY_ID,
  type TextModelId,
  type TextModelOption,
  type TextProvider,
} from '@gruenerator/shared/models';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_NOTEBOOK_DEPTH } from '../lib/notebookDepth';
import { notifyError, notifyWarning } from '../lib/notify';
import { AUTO_MODEL_ID, type AutoModelId, type SelectedModel } from '../lib/resolveAutoModel';

import { useArtifactLiveStore } from './artifactLiveStore';
import { useComputeExportStore } from './computeExportStore';
import { useLastComputeStore } from './lastComputeStore';
import { usePythonFileStore } from './pythonFileStore';
import { useReelLiveStore } from './reelLiveStore';
import { useSharepicLiveStore } from './sharepicLiveStore';
import { draftRoleState } from './draftRole';
import { useUserProfileStore } from './userProfileStore';

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
// Search depth is a wire value: it goes straight into the /api/search-graph/stream
// body, where the contract validates it against `searchModeSchema`. Re-exported
// from the contract so web, mobile and the API share one definition instead of
// three copies that can drift.
export { type SearchMode };

/** A pinned MCP connector: while set, the composer auto-injects its durable
 *  `@[Label](mcp:id)` token into every sent message so the tool scope is held
 *  explicitly across follow-ups. Session-scoped — never persisted. */
export interface PinnedConnector {
  id: string;
  label: string;
}

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
  roleRef: RoleRef | null;
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
  /**
   * Notebook retrieval depth. A preference, not a filter: it says how much work
   * an answer is worth to you, which does not change per notebook, so unlike the
   * source/category filters it is persisted and survives a reload.
   */
  notebookDepth: NotebookDepth;
  customSystemPrompt: string | null;
  customRoleName: string | null;
  /**
   * Verweis auf die gewählte Rolle statt ihres Prompttextes. Der Auftrag zur
   * Rolle ist parteiintern und liegt server-seitig — der Client kennt ihn nicht
   * und schickt nur Ebene und Bezeichnung. `customSystemPrompt` bleibt für frei
   * eingetippte Rollen, deren Prompt weiterhin per KI entsteht.
   */
  customRoleRef: RoleRef | null;
  /**
   * Wer die Rolle zuletzt gesetzt hat. `load` heißt: sie kommt aus den
   * Thread-Einstellungen und steht dort bereits — ein Zurückschreiben wäre eine
   * überflüssige Anfrage und im Fehlerfall ein irreführender Hinweis.
   * `default` heißt: sie kommt aus der Konto-Voreinstellung und gehört diesem
   * Thread nicht (siehe `ActiveRoleSyncEffect`) — `loadThreadSettings` räumt
   * sie weg, sobald ein Thread ohne eigene Rolle geöffnet wird.
   */
  roleRefSource: 'user' | 'load' | 'default';
  customEnabledTools: Record<string, boolean> | null;
  /** Mention key of the active /skill (e.g. 'instagram'). Composer sets this
   *  when a skill mention is inserted; cleared on agent change / new thread.
   *  Sent to backend so it appends only the relevant skill's prompt fragment. */
  activeSkillMention: string | null;
  /** Pinned MCP connector (session-scoped, not persisted). Set from the
   *  composer's "Konnektoren" menu; cleared on new thread / new chat. */
  pinnedConnector: PinnedConnector | null;
  setActiveSkillMention: (mention: string | null) => void;
  setPinnedConnector: (connector: PinnedConnector | null) => void;
  setSelectedAgent: (agentId: string | null) => void;
  setSelectedProvider: (provider: Provider) => void;
  setSelectedModel: (model: SelectedModel) => void;
  setCurrentThread: (threadId: string | null) => void;
  /** The draft the user is typing in just became a real thread (lazy
   *  `initialize()` / `onThreadCreated` of its FIRST send). Same transition
   *  bookkeeping as `setCurrentThread`, but skill mention and pinned connector
   *  survive — this is a continuation of the same conversation, not a switch.
   *  Only the actual mint sites may call this; navigation writers (sidebar/URL
   *  sync) stay on `setCurrentThread`, whose unconditional clear is what keeps
   *  an abandoned draft's pin out of unrelated pre-existing threads. */
  mintThreadFromDraft: (threadId: string) => void;
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
  setNotebookDepth: (depth: NotebookDepth) => void;
  setCompactionState: (state: CompactionState) => void;
  loadCompactionState: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
  triggerCompaction: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
  incrementMessageCount: () => void;
  setCustomSystemPrompt: (prompt: string | null) => void;
  setCustomRoleName: (name: string | null) => void;
  setCustomRoleRef: (ref: RoleRef | null) => void;
  setCustomEnabledTools: (tools: Record<string, boolean> | null) => void;
  /** Clear per-thread chat context (skill mention, custom prompt/role/tools,
   *  thread mode) while keeping the selected agent. Used when switching agents
   *  so the new agent starts from a clean thread. */
  resetThreadContext: () => void;
  /** Reset for a NEW chat: `resetThreadContext()` plus deselecting the agent —
   *  and then applying the account's default role (`draftRoleState`), because a
   *  fresh draft starts with "my role", not blank. The single source of truth
   *  for "new chat" used by every new-chat surface (workplace composer, /chat
   *  overview, ChatPage). */
  resetChatContext: () => void;
  loadThreadSettings: (threadId: string, apiClient: ChatApiClient) => Promise<void>;
  saveThreadSettings: (threadId: string, apiClient: ChatApiClient) => Promise<boolean>;
  /** Der Entwurf wurde gerade zu diesem Thread — seine Rolle gehört ab jetzt
   *  dem Thread, nicht mehr der Konto-Voreinstellung. Muss an JEDER Mint-Stelle
   *  laufen (lazy `initialize()` im ThreadListAdapter ist der Produktionspfad,
   *  `onThreadCreated` der Legacy-Pfad für Backend-geminte Threads): ohne die
   *  Promotion fragt `ThreadDataSyncEffect` die Settings des frischen Threads
   *  ab, bekommt 404 und räumt eine noch als `default` markierte Rolle wieder
   *  weg — die Standardrolle verschwand beim ersten Senden. */
  promoteDraftRoleToThread: (threadId: string, apiClient: ChatApiClient) => void;
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
      notebookDepth: DEFAULT_NOTEBOOK_DEPTH,
      customSystemPrompt: null,
      customRoleName: null,
      customRoleRef: null,
      roleRefSource: 'load',
      customEnabledTools: null,
      activeSkillMention: null,
      pinnedConnector: null,

      setActiveSkillMention: (mention) => set({ activeSkillMention: mention }),

      setPinnedConnector: (connector) => set({ pinnedConnector: connector }),

      setSelectedAgent: (agentId) =>
        set({ selectedAgentId: agentId, activeSkillMention: null, pinnedConnector: null }),

      resetThreadContext: () =>
        set({
          activeSkillMention: null,
          pinnedConnector: null,
          customSystemPrompt: null,
          customRoleName: null,
          customRoleRef: null,
          roleRefSource: 'load',
          customEnabledTools: null,
          threadMode: 'chat',
        }),

      resetChatContext: () =>
        set({
          selectedAgentId: null,
          activeSkillMention: null,
          pinnedConnector: null,
          customEnabledTools: null,
          // Die Standardrolle synchron mit anwenden, statt zu nullen und auf
          // den ActiveRoleSyncEffect zu warten: läuft dieser Reset im selben
          // Effekt-Durchlauf NACH dem Effekt, sieht der nächste Render lauter
          // unveränderte Werte und der Effekt feuert nie wieder — die Rolle
          // wäre nach jedem Reload weg (Herleitung in `draftRoleState`).
          ...(draftRoleState() ?? {
            customSystemPrompt: null,
            customRoleName: null,
            customRoleRef: null,
            roleRefSource: 'load',
            threadMode: 'chat',
          }),
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

      setCurrentThread: (threadId) => switchThread(threadId, { keepMentions: false }),

      mintThreadFromDraft: (threadId) => switchThread(threadId, { keepMentions: true }),

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

      setNotebookDepth: (depth) => set({ notebookDepth: depth }),

      setCompactionState: (state) => set({ compactionState: state }),

      loadCompactionState: async (threadId: string, apiClient: ChatApiClient) => {
        // Clear any prior thread's summary up front: re-opening the
        // already-current thread skips setCurrentThread's reset, so without this
        // the CompactionIndicator would show a stale banner during the fetch.
        set({ compactionLoading: true, compactionState: { ...DEFAULT_COMPACTION_STATE } });
        try {
          const response = await apiClient.get<CompactionResponse>(
            `/api/chat-service/summarize?threadId=${threadId}`
          );
          // The user can switch threads while this is in flight; landing a
          // foreign thread's counters here also mis-drives the title trigger,
          // which reads messageCount. Same guard loadThreadSettings uses.
          if (useAgentStore.getState().currentThreadId !== threadId) return;
          set({
            compactionState: response.compactionState,
            messageCount: response.messageCount,
            needsCompaction: response.needsCompaction,
            compactionLoading: false,
          });
        } catch (error) {
          console.error('Failed to load compaction state:', error);
          if (useAgentStore.getState().currentThreadId !== threadId) return;
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

      setCustomRoleRef: (ref) => set({ customRoleRef: ref, roleRefSource: 'user' }),

      setCustomEnabledTools: (tools) => set({ customEnabledTools: tools }),

      loadThreadSettings: async (threadId: string, apiClient: ChatApiClient) => {
        try {
          const response = await apiClient.get<ThreadSettings>(
            `/api/chat-service/threads/${threadId}/settings`
          );
          if (useAgentStore.getState().currentThreadId !== threadId) return;
          const roleRef = response.roleRef ?? null;
          set({
            customSystemPrompt: response.customSystemPrompt ?? null,
            customEnabledTools: response.customEnabledTools ?? null,
            customRoleRef: roleRef,
            roleRefSource: 'load' as const,
            // Die Bezeichnung steht nicht im Thread, sondern in den Rollen der
            // Person — der Thread merkt sich nur die Referenz. Ist die Rolle
            // inzwischen gelöscht, bleibt die gespeicherte Bezeichnung als
            // Anzeige stehen; der Server fängt den fehlenden Treffer ab.
            ...(roleRef
              ? {
                  threadMode: 'eigener' as const,
                  customRoleName:
                    useUserProfileStore
                      .getState()
                      .roles.find((r) => r.ebene === roleRef.ebene && r.rolle === roleRef.rolle)
                      ?.rolle ?? roleRef.rolle,
                }
              : // Frei eingetippte Rolle: sie hat keine Referenz, nur ihren
                // erzeugten Prompttext. Ohne diesen Zweig kam der Text zwar
                // zurück, der Modus aber nicht — der Chip war weg und die
                // Anfrage ging als normaler Chat mitsamt `agentId` raus.
                response.customSystemPrompt
                ? { threadMode: 'eigener' as const }
                : {}),
          });
        } catch (error) {
          // 404 is the normal "thread has no settings row yet" case and falls
          // through to the mode reset below. Anything else means we do not KNOW
          // the settings — resetting on that assumption silently kicked the user
          // out of their custom agent because a request happened to fail.
          if (!isApiErrorWithStatus(error, 404)) {
            console.warn('[chatStore] Thread settings could not be loaded:', error);
            notifyWarning(
              'Chat-Einstellungen konnten nicht geladen werden',
              'Die zuletzt bekannten Einstellungen bleiben aktiv.'
            );
            return;
          }
        }
        const state = useAgentStore.getState();
        // Eine Katalogrolle hat keinen `customSystemPrompt` — ohne die
        // `customRoleRef`-Bedingung hätte dieser Reset jeden Rollen-Chat beim
        // Neuladen in den normalen Chat zurückgeworfen.
        //
        // `default` ist der zweite Fall: die Rolle stammt aus der
        // Konto-Voreinstellung, nicht aus diesem Thread. Sie muss auch dann
        // weichen, wenn sie gesetzt ist — sonst erbt ein alter Chat ohne
        // Einstellungszeile (404) eine Rolle, die er nie hatte.
        if (
          state.currentThreadId === threadId &&
          state.threadMode === 'eigener' &&
          (state.roleRefSource === 'default' || (!state.customSystemPrompt && !state.customRoleRef))
        ) {
          set({
            threadMode: 'chat',
            customRoleName: null,
            customRoleRef: null,
            customSystemPrompt: null,
            roleRefSource: 'load',
          });
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
              roleRef: state.customRoleRef,
            }
          );
          return true;
        } catch (error) {
          // The UI shows the new values either way, so a silent failure meant
          // the user believed their prompt was saved until it vanished on reload.
          console.error('Failed to save thread settings:', error);
          notifyError(
            'Einstellungen konnten nicht gespeichert werden',
            'Bitte versuche es noch einmal.'
          );
          return false;
        }
      },

      promoteDraftRoleToThread: (threadId: string, apiClient: ChatApiClient) => {
        const state = useAgentStore.getState();
        if (state.threadMode !== 'eigener' || (!state.customSystemPrompt && !state.customRoleRef)) {
          return;
        }
        // Sofort `load`, nicht erst wenn das PATCH zurückkommt: der
        // ThreadDataSyncEffect fragt die Einstellungen des frisch angelegten
        // Threads parallel ab, und eine 404 auf dem Weg dorthin hätte eine noch
        // als `default` markierte Rolle wieder weggeräumt.
        set({ roleRefSource: 'load' });
        void useAgentStore.getState().saveThreadSettings(threadId, apiClient);
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
      version: 17,
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
        if (version < 14) {
          // selectedModel / selectedProvider are no longer persisted — every
          // session starts on 'Automatisch' instead of a saved user default.
          delete state.selectedModel;
          delete state.selectedProvider;
        }
        if (version < 15) {
          // The notebook depth used to be component state that reset on every
          // mount, so there is nothing to carry over — only a floor to set.
          state.notebookDepth = DEFAULT_NOTEBOOK_DEPTH;
        }
        if (version < 16) {
          // v15 hat allen 'fast' eingeschrieben, ohne dass es je eine Wahl war.
          // Der Startwert ist jetzt 'deep' — 'deep'/'ultra' bleiben stehen.
          //
          // Bewusst in Kauf genommen: ein seit v15 aktiv gewähltes 'fast' ist im
          // Storage nicht vom damaligen Zwangswert zu unterscheiden und wird hier
          // mit angehoben. Ein Unterscheidungs-Flag würde erst ab heute
          // mitschreiben und den Altbestand ebenso wenig auflösen, während der
          // Verzicht auf die Migration jede bestehende Installation dauerhaft auf
          // der schmalsten Stufe ließe — dort ist die Tiefe seit diesem PR die
          // einzige Qualitätswahl. Der Verlust ist eine Auswahl im Composer.
          if (state.notebookDepth === 'fast') {
            state.notebookDepth = DEFAULT_NOTEBOOK_DEPTH;
          }
        }
        if (version < 17) {
          // currentThreadId is no longer persisted: the thread URL is the
          // restore mechanism. A leftover id was read by getConfig().threadId
          // during the boot window before the runtime settled, so a first
          // message could be filed into whatever thread was open last session.
          delete state.currentThreadId;
        }
        return state;
      },
      partialize: (state) => ({
        // selectedAgentId and threadMode are deliberately NOT persisted: they are
        // transient chat context. The URL (/agents/:slug) is the source of truth
        // for the active agent; persisting it leaked the last agent into new chats.
        // selectedModel/selectedProvider are session-only too: the picker always
        // starts on 'Automatisch'.
        // currentThreadId is NOT persisted either: the thread URL restores the
        // open conversation, and MainThreadSyncEffect nulled the stored value on
        // boot anyway — keeping it only left a stale id readable in the window
        // before the runtime settled.
        selectedNotebookId: state.selectedNotebookId,
        searchMode: state.searchMode,
        notebookDepth: state.notebookDepth,
        // Survive a reload that happens between text generation and the first
        // user message (no thread exists yet, so server-side persistence
        // hasn't kicked in). Cleared once the backend confirms thread_created.
        pendingInitialAssistantMessage: state.pendingInitialAssistantMessage,
      }),
    }
  )
);

/**
 * Shared transition bookkeeping behind `setCurrentThread` and
 * `mintThreadFromDraft`. `keepMentions` is the ONLY divergence: a mint (the
 * draft's first send just created this thread) is a continuation of the same
 * conversation, so skill mention and pinned connector survive it — a connector
 * pinned on the Startseite otherwise died the moment the first answer streamed,
 * and every follow-up lost its MCP scope. Every other transition — including
 * draft → pre-existing thread via sidebar/URL, which looks identical from the
 * store's point of view (null → id) — must clear, or an abandoned draft's pin
 * would leak into an unrelated thread. That is why the distinction lives at the
 * call sites, not in a null-check here.
 */
function switchThread(threadId: string | null, opts: { keepMentions: boolean }): void {
  if (useAgentStore.getState().currentThreadId === threadId) return;
  useAgentStore.setState({
    currentThreadId: threadId,
    currentThreadTitle: null,
    compactionState: { ...DEFAULT_COMPACTION_STATE },
    messageCount: 0,
    needsCompaction: false,
    ...(opts.keepMentions ? {} : { activeSkillMention: null, pinnedConnector: null }),
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
  // Same for a docked HTML/SVG artifact: activeArtifact is module-global,
  // so without this reset the old thread's artifact stays pinned in the new one.
  useArtifactLiveStore.getState().setActiveArtifact(null);
  // Tabular files attached for the in-browser interpreter are session-
  // scoped too — an old thread's Excel/CSV must not leak into the new one.
  usePythonFileStore.getState().clear();
  // Same for the last spreadsheet computation forwarded to the model.
  useLastComputeStore.getState().clear();
  // And for the interpreter's output files (download-chip byte stash).
  useComputeExportStore.getState().clear();
}
