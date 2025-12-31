import { create } from 'zustand';

interface PreferencesState {
  isLoading: boolean;
}

interface PreferencesActions {
  loadPreferences: () => Promise<void>;
}

type PreferencesStore = PreferencesState & PreferencesActions;

export const usePreferencesStore = create<PreferencesStore>()((set) => ({
  isLoading: true,

  loadPreferences: async () => {
    try {
      // Future preference loading will go here
      set({ isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));
