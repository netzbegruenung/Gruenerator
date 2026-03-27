import { create } from 'zustand';

interface SubtitlerBetaState {
  currentTime: number;
  isPlaying: boolean;
}

interface SubtitlerBetaActions {
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  reset: () => void;
}

const initialState: SubtitlerBetaState = {
  currentTime: 0,
  isPlaying: false,
};

export const useSubtitlerBetaStore = create<SubtitlerBetaState & SubtitlerBetaActions>()((set) => ({
  ...initialState,

  setCurrentTime: (currentTime) => set({ currentTime }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  reset: () => set(initialState),
}));
