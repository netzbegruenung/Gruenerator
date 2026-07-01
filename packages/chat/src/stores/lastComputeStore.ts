import { create } from 'zustand';

/**
 * The most recent client-side spreadsheet computation (auto-run pandas result),
 * so the NEXT chat request can forward it to the backend as `computedResult`.
 * The backend injects it via formatComputedResultContext ("übernimm die Werte
 * EXAKT"), letting the model reference the number in a follow-up ("und pro
 * Monat?") without re-deriving it in its head.
 *
 * Session-scoped and single-slot (only the latest result matters); cleared on
 * thread switch alongside the tabular file store.
 */
export interface ComputeResult {
  operation: string;
  entries: Array<{ label: string; value: string }>;
  summary: string;
}

interface LastComputeState {
  result: ComputeResult | null;
  setResult: (result: ComputeResult) => void;
  clear: () => void;
}

export const useLastComputeStore = create<LastComputeState>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  clear: () => set({ result: null }),
}));
