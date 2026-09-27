import { create, type StateCreator } from 'zustand';

import { registerAiConsentRequiredHandler } from '../api/aiConsentSignal.js';
import { DEFAULT_AUTH_STATE } from '../types/auth.js';

import type { AuthState, AuthActions, AuthStore, User } from '../types/auth.js';

/**
 * Configuration for profile API operations
 * These are injected at runtime to keep the store platform-agnostic
 */
export interface AuthStoreConfig {
  updateProfileApi?: (data: Partial<User>) => Promise<User>;
  updateAvatarApi?: (avatarRobotId: string) => Promise<User>;
  updateMessageColorApi?: (color: string) => Promise<void>;
  updateLocaleApi?: (locale: 'de-DE' | 'de-AT') => Promise<void>;
  /** Antwortet mit dem Zeitstempel, den der Server gesetzt hat (null = widerrufen). */
  setAiConsentApi?: (granted: boolean) => Promise<string | null>;
  onClearAuth?: () => void;
}

let storeConfig: AuthStoreConfig = {};

export const setAuthStoreConfig = (config: AuthStoreConfig): void => {
  storeConfig = { ...storeConfig, ...config };
};

const createAuthStoreSlice: StateCreator<AuthStore> = (set, get) => ({
  ...DEFAULT_AUTH_STATE,

  setAuthState: (data) => {
    const { user, ...rest } = data;
    set({
      user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      selectedMessageColor:
        user.user_metadata?.chat_color || DEFAULT_AUTH_STATE.selectedMessageColor,
      locale: user.locale || 'de-DE',
      ...rest,
    });
  },

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),

  setLoggingOut: (isLoggingOut) => set({ isLoggingOut }),

  clearAuth: () => {
    set(DEFAULT_AUTH_STATE);
    storeConfig.onClearAuth?.();
  },

  updateProfile: async (profileData) => {
    const currentUser = get().user;
    if (!currentUser) {
      throw new Error('No user to update');
    }

    if (!storeConfig.updateProfileApi) {
      throw new Error('updateProfileApi not configured');
    }

    const updatedUser = await storeConfig.updateProfileApi(profileData);
    set({ user: { ...currentUser, ...updatedUser } });
    return updatedUser;
  },

  updateAvatar: async (avatarRobotId) => {
    const currentUser = get().user;
    if (!currentUser) {
      throw new Error('No user to update');
    }

    if (!storeConfig.updateAvatarApi) {
      throw new Error('updateAvatarApi not configured');
    }

    const updatedUser = await storeConfig.updateAvatarApi(avatarRobotId);
    set({ user: { ...currentUser, avatar_robot_id: avatarRobotId } });
    return updatedUser;
  },

  updateMessageColor: async (color) => {
    if (!storeConfig.updateMessageColorApi) {
      throw new Error('updateMessageColorApi not configured');
    }

    await storeConfig.updateMessageColorApi(color);
    set({ selectedMessageColor: color });

    const currentUser = get().user;
    if (currentUser) {
      set({
        user: {
          ...currentUser,
          user_metadata: { ...currentUser.user_metadata, chat_color: color },
        },
      });
    }
  },

  // Nicht optimistisch: eine Einwilligung, die der Server nie angenommen hat,
  // wäre eine falsche Behauptung genau an der Stelle, an der es auf den Nachweis
  // ankommt (Art. 7 Abs. 1 DSGVO).
  setAiConsent: async (granted) => {
    if (!storeConfig.setAiConsentApi) {
      throw new Error('setAiConsentApi not configured');
    }

    const ai_consent_at = await storeConfig.setAiConsentApi(granted);

    const currentUser = get().user;
    if (currentUser) {
      set({ user: { ...currentUser, ai_consent_at } });
    }
  },

  updateLocale: async (locale) => {
    if (!storeConfig.updateLocaleApi) {
      throw new Error('updateLocaleApi not configured');
    }

    await storeConfig.updateLocaleApi(locale);
    set({ locale });

    const currentUser = get().user;
    if (currentUser) {
      set({ user: { ...currentUser, locale } });
    }
  },
});

export const useAuthStore = create<AuthStore>()(createAuthStoreSlice);

// Der Server hat einen KI-Eingang mit „Einwilligung fehlt" abgewiesen. Damit
// ist der Zeitstempel im Store nachweislich veraltet — auf `null` gezogen
// erscheint das Einwilligungs-Gate von selbst, statt dass die Nutzer*in vor
// einem Fehler steht, den sie im Dialog längst ausräumen könnte.
registerAiConsentRequiredHandler(() => {
  const { user } = useAuthStore.getState();
  if (user && user.ai_consent_at != null) {
    useAuthStore.setState({ user: { ...user, ai_consent_at: null } });
  }
});

export const getAuthState = (): AuthState => {
  const { user, isAuthenticated, isLoading, error, isLoggingOut, selectedMessageColor, locale } =
    useAuthStore.getState();
  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    isLoggingOut,
    selectedMessageColor,
    locale,
  };
};
