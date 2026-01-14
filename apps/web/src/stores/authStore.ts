import { create } from 'zustand';
import { fetchWithDedup } from '../utils/requestDeduplication';
import { setLocale } from '../i18n';
import { isDesktopApp } from '../utils/platform';
import { openDesktopLogin, type AuthSource } from '../utils/desktopAuth';
import apiClient from '../components/utils/apiClient';

// =============================================================================
// Type Definitions
// =============================================================================

export type SupportedLocale = 'de-DE' | 'de-AT';

export interface UserMetadata {
  chat_color?: string;
  igel_modus?: boolean;
  [key: string]: unknown;
}

export interface User {
  id: string;
  email?: string;
  auth_email?: string;
  name?: string;
  display_name?: string;
  avatar_robot_id?: string;
  keycloak_id?: string | null;
  igel_modus?: boolean;
  locale?: SupportedLocale;
  user_metadata?: UserMetadata;
  [key: string]: unknown;
}

export interface SupabaseSession {
  access_token?: string;
  refresh_token?: string;
  user?: {
    id: string;
    user_metadata?: UserMetadata;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AuthStateData {
  user: User | null;
  isAuthenticated: boolean;
  supabaseSession?: SupabaseSession | null;
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

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  [key: string]: unknown;
}

interface PersistedAuthState {
  user: User | null;
  isAuthenticated: boolean;
  selectedMessageColor: string;
  igelModus: boolean;
  locale: SupportedLocale;
  isLoading: boolean;
}

export interface AuthStore {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isLoggingOut: boolean;
  selectedMessageColor: string;
  igelModus: boolean;
  locale: SupportedLocale;
  supabaseSession: SupabaseSession | null;
  unsubscribeSupabase: () => void;
  _supabaseAuthCleanup?: (() => void) | null;

  // Actions
  setAuthState: (data: AuthStateData) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setLoggingOut: (loggingOut: boolean) => void;
  clearAuth: () => void;
  setSupabaseSession: (session: SupabaseSession | null) => void;
  updateProfile: (profileData: ProfileData) => Promise<ProfileData>;
  updateAvatar: (avatarRobotId: string) => Promise<ProfileData>;
  updateMessageColor: (color: string) => Promise<string>;
  setIgelModus: (enabled: boolean) => Promise<boolean>;
  handleFailedBackendSession: () => Promise<void>;
  initializeSupabaseAuth: () => Promise<void>;
  cleanupSupabaseAuth: () => void;
  login: (source?: AuthSource) => void;
  setLoginIntent: () => void;
  logout: () => Promise<void>;
  register: () => void;
  deleteAccount: (confirmationData?: DeleteAccountConfirmation) => Promise<{ success: boolean; message: string }>;
  sendPasswordResetEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  updatePassword: () => void;
  canManageAccount: () => boolean;
  signup: () => void;
  updateLocale: (newLocale: SupportedLocale) => Promise<boolean>;
}

// localStorage keys for auth state persistence
const AUTH_STORAGE_KEY = 'gruenerator_auth_state';
const AUTH_CACHE_VERSION = '1.2'; // Increment to invalidate old cache
const AUTH_EXPIRY_TIME = 15 * 60 * 1000; // 15 minutes (increased from 10)
const AUTH_VERSION_KEY = 'gruenerator_auth_cache_version';
const LOGOUT_TIMESTAMP_KEY = 'gruenerator_logout_timestamp';
const LOGOUT_COOLDOWN_TIME = 60 * 1000; // 1 minute cooldown after logout
const LOGIN_INTENT_KEY = 'gruenerator_login_intent';

// Helper functions for legacy compatibility (deprecated)
const legacyHelpers = {
  /**
   * Legacy compatibility - beta features are now managed via backend API
   * @deprecated Use authStore.updateBetaFeature directly
   */
  async updateUserBetaFeatures(featureKey: string, isEnabled: boolean): Promise<unknown> {
    // Delegate to new implementation
    const store = useAuthStore.getState();
    return (store as unknown as { updateBetaFeature?: (key: string, enabled: boolean) => Promise<unknown> }).updateBetaFeature?.(featureKey, isEnabled);
  },

  /**
   * Legacy compatibility - message color is now managed via backend API
   * @deprecated Use authStore.updateMessageColor directly
   */
  async updateUserMessageColor(newColor: string): Promise<string> {
    // Delegate to new implementation
    const store = useAuthStore.getState();
    return store.updateMessageColor(newColor);
  }
};

// Helper to load persisted auth state
const loadPersistedAuthState = (): PersistedAuthState | null => {
  try {
    // Check if user recently logged out
    const logoutTimestamp = localStorage.getItem(LOGOUT_TIMESTAMP_KEY);
    if (logoutTimestamp && Date.now() - parseInt(logoutTimestamp) < LOGOUT_COOLDOWN_TIME) {
      return null;
    }

    // Check cache version first
    const storedVersion = localStorage.getItem(AUTH_VERSION_KEY);
    if (storedVersion !== AUTH_CACHE_VERSION) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.setItem(AUTH_VERSION_KEY, AUTH_CACHE_VERSION);
      return null;
    }

    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const { authState, timestamp, cacheVersion } = JSON.parse(stored) as {
        authState: PersistedAuthState;
        timestamp: number;
        cacheVersion: string;
      };

      // Double-check cache version in stored data
      if (cacheVersion !== AUTH_CACHE_VERSION) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }

      // Check if stored state is still valid (not expired)
      if (timestamp && Date.now() - timestamp < AUTH_EXPIRY_TIME) {
        return {
          user: authState.user,
          isAuthenticated: authState.isAuthenticated,
          selectedMessageColor: authState.selectedMessageColor || '#008939',
          igelModus: authState.igelModus || false,
          locale: authState.locale || 'de-DE',
          isLoading: false, // Don't start in loading state if we have persisted data
        };
      } else {
        // Remove expired data
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_VERSION_KEY);
  }
  return null;
};

// Helper to persist auth state
const persistAuthState = (authState: Partial<AuthStore>): void => {
  try {
    const dataToStore = {
      authState: {
        user: authState.user,
        isAuthenticated: authState.isAuthenticated,
        selectedMessageColor: authState.selectedMessageColor,
        igelModus: authState.igelModus,
        locale: authState.locale,
      },
      timestamp: Date.now(),
      cacheVersion: AUTH_CACHE_VERSION,
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(dataToStore));
    localStorage.setItem(AUTH_VERSION_KEY, AUTH_CACHE_VERSION);
  } catch (error) {
    // If storage is full, try to clear some space
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_VERSION_KEY);
    }
  }
};

// Load initial state from localStorage if available
const persistedState = loadPersistedAuthState();

/**
 * Zustand store for authentication state management
 * Uses Authentik SSO for authentication and Supabase for user metadata/preferences
 */
export const useAuthStore = create<AuthStore>((set, get) => ({
  // Auth state - use persisted state if available, otherwise defaults
  user: persistedState?.user || null,
  isAuthenticated: persistedState?.isAuthenticated || false,
  isLoading: persistedState ? false : true, // Don't start loading if we have persisted data
  error: null,
  isLoggingOut: false, // New state to track logout in progress
  
  selectedMessageColor: persistedState?.selectedMessageColor || '#008939', // Default Klee

  // Igel-Modus (Grüne Jugend membership)
  igelModus: persistedState?.igelModus || false, // Default OFF

  // Locale/language preference
  locale: persistedState?.locale || 'de-DE', // Default to German

  // Supabase specific state
  supabaseSession: null,
  unsubscribeSupabase: () => {}, // Placeholder for cleanup

  // Main actions
  setAuthState: (data: AuthStateData) => {
    const userLocale: SupportedLocale = (data.user?.locale as SupportedLocale) || 'de-DE';

    // Update i18n language when user authenticates
    setLocale(userLocale);

    set({
      user: data.user,
      isAuthenticated: data.isAuthenticated,
      isLoading: false,
      error: null,
      supabaseSession: data.supabaseSession || null,
      // Extract color from user metadata if available
      selectedMessageColor: data.user?.user_metadata?.chat_color || '#008939',
      igelModus: data.user?.igel_modus || false, // Read from profiles table instead of user_metadata
      locale: userLocale,
    });
  },

  setLoading: (isLoading: boolean) => set({ isLoading }),

  setError: (error: string | null) => {
    set({ error, isLoading: false });
  },

  setLoggingOut: (loggingOut: boolean) => set({ isLoggingOut: loggingOut }),
  
  clearAuth: () => {
    // Cleanup Supabase auth listener
    const state = get();
    if (state._supabaseAuthCleanup) {
      state._supabaseAuthCleanup();
    }
    
    // CRITICAL: Set logout timestamp to prevent immediate re-auth
    localStorage.setItem(LOGOUT_TIMESTAMP_KEY, Date.now().toString());
    
    // CRITICAL: Clear ALL persisted auth data to prevent data leakage
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_VERSION_KEY);
    
    // Clear React Query cache to prevent stale auth data
    if (typeof window !== 'undefined' && (window as Window & { queryClient?: { removeQueries: (options: { queryKey: string[] }) => void; clear: () => void } }).queryClient) {
      const win = window as Window & { queryClient: { removeQueries: (options: { queryKey: string[] }) => void; clear: () => void } };
      win.queryClient.removeQueries({ queryKey: ['authStatus'] });
      win.queryClient.clear();
    }
    
    // Legacy cleanup - no longer needed with new auth system
    
    // Reset store to default state
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      isLoggingOut: false,
      selectedMessageColor: '#008939',
      igelModus: false,
      locale: 'de-DE',
      supabaseSession: null,
      _supabaseAuthCleanup: null,
    });

    // Reset i18n to default German when logging out
    setLocale('de-DE');
  },

  // Supabase session management
  setSupabaseSession: (session: SupabaseSession | null) => {
    const user = session?.user || null;
    set({
      supabaseSession: session,
    });

    // Update metadata from Supabase session if available
    if (user?.user_metadata) {
      const metadata = user.user_metadata;
      set((state) => ({
        selectedMessageColor: (metadata.chat_color as string) || state.selectedMessageColor,
        igelModus: metadata.igel_modus ?? state.igelModus,
      }));
    }
  },

  // Profile management via Backend API
  updateProfile: async (profileData: ProfileData): Promise<ProfileData> => {
    const response = await apiClient.put('/auth/profile', profileData);
    const result = response.data as ApiResponse<ProfileData> & { profile?: ProfileData };

    if (!result.success) {
      throw new Error(result.message || 'Profil-Update fehlgeschlagen');
    }

    // Update user in store with new profile data
    set(state => ({
      user: state.user ? { ...state.user, ...result.profile } : null
    }));

    return result.profile as ProfileData;
  },

  // Avatar update via Backend API
  updateAvatar: async (avatarRobotId: string): Promise<ProfileData> => {
    const response = await apiClient.patch('/auth/profile/avatar', { avatar_robot_id: avatarRobotId });
    const result = response.data as ApiResponse<ProfileData> & { profile?: ProfileData };

    if (!result.success) {
      throw new Error(result.message || 'Avatar-Update fehlgeschlagen');
    }

    // Update user in store with new avatar
    set(state => ({
      user: state.user ? { ...state.user, ...result.profile } : null
    }));

    return result.profile as ProfileData;
  },


  // Message color management via Backend API
  updateMessageColor: async (color: string): Promise<string> => {
    // Optimistic update
    set({ selectedMessageColor: color });

    try {
      const response = await apiClient.patch('/auth/profile/message-color', { color });
      const result = response.data as ApiResponse & { messageColor?: string };

      if (!result.success) {
        throw new Error(result.message || 'Message Color Update fehlgeschlagen');
      }

      return result.messageColor as string;
    } catch (error: unknown) {
      // Revert optimistic update on failure
      const state = get();
      const previousColor = state.user?.user_metadata?.chat_color || '#008939';
      set({ selectedMessageColor: previousColor });
      throw error;
    }
  },

  // Igel-Modus (Grüne Jugend membership) management via Backend API
  setIgelModus: async (enabled: boolean): Promise<boolean> => {
    // Optimistic update
    set({ igelModus: enabled });

    try {
      const response = await apiClient.patch('/auth/profile/igel-modus', { igel_modus: enabled });
      const result = response.data as ApiResponse & { igelModus?: boolean };

      if (!result.success) {
        throw new Error(result.message || 'Igel-Modus Update fehlgeschlagen');
      }

      return result.igelModus as boolean;
    } catch (error: unknown) {
      // Revert optimistic update on failure
      set({ igelModus: !enabled });
      throw error;
    }
  },

  // Legacy compatibility methods (deprecated with new auth system)
  handleFailedBackendSession: async () => {
    // No longer needed with new auth system
  },

  initializeSupabaseAuth: async () => {
    // No longer needed with new auth system
  },

  cleanupSupabaseAuth: () => {
    // No longer needed with new auth system
  },

  // Auth actions (these now redirect to backend endpoints)
  login: (source?: AuthSource) => {
    if (isDesktopApp()) {
      openDesktopLogin(source || 'gruenerator-login');
    } else {
      const baseUrl = apiClient.defaults.baseURL || '/api';
      const authUrl = source
        ? `${baseUrl}/auth/login?source=${source}`
        : `${baseUrl}/auth/login`;
      window.location.href = authUrl;
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
      
      // Step 1: Set logging out state immediately for smooth UX
      set({ isLoggingOut: true });
      
      // Step 2: Cleanup Supabase auth listener immediately to prevent state conflicts
      if (state._supabaseAuthCleanup) {
        try {
          state._supabaseAuthCleanup();
        } catch (error) {
        }
      }
      
      // Step 3: Call backend logout API FIRST (before clearing local state)
      let backendResponse: Record<string, unknown> | null = null;
      try {
        const response = await apiClient.post('/auth/logout');

        backendResponse = response.data;
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
          sessionCleared: false
        };
      }
      
      // Step 4: Clear local state after backend confirmation (or on backend failure)
      console.log('[AuthStore] Clearing local authentication state...');
      get().clearAuth();
      
      // Step 5: Handle SSO logout if backend provided logout URL
      const ssoLogoutUrlValue = backendResponse?.keycloakBackgroundLogoutUrl || backendResponse?.authentikBackgroundLogoutUrl;
      const ssoLogoutUrl = typeof ssoLogoutUrlValue === 'string' ? ssoLogoutUrlValue : null;
      if (ssoLogoutUrl) {
        console.log('[AuthStore] Performing background SSO logout...');
        
        // Method 1: Try fetch with no-cors (fire-and-forget)
        try {
          fetch(ssoLogoutUrl, { 
            mode: 'no-cors',
            credentials: 'include'
          }).catch(error => {
            console.warn('[AuthStore] Background SSO logout fetch warning (expected for no-cors):', error);
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
      try {
        console.log('[AuthStore] Verifying logout completion...');
        const statusResponse = await apiClient.get('/auth/status');

        const statusData = statusResponse.data;
        if (statusData.isAuthenticated) {
          console.warn('[AuthStore] Warning: Still appears authenticated after logout. This may indicate a partial logout.');
          // Note: Don't fail here as this could be due to SSO logout timing
        } else {
          console.log('[AuthStore] Logout verification successful - user is no longer authenticated');
        }
      } catch (error: unknown) {
        console.warn('[AuthStore] Logout verification failed (non-critical):', error);
      }
      
      // Step 7: Navigate to home page after successful logout
      console.log('[AuthStore] Logout process completed, redirecting to home page');
      window.location.href = '/';
      
    } catch (error) {
      console.error('[AuthStore] Critical logout error:', error);
      
      // Emergency cleanup: Clear local state even if everything else failed
      try {
        get().clearAuth();
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
    }
  },

  // Registration functionality (now handled by Authentik flows)
  register: () => {
    // Deprecated: Registration is now handled through Authentik enrollment flows
  },

  // Account deletion for gruenerator users
  deleteAccount: async (confirmationData?: DeleteAccountConfirmation): Promise<{ success: boolean; message: string }> => {
    try {
      // Primary attempt: JSON body
      const response = await apiClient.delete('/auth/delete-account', {
        data: confirmationData || {},
        headers: {
          'Accept': 'application/json',
        },
      });

      const data = response.data;

      // Clear local auth state
      get().clearAuth();

      return {
        success: true,
        message: (data && data.message) || 'Konto erfolgreich gelöscht',
      };

    } catch (error: unknown) {
      // Try fallback with query param if the first attempt failed
      if (confirmationData && (confirmationData.confirm || confirmationData.password || confirmationData.confirmation)) {
        try {
          const confirmVal = encodeURIComponent(
            confirmationData.confirm || confirmationData.password || confirmationData.confirmation || ''
          );
          const fallbackResponse = await apiClient.delete(`/auth/delete-account?confirm=${confirmVal}`, {
            headers: { 'Accept': 'application/json' },
          });

          const fallbackData = fallbackResponse.data;

          // Clear local auth state
          get().clearAuth();

          return {
            success: true,
            message: (fallbackData && fallbackData.message) || 'Konto erfolgreich gelöscht',
          };
        } catch (fallbackError: unknown) {
          const errorMessage = fallbackError instanceof Error
            ? fallbackError.message
            : (fallbackError && typeof fallbackError === 'object' && 'response' in fallbackError
              ? (fallbackError.response as { data?: { message?: string } })?.data?.message
              : 'Kontolöschung fehlgeschlagen');
          throw {
            success: false,
            message: errorMessage || 'Kontolöschung fehlgeschlagen',
          };
        }
      }

      const errorMessage = error instanceof Error
        ? error.message
        : (error && typeof error === 'object' && 'response' in error
          ? (error.response as { data?: { message?: string } })?.data?.message
          : 'Kontolöschung fehlgeschlagen');
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
        message: data.message || 'Passwort-Reset erfolgreich'
      };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : (error && typeof error === 'object' && 'response' in error
          ? (error.response as { data?: { message?: string } })?.data?.message
          : 'Passwort-Reset fehlgeschlagen');
      throw {
        success: false,
        message: errorMessage || 'Passwort-Reset fehlgeschlagen'
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

  // Locale management
  updateLocale: async (newLocale: SupportedLocale): Promise<boolean> => {
    // Validate locale
    if (!['de-DE', 'de-AT'].includes(newLocale)) {
      console.warn('[AuthStore] Invalid locale:', newLocale);
      return false;
    }

    try {
      // Update backend if user is authenticated
      const state = get();
      if (state.isAuthenticated) {
        await apiClient.put('/auth/locale', { locale: newLocale });
      }

      // Update i18n
      setLocale(newLocale);

      // Update store
      set({ locale: newLocale });

      return true;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : (error && typeof error === 'object' && 'response' in error
          ? (error.response as { data?: { error?: string } })?.data?.error
          : 'Unknown error');
      console.error('[AuthStore] Error updating locale:', errorMessage);
      return false;
    }
  },
}));

// Export legacy helpers for backward compatibility
export { legacyHelpers as supabaseHelpers }; 

// Subscribe to changes and persist them to localStorage
useAuthStore.subscribe((state) => {
  // Only persist if the user is authenticated to avoid overwriting with null
  if (state.isAuthenticated && state.user) {
    persistAuthState(state);
  }
});

// Legacy initialization - no longer needed with new auth system
// Auth state is now managed via backend API calls in useAuth hook

// Helper to set login intent (clears logout timestamp)
const setLoginIntent = () => {
  try {
    localStorage.setItem(LOGIN_INTENT_KEY, Date.now().toString());
    localStorage.removeItem(LOGOUT_TIMESTAMP_KEY); // Clear logout timestamp for intentional login
    console.log('[AuthStore] Login intent set, cleared logout timestamp');
  } catch (error) {
    // Ignore localStorage errors
  }
};
