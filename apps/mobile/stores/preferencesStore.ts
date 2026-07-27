import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_STORAGE_KEY = 'themeMode';
const PERFORMANCE_MODE_STORAGE_KEY = 'performanceMode';

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
  /**
   * Drops the effects that cost every frame — today the Android tab bar's blur
   * and the full-screen capture behind it.
   *
   * Device-local on purpose, unlike the `reduce_transparency` profile flag it
   * overlaps with: that one is an accessibility choice about how the app should
   * look and belongs to the person across all their devices, this one is about
   * what *this* phone can afford. An old Android handset and an iPad want
   * different answers.
   */
  performanceMode: boolean;
}

interface PreferencesActions {
  loadPreferences: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setPerformanceMode: (enabled: boolean) => Promise<void>;
}

type PreferencesStore = PreferencesState & PreferencesActions;

export const usePreferencesStore = create<PreferencesStore>()((set) => ({
  isLoading: true,
  themeMode: 'system',
  performanceMode: false,

  loadPreferences: async () => {
    try {
      // Both keys before anything is set: this runs on the startup path, awaited
      // alongside the session probe, and performance mode has to be known before
      // the tabs mount — flipping it later remounts the focused screen.
      const [storedTheme, storedPerformance] = await Promise.all([
        AsyncStorage.getItem(THEME_STORAGE_KEY),
        AsyncStorage.getItem(PERFORMANCE_MODE_STORAGE_KEY),
      ]);
      const mode: ThemeMode =
        storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system'
          ? storedTheme
          : 'system';
      applyThemeMode(mode);
      set({ themeMode: mode, performanceMode: storedPerformance === 'true', isLoading: false });
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

  setPerformanceMode: async (enabled) => {
    set({ performanceMode: enabled });
    try {
      await AsyncStorage.setItem(PERFORMANCE_MODE_STORAGE_KEY, String(enabled));
    } catch {
      // Non-fatal, same as the theme: the switch still takes effect this session.
    }
  },
}));
