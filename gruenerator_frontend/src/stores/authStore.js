import { create } from 'zustand';
import { templatesSupabase } from '../components/utils/templatesSupabaseClient';
import { fetchWithDedup } from '../utils/requestDeduplication';
import { setTemplatesSupabaseSession } from '../components/utils/templatesSupabaseClient.js';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

// localStorage keys for auth state persistence
const AUTH_STORAGE_KEY = 'gruenerator_auth_state';
const AUTH_CACHE_VERSION = '1.2'; // Increment to invalidate old cache
const AUTH_EXPIRY_TIME = 15 * 60 * 1000; // 15 minutes (increased from 10)
const AUTH_VERSION_KEY = 'gruenerator_auth_cache_version';

// Helper functions for Supabase operations (extracted from SupabaseAuthContext)
const supabaseHelpers = {
  /**
   * Update user beta features in Supabase user metadata
   */
  async updateUserBetaFeatures(featureKey, isEnabled, currentUser) {
    if (!currentUser || !templatesSupabase) {
      throw new Error("User not logged in or Supabase not available");
    }

    try {
      // Get current user metadata
      const { data: userData, error: fetchError } = await templatesSupabase
        .from('auth.users')
        .select('raw_user_meta_data')
        .eq('id', currentUser.id)
        .single();

      if (fetchError) {
        console.error("Error fetching user metadata:", fetchError);
        throw fetchError;
      }

      // Update beta features in metadata
      const currentMetadata = userData.raw_user_meta_data || {};
      const currentBetaFeatures = currentMetadata.beta_features || {};
      const updatedBetaFeatures = { 
        ...currentBetaFeatures, 
        [featureKey]: isEnabled 
      };

      const updatedMetadata = {
        ...currentMetadata,
        beta_features: updatedBetaFeatures
      };

      // Update in database
      const { error: updateError } = await templatesSupabase
        .from('auth.users')
        .update({ raw_user_meta_data: updatedMetadata })
        .eq('id', currentUser.id);

      if (updateError) {
        console.error("Error updating user beta features in Supabase:", updateError);
        throw updateError;
      }

      return updatedBetaFeatures;
    } catch (err) {
      console.error("Failed to update beta features:", err);
      throw err;
    }
  },

  /**
   * Update user message color in Supabase user metadata
   */
  async updateUserMessageColor(newColor, currentUser) {
    if (!currentUser || !templatesSupabase) {
      throw new Error("User not logged in or Supabase not available");
    }

    try {
      // Get current user metadata
      const { data: userData, error: fetchError } = await templatesSupabase
        .from('auth.users')
        .select('raw_user_meta_data')
        .eq('id', currentUser.id)
        .single();

      if (fetchError) {
        console.error("Error fetching user metadata:", fetchError);
        throw fetchError;
      }

      // Update chat color in metadata
      const currentMetadata = userData.raw_user_meta_data || {};
      const updatedMetadata = {
        ...currentMetadata,
        chat_color: newColor
      };

      // Update in database
      const { error: updateError } = await templatesSupabase
        .from('auth.users')
        .update({ raw_user_meta_data: updatedMetadata })
        .eq('id', currentUser.id);
      
      if (updateError) {
        console.error("Error updating user message color in Supabase:", updateError);
        throw updateError;
      }

      return newColor;
    } catch (err) {
      console.error("Failed to update message color:", err);
      throw err;
    }
  },

  /**
   * Sync user session from Supabase (if using templates database)
   */
  async getSupabaseSession() {
    if (!templatesSupabase) {
      return null;
    }

    try {
      const { data: { session }, error } = await templatesSupabase.auth.getSession();
      if (error) throw error;
      return session;
    } catch (err) {
      console.error('Error getting Supabase session:', err);
      return null;
    }
  },

  /**
   * Set up Supabase auth state change listener
   */
  setupSupabaseAuthListener(callback) {
    if (!templatesSupabase) {
      return () => {}; // Return empty cleanup function
    }

    const { data: { subscription } } = templatesSupabase.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }
};

// Helper to load persisted auth state
const loadPersistedAuthState = () => {
  try {
    // Check cache version first
    const storedVersion = localStorage.getItem(AUTH_VERSION_KEY);
    if (storedVersion !== AUTH_CACHE_VERSION) {
      console.log('[AuthStore] Cache version mismatch, clearing auth cache');
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
        console.log('[AuthStore] Loading persisted auth state');
        return {
          user: authState.user,
          isAuthenticated: authState.isAuthenticated,
          betaFeatures: authState.betaFeatures || {},
          selectedMessageColor: authState.selectedMessageColor || '#008939',
          deutschlandmodus: authState.deutschlandmodus || null,
          isLoading: false, // Don't start in loading state if we have persisted data
        };
      } else {
        // Remove expired data
        console.log('[AuthStore] Cached auth state expired');
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  } catch (error) {
    console.warn('[AuthStore] Error loading persisted auth state:', error);
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
        betaFeatures: authState.betaFeatures,
        selectedMessageColor: authState.selectedMessageColor,
        deutschlandmodus: authState.deutschlandmodus,
      },
      timestamp: Date.now(),
      cacheVersion: AUTH_CACHE_VERSION,
    };
    
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(dataToStore));
    localStorage.setItem(AUTH_VERSION_KEY, AUTH_CACHE_VERSION);
    
    console.log('[AuthStore] Auth state persisted successfully');
  } catch (error) {
    console.warn('[AuthStore] Error persisting auth state:', error);
    // If storage is full, try to clear some space
    if (error.name === 'QuotaExceededError') {
      console.log('[AuthStore] Storage quota exceeded, clearing old data');
      localStorage.removeItem(AUTH_STORAGE_KEY);
      localStorage.removeItem(AUTH_VERSION_KEY);
    }
  }
};

// Load initial state from localStorage if available
const persistedState = loadPersistedAuthState();

// Debounce system for beta feature updates
let betaFeatureUpdateTimeout = null;
let pendingBetaUpdates = {};

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
  
  // Beta features and other user metadata
  betaFeatures: persistedState?.betaFeatures || {},
  selectedMessageColor: persistedState?.selectedMessageColor || '#008939', // Default Klee
  deutschlandmodus: persistedState?.deutschlandmodus || null,

  // Supabase specific state
  supabaseSession: null,
  unsubscribeSupabase: () => {}, // Placeholder for cleanup

  // Main actions
  setAuthState: (data) => {
    console.log('[AuthStore DEBUG] setAuthState called with:', { 
      user: data.user ? `User with ID ${data.user.id}` : null,
      isAuthenticated: data.isAuthenticated 
    });

    // Immediately set the session in the Supabase client if available.
    // This is crucial to ensure subsequent requests are authenticated.
    if (data.supabaseSession) {
      console.log('[AuthStore] Setting Supabase session in client to authenticate requests.');
      setTemplatesSupabaseSession(data.supabaseSession);
    }

    set({
      user: data.user,
      isAuthenticated: data.isAuthenticated,
      isLoading: false,
      error: null,
      supabaseSession: data.supabaseSession || null,
      // Extract beta features and color from user metadata if available
      betaFeatures: data.user?.user_metadata?.beta_features || {},
      selectedMessageColor: data.user?.user_metadata?.chat_color || '#008939',
      deutschlandmodus: data.user?.user_metadata?.deutschlandmodus || null,
    });
  },

  setLoading: (isLoading) => set({ isLoading }),
  
  setError: (error) => {
    console.log('[AuthStore DEBUG] setError called with:', error);
    set({ error, isLoading: false });
  },
  
  setLoggingOut: (loggingOut) => set({ isLoggingOut: loggingOut }),
  
  clearAuth: () => {
    console.log('[AuthStore DEBUG] clearAuth called.');
    
    // Cleanup Supabase auth listener
    const state = get();
    if (state._supabaseAuthCleanup) {
      state._supabaseAuthCleanup();
    }
    
    // Clear persisted state
    localStorage.removeItem(AUTH_STORAGE_KEY);
    
    // Reset store to default state
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      isLoggingOut: false,
      betaFeatures: {},
      selectedMessageColor: '#008939',
      deutschlandmodus: null,
      supabaseSession: null,
      _supabaseAuthCleanup: null,
    });
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
        betaFeatures: metadata.beta_features || state.betaFeatures,
        selectedMessageColor: metadata.chat_color || state.selectedMessageColor,
        deutschlandmodus: metadata.deutschlandmodus ?? state.deutschlandmodus,
      }));
    }
  },

  // Profile management via Backend API
  updateProfile: async (profileData) => {
    try {
      console.log('[AuthStore] Updating profile via backend API:', profileData);
      
      const response = await fetch(`${AUTH_BASE_URL}/api/auth/profile`, {
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
      
      console.log('[AuthStore] Profile updated successfully:', result.profile);
      
      // Update user in store with new profile data
      set(state => ({
        user: { ...state.user, ...result.profile }
      }));
      
      return result.profile;
    } catch (error) {
      console.error('[AuthStore] Profile update failed:', error);
      throw error;
    }
  },

  // Avatar update via Backend API
  updateAvatar: async (avatarRobotId) => {
    try {
      console.log('[AuthStore] Updating avatar via backend API:', avatarRobotId);
      
      const response = await fetch(`${AUTH_BASE_URL}/api/auth/profile/avatar`, {
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
      
      console.log('[AuthStore] Avatar updated successfully:', result.profile);
      
      // Update user in store with new avatar
      set(state => ({
        user: { ...state.user, ...result.profile }
      }));
      
      return result.profile;
    } catch (error) {
      console.error('[AuthStore] Avatar update failed:', error);
      throw error;
    }
  },

  // Beta features management via Backend API
  updateBetaFeatures: (features) => set((state) => ({
    betaFeatures: { ...state.betaFeatures, ...features }
  })),

  updateBetaFeature: async (key, value, immediate = false) => {
    const dedupKey = `${key}_${immediate}`;
    
    // Optimistic Update
    set(state => ({ betaFeatures: { ...state.betaFeatures, [key]: value } }));
    
    // Use backend API instead of direct Supabase calls
    return fetchWithDedup(dedupKey, async () => {
      try {
        console.log(`[AuthStore] Updating beta feature '${key}' to ${value} via backend API`);
        
        const response = await fetch(`${AUTH_BASE_URL}/api/auth/profile/beta-features`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ feature: key, enabled: value })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Beta Feature Update fehlgeschlagen');
        }
        
        console.log(`[AuthStore] Beta feature '${key}' updated to ${value} successfully`);
        
        // Update beta features in store
        set(state => ({
          betaFeatures: result.betaFeatures
        }));
        
        // Invalidate React Query cache for beta features
        if (typeof window !== 'undefined' && window.queryClient) {
          window.queryClient.invalidateQueries({ queryKey: ['betaFeatures'] });
        }
        
        return result.betaFeatures;
      } catch (error) {
        console.error(`[AuthStore] Failed to update beta feature '${key}':`, error);
        // Revert on error
        set(state => ({ betaFeatures: { ...state.betaFeatures, [key]: !value } }));
        throw error;
      }
    });
  },

  // Message color management via Backend API
  updateMessageColor: async (color) => {
    // Optimistic update
    set({ selectedMessageColor: color });

    try {
      console.log(`[AuthStore] Updating message color to ${color} via backend API`);
      
      const response = await fetch(`${AUTH_BASE_URL}/api/auth/profile/message-color`, {
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
      
      console.log(`[AuthStore] Message color updated to ${color} successfully`);
      
      return result.messageColor;
    } catch (error) {
      console.error(`[AuthStore] Failed to update message color:`, error);
      // Revert optimistic update on failure
      const state = get();
      const previousColor = state.user?.user_metadata?.chat_color || '#008939';
      set({ selectedMessageColor: previousColor });
      throw error;
    }
  },

  // Handle failed backend session creation with frontend fallback
  handleFailedBackendSession: async (user) => {
    if (!templatesSupabase || !user?.email) {
      console.warn('[AuthStore] Cannot create frontend session: missing Supabase client or user email');
      return;
    }

    try {
      console.log('[AuthStore] Attempting to sign in to Supabase directly:', user.email);
      
      // Try to sign in using the email (this will trigger RLS with the correct user)
      // This works because the user already exists in Supabase auth.users table
      const { data: existingSession } = await templatesSupabase.auth.getSession();
      
      if (existingSession?.session) {
        console.log('[AuthStore] Found existing Supabase session');
        get().setSupabaseSession(existingSession.session);
        return;
      }

      // If no existing session, try to refresh or get user data directly
      const { data: userData, error: userError } = await templatesSupabase.auth.getUser();
      
      if (!userError && userData?.user) {
        console.log('[AuthStore] Supabase user found, session should be active');
        // Sometimes the session exists but getSession doesn't return it immediately
        setTimeout(async () => {
          const { data: retrySession } = await templatesSupabase.auth.getSession();
          if (retrySession?.session) {
            get().setSupabaseSession(retrySession.session);
          }
        }, 1000);
        return;
      }

      console.log('[AuthStore] No active Supabase session found, user may need to authenticate with Supabase separately');
      
    } catch (error) {
      console.error('[AuthStore] Frontend Supabase session fallback failed:', error);
    }
  },

  // Initialize Supabase auth state (call this after Authentik auth is established)
  initializeSupabaseAuth: async () => {
    try {
      const session = await supabaseHelpers.getSupabaseSession();
      
      if (session) {
        get().setSupabaseSession(session);
        
        // Update user metadata from Supabase session
        const user = session.user;
        if (user?.user_metadata) {
          set((state) => ({
            betaFeatures: user.user_metadata.beta_features || state.betaFeatures,
            selectedMessageColor: user.user_metadata.chat_color || state.selectedMessageColor,
            deutschlandmodus: user.user_metadata.deutschlandmodus ?? state.deutschlandmodus,
          }));
        }
      }

      // Set up auth state change listener
      const cleanup = supabaseHelpers.setupSupabaseAuthListener((event, session) => {
        console.log('[AuthStore] Supabase auth state changed:', event);
        get().setSupabaseSession(session);
        
        if (session?.user?.user_metadata) {
          const metadata = session.user.user_metadata;
          set((state) => ({
            betaFeatures: metadata.beta_features || state.betaFeatures,
            selectedMessageColor: metadata.chat_color || state.selectedMessageColor,
            deutschlandmodus: metadata.deutschlandmodus ?? state.deutschlandmodus,
          }));
        }
      });

      // Store cleanup function for later use
      set({ _supabaseAuthCleanup: cleanup });

    } catch (error) {
      console.error('[AuthStore] Failed to initialize Supabase auth:', error);
    }
  },

  // Cleanup Supabase auth listener
  cleanupSupabaseAuth: () => {
    const state = get();
    if (state._supabaseAuthCleanup) {
      state._supabaseAuthCleanup();
      set({ _supabaseAuthCleanup: null });
    }
  },

  // Auth actions (these now redirect to backend endpoints)
  login: () => {
    const authUrl = `${AUTH_BASE_URL}/api/auth/login`;
    console.log(`[AuthStore] Redirecting to login: ${authUrl}`);
    window.location.href = authUrl;
  },

  logout: async () => {
    try {
      // Set logging out state immediately for smooth UX
      get().setLoggingOut(true);
      
      // Cleanup Supabase auth listener
      get().cleanupSupabaseAuth();
      
      // Start logout API call but don't wait for it
      const authUrl = `${AUTH_BASE_URL}/api/auth/logout`;
      console.log(`[AuthStore] Calling logout API: ${authUrl}`);
      
      // Call logout API and clear state
      fetch(authUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }).then(response => response.json()).then(data => {
        console.log('[AuthStore] Logout API completed:', data);
      }).catch(error => {
        console.warn('[AuthStore] Logout API error (non-blocking):', error);
      });

      // Clear auth state immediately
      console.log('[AuthStore] Clearing auth state without redirect...');
      get().clearAuth();
      
    } catch (error) {
      console.error('[AuthStore] Logout error:', error);
      // Clear local state even if logout API failed
      get().clearAuth();
    }
  },

  // Registration functionality (now handled by Authentik flows)
  register: () => {
    console.warn('[AuthStore] register() is deprecated. Registration is now handled through Authentik enrollment flows.');
    console.warn('[AuthStore] Use the registration page that redirects to Authentik instead.');
  },

  // Account deletion for gruenerator users
  deleteAccount: async (confirmationData) => {
    try {
      console.log(`[AuthStore] Deleting account for user: ${get().user?.email}`);
      
      const authUrl = `${AUTH_BASE_URL}/api/auth/delete-account`;
      const response = await fetch(authUrl, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(confirmationData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Kontolöschung fehlgeschlagen');
      }

      console.log('[AuthStore] Account deletion successful');
      
      // Clear local auth state
      get().clearAuth();
      
      return {
        success: true,
        message: data.message
      };

    } catch (error) {
      console.error('[AuthStore] Account deletion error:', error);
      throw {
        success: false,
        message: error.message || 'Kontolöschung fehlgeschlagen'
      };
    }
  },

  // Password reset request for gruenerator users
  sendPasswordResetEmail: async (email) => {
    try {
      console.log(`[AuthStore] Requesting password reset for: ${email}`);
      
      const authUrl = `${AUTH_BASE_URL}/api/auth/reset-password`;
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

      console.log('[AuthStore] Password reset email requested');
      
      return {
        success: true,
        message: data.message
      };

    } catch (error) {
      console.error('[AuthStore] Password reset error:', error);
      throw {
        success: false,
        message: error.message || 'Passwort-Reset fehlgeschlagen'
      };
    }
  },

  // Legacy compatibility method (still needed for external SSO users)
  updatePassword: () => {
    console.warn('updatePassword is not supported with Authentik SSO. Use your identity provider or password reset flow.');
  },

  // Helper method to check if current user can register/delete account
  canManageAccount: () => {
    const state = get();
    if (!state.user) return false;
    
    // Check if user is from gruenerator source
    // This could be enhanced with server-side verification
    const userMetadata = state.user?.user_metadata || {};
    return userMetadata.source === 'gruenerator-login' || 
           userMetadata.registration_source === 'gruenerator';
  },

  // Legacy compatibility (marked as removed)
  signup: () => {
    console.warn('signup is deprecated. Use register() method instead.');
  },
}));

// Export helpers for use in other parts of the application
export { supabaseHelpers }; 

// Subscribe to changes and persist them to localStorage
useAuthStore.subscribe(
  (state) => {
    console.log('[AuthStore DEBUG] Subscription triggered. IsAuthenticated:', state.isAuthenticated);
    // Only persist if the user is authenticated to avoid overwriting with null
    if (state.isAuthenticated && state.user) {
      console.log(`[AuthStore DEBUG] Persisting state for user ${state.user.id}`);
      persistAuthState(state);
    } else {
      console.log('[AuthStore DEBUG] Skipping persistence: user not authenticated or null.');
    }
  },
  (state) => ({ 
    user: state.user, 
    isAuthenticated: state.isAuthenticated,
    betaFeatures: state.betaFeatures,
    selectedMessageColor: state.selectedMessageColor,
    deutschlandmodus: state.deutschlandmodus,
  })
);

// Initialize Supabase listener when the store is created
const initialize = () => {
  const { initializeSupabaseAuth } = useAuthStore.getState();
  initializeSupabaseAuth();
};
initialize();