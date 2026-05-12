'use client';

import { createStore, useStore } from 'zustand';
import type { ModelId } from '@gruenerator/shared/models';
import { useChatSurfaceContext, type ChatSurfaceState } from '../context/ChatSurfaceContext';
import { useAgentStore, type SearchMode, type ThreadMode } from '../stores/chatStore';

const FALLBACK = createStore<ChatSurfaceState>(() => ({
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

function useScopedField<T>(surfaceSelector: (s: ChatSurfaceState) => T, globalValue: T): T {
  const ctx = useChatSurfaceContext();
  const surfaceValue = useStore(ctx?.store ?? FALLBACK, ctx ? surfaceSelector : () => globalValue);
  return ctx ? surfaceValue : globalValue;
}

// ─── reads ──────────────────────────────────────────────────────────────────

export function useScopedAgentId(): string | null {
  const global = useAgentStore((s) => s.selectedAgentId);
  return useScopedField((s) => s.selectedAgentId, global);
}

export function useScopedThreadMode(): ThreadMode {
  const global = useAgentStore((s) => s.threadMode);
  return useScopedField((s) => s.threadMode, global);
}

export function useScopedSearchMode(): SearchMode {
  const global = useAgentStore((s) => s.searchMode);
  return useScopedField((s) => s.searchMode, global);
}

export function useScopedSelectedModel(): ModelId | null {
  const global = useAgentStore((s) => s.selectedModel);
  return useScopedField<ModelId | null>((s) => s.selectedModel, global);
}

export function useScopedSelectedNotebookId(): string {
  const global = useAgentStore((s) => s.selectedNotebookId);
  return useScopedField((s) => s.selectedNotebookId, global);
}

export function useScopedCustomSystemPrompt(): string | null {
  const global = useAgentStore((s) => s.customSystemPrompt);
  return useScopedField((s) => s.customSystemPrompt, global);
}

export function useScopedCustomRoleName(): string | null {
  const global = useAgentStore((s) => s.customRoleName);
  return useScopedField((s) => s.customRoleName, global);
}

// ─── writes ─────────────────────────────────────────────────────────────────

export function useScopedSetSelectedAgent(): (id: string | null) => void {
  const ctx = useChatSurfaceContext();
  const globalSet = useAgentStore((s) => s.setSelectedAgent);
  if (!ctx) return globalSet;
  return (id) => ctx.store.getState().setSelectedAgent(id);
}

export function useScopedSetThreadMode(): (mode: ThreadMode) => void {
  const ctx = useChatSurfaceContext();
  const globalSet = useAgentStore((s) => s.setThreadMode);
  if (!ctx) return globalSet;
  return (mode) => ctx.store.getState().setThreadMode(mode);
}

export function useScopedSetSearchMode(): (mode: SearchMode) => void {
  const ctx = useChatSurfaceContext();
  const globalSet = useAgentStore((s) => s.setSearchMode);
  if (!ctx) return globalSet;
  return (mode) => ctx.store.getState().setSearchMode(mode);
}

export function useScopedSetSelectedModel(): (model: ModelId) => void {
  const ctx = useChatSurfaceContext();
  const globalSet = useAgentStore((s) => s.setSelectedModel);
  if (!ctx) return globalSet;
  return (model) => ctx.store.getState().setSelectedModel(model);
}

export function useScopedSetSelectedNotebook(): (id: string) => void {
  const ctx = useChatSurfaceContext();
  const globalSet = useAgentStore((s) => s.setSelectedNotebook);
  if (!ctx) return globalSet;
  return (id) => ctx.store.getState().setSelectedNotebook(id);
}

export function useScopedSetCustomSystemPrompt(): (prompt: string | null) => void {
  const ctx = useChatSurfaceContext();
  const globalSet = useAgentStore((s) => s.setCustomSystemPrompt);
  if (!ctx) return globalSet;
  return (prompt) => ctx.store.getState().setCustomSystemPrompt(prompt);
}

export function useScopedSetCustomRoleName(): (name: string | null) => void {
  const ctx = useChatSurfaceContext();
  const globalSet = useAgentStore((s) => s.setCustomRoleName);
  if (!ctx) return globalSet;
  return (name) => ctx.store.getState().setCustomRoleName(name);
}

// ─── snapshot reader (for callbacks, e.g. adapter getConfig) ────────────────
//
// Returns a function that reads the *current* surface state (or globals when no
// surface is active). Use inside event handlers / refs where you don't want
// to subscribe to changes — getConfig in the adapter is the canonical case.
export function getScopedSnapshot(surface: ChatSurfaceState | null): ChatSurfaceState {
  if (surface) return surface;
  const g = useAgentStore.getState();
  return {
    selectedAgentId: g.selectedAgentId,
    threadMode: g.threadMode,
    searchMode: g.searchMode,
    selectedModel: g.selectedModel,
    selectedNotebookId: g.selectedNotebookId,
    customSystemPrompt: g.customSystemPrompt,
    customRoleName: g.customRoleName,
    setSelectedAgent: g.setSelectedAgent,
    setThreadMode: g.setThreadMode,
    setSearchMode: g.setSearchMode,
    setSelectedModel: g.setSelectedModel,
    setSelectedNotebook: g.setSelectedNotebook,
    setCustomSystemPrompt: g.setCustomSystemPrompt,
    setCustomRoleName: g.setCustomRoleName,
  };
}
