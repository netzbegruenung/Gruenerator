import { create } from 'zustand';

/**
 * The browser's vision review of chat creator sharepics (the studio's review
 * loop, run after the turn). Session-only: a reload reads the corrected spec
 * from the thread, where the review saved it.
 */
interface SharepicReviewStore {
  /** Variants whose review is running. */
  checking: Record<string, true>;
  /** The corrected props per variant, already saved on the thread. */
  reviewed: Record<string, Record<string, unknown>>;
  setChecking: (variantId: string, checking: boolean) => void;
  setReviewed: (variantId: string, props: Record<string, unknown>) => void;
}

export const useSharepicReviewStore = create<SharepicReviewStore>((set) => ({
  checking: {},
  reviewed: {},
  setChecking: (variantId, checking) =>
    set((s) => {
      const next = { ...s.checking };
      if (checking) next[variantId] = true;
      else delete next[variantId];
      return { checking: next };
    }),
  setReviewed: (variantId, props) =>
    set((s) => ({ reviewed: { ...s.reviewed, [variantId]: props } })),
}));
