import { create, StateCreator } from 'zustand';
import type { AuthState, AuthActions, AuthStore, User } from '../types/auth.js';
import { DEFAULT_AUTH_STATE } from '../types/auth.js';

/**
 * Configuration for profile API operations
 * These are injected at runtime to keep the store platform-agnostic
 */
export interface AuthStoreConfig {
  updateProfileApi?: (data: Partial<User>) => Promise<User>;
  updateAvatarApi?: (avatarRobotId: string) => Promise<User>;
  updateMessageColorApi?: (color: string) => Promise<void>;
  updateLocaleApi?: (locale: 'de-DE' | 'de-AT') => Promise<void>;
  updateIgelModusApi?: (enabled: boolean) => Promise<void>;
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
      selectedMessageColor: user.user_metadata?.chat_color || DEFAULT_AUTH_STATE.selectedMessageColor,
      igelModus: user.igel_modus || false,
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

  updateIgelModus: async (enabled) => {
    if (!storeConfig.updateIgelModusApi) {
      throw new Error('updateIgelModusApi not configured');
    }

    await storeConfig.updateIgelModusApi(enabled);
    set({ igelModus: enabled });

    const currentUser = get().user;
    if (currentUser) {
      set({ user: { ...currentUser, igel_modus: enabled } });
    }
  },
});

export const useAuthStore = create<AuthStore>()(createAuthStoreSlice);

export const getAuthState = (): AuthState => {
  const { user, isAuthenticated, isLoading, error, isLoggingOut, selectedMessageColor, igelModus, locale } = useAuthStore.getState();
  return { user, isAuthenticated, isLoading, error, isLoggingOut, selectedMessageColor, igelModus, locale };
};
