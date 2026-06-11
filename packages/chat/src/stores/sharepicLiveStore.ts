import { create } from 'zustand';

/**
 * Live state of chat sharepic variants that have been (or are being) edited.
 *
 * Written by the SSE parser (`sharepic_minted` / `sharepic_updated`) and by
 * card-mount rehydration; read by SharepicVariantCard for in-place re-renders
 * and by the model adapter to attach `currentSharepic` (the variant the user
 * marked active for chat editing) to outgoing requests.
 */
export interface SharepicLiveEntry {
  canvasId: string;
  canvasType: string;
  version: number | null;
  /** Full flat state of the latest version; null until first fetch/update. */
  state: Record<string, unknown> | null;
  summary?: string;
  /**
   * Set when the state changed through a real edit (SSE update / restore) —
   * NOT on mount rehydration. The card uploads its next successful head
   * render as the canvas thumbnail and clears the flag.
   */
  thumbnailDirty?: boolean;
}

export interface ActiveSharepic {
  variantId: string;
  canvasId: string | null;
  canvasType: string;
}

interface SharepicLiveStore {
  /** variantId → live entry. */
  entries: Record<string, SharepicLiveEntry>;
  activeVariant: ActiveSharepic | null;
  upsertEntry: (
    variantId: string,
    entry: Partial<SharepicLiveEntry> & { canvasId: string }
  ) => void;
  setActiveVariant: (active: ActiveSharepic | null) => void;
  clearThumbnailDirty: (variantId: string) => void;
}

export const useSharepicLiveStore = create<SharepicLiveStore>((set, get) => ({
  entries: {},
  activeVariant: null,

  upsertEntry: (variantId, entry) => {
    const prev = get().entries[variantId];
    const next: SharepicLiveEntry = prev
      ? { ...prev, ...entry }
      : { canvasType: '', version: null, state: null, ...entry };
    set({ entries: { ...get().entries, [variantId]: next } });
    const active = get().activeVariant;
    if (active?.variantId === variantId && active.canvasId !== next.canvasId) {
      set({ activeVariant: { ...active, canvasId: next.canvasId } });
    }
  },

  setActiveVariant: (active) => set({ activeVariant: active }),

  clearThumbnailDirty: (variantId) => {
    const prev = get().entries[variantId];
    if (!prev?.thumbnailDirty) return;
    set({ entries: { ...get().entries, [variantId]: { ...prev, thumbnailDirty: false } } });
  },
}));
