import { create } from 'zustand';

interface NotebookFilterState {
  /** The notebook the current selection belongs to; a different one resets it. */
  notebookId: string | null;
  /** Keyword facets, keyed by filter field — the shape `/notebook/stream` takes. */
  keywordFilters: Record<string, string[]>;
  /** Chosen collections, or null for "all of the notebook's". */
  collectionIds: string[] | null;

  setNotebook: (notebookId: string) => void;
  toggleValue: (field: string, value: string) => void;
  toggleCollection: (id: string, available: string[]) => void;
  reset: () => void;
}

/**
 * The notebook filter selection, lifted out of the research panel so the KI path
 * can read it too: asking hands off to `/(focused)/chat-conversation`, a screen
 * change that would drop panel-local state, and `useMobileChatRuntime` builds the
 * request body from outside the panel either way.
 *
 * Not persisted — a filter is scoped to the session you set it in, and reviving
 * one silently on the next app start would quietly narrow every answer. The
 * retrieval depth is the opposite case and therefore lives elsewhere: it widens
 * rather than narrows, and it is a standing preference, so it is persisted in
 * `preferencesStore`.
 */
export const useNotebookFilterStore = create<NotebookFilterState>((set, get) => ({
  notebookId: null,
  keywordFilters: {},
  collectionIds: null,

  setNotebook: (notebookId) => {
    if (get().notebookId === notebookId) return;
    set({ notebookId, keywordFilters: {}, collectionIds: null });
  },

  toggleValue: (field, value) =>
    set((state) => {
      const current = state.keywordFilters[field] ?? [];
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (updated.length === 0) {
        const { [field]: _drop, ...rest } = state.keywordFilters;
        return { keywordFilters: rest };
      }
      return { keywordFilters: { ...state.keywordFilters, [field]: updated } };
    }),

  toggleCollection: (id, available) =>
    set((state) => {
      const current = state.collectionIds ?? available;
      const updated = current.includes(id) ? current.filter((c) => c !== id) : [...current, id];
      // Deselecting the last one would search nothing; treat it as "all" again,
      // and so is selecting everything.
      const isAll = updated.length === 0 || updated.length === available.length;
      return { collectionIds: isAll ? null : updated };
    }),

  reset: () => set({ keywordFilters: {}, collectionIds: null }),
}));

/**
 * The filters to send for `notebookId` — empty unless the stored selection
 * belongs to that notebook, so a stale selection can't leak into another one.
 */
export function notebookFiltersFor(notebookId: string | undefined): {
  keywordFilters: Record<string, string[]>;
  collectionIds: string[] | null;
} {
  const state = useNotebookFilterStore.getState();
  if (!notebookId || state.notebookId !== notebookId) {
    return { keywordFilters: {}, collectionIds: null };
  }
  return {
    keywordFilters: state.keywordFilters,
    collectionIds: state.collectionIds,
  };
}
