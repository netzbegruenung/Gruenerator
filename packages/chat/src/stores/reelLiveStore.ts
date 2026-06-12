import { create } from 'zustand';

import { useSharepicLiveStore } from './sharepicLiveStore';

import type { SubtitleSegment } from '@gruenerator/shared/subtitle-editor';

/**
 * Live state of the reels (subtitler projects) touched in this chat session.
 *
 * Written by the SSE parser (`reel_updated`), the ReelProcessingCard (when
 * auto-transcription completes) and panel-mount rehydration; read by the
 * ReelArtifactPanel for the live subtitle overlay and by the model adapter
 * to attach `currentReel` (the project the user marked active for chat
 * editing) to outgoing requests.
 */
export interface ReelLiveEntry {
  title: string;
  /** Parsed subtitle segments of the latest state; null until first fetch. */
  segments: SubtitleSegment[] | null;
  /** Summary of the last chat edit (version label). */
  summary: string | null;
  /** Segment indices changed by the last edit (for highlight/preview). */
  changedIndices: number[] | null;
}

export interface ActiveReel {
  projectId: string;
  title: string;
}

interface ReelLiveStore {
  /** projectId → live entry. */
  entries: Record<string, ReelLiveEntry>;
  activeReel: ActiveReel | null;
  upsertEntry: (projectId: string, entry: Partial<ReelLiveEntry> & { title: string }) => void;
  setActiveReel: (active: ActiveReel | null) => void;
}

export const useReelLiveStore = create<ReelLiveStore>((set, get) => ({
  entries: {},
  activeReel: null,

  upsertEntry: (projectId, entry) => {
    const prev = get().entries[projectId];
    const next: ReelLiveEntry = prev
      ? { ...prev, ...entry }
      : { segments: null, summary: null, changedIndices: null, ...entry };
    set({ entries: { ...get().entries, [projectId]: next } });
  },

  setActiveReel: (active) => {
    // One docked artifact at a time: activating a reel closes the sharepic
    // panel (sharepicLiveStore doesn't import this store, so no cycle).
    if (active && useSharepicLiveStore.getState().activeVariant) {
      useSharepicLiveStore.getState().setActiveVariant(null);
    }
    set({ activeReel: active });
  },
}));

// Reverse direction of the one-artifact rule: activating a sharepic clears
// the active reel. sharepicLiveStore cannot import this store (cycle), so
// the coupling lives here as a subscription. setState (not setActiveReel)
// avoids re-triggering the forward clear above. Without this, a stale
// currentReel keeps being sent alongside currentSharepic and the reel
// branch hijacks verb-only follow-ups aimed at the sharepic.
useSharepicLiveStore.subscribe((state, prevState) => {
  if (
    state.activeVariant &&
    state.activeVariant !== prevState.activeVariant &&
    useReelLiveStore.getState().activeReel
  ) {
    useReelLiveStore.setState({ activeReel: null });
  }
});
