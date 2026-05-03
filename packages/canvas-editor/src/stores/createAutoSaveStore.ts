/**
 * createAutoSaveStore — Vanilla Zustand store factory for canvas auto-save state.
 *
 * Each editor instance gets its own store via {@link AutoSaveStoreProvider}.
 * The shareToken, status, and last-image dedup all scope to the instance,
 * so opening a different canvas can't write into the previous canvas's record.
 */

import { createStore } from 'zustand/vanilla';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutoSaveState {
  autoSaveStatus: AutoSaveStatus;
  autoSavedShareToken: string | null;
  lastAutoSavedImageSrc: string | null;
}

export interface AutoSaveActions {
  setAutoSaveStatus: (status: AutoSaveStatus) => void;
  setAutoSavedShareToken: (token: string | null) => void;
  setLastAutoSavedImageSrc: (src: string | null) => void;
  clearAutoSaveState: () => void;
}

export type AutoSaveStore = AutoSaveState & AutoSaveActions;

export interface CreateAutoSaveStoreOptions {
  /**
   * Seed the per-instance store with a known share token, e.g. from the URL
   * when the editor is opened against an existing share. Without this seed,
   * the first save after a reload creates a new draft instead of updating.
   */
  initialShareToken?: string | null;
}

export function createAutoSaveStore(options: CreateAutoSaveStoreOptions = {}) {
  const initialShareToken = options.initialShareToken ?? null;
  return createStore<AutoSaveStore>()((set) => ({
    autoSaveStatus: 'idle',
    autoSavedShareToken: initialShareToken,
    lastAutoSavedImageSrc: null,

    setAutoSaveStatus: (status) => set({ autoSaveStatus: status }),
    setAutoSavedShareToken: (token) => set({ autoSavedShareToken: token }),
    setLastAutoSavedImageSrc: (src) => set({ lastAutoSavedImageSrc: src }),
    clearAutoSaveState: () =>
      set({
        autoSaveStatus: 'idle',
        autoSavedShareToken: null,
        lastAutoSavedImageSrc: null,
      }),
  }));
}

export type AutoSaveStoreApi = ReturnType<typeof createAutoSaveStore>;

/**
 * Default singleton retained for code paths that mount canvas-editor primitives
 * without an {@link AutoSaveStoreProvider}. New code should prefer the Provider.
 */
export const defaultAutoSaveStore = createAutoSaveStore();
