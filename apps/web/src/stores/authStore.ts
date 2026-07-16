import { useUserProfileStore } from '@gruenerator/chat/stores';
import { type UserProfile } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { toast } from '@gruenerator/ui';
import { create } from 'zustand';

import apiClient, { setLoggingOutFlag } from '../components/utils/apiClient';
import { INSTANT_AUTH_CACHE, LOGIN_INTENT, LOGOUT_TIMESTAMP } from '../features/auth/storageKeys';
import { authClient } from '../lib/authClient';
import { sessionDebug } from '../lib/sessionDebug';
import { openDesktopLogin, type AuthSource } from '../utils/desktopAuth';
import { isDesktopApp } from '../utils/platform';

// =============================================================================
// Type Definitions
// =============================================================================

export type SupportedLocale = 'de-DE' | 'de-AT';

export interface UserMetadata {
  chat_color?: string;
  [key: string]: unknown;
}

// User is the canonical UserProfile from @gruenerator/contracts — same Zod
// schema the backend validates at the Better Auth boundary.
export type User = UserProfile;

export interface AuthStateData {
  user: User | null;
  isAuthenticated: boolean;
}

export interface ProfileData {
  display_name?: string;
  email?: string;
  [key: string]: unknown;
}

export interface DeleteAccountConfirmation {
  confirm?: string;
  password?: string;
  confirmation?: string;
}

export interface AuthStore {
  // State
  user: User | null;
  isAuthenticated: boolean;
  // True only when /auth/status (or login flow) has confirmed authentication
  // in the CURRENT page load. Deliberately NOT persisted: every reload starts
  // false and must be re-confirmed by the server before downstream code
  // trusts the cached optimistic state. Prevents the cache-driven redirect
  // loop where stale `isAuthenticated: true` survives a backend session expiry.
  hasServerConfirmed: boolean;
  isLoading: boolean;
  error: string | null;
  isLoggingOut: boolean;
  selectedMessageColor: string;
  locale: SupportedLocale;
  // Actions
  setAuthState: (data: AuthStateData) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setLoggingOut: (loggingOut: boolean) => void;
  clearAuth: (source?: string) => void;
  updateProfile: (profileData: ProfileData) => Promise<ProfileData>;
  updateAvatar: (avatarRobotId: string) => Promise<ProfileData>;
  updateMessageColor: (color: string) => Promise<string>;
  login: (source?: AuthSource) => void;
  setLoginIntent: () => void;
  logout: () => Promise<void>;
  register: () => void;
  deleteAccount: (
    confirmationData?: DeleteAccountConfirmation
  ) => Promise<{ success: boolean; message: string }>;
  sendPasswordResetEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  updatePassword: () => void;
  canManageAccount: () => boolean;
  signup: () => void;
  updateLocale: (newLocale: SupportedLocale) => Promise<boolean>;
}

// Detect browser locale for unauthenticated default
function detectBrowserLocale(): SupportedLocale {
  const languages = navigator?.languages || [navigator?.language];
  for (const lang of languages) {
    if (lang?.startsWith('de-AT')) return 'de-AT';
  }
  return 'de-DE';
}

// Storage key aliases. The literals live in `features/auth/storageKeys.ts` so every
// read/write site shares the same string — see that file for the rationale.
const LOGOUT_TIMESTAMP_KEY = LOGOUT_TIMESTAMP;
const LOGIN_INTENT_KEY = LOGIN_INTENT;

// Helper functions for legacy compatibility (deprecated)
const legacyHelpers = {
  /**
   * Legacy compatibility - beta features are now managed via backend API
   * @deprecated Use authStore.updateBetaFeature directly
   */
  async updateUserBetaFeatures(featureKey: string, isEnabled: boolean): Promise<unknown> {
    // Delegate to new implementation
    const store = useAuthStore.getState();
    return (
      store as unknown as {
        updateBetaFeature?: (key: string, enabled: boolean) => Promise<unknown>;
      }
    ).updateBetaFeature?.(featureKey, isEnabled);
  },

  /**
   * Legacy compatibility - message color is now managed via backend API
   * @deprecated Use authStore.updateMessageColor directly
   */
  async updateUserMessageColor(newColor: string): Promise<string> {
    // Delegate to new implementation
    const store = useAuthStore.getState();
    return store.updateMessageColor(newColor);
  },
};

/**
 * Zustand store for authentication state management
 */
export const useAuthStore = create<AuthStore>((set, get) => ({
  // Auth state — Zustand no longer persists to localStorage. React Query's
  // instant-auth cache (seeded via `initialData` in useAuth) is the single
  // source of truth for a warm start; this store is a pure in-memory mirror,
  // populated by the queryFn's `applyAuthAnswer` → `setAuthState`.
  user: null,
  isAuthenticated: false,
  // Intentionally always false on init — server must reconfirm every load.
  hasServerConfirmed: false,
  isLoading: true,
  error: null,
  isLoggingOut: false, // New state to track logout in progress

  selectedMessageColor: '#008939', // Default Klee

  // Locale/language preference
  locale: detectBrowserLocale(),

  // Main actions
  setAuthState: (data: AuthStateData) => {
    const userLocale: SupportedLocale =
      (data.user?.locale as SupportedLocale) || detectBrowserLocale();

    set({
      user: data.user,
      isAuthenticated: data.isAuthenticated,
      // Any call to setAuthState carries a server-confirmed truth (either
      // from /auth/status or the login flow). Promotes the cached optimistic
      // state to the "verified" tier that downstream consumers trust for
      // sensitive decisions.
      hasServerConfirmed: data.isAuthenticated,
      isLoading: false,
      error: null,
      // Extract color from canonical UserProfile field. The legacy
      // `user_metadata.chat_color` path never matched the real shape — it
      // was reading undefined and falling through to the default. Now we
      // read the actual `chat_color` field typed on the contract.
      selectedMessageColor: data.user?.chat_color || '#008939',
      locale: userLocale,
    });
  },

  setLoading: (isLoading: boolean) => set({ isLoading }),

  setError: (error: string | null) => {
    set({ error, isLoading: false });
  },

  setLoggingOut: (loggingOut: boolean) => set({ isLoggingOut: loggingOut }),

  clearAuth: (source = 'unknown') => {
    sessionDebug('teardown.clearAuth', { source });
    // CRITICAL: Set logout timestamp to prevent immediate re-auth
    localStorage.setItem(LOGOUT_TIMESTAMP_KEY, Date.now().toString());

    // Clear the instant-auth cache used by useInstantAuth() / getCachedAuthState()
    // Without this, LoginPage reads stale cached auth and causes redirect loops.
    localStorage.removeItem(INSTANT_AUTH_CACHE);

    // Clear React Query cache to prevent stale auth data
    if (
      typeof window !== 'undefined' &&
      (
        window as Window & {
          queryClient?: {
            removeQueries: (options: { queryKey: string[] }) => void;
            clear: () => void;
          };
        }
      ).queryClient
    ) {
      const win = window as Window & {
        queryClient: {
          removeQueries: (options: { queryKey: string[] }) => void;
          clear: () => void;
        };
      };
      win.queryClient.removeQueries({ queryKey: ['authStatus'] });
      win.queryClient.clear();
    }

    // user-defaults RQ cache is cleared via win.queryClient.clear() above
    useUserProfileStore.getState().reset();

    // Reset store to default state
    set({
      user: null,
      isAuthenticated: false,
      hasServerConfirmed: false,
      isLoading: false,
      error: null,
      isLoggingOut: false,
      selectedMessageColor: '#008939',
      locale: detectBrowserLocale(),
    });
  },

  // Profile management via typed contracts client
  updateProfile: async (profileData: ProfileData): Promise<ProfileData> => {
    // ProfileData is loosely typed (index signature); pick the fields the
    // contract body declares, guarding the `unknown`-typed values.
    const body: {
      display_name?: string;
      username?: string;
      email?: string;
      custom_prompt?: string;
    } = {};
    if (typeof profileData.display_name === 'string') body.display_name = profileData.display_name;
    if (typeof profileData.username === 'string') body.username = profileData.username;
    if (typeof profileData.email === 'string') body.email = profileData.email;
    if (typeof profileData.custom_prompt === 'string')
      body.custom_prompt = profileData.custom_prompt;

    const res = await getContractsClient().userProfile.updateProfile({ body });
    if (res.status !== 200) {
      throw new Error(`Profil-Update fehlgeschlagen (HTTP ${res.status})`);
    }

    // Update user in store with new profile data
    set((state) => ({
      user: state.user ? { ...state.user, ...res.body.profile } : null,
    }));

    return res.body.profile;
  },

  // Avatar update via typed contracts client
  updateAvatar: async (avatarRobotId: string): Promise<ProfileData> => {
    const res = await getContractsClient().userProfile.updateAvatar({
      body: { avatar_robot_id: Number(avatarRobotId) },
    });
    if (res.status !== 200) {
      throw new Error(`Avatar-Update fehlgeschlagen (HTTP ${res.status})`);
    }

    // Update user in store with new avatar
    set((state) => ({
      user: state.user ? { ...state.user, ...res.body.profile } : null,
    }));

    return res.body.profile;
  },

  // Message color management via typed contracts client
  updateMessageColor: async (color: string): Promise<string> => {
    // Optimistic update
    set({ selectedMessageColor: color });

    try {
      const res = await getContractsClient().userProfile.updateMessageColor({ body: { color } });
      if (res.status !== 200) {
        throw new Error(`Message Color Update fehlgeschlagen (HTTP ${res.status})`);
      }

      return res.body.messageColor;
    } catch (error: unknown) {
      // Revert optimistic update on failure
      const state = get();
      const previousColor = state.user?.chat_color || '#008939';
      set({ selectedMessageColor: previousColor });
      throw error;
    }
  },

  // Auth actions
  login: (source?: AuthSource) => {
    if (isDesktopApp()) {
      // Surface failures instead of swallowing them: a rejected open() (e.g.
      // browser couldn't launch) would otherwise leave the button looking dead.
      openDesktopLogin(source || 'gruenerator-login').catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
        console.error('[AuthStore] Desktop login failed:', error);
        toast.error(`Anmeldung konnte nicht gestartet werden: ${message}`);
      });
    } else {
      // Navigate to SPA login page which shows provider buttons
      window.location.href = source ? `/login?source=${source}` : '/login';
    }
  },

  // Set login intent for conscious login attempts
  setLoginIntent: () => {
    setLoginIntent();
  },

  logout: async () => {
    const state = get();

    // Prevent multiple concurrent logout attempts
    if (state.isLoggingOut) {
      return;
    }

    try {
      sessionDebug('logout.begin', {});
      // Step 1: Set logging out state immediately for smooth UX
      set({ isLoggingOut: true });
      setLoggingOutFlag(true);

      // Step 2: Call backend logout API FIRST (before clearing local state)
      let backendResponse: Record<string, unknown> | null = null;
      try {
        const response = await apiClient.post('/auth/logout');

        backendResponse = response.data as Record<string, unknown> | null;
        console.log('[AuthStore] Backend logout response:', backendResponse);

        // Check if backend logout actually succeeded
        if (backendResponse && !backendResponse.success) {
          console.error('[AuthStore] Backend logout failed:', backendResponse);

          // If backend reports specific session destruction failure, handle it
          if (backendResponse.error === 'session_destruction_failed') {
            console.warn('[AuthStore] Session destruction failed, will need manual recovery');
            // Continue with local cleanup but flag for potential issues
          } else {
            throw new Error(`Backend logout failed: ${backendResponse.message || 'Unknown error'}`);
          }
        }
      } catch (error: unknown) {
        console.error('[AuthStore] Backend logout API error:', error);

        // For network errors, still try to clean up locally but log the issue
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        backendResponse = {
          success: false,
          error: 'network_error',
          message: errorMessage,
          sessionCleared: false,
        };
      }

      // Step 4: Clear local state after backend confirmation (or on backend failure)
      console.log('[AuthStore] Clearing local authentication state...');
      get().clearAuth('logout');

      // Step 5: Handle SSO logout if backend provided logout URL
      const ssoLogoutUrlValue =
        backendResponse?.keycloakBackgroundLogoutUrl ||
        backendResponse?.authentikBackgroundLogoutUrl;
      const ssoLogoutUrl = typeof ssoLogoutUrlValue === 'string' ? ssoLogoutUrlValue : null;
      if (ssoLogoutUrl) {
        console.log('[AuthStore] Performing background SSO logout...');

        // Method 1: Try fetch with no-cors (fire-and-forget)
        try {
          fetch(ssoLogoutUrl, {
            mode: 'no-cors',
            credentials: 'include',
          }).catch((error) => {
            console.warn(
              '[AuthStore] Background SSO logout fetch warning (expected for no-cors):',
              error
            );
          });
        } catch (error) {
          console.warn('[AuthStore] Background SSO logout fetch error:', error);
        }

        // Method 2: Fallback with hidden iframe for better compatibility
        try {
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.src = ssoLogoutUrl;
          document.body.appendChild(iframe);

          // Clean up iframe after SSO logout
          setTimeout(() => {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          }, 3000);
        } catch (error) {
          console.warn('[AuthStore] Background SSO iframe logout error:', error);
        }
      }

      // Step 6: Verify logout completion (optional verification)
      let verifyStillAuthenticated: boolean | undefined;
      try {
        console.log('[AuthStore] Verifying logout completion...');
        const { data: session } = await authClient.getSession({
          query: { disableCookieCache: true },
        });

        verifyStillAuthenticated = !!session?.user;
        if (session?.user) {
          console.warn(
            '[AuthStore] Warning: Still appears authenticated after logout. This may indicate a partial logout.'
          );
          // Note: Don't fail here as this could be due to SSO logout timing
        } else {
          console.log(
            '[AuthStore] Logout verification successful - user is no longer authenticated'
          );
        }
      } catch (error: unknown) {
        console.warn('[AuthStore] Logout verification failed (non-critical):', error);
      }

      sessionDebug('logout.done', {
        backendSuccess: backendResponse?.success !== false,
        ssoLogoutUrl: !!ssoLogoutUrlValue,
        verifyStillAuthenticated,
      });

      // Step 7: Navigate to home page after successful logout
      console.log('[AuthStore] Logout process completed, redirecting to home page');
      window.location.href = '/';
    } catch (error) {
      console.error('[AuthStore] Critical logout error:', error);
      sessionDebug('logout.done', { backendSuccess: false, error: true });

      // Emergency cleanup: Clear local state even if everything else failed
      try {
        get().clearAuth('logout-emergency');
      } catch (cleanupError) {
        console.error('[AuthStore] Emergency cleanup also failed:', cleanupError);
      }

      // Always redirect to home page, even on complete failure
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    } finally {
      // Always reset the logging out state
      set({ isLoggingOut: false });
      setLoggingOutFlag(false);
    }
  },

  // Registration functionality (now handled by Authentik flows)
  register: () => {
    // Deprecated: Registration is now handled through Authentik enrollment flows
  },

  // Account deletion for gruenerator users
  deleteAccount: async (
    confirmationData?: DeleteAccountConfirmation
  ): Promise<{ success: boolean; message: string }> => {
    try {
      // Primary attempt: JSON body via typed contracts client
      const res = await getContractsClient().userProfile.deleteAccount({
        body: confirmationData || {},
      });

      if (res.status !== 200) {
        throw new Error(`Konto-Löschung fehlgeschlagen (HTTP ${res.status})`);
      }

      // Clear local auth state
      get().clearAuth('delete-account');

      return {
        success: true,
        message: res.body.message || 'Konto erfolgreich gelöscht',
      };
    } catch (error: unknown) {
      // Try fallback with query param if the first attempt failed
      if (
        confirmationData &&
        (confirmationData.confirm || confirmationData.password || confirmationData.confirmation)
      ) {
        try {
          const confirmVal = encodeURIComponent(
            confirmationData.confirm ||
              confirmationData.password ||
              confirmationData.confirmation ||
              ''
          );
          const fallbackResponse = await apiClient.delete(
            `/auth/delete-account?confirm=${confirmVal}`,
            {
              headers: { Accept: 'application/json' },
            }
          );

          const fallbackData = fallbackResponse.data as { message?: string } | undefined;

          // Clear local auth state
          get().clearAuth('delete-account-fallback');

          return {
            success: true,
            message: fallbackData?.message || 'Konto erfolgreich gelöscht',
          };
        } catch (fallbackError: unknown) {
          const errorMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : fallbackError && typeof fallbackError === 'object' && 'response' in fallbackError
                ? (fallbackError.response as { data?: { message?: string } })?.data?.message
                : 'Kontolöschung fehlgeschlagen';
          throw {
            success: false,
            message: errorMessage || 'Kontolöschung fehlgeschlagen',
          };
        }
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : error && typeof error === 'object' && 'response' in error
            ? (error.response as { data?: { message?: string } })?.data?.message
            : 'Kontolöschung fehlgeschlagen';
      throw {
        success: false,
        message: errorMessage || 'Kontolöschung fehlgeschlagen',
      };
    }
  },

  // Password reset request for gruenerator users
  sendPasswordResetEmail: async (email: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await apiClient.post('/auth/reset-password', { email });
      const data = response.data as { message?: string };

      return {
        success: true,
        message: data.message || 'Passwort-Reset erfolgreich',
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : error && typeof error === 'object' && 'response' in error
            ? (error.response as { data?: { message?: string } })?.data?.message
            : 'Passwort-Reset fehlgeschlagen';
      throw {
        success: false,
        message: errorMessage || 'Passwort-Reset fehlgeschlagen',
      };
    }
  },

  // Legacy compatibility method (still needed for external SSO users)
  updatePassword: () => {
    // Not supported with Authentik SSO
  },

  // Helper method to check if current user can manage account (smart SSO detection)
  canManageAccount: () => {
    const currentUser = get().user;
    if (!currentUser) return false;

    const authEmail = currentUser.auth_email; // from auth.users
    const hasKeycloakId = !!currentUser.keycloak_id;

    // SSO user with email from IdP = can't change email (managed externally)
    if (hasKeycloakId && authEmail) return false;

    // SSO user without email OR local user = can manage email
    return true;
  },

  // Legacy compatibility (marked as removed)
  signup: () => {
    // Deprecated method
  },

  // Locale management (for backend communication - AI prompts, subtitler, etc.)
  updateLocale: async (newLocale: SupportedLocale): Promise<boolean> => {
    // Validate locale
    if (!['de-DE', 'de-AT'].includes(newLocale)) {
      console.warn('[AuthStore] Invalid locale:', newLocale);
      return false;
    }

    try {
      // Persist via the typed contracts client. When not authenticated the
      // locale is a local-only preference (store update below, no request).
      const state = get();
      if (state.isAuthenticated) {
        const result = await getContractsClient().userProfile.updateLocale({
          body: { locale: newLocale },
        });
        if (result.status !== 200) {
          const body: unknown = result.body;
          const message =
            body &&
            typeof body === 'object' &&
            'message' in body &&
            typeof body.message === 'string'
              ? body.message
              : 'Sprache konnte nicht gespeichert werden.';
          console.error('[AuthStore] Error updating locale:', result.status, message);
          toast.error(message);
          return false;
        }
      }

      // Update store
      set({ locale: newLocale });

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AuthStore] Error updating locale:', errorMessage);
      toast.error('Sprache konnte nicht gespeichert werden.');
      return false;
    }
  },
}));

// Export legacy helpers for backward compatibility
export { legacyHelpers };

// Helper to set login intent (clears logout timestamp)
const setLoginIntent = () => {
  try {
    localStorage.setItem(LOGIN_INTENT_KEY, Date.now().toString());
    localStorage.removeItem(LOGOUT_TIMESTAMP_KEY); // Clear logout timestamp for intentional login
    console.log('[AuthStore] Login intent set, cleared logout timestamp');
  } catch {
    // Ignore localStorage errors
  }
};
