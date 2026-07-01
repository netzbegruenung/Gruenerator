import { create } from 'zustand';

import { useReelLiveStore } from './reelLiveStore';
import { useSharepicLiveStore } from './sharepicLiveStore';

import type { ArtifactData } from '../hooks/useChatGraphStream';

/**
 * Live state of the generic artifact (HTML/SVG) the user is viewing in the
 * docked side panel. Written by the SSE parser (`artifact` event) and by inline
 * artifact cards when the user re-opens one; read by ArtifactPanel.
 *
 * Modeled on sharepicLiveStore — the panel-docking UX is shared, but artifacts
 * are static renderables (no canvas/version machinery).
 */
export interface ActiveArtifact extends ArtifactData {
  /** Stable id so a card can tell whether it is the currently-open artifact. */
  id: string;
}

interface ArtifactLiveStore {
  activeArtifact: ActiveArtifact | null;
  setActiveArtifact: (artifact: ActiveArtifact | null) => void;
}

export const useArtifactLiveStore = create<ArtifactLiveStore>((set) => ({
  activeArtifact: null,
  setActiveArtifact: (artifact) => {
    // Only one docked panel at a time: opening an artifact closes an active
    // sharepic/reel. (Those stores don't import this one, so no cycle.)
    if (artifact) {
      if (useSharepicLiveStore.getState().activeVariant) {
        useSharepicLiveStore.getState().setActiveVariant(null);
      }
      if (useReelLiveStore.getState().activeReel) {
        useReelLiveStore.getState().setActiveReel(null);
      }
    }
    set({ activeArtifact: artifact });
  },
}));
