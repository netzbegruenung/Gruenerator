import { create } from 'zustand';
import { fetchWithDedup } from '../utils/requestDeduplication';
import { setLocale } from '../i18n';

// Auth Backend URL aus Environment Variable oder Fallback zu relativem Pfad
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
   */
  async updateUserBetaFeatures(featureKey, isEnabled) {
    // Delegate to new implementation
    const store = useAuthStore.getState();
    return store.updateBetaFeature(featureKey, isEnabled);
  },

  /**
   * Legacy compatibility - message color is now managed via backend API
   */
  async updateUserMessageColor(newColor) {
    // Delegate to new implementation
    const store = useAuthStore.getState();
    return store.updateMessageColor(newColor);
  }
};

// Helper to load persisted auth state
const loadPersistedAuthState = () => {
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
      const { authState, timestamp, cacheVersion } = JSON.parse(stored);
      
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
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(AUTH_VERSION_KEY);
  }
  return null;
};

// Helper to persist auth state
const persistAuthState = (authState) => {
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
    if (error.name === 'QuotaExceededError') {
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
export const useAuthStore = create((set, get) => ({
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
  setAuthState: (data) => {
    const userLocale = data.user?.locale || 'de-DE';

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

  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => {
    set({ error, isLoading: false });
  },
  
  setLoggingOut: (loggingOut) => set({ isLoggingOut: loggingOut }),
  
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
    if (typeof window !== 'undefined' && window.queryClient) {
      window.queryClient.removeQueries({ queryKey: ['authStatus'] });
      window.queryClient.clear();
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
  setSupabaseSession: (session) => {
    const user = session?.user || null;
    set({ 
      supabaseSession: session,
    });
    
    // Update metadata from Supabase session if available
    if (user?.user_metadata) {
      const metadata = user.user_metadata;
      set((state) => ({
        selectedMessageColor: metadata.chat_color || state.selectedMessageColor,
        igelModus: metadata.igel_modus ?? state.igelModus,
      }));
    }
  },

  // Profile management via Backend API
  updateProfile: async (profileData) => {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/auth/profile`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(profileData)
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Profil-Update fehlgeschlagen');
      }
      
      // Update user in store with new profile data
      set(state => ({
        user: { ...state.user, ...result.profile }
      }));
      
      return result.profile;
    } catch (error) {
      throw error;
    }
  },

  // Avatar update via Backend API
  updateAvatar: async (avatarRobotId) => {
    try {
      const response = await fetch(`${AUTH_BASE_URL}/auth/profile/avatar`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ avatar_robot_id: avatarRobotId })
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Avatar-Update fehlgeschlagen');
      }
      
      // Update user in store with new avatar
      set(state => ({
        user: { ...state.user, ...result.profile }
      }));
      
      return result.profile;
    } catch (error) {
      throw error;
    }
  },


  // Message color management via Backend API
  updateMessageColor: async (color) => {
    // Optimistic update
    set({ selectedMessageColor: color });

    try {
      const response = await fetch(`${AUTH_BASE_URL}/auth/profile/message-color`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ color })
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Message Color Update fehlgeschlagen');
      }
      
      return result.messageColor;
    } catch (error) {
      // Revert optimistic update on failure
      const state = get();
      const previousColor = state.user?.user_metadata?.chat_color || '#008939';
      set({ selectedMessageColor: previousColor });
      throw error;
    }
  },

  // Igel-Modus (Grüne Jugend membership) management via Backend API
  setIgelModus: async (enabled) => {
    // Optimistic update
    set({ igelModus: enabled });

    try {
      const response = await fetch(`${AUTH_BASE_URL}/auth/profile/igel-modus`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ igel_modus: enabled })
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Igel-Modus Update fehlgeschlagen');
      }
      
      return result.igelModus;
    } catch (error) {
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
  login: () => {
    const authUrl = `${AUTH_BASE_URL}/auth/login`;
    window.location.href = authUrl;
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
      const authUrl = `${AUTH_BASE_URL}/auth/logout`;
      
      let backendResponse = null;
      try {
        const response = await fetchWithDedup('logout', () => fetch(authUrl, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        }));
        
        backendResponse = await response.json();
        console.log('[AuthStore] Backend logout response:', backendResponse);
        
        // Check if backend logout actually succeeded
        if (!response.ok || !backendResponse.success) {
          console.error('[AuthStore] Backend logout failed:', backendResponse);
          
          // If backend reports specific session destruction failure, handle it
          if (backendResponse.error === 'session_destruction_failed') {
            console.warn('[AuthStore] Session destruction failed, will need manual recovery');
            // Continue with local cleanup but flag for potential issues
          } else {
            throw new Error(`Backend logout failed: ${backendResponse.message || 'Unknown error'}`);
          }
        }
        
      } catch (error) {
        console.error('[AuthStore] Backend logout API error:', error);
        
        // For network errors, still try to clean up locally but log the issue
        backendResponse = {
          success: false,
          error: 'network_error',
          message: error.message,
          sessionCleared: false
        };
      }
      
      // Step 4: Clear local state after backend confirmation (or on backend failure)
      console.log('[AuthStore] Clearing local authentication state...');
      get().clearAuth();
      
      // Step 5: Handle SSO logout if backend provided logout URL
      const ssoLogoutUrl = backendResponse?.keycloakBackgroundLogoutUrl || backendResponse?.authentikBackgroundLogoutUrl;
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
        const statusResponse = await fetch(`${AUTH_BASE_URL}/auth/status`, {
          credentials: 'include',
          method: 'GET'
        });
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          if (statusData.isAuthenticated) {
            console.warn('[AuthStore] Warning: Still appears authenticated after logout. This may indicate a partial logout.');
            // Note: Don't fail here as this could be due to SSO logout timing
          } else {
            console.log('[AuthStore] Logout verification successful - user is no longer authenticated');
          }
        }
      } catch (error) {
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
  deleteAccount: async (confirmationData) => {
    const authUrl = `${AUTH_BASE_URL}/auth/delete-account`;

    // Helper: try to parse JSON, gracefully fallback to text/empty
    const parseResponse = async (response) => {
      try {
        if (response.status === 204) return { data: null };
        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();
        if (!text) return { data: null };
        if (contentType.includes('application/json')) {
          return { data: JSON.parse(text) };
        }
        // Not JSON – return raw text for diagnostics
        return { data: { raw: text } };
      } catch (e) {
        // Parsing failed – treat as no data
        return { data: null };
      }
    };

    // Helper: perform a DELETE request and parse response safely
    const doDelete = async (url, options) => {
      const response = await fetch(url, options);
      const { data } = await parseResponse(response);
      return { response, data };
    };

    try {
      // Primary attempt: JSON body (some servers accept bodies for DELETE)
      let { response, data } = await doDelete(authUrl, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(confirmationData || {}),
      });

      // Fallback: if not OK, try query param (for servers not accepting DELETE bodies)
      if (!response.ok && confirmationData && (confirmationData.confirm || confirmationData.password || confirmationData.confirmation)) {
        const confirmVal = encodeURIComponent(
          confirmationData.confirm || confirmationData.password || confirmationData.confirmation
        );
        ({ response, data } = await doDelete(`${authUrl}?confirm=${confirmVal}`, {
          method: 'DELETE',
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        }));
      }

      const contentType = response.headers.get('content-type') || '';
      const isHtml = contentType.includes('text/html') || (data && typeof data.raw === 'string' && data.raw.trim().startsWith('<!DOCTYPE'));

      if (!response.ok || isHtml) {
        const message = (data && (data.message || data.error)) || 'Kontolöschung fehlgeschlagen';
        throw new Error(message);
      }

      // Clear local auth state
      get().clearAuth();

      return {
        success: true,
        message: (data && data.message) || 'Konto erfolgreich gelöscht',
      };

    } catch (error) {
      throw {
        success: false,
        message: error?.message || 'Kontolöschung fehlgeschlagen',
      };
    }
  },

  // Password reset request for gruenerator users
  sendPasswordResetEmail: async (email) => {
    try {
      const authUrl = `${AUTH_BASE_URL}/auth/reset-password`;
      const response = await fetch(authUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Passwort-Reset fehlgeschlagen');
      }

      return {
        success: true,
        message: data.message
      };

    } catch (error) {
      throw {
        success: false,
        message: error.message || 'Passwort-Reset fehlgeschlagen'
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
  updateLocale: async (newLocale) => {
    // Validate locale
    if (!['de-DE', 'de-AT'].includes(newLocale)) {
      console.warn('[AuthStore] Invalid locale:', newLocale);
      return false;
    }

    try {
      // Update backend if user is authenticated
      const state = get();
      if (state.isAuthenticated) {
        const response = await fetch(`${AUTH_BASE_URL}/auth/locale`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ locale: newLocale })
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('[AuthStore] Failed to update locale on backend:', errorData.error);
          return false;
        }
      }

      // Update i18n
      setLocale(newLocale);

      // Update store
      set({ locale: newLocale });

      return true;
    } catch (error) {
      console.error('[AuthStore] Error updating locale:', error);
      return false;
    }
  },
}));

// Export legacy helpers for backward compatibility
export { legacyHelpers as supabaseHelpers }; 

// Subscribe to changes and persist them to localStorage
useAuthStore.subscribe(
  (state) => {
    // Only persist if the user is authenticated to avoid overwriting with null
    if (state.isAuthenticated && state.user) {
      persistAuthState(state);
    }
  },
  (state) => ({
    user: state.user,
    isAuthenticated: state.isAuthenticated,
    selectedMessageColor: state.selectedMessageColor,
    igelModus: state.igelModus,
    locale: state.locale,
  })
);

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
