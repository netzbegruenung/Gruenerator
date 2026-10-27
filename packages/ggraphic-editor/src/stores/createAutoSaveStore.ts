// SPDX-License-Identifier: MPL-2.0
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
  /** True while there are edits that have not been persisted yet. */
  isDirty: boolean;
  /** Re-runs the last auto-save attempt. Registered by useCanvasAutoSave. */
  retryAutoSave: (() => void) | null;
  /**
   * Alt text the person typed for the exported image; `null` = follow the
   * canvas-text suggestion. Session-only, shared by sidebar and top-bar share.
   */
  shareAltText: string | null;
  /** Whether the alt text goes into the shared post text; off unless ticked. */
  shareAltTextInCaption: boolean;
}

export interface AutoSaveActions {
  setAutoSaveStatus: (status: AutoSaveStatus) => void;
  setAutoSavedShareToken: (token: string | null) => void;
  setLastAutoSavedImageSrc: (src: string | null) => void;
  setDirty: (dirty: boolean) => void;
  setRetryAutoSave: (retry: (() => void) | null) => void;
  setShareAltText: (text: string | null) => void;
  setShareAltTextInCaption: (include: boolean) => void;
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
    isDirty: false,
    retryAutoSave: null,
    shareAltText: null,
    shareAltTextInCaption: false,

    setAutoSaveStatus: (status) => set({ autoSaveStatus: status }),
    setAutoSavedShareToken: (token) => set({ autoSavedShareToken: token }),
    setLastAutoSavedImageSrc: (src) => set({ lastAutoSavedImageSrc: src }),
    setDirty: (dirty) => set({ isDirty: dirty }),
    setRetryAutoSave: (retry) => set({ retryAutoSave: retry }),
    setShareAltText: (text) => set({ shareAltText: text }),
    setShareAltTextInCaption: (include) => set({ shareAltTextInCaption: include }),
    clearAutoSaveState: () =>
      set({
        autoSaveStatus: 'idle',
        autoSavedShareToken: null,
        lastAutoSavedImageSrc: null,
        isDirty: false,
        retryAutoSave: null,
        shareAltText: null,
        shareAltTextInCaption: false,
      }),
  }));
}

export type AutoSaveStoreApi = ReturnType<typeof createAutoSaveStore>;

/**
 * Default singleton retained for code paths that mount canvas-editor primitives
 * without an {@link AutoSaveStoreProvider}. New code should prefer the Provider.
 */
export const defaultAutoSaveStore = createAutoSaveStore();
