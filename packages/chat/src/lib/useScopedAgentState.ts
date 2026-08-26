'use client';

import { createStore, useStore } from 'zustand';

import { useChatSurfaceContext, type ChatSurfaceState } from '../context/ChatSurfaceContext';
import { useAgentStore, type SearchMode, type ThreadMode } from '../stores/chatStore';
import { useUserProfileStore } from '../stores/userProfileStore';

import { AUTO_MODEL_ID, type SelectedModel } from './resolveAutoModel';

import type { RoleRef } from '@gruenerator/contracts';

const FALLBACK = createStore<ChatSurfaceState>(() => ({
  selectedAgentId: null,
  threadMode: 'chat',
  searchMode: 'web',
  selectedModel: AUTO_MODEL_ID,
  selectedNotebookId: 'gruenerator-notebook',
  customSystemPrompt: null,
  customRoleName: null,
  customRoleRef: null,
  setSelectedAgent: () => {},
  setThreadMode: () => {},
  setSearchMode: () => {},
  setSelectedModel: () => {},
  setSelectedNotebook: () => {},
  setCustomSystemPrompt: () => {},
  setCustomRoleRef: () => {},
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

export function useScopedSelectedModel(): SelectedModel {
  const global = useAgentStore((s) => s.selectedModel);
  return useScopedField<SelectedModel>((s) => s.selectedModel, global);
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

export function useScopedCustomRoleRef(): RoleRef | null {
  const global = useAgentStore((s) => s.customRoleRef);
  return useScopedField((s) => s.customRoleRef, global);
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

export function useScopedSetSelectedModel(): (model: SelectedModel) => void {
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

export function useScopedSetCustomRoleRef(): (ref: RoleRef | null) => void {
  const ctx = useChatSurfaceContext();
  const globalSet = useAgentStore((s) => s.setCustomRoleRef);
  if (!ctx) return globalSet;
  return (ref) => ctx.store.getState().setCustomRoleRef(ref);
}

/** Stabil, damit die Identität des Rückgabewerts nicht bei jedem Render wechselt. */
const NOOP_SET_ACTIVE_ROLE = (_role: RoleRef | null): void => {};

/**
 * Die Konto-Voreinstellung für neue Chats. Anders als die Nachbarn hier gibt es
 * keine oberflächen-eigene Entsprechung — eine eingebettete Fläche (Docs,
 * Boards, Sheets, Präsentationen) hält ihren Rollenzustand bewusst bei sich,
 * und ihre Wahl darf nicht zum Standard für jeden `/chat`-Entwurf werden. In
 * einer solchen Fläche schreibt diese Funktion deshalb nichts.
 *
 * Erreichbar ist der Fall heute nicht: alle vier Konsumenten setzen
 * `showToolToggles={false}`, und `includeModes` verbirgt damit das gesamte
 * Rollen-Untermenü. Das ist aber ein Schutz durch ein fremdes UI-Flag, keine
 * Bereichsprüfung — schaltet eine künftige Fläche die Werkzeug-Schalter ein,
 * weil sie die braucht, bekäme sie das Leck gratis dazu. Genau die Sorte Leck,
 * die der Rest dieser Änderung in der anderen Richtung schließt.
 */
export function useScopedSetActiveRole(): (role: RoleRef | null) => void {
  const ctx = useChatSurfaceContext();
  const globalSet = useUserProfileStore((s) => s.setActiveRole);
  if (ctx) return NOOP_SET_ACTIVE_ROLE;
  return globalSet;
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
    customRoleRef: g.customRoleRef,
    setSelectedAgent: g.setSelectedAgent,
    setThreadMode: g.setThreadMode,
    setSearchMode: g.setSearchMode,
    setSelectedModel: g.setSelectedModel,
    setSelectedNotebook: g.setSelectedNotebook,
    setCustomSystemPrompt: g.setCustomSystemPrompt,
    setCustomRoleName: g.setCustomRoleName,
    setCustomRoleRef: g.setCustomRoleRef,
  };
}
