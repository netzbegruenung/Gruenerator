import { create } from 'zustand';

interface AltTextState {
  altText: string;
  isAltTextLoading: boolean;
  altTextError: string | null;
  showAltText: boolean;
}

interface AltTextActions {
  setAltText: (text: string) => void;
  setAltTextLoading: (loading: boolean) => void;
  setAltTextError: (error: string | null) => void;
  toggleAltText: () => void;
  setShowAltText: (show: boolean) => void;
  resetAltText: () => void;
}

export type AltTextStore = AltTextState & AltTextActions;

export const useAltTextStore = create<AltTextStore>((set) => ({
  altText: '',
  isAltTextLoading: false,
  altTextError: null,
  showAltText: false,

  setAltText: (text) => set({ altText: text }),
  setAltTextLoading: (loading) => set({ isAltTextLoading: loading }),
  setAltTextError: (error) => set({ altTextError: error }),
  toggleAltText: () => set((state) => ({ showAltText: !state.showAltText })),
  setShowAltText: (show) => set({ showAltText: show }),
  resetAltText: () =>
    set({
      altText: '',
      isAltTextLoading: false,
      altTextError: null,
      showAltText: false,
    }),
}));

export default useAltTextStore;
