import { create } from 'zustand';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface AutoSaveState {
  autoSaveStatus: AutoSaveStatus;
  autoSavedShareToken: string | null;
  lastAutoSavedImageSrc: string | null;
}

interface AutoSaveActions {
  setAutoSaveStatus: (status: AutoSaveStatus) => void;
  setAutoSavedShareToken: (token: string | null) => void;
  setLastAutoSavedImageSrc: (src: string | null) => void;
  clearAutoSaveState: () => void;
}

export type AutoSaveStore = AutoSaveState & AutoSaveActions;

export const useAutoSaveStore = create<AutoSaveStore>((set) => ({
  autoSaveStatus: 'idle',
  autoSavedShareToken: null,
  lastAutoSavedImageSrc: null,

  setAutoSaveStatus: (status) => set({ autoSaveStatus: status }),
  setAutoSavedShareToken: (token) => set({ autoSavedShareToken: token }),
  setLastAutoSavedImageSrc: (src) => set({ lastAutoSavedImageSrc: src }),
  clearAutoSaveState: () => set({
    autoSaveStatus: 'idle',
    autoSavedShareToken: null,
    lastAutoSavedImageSrc: null
  })
}));

export default useAutoSaveStore;
