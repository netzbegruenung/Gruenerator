import {
  DEFAULT_NOTEBOOK_ANSWER_MODE,
  DEFAULT_NOTEBOOK_DEPTH,
  NOTEBOOK_COMPOSER_MODES,
  type NotebookComposerMode,
} from '@gruenerator/chat';
import {
  chatBackgroundSchema,
  notebookDepthSchema,
  type ChatBackground,
  type NotebookDepth,
} from '@gruenerator/contracts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark' | 'system';
export type VorlagenGridSize = 'small' | 'large';

const THEME_STORAGE_KEY = 'themeMode';
const CHAT_BACKGROUND_STORAGE_KEY = 'chatBackground';
const NOTEBOOK_DEPTH_STORAGE_KEY = 'notebookDepth';
const NOTEBOOK_ANSWER_MODE_STORAGE_KEY = 'notebookAnswerMode';
const VORLAGEN_GRID_SIZE_STORAGE_KEY = 'vorlagenGridSize';

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
   * The chat background chosen on this device, or null to follow the profile.
   *
   * The presets are also a profile field, shared with web — but not all of them
   * exist there. The mesh presets are app-only, and a *deployed* backend only
   * accepts the keys its own copy of `chatBackgroundSchema` knows, which is
   * whatever was released, not whatever this branch adds. Sending it a key it
   * has never heard of comes back as a validation error, and the choice fails
   * to save for a reason that has nothing to do with the person making it.
   *
   * So the device answers first and the server is told only when it can accept
   * the value (see `services/chatBackground`). Null means nothing was chosen
   * here and the profile decides — which keeps a choice made on web arriving.
   */
  chatBackground: ChatBackground | null;
  /**
   * Notebook retrieval depth (Klein/Mittel/Ultra).
   *
   * Here rather than in `notebookFilterStore`, which is deliberately not
   * persisted: a source or category filter is scoped to the session you set it
   * in, but how much work an answer is worth is a standing preference and does
   * not change per notebook.
   */
  notebookDepth: NotebookDepth;
  /** Notebook composer mode (Magic/Chat/Präzision/Manuell) — a standing
   *  preference like the depth, for the same reason. `manuell` is a client
   *  mode; what goes on the wire is `toNotebookAnswerMode(...)`. */
  notebookAnswerMode: NotebookComposerMode;
  /** Card size on the Vorlagen screen, like web's toggle there. */
  vorlagenGridSize: VorlagenGridSize;
}

interface PreferencesActions {
  loadPreferences: () => Promise<void>;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  setChatBackground: (background: ChatBackground) => Promise<void>;
  setNotebookDepth: (depth: NotebookDepth) => Promise<void>;
  setNotebookAnswerMode: (mode: NotebookComposerMode) => Promise<void>;
  setVorlagenGridSize: (size: VorlagenGridSize) => Promise<void>;
}

type PreferencesStore = PreferencesState & PreferencesActions;

export const usePreferencesStore = create<PreferencesStore>()((set) => ({
  isLoading: true,
  themeMode: 'system',
  chatBackground: null,
  notebookDepth: DEFAULT_NOTEBOOK_DEPTH,
  notebookAnswerMode: DEFAULT_NOTEBOOK_ANSWER_MODE,
  vorlagenGridSize: 'small',

  loadPreferences: async () => {
    try {
      // All keys before anything is set: this runs on the startup path, awaited
      // alongside the session probe.
      const [storedTheme, storedBackground, storedDepth, storedAnswerMode, storedGridSize] =
        await Promise.all([
          AsyncStorage.getItem(THEME_STORAGE_KEY),
          AsyncStorage.getItem(CHAT_BACKGROUND_STORAGE_KEY),
          AsyncStorage.getItem(NOTEBOOK_DEPTH_STORAGE_KEY),
          AsyncStorage.getItem(NOTEBOOK_ANSWER_MODE_STORAGE_KEY),
          AsyncStorage.getItem(VORLAGEN_GRID_SIZE_STORAGE_KEY),
        ]);
      // Parsed rather than trusted: a key written by an older build may have
      // been dropped from the enum since.
      const background = chatBackgroundSchema.safeParse(storedBackground);
      const depth = notebookDepthSchema.safeParse(storedDepth);
      const answerMode = NOTEBOOK_COMPOSER_MODES.find((m) => m.mode === storedAnswerMode)?.mode;
      const mode: ThemeMode =
        storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system'
          ? storedTheme
          : 'system';
      applyThemeMode(mode);
      set({
        themeMode: mode,
        chatBackground: background.success ? background.data : null,
        notebookDepth: depth.success ? depth.data : DEFAULT_NOTEBOOK_DEPTH,
        notebookAnswerMode: answerMode ?? DEFAULT_NOTEBOOK_ANSWER_MODE,
        vorlagenGridSize: storedGridSize === 'large' ? 'large' : 'small',
        isLoading: false,
      });
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

  setChatBackground: async (background) => {
    set({ chatBackground: background });
    try {
      await AsyncStorage.setItem(CHAT_BACKGROUND_STORAGE_KEY, background);
    } catch {
      // Non-fatal: the choice still applies this session, just won't persist.
    }
  },

  setNotebookDepth: async (depth) => {
    set({ notebookDepth: depth });
    try {
      await AsyncStorage.setItem(NOTEBOOK_DEPTH_STORAGE_KEY, depth);
    } catch {
      // Non-fatal: the choice still applies this session, just won't persist.
    }
  },

  setNotebookAnswerMode: async (mode) => {
    set({ notebookAnswerMode: mode });
    try {
      await AsyncStorage.setItem(NOTEBOOK_ANSWER_MODE_STORAGE_KEY, mode);
    } catch {
      // Non-fatal: the choice still applies this session, just won't persist.
    }
  },

  setVorlagenGridSize: async (size) => {
    set({ vorlagenGridSize: size });
    try {
      await AsyncStorage.setItem(VORLAGEN_GRID_SIZE_STORAGE_KEY, size);
    } catch {
      // Non-fatal: the choice still applies this session, just won't persist.
    }
  },
}));
