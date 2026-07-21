import { create } from 'zustand';
import { type ComputePayload } from '@gruenerator/contracts';

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
/** Derived from the wire schema (computePayloadSchema) — this IS the shape the
 *  run_python resume POSTs and the backend validates; a hand-written twin
 *  would drift silently. figures/files (capped base64) travel with the resume
 *  and are stripped when forwarding as `computedResult` on the NEXT request. */
export type ComputeResult = ComputePayload;

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
