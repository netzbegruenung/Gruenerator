'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { SelectedModel } from '../lib/resolveAutoModel';
import type { SearchMode, ThreadMode } from '../stores/chatStore';

export interface ChatSurfaceState {
  selectedAgentId: string | null;
  threadMode: ThreadMode;
  searchMode: SearchMode;
  selectedModel: SelectedModel | null;
  selectedNotebookId: string;
  customSystemPrompt: string | null;
  customRoleName: string | null;

  setSelectedAgent: (agentId: string | null) => void;
  setThreadMode: (mode: ThreadMode) => void;
  setSearchMode: (mode: SearchMode) => void;
  setSelectedModel: (model: SelectedModel) => void;
  setSelectedNotebook: (id: string) => void;
  setCustomSystemPrompt: (prompt: string | null) => void;
  setCustomRoleName: (name: string | null) => void;
}

export type ChatSurfaceStore = StoreApi<ChatSurfaceState>;

interface ChatSurfaceContextValue {
  scope: 'surface';
  store: ChatSurfaceStore;
  customEnabledToolsOverlay: Record<string, boolean>;
}

const ChatSurfaceContext = createContext<ChatSurfaceContextValue | null>(null);

export type ChatSurfaceDefaults = Partial<
  Pick<
    ChatSurfaceState,
    | 'selectedAgentId'
    | 'threadMode'
    | 'searchMode'
    | 'selectedModel'
    | 'selectedNotebookId'
    | 'customSystemPrompt'
    | 'customRoleName'
  >
>;

interface ChatSurfaceProviderProps {
  /**
   * Optional pre-created store. When provided, defaults are ignored — the
   * caller owns the store and can read it imperatively (e.g. inside an
   * adapter's getConfig callback) while components in the tree see the same
   * instance.
   */
  store?: ChatSurfaceStore;
  defaults?: ChatSurfaceDefaults;
  customEnabledToolsOverlay?: Record<string, boolean>;
  children: ReactNode;
}

export function createChatSurfaceStore(defaults?: ChatSurfaceDefaults): ChatSurfaceStore {
  return createStore<ChatSurfaceState>((set) => ({
    selectedAgentId: defaults?.selectedAgentId ?? null,
    threadMode: defaults?.threadMode ?? 'chat',
    searchMode: defaults?.searchMode ?? 'web',
    selectedModel: defaults?.selectedModel ?? null,
    selectedNotebookId: defaults?.selectedNotebookId ?? 'gruenerator-notebook',
    customSystemPrompt: defaults?.customSystemPrompt ?? null,
    customRoleName: defaults?.customRoleName ?? null,

    setSelectedAgent: (agentId) => set({ selectedAgentId: agentId }),
    setThreadMode: (mode) => set({ threadMode: mode }),
    setSearchMode: (mode) => set({ searchMode: mode }),
    setSelectedModel: (model) => set({ selectedModel: model }),
    setSelectedNotebook: (id) => set({ selectedNotebookId: id }),
    setCustomSystemPrompt: (prompt) => set({ customSystemPrompt: prompt }),
    setCustomRoleName: (name) => set({ customRoleName: name }),
  }));
}

export function ChatSurfaceProvider({
  store: externalStore,
  defaults,
  customEnabledToolsOverlay,
  children,
}: ChatSurfaceProviderProps) {
  // Defaults captured on first render only; subsequent changes are ignored
  // so the surface state isn't reset by re-renders.
  const internalStore = useMemo<ChatSurfaceStore>(
    () => createChatSurfaceStore(defaults),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const store = externalStore ?? internalStore;

  const value = useMemo<ChatSurfaceContextValue>(
    () => ({
      scope: 'surface',
      store,
      customEnabledToolsOverlay: customEnabledToolsOverlay ?? {},
    }),
    [store, customEnabledToolsOverlay]
  );

  return <ChatSurfaceContext.Provider value={value}>{children}</ChatSurfaceContext.Provider>;
}

export function useChatSurfaceContext(): ChatSurfaceContextValue | null {
  return useContext(ChatSurfaceContext);
}

export function useChatSurfaceStore<T>(selector: (state: ChatSurfaceState) => T): T | null {
  const ctx = useContext(ChatSurfaceContext);
  // Hooks must run unconditionally; pass a no-op store when no surface is active.
  // Consumers should check the return value or use the scoped helpers in useScopedAgentState.
  return useStore(ctx?.store ?? FALLBACK_STORE, ctx ? selector : noopSelector);
}

const noopSelector = () => null as never;
const FALLBACK_STORE: ChatSurfaceStore = createStore<ChatSurfaceState>(() => ({
  selectedAgentId: null,
  threadMode: 'chat',
  searchMode: 'web',
  selectedModel: null,
  selectedNotebookId: 'gruenerator-notebook',
  customSystemPrompt: null,
  customRoleName: null,
  setSelectedAgent: () => {},
  setThreadMode: () => {},
  setSearchMode: () => {},
  setSelectedModel: () => {},
  setSelectedNotebook: () => {},
  setCustomSystemPrompt: () => {},
  setCustomRoleName: () => {},
}));
