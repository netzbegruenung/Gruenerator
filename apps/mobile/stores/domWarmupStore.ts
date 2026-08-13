import { create } from 'zustand';

/**
 * Bookkeeping for the off-screen preloading of `use dom` components
 * (see `components/common/DomWarmup.tsx`).
 *
 * One entry per warmup target, identified by a stable id. A target is `done`
 * once its bundle reported ready, once it gave up, or once the real screen
 * using that DOM component opened — in every case there is nothing left to
 * warm this session.
 */
interface DomWarmupState {
  started: boolean;
  done: string[];
  start: () => void;
  complete: (id: string) => void;
}

export const useDomWarmupStore = create<DomWarmupState>((set) => ({
  started: false,
  done: [],
  start: () => set({ started: true }),
  complete: (id) =>
    set((s) => (s.done.includes(id) ? s : { done: [...s.done, id], started: true })),
}));

/**
 * Called by a screen that mounts the real DOM component: warming it off screen
 * is pointless now, and a second WebView would only compete with it.
 */
export function completeDomWarmup(id: string): void {
  useDomWarmupStore.getState().complete(id);
}
