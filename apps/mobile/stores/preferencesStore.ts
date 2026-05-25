import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'themeMode';

// Drives the whole app: every screen reads useColorScheme() from react-native,
// and Appearance.setColorScheme overrides what that returns. RN passes the value
// straight to the native setColorScheme(style: String), which is NON-NULL — so
// "follow OS" must be the 'unspecified' sentinel, never null (null → NPE on the
// new architecture: AppearanceModule.setColorScheme, parameter style).
const applyThemeMode = (mode: ThemeMode): void => {
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
};

interface PreferencesState {
  isLoading: boolean;
  themeMode: ThemeMode;
}

interface PreferencesActions {
  loadPreferences: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
}

type PreferencesStore = PreferencesState & PreferencesActions;

export const usePreferencesStore = create<PreferencesStore>()((set) => ({
  isLoading: true,
  themeMode: 'system',

  loadPreferences: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      const mode: ThemeMode =
        stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
      applyThemeMode(mode);
      set({ themeMode: mode, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setThemeMode: async (mode) => {
    applyThemeMode(mode);
    set({ themeMode: mode });
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Non-fatal: the choice still applies this session, just won't persist.
    }
  },
}));
