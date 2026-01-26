import { create } from 'zustand';

interface PreloadedImageResult {
  imageSrc?: string;
  image?: {
    category?: string;
    [key: string]: unknown;
  };
  category?: string;
  [key: string]: unknown;
}

interface PreloadState {
  preloadedImageResult: PreloadedImageResult | null;
  slogansReady: boolean;
}

interface PreloadActions {
  setPreloadedImageResult: (result: PreloadedImageResult | null) => void;
  setSlogansReady: (ready: boolean) => void;
  clearPreloadState: () => void;
}

export type PreloadStore = PreloadState & PreloadActions;

export const usePreloadStore = create<PreloadStore>((set) => ({
  preloadedImageResult: null,
  slogansReady: false,

  setPreloadedImageResult: (result) => set({ preloadedImageResult: result }),
  setSlogansReady: (ready) => set({ slogansReady: ready }),
  clearPreloadState: () =>
    set({
      preloadedImageResult: null,
      slogansReady: false,
    }),
}));

export default usePreloadStore;
