import { create } from 'zustand';
import { preferencesStorage, type TabBarStyle } from '../services/preferences';

interface PreferencesState {
  tabBarStyle: TabBarStyle;
  isLoading: boolean;
}

interface PreferencesActions {
  setTabBarStyle: (style: TabBarStyle) => Promise<void>;
  loadPreferences: () => Promise<void>;
}

type PreferencesStore = PreferencesState & PreferencesActions;

export const usePreferencesStore = create<PreferencesStore>()((set) => ({
  tabBarStyle: 'classic',
  isLoading: true,

  loadPreferences: async () => {
    try {
      const tabBarStyle = await preferencesStorage.getTabBarStyle();
      set({ tabBarStyle, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setTabBarStyle: async (style: TabBarStyle) => {
    set({ tabBarStyle: style });
    await preferencesStorage.setTabBarStyle(style);
  },
}));
