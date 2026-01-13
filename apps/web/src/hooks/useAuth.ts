import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore, type AuthStore } from '../stores/authStore';
import apiClient from '../components/utils/apiClient';
import type { AxiosRequestConfig } from 'axios';

// Extend axios config to allow skipAuthRedirect
interface ExtendedAxiosRequestConfig extends AxiosRequestConfig {
  skipAuthRedirect?: boolean;
}

interface AuthOptions {
  skipAuth?: boolean;
  lazy?: boolean;
  instant?: boolean;
}

interface AuthData {
  isAuthenticated: boolean;
  user?: Record<string, unknown>;
  supabaseSession?: Record<string, unknown>;
}

interface PartialLogoutState {
  isPartialLogout: boolean;
  needsRecovery?: boolean;
  frontendState?: string;
  backendState?: string;
}

// Helper to detect and clean up invalid auth state on first visit
const cleanupInvalidAuthState = () => {
  try {
    // Check if this is likely a first visit or corrupted state
    const hasVisitedBefore = sessionStorage.getItem('gruenerator_session_active');

    if (!hasVisitedBefore) {
      // Mark this session as active
      sessionStorage.setItem('gruenerator_session_active', 'true');

      // Check for potentially corrupted logout timestamp
      const logoutTimestamp = localStorage.getItem('gruenerator_logout_timestamp');
      if (logoutTimestamp) {
        const timestamp = parseInt(logoutTimestamp);
        const now = Date.now();

        // If timestamp is invalid, in the future, or older than 1 hour, it's likely corrupted
        if (isNaN(timestamp) || timestamp > now || (now - timestamp) > 60 * 60 * 1000) {
          localStorage.removeItem('gruenerator_logout_timestamp');
        }
      }

      // Also clean up any stale login intent
      const loginIntent = localStorage.getItem('gruenerator_login_intent');
      if (loginIntent) {
        const intentTime = parseInt(loginIntent);
        if (isNaN(intentTime) || intentTime > Date.now() || (Date.now() - intentTime) > 10 * 60 * 1000) {
          localStorage.removeItem('gruenerator_login_intent');
        }
      }
    }
  } catch (error) {
    console.warn('[useAuth] Error during first visit cleanup:', error);
  }
};

// Run cleanup on module load
if (typeof window !== 'undefined') {
  cleanupInvalidAuthState();
}

// Helper to check if user recently logged out
const isRecentlyLoggedOut = () => {
  try {
    // Check if there's a recent login intent - if so, allow auth
    const loginIntent = localStorage.getItem('gruenerator_login_intent');
    if (loginIntent) {
      const intentTime = parseInt(loginIntent);
      // Validate the timestamp is a valid number and not in the future
      if (!isNaN(intentTime) && intentTime > 0 && intentTime <= Date.now()) {
        const timeSinceIntent = Date.now() - intentTime;
        // Allow auth for 5 minutes after login intent
        if (timeSinceIntent < 5 * 60 * 1000) {
          return false; // Don't block auth
        }
      }
      // Clean up invalid or old login intent
      localStorage.removeItem('gruenerator_login_intent');
    }

    // Check logout timestamp only if no recent login intent
    const logoutTimestamp = localStorage.getItem('gruenerator_logout_timestamp');
    if (logoutTimestamp) {
      const timestamp = parseInt(logoutTimestamp);

      // Validate timestamp is a valid number
      if (isNaN(timestamp) || timestamp <= 0) {
        localStorage.removeItem('gruenerator_logout_timestamp');
        return false;
      }

      // Check if timestamp is in the future (clock skew or invalid data)
      if (timestamp > Date.now()) {
        localStorage.removeItem('gruenerator_logout_timestamp');
        return false;
      }

      // Check if timestamp is unreasonably old (> 1 day)
      const timeSinceLogout = Date.now() - timestamp;
      if (timeSinceLogout > 24 * 60 * 60 * 1000) {
        localStorage.removeItem('gruenerator_logout_timestamp');
        return false;
      }

      // Check if logout was within the last minute
      if (timeSinceLogout < 60 * 1000) {
        return true; // Block automatic auth
      } else {
        // Clean up old logout timestamp
        localStorage.removeItem('gruenerator_logout_timestamp');
      }
    }
  } catch (error) {
    console.warn('[useAuth] Error checking logout status, allowing auth:', error);
    // If we can't read from localStorage, assume not recently logged out
    // Also try to clean up potentially corrupted localStorage
    try {
      localStorage.removeItem('gruenerator_logout_timestamp');
      localStorage.removeItem('gruenerator_login_intent');
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
  }
  return false;
};

// Helper to detect potential partial logout states
const detectPartialLogoutState = async () => {
  try {
    const authStore = useAuthStore.getState();
    const frontendLoggedOut = !authStore.isAuthenticated;

    // If frontend shows logged out, check if backend still has session
    if (frontendLoggedOut) {
      const response = await apiClient.get('/auth/status', {
        skipAuthRedirect: true
      } as ExtendedAxiosRequestConfig);

      const statusData = response.data as Record<string, unknown>;
      const backendAuthenticated = statusData.isAuthenticated;

      if (backendAuthenticated) {
        console.warn('[useAuth] Partial logout detected: Frontend logged out but backend still authenticated');
        return {
          isPartialLogout: true,
          needsRecovery: true,
          frontendState: 'logged_out',
          backendState: 'authenticated'
        };
      }
    }

    return { isPartialLogout: false };
  } catch (error: unknown) {
    console.warn('[useAuth] Could not check for partial logout state:', error);
    return { isPartialLogout: false };
  }
};

/**
 * Helper function to check if server is available
 */
const checkServerHealth = async () => {
  try {
    // Health endpoint is at /health (relative to base URL without /api)
    const baseURL = (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL || '/api';
    const healthUrl = baseURL.replace('/api', '') + '/health';
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Optimized server availability hook with instant production start
 */
const useServerAvailability = (skipCheck = false) => {
  const [isServerAvailable, setIsServerAvailable] = useState(true); // Start optimistic
  const [isChecking, setIsChecking] = useState(false); // Start false

  useEffect(() => {
    const isDevelopment = import.meta.env.DEV;

    if (!isDevelopment || skipCheck) {
      setIsServerAvailable(true);
      setIsChecking(false);
      return;
    }

    // Start checking only in development and only if not skipped
    setIsChecking(true);

    let checkCount = 0;
    const maxChecks = 5; // Reduced from 20 to 5 checks

    const checkServer = async () => {
      const available = await checkServerHealth();

      if (available) {
        setIsServerAvailable(true);
        setIsChecking(false);
        return;
      }

      checkCount++;
      if (checkCount >= maxChecks) {
        // Optimistic: assume available after max checks
        setIsServerAvailable(true);
        setIsChecking(false);
        return;
      }

      // Faster backoff: 200ms, 400ms, 800ms
      const delay = Math.min(200 * Math.pow(2, checkCount), 1000);
      setTimeout(checkServer, delay);
    };

    // Immediate first check in development
    checkServer();
  }, [skipCheck]);

  return { isServerAvailable, isChecking };
};

/**
 * Cache-first auth state loader
 */
const getCachedAuthState = () => {
  try {
    const cached = localStorage.getItem('authState');
    if (cached) {
      const parsed = JSON.parse(cached);
      // Check if cache is still fresh (< 5 minutes)
      if (parsed.timestamp && (Date.now() - parsed.timestamp) < 5 * 60 * 1000) {
        return parsed.data;
      }
    }
  } catch (error) {
    // Cache read failed, return null
  }
  return null;
};

/**
 * Save auth state to cache
 */
const setCachedAuthState = (data: AuthData) => {
  try {
    localStorage.setItem('authState', JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (error) {
    // Cache write failed, ignore
  }
};

/**
 * Optimized hook that manages authentication state
 * 
 * USAGE GUIDE:
 * 
 * 1. useAuth() - Standard authentication (default behavior)
 * 2. useAuth({ skipAuth: true }) - Completely skip auth for public pages
 * 3. useAuth({ lazy: true }) - Load auth in background for optional auth pages
 * 4. useAuth({ instant: true }) - Use cached state immediately, refresh in background
 * 5. useAuth({ instant: true, lazy: false }) - Optimal for auth-required pages
 * 
 * CONVENIENCE HOOKS:
 * - usePublicAuth() - For public pages (skipAuth: true)
 * - useLazyAuth() - For optional auth pages (lazy: true) 
 * - useInstantAuth() - For pages needing immediate auth with cache (instant: true)
 * - useOptimizedAuth() - For auth-required pages with best performance
 * 
 * @param {Object} options - Configuration options
 * @param {boolean} options.skipAuth - Skip authentication entirely (for public pages)
 * @param {boolean} options.lazy - Load auth in background (for pages that work without auth)
 * @param {boolean} options.instant - Use cached state immediately, refresh in background
 * @returns {Object} Authentication state and methods
 */
export const useAuth = (options: AuthOptions = {}) => {
  const { skipAuth = false, lazy = false, instant = false } = options;

  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    isLoggingOut,
    selectedMessageColor,
    igelModus,
    setAuthState,
    setLoading,
    setError,
    clearAuth,
    updateMessageColor,
    setIgelModus,
    login,
    logout,
    register,
    deleteAccount,
    sendPasswordResetEmail,
    updatePassword,
    updateProfile,
    updateAvatar,
    canManageAccount,
    setLoginIntent,
  } = useAuthStore();

  const [hasInitializedFromCache, setHasInitializedFromCache] = useState(false);
  const queryClient = useQueryClient();


  // Skip all auth logic for public pages
  if (skipAuth) {
    return {
      user: null,
      isAuthenticated: false,
      loading: false,
      error: null,
      isLoggingOut: false,
      isAuthResolved: true,
      isInitialLoad: false,
      hasCachedData: false,
      selectedMessageColor: '#008939',
      igelModus: false,
      login,
      logout: () => { },
      updateUserMessageColor: async () => { },
      setIgelModus: async () => false,
      register: () => { },
      deleteAccount: async () => ({ success: false, message: '' }),
      sendPasswordResetEmail: async () => ({ success: false, message: '' }),
      updatePassword: () => { },
      updateProfile: async () => ({}),
      updateAvatar: async () => ({}),
      refetchAuth: () => { },
      setLoginIntent: () => { },
      session: null,
      supabase: null,
      canManageAccount: () => false,
    };
  }

  // Load cached state immediately for instant mode
  const cachedAuth = instant ? getCachedAuthState() : null;
  const [hasCachedData] = useState(!!cachedAuth);

  // Initialize with cached data if available
  useEffect(() => {
    if (cachedAuth && !hasInitializedFromCache) {
      setAuthState(cachedAuth);
      setHasInitializedFromCache(true);
    }
  }, [cachedAuth, hasInitializedFromCache, setAuthState]);

  const { isServerAvailable, isChecking } = useServerAvailability(lazy || (instant && hasCachedData));

  // Check if user recently logged out to prevent immediate re-auth
  const hasRecentlyLoggedOut = isRecentlyLoggedOut();

  // Always allow auth on login page (conscious user action)
  const isOnLoginPage = typeof window !== 'undefined' &&
    (window.location.pathname === '/login' || window.location.pathname === '/auth/login');

  // Query configuration for different loading strategies
  const {
    data: authData,
    isLoading: isQueryLoading,
    isFetching,
    isError,
    error: queryError,
    refetch: refetchAuth,
  } = useQuery<AuthData>({
    queryKey: ['authStatus'],
    queryFn: async (): Promise<AuthData> => {
      try {
        const response = await apiClient.get('/auth/status', {
          skipAuthRedirect: true,
        } as ExtendedAxiosRequestConfig);
        return response.data as AuthData;
      } catch (error: unknown) {
        throw error;
      }
    },
    enabled: isServerAvailable && !skipAuth && (!hasRecentlyLoggedOut || isOnLoginPage), // Allow auth on login page
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Handle auth data when it changes
  useEffect(() => {
    // Don't process auth data if user recently logged out (unless on login page)
    if (hasRecentlyLoggedOut && !isOnLoginPage) {
      // Only clear auth if user is currently authenticated
      // This prevents unnecessary clearAuth calls that would reset the logout timestamp
      const { isAuthenticated: currentIsAuthenticated } = useAuthStore.getState();
      if (currentIsAuthenticated) {
        clearAuth();
      }
      // If we're on a protected page and recently logged out, clear the logout timestamp
      // to allow the login screen to be shown properly
      if (!isOnLoginPage && !skipAuth && !lazy) {
        try {
          localStorage.removeItem('gruenerator_logout_timestamp');
        } catch (error) {
          // Ignore localStorage errors
        }
      }
      return;
    }

    if (authData) {
      if (instant) {
        setCachedAuthState(authData);
      }

      const { isAuthenticated: currentIsAuthenticated, user: currentUser } = useAuthStore.getState();

      if (authData.isAuthenticated && authData.user) {
        // Clear login intent after successful authentication
        try {
          localStorage.removeItem('gruenerator_login_intent');
        } catch (error) {
          // Ignore localStorage errors
        }

        // Prevent infinite loop by only setting state if user is different
        if (authData.user.id !== currentUser?.id) {
          setAuthState({
            user: authData.user,
            isAuthenticated: authData.isAuthenticated,
            supabaseSession: authData.supabaseSession
          });

          // Prefetch groups if user doesn't already have groups loaded
          if (!authData.user.groups) {
            queryClient.prefetchQuery({
              queryKey: ['userGroups', authData.user.id],
              queryFn: async () => {
                try {
                  const response = await apiClient.get('/auth/groups', {
                    skipAuthRedirect: true
                  } as ExtendedAxiosRequestConfig);
                  return response.data.groups || [];
                } catch (error: unknown) {
                  console.warn('[useAuth] Groups prefetch failed:', error);
                  return [];
                }
              },
              staleTime: 2 * 60 * 1000, // 2 minutes
            });
          }
        }

        if (authData.supabaseSession) {
          try {
            const { initializeSupabaseAuth } = useAuthStore.getState();
            initializeSupabaseAuth();
          } catch (error) {
            // Supabase auth initialization failed
          }
        }
      } else if (currentIsAuthenticated) {
        // Only clear auth if user was previously authenticated
        clearAuth();
      }
    } else if (queryError) {
      setError(queryError.message);
      clearAuth();
    }
  }, [authData, queryError, instant, setAuthState, clearAuth, setError, hasRecentlyLoggedOut, isOnLoginPage]);

  // Calculate loading states with optimizations
  const isCombinedLoading = (
    (!hasCachedData && isChecking) ||
    (!hasCachedData && isQueryLoading) ||
    (isLoading && !authData && !hasCachedData)
  );

  const isAuthResolved = (
    hasCachedData ||
    (!isChecking && !isQueryLoading && (authData !== undefined || queryError) && !isLoggingOut) ||
    // Force resolve auth state if user recently logged out and not on login page
    (hasRecentlyLoggedOut && !isOnLoginPage)
  );


  // Helper function to update message color
  const updateUserMessageColor = async (newColor: string) => {
    if (!user) {
      return;
    }

    try {
      await updateMessageColor(newColor);
    } catch (err) {
      throw err;
    }
  };

  return {
    user,
    isAuthenticated,
    loading: isCombinedLoading,
    error,
    isLoggingOut,

    // Enhanced loading states
    isAuthResolved,
    isInitialLoad: !hasCachedData && (isChecking || (isQueryLoading && !authData)),
    hasCachedData, // New: indicates if using cached data
    selectedMessageColor,
    igelModus,

    login,
    logout,
    setLoginIntent,

    updateUserMessageColor,
    setIgelModus,

    register,
    deleteAccount,
    sendPasswordResetEmail,
    updatePassword,
    updateProfile,
    updateAvatar,

    refetchAuth,

    // Legacy compatibility
    session: useAuthStore.getState().supabaseSession,
    supabase: null,
    canManageAccount,
  };
};

/**
 * Convenience hooks for different use cases
 */

// Für öffentliche Seiten - komplett ohne Auth
export const usePublicAuth = () => useAuth({ skipAuth: true });

// Für Seiten die ohne Auth funktionieren aber erweiterte Features mit Auth haben
export const useLazyAuth = () => useAuth({ lazy: true });

// Für Seiten die sofort Auth brauchen aber cached state nutzen können
export const useInstantAuth = () => useAuth({ instant: true });

// Für Seiten die sofort Auth brauchen mit optimalen Performance
export const useOptimizedAuth = () => useAuth({ instant: true, lazy: false });

// Legacy default export für bestehenden Code
export default useAuth; 