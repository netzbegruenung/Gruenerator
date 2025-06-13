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
        throw updateError;
      }

      return updatedBetaFeatures;
    } catch (err) {
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
        throw updateError;
      }

      return newColor;
    } catch (err) {
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
          betaFeatures: authState.betaFeatures || {},
          selectedMessageColor: authState.selectedMessageColor || '#008939',
          deutschlandmodus: authState.deutschlandmodus || null,
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
        betaFeatures: authState.betaFeatures,
        selectedMessageColor: authState.selectedMessageColor,
        deutschlandmodus: authState.deutschlandmodus,
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
    // Immediately set the session in the Supabase client if available.
    // This is crucial to ensure subsequent requests are authenticated.
    if (data.supabaseSession) {
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
    set({ error, isLoading: false });
  },
  
  setLoggingOut: (loggingOut) => set({ isLoggingOut: loggingOut }),
  
  clearAuth: () => {
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
      
      // Update user in store with new avatar
      set(state => ({
        user: { ...state.user, ...result.profile }
      }));
      
      return result.profile;
    } catch (error) {
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
      
      return result.messageColor;
    } catch (error) {
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
      return;
    }

    try {
      // Try to sign in using the email (this will trigger RLS with the correct user)
      // This works because the user already exists in Supabase auth.users table
      const { data: existingSession } = await templatesSupabase.auth.getSession();
      
      if (existingSession?.session) {
        get().setSupabaseSession(existingSession.session);
        return;
      }

      // If no existing session, try to refresh or get user data directly
      const { data: userData, error: userError } = await templatesSupabase.auth.getUser();
      
      if (!userError && userData?.user) {
        // Sometimes the session exists but getSession doesn't return it immediately
        setTimeout(async () => {
          const { data: retrySession } = await templatesSupabase.auth.getSession();
          if (retrySession?.session) {
            get().setSupabaseSession(retrySession.session);
          }
        }, 1000);
        return;
      }
      
    } catch (error) {
      // Failed to create frontend session fallback
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
      // Failed to initialize Supabase auth
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
      
      // Call logout API and clear state
      fetch(authUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      }).then(response => response.json()).then(data => {
        // Logout API completed
      }).catch(error => {
        // Logout API error (non-blocking)
      });

      // Clear auth state immediately
      get().clearAuth();
      
    } catch (error) {
      // Clear local state even if logout API failed
      get().clearAuth();
    }
  },

  // Registration functionality (now handled by Authentik flows)
  register: () => {
    // Deprecated: Registration is now handled through Authentik enrollment flows
  },

  // Account deletion for gruenerator users
  deleteAccount: async (confirmationData) => {
    try {
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

      // Clear local auth state
      get().clearAuth();
      
      return {
        success: true,
        message: data.message
      };

    } catch (error) {
      throw {
        success: false,
        message: error.message || 'Kontolöschung fehlgeschlagen'
      };
    }
  },

  // Password reset request for gruenerator users
  sendPasswordResetEmail: async (email) => {
    try {
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
    // Deprecated method
  },
}));

// Export helpers for use in other parts of the application
export { supabaseHelpers }; 

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