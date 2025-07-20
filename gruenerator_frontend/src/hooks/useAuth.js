import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';

// Auth Backend URL aus Environment Variable oder Fallback zu relativem Pfad
const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Helper to check if user recently logged out
const isRecentlyLoggedOut = () => {
  try {
    // Check if there's a recent login intent - if so, allow auth
    const loginIntent = localStorage.getItem('gruenerator_login_intent');
    if (loginIntent) {
      const intentTime = parseInt(loginIntent);
      const timeSinceIntent = Date.now() - intentTime;
      // Allow auth for 5 minutes after login intent
      if (timeSinceIntent < 5 * 60 * 1000) {
        console.log('[useAuth] Recent login intent found, allowing auth');
        return false; // Don't block auth
      } else {
        // Clean up old login intent
        localStorage.removeItem('gruenerator_login_intent');
      }
    }

    // Check logout timestamp only if no recent login intent
    const logoutTimestamp = localStorage.getItem('gruenerator_logout_timestamp');
    if (logoutTimestamp) {
      const timeSinceLogout = Date.now() - parseInt(logoutTimestamp);
      // Check if logout was within the last minute
      if (timeSinceLogout < 60 * 1000) {
        console.log('[useAuth] Recent logout detected, blocking automatic auth');
        return true; // Block automatic auth
      } else {
        // Clean up old logout timestamp
        localStorage.removeItem('gruenerator_logout_timestamp');
      }
    }
  } catch (error) {
    // If we can't read from localStorage, assume not recently logged out
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
      const response = await fetch(`${AUTH_BASE_URL}/auth/status`, {
        credentials: 'include',
        method: 'GET'
      });
      
      if (response.ok) {
        const statusData = await response.json();
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
    }
    
    return { isPartialLogout: false };
  } catch (error) {
    console.warn('[useAuth] Could not check for partial logout state:', error);
    return { isPartialLogout: false };
  }
};

/**
 * Helper function to check if server is available
 */
const checkServerHealth = async (baseUrl) => {
  try {
    // Health endpoint is always at /health, not /api/health
    const healthUrl = baseUrl.replace('/api', '') + '/health';
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(1000), // Reduced from 2s to 1s
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
      const baseUrl = AUTH_BASE_URL || window.location.origin;
      const available = await checkServerHealth(baseUrl);
      
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
const setCachedAuthState = (data) => {
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
export const useAuth = (options = {}) => {
  const { skipAuth = false, lazy = false, instant = false } = options;
  
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    isLoggingOut,
    betaFeatures,
    selectedMessageColor,
    igelModus,
    bundestagApiEnabled,
    setAuthState,
    setLoading,
    setError,
    clearAuth,
    updateBetaFeature,
    updateMessageColor,
    setIgelModus,
    setBundestagApiEnabled,
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
      selectedMessageColor: '#008939',
      igelModus: false,
      login,
      logout: () => {},
      updateUserMessageColor: () => {},
      setIgelModus: () => {},
      register: () => {},
      deleteAccount: () => {},
      sendPasswordResetEmail: () => {},
      updatePassword: () => {},
      updateProfile: () => {},
      updateAvatar: () => {},
      refetchAuth: () => {},
      session: null,
      supabase: null,
      canManageAccount: false,
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

  // Check if user is on the logged-out page to prevent automatic re-auth
  const isJustLoggedOut = typeof window !== 'undefined' && 
    window.location.pathname === '/logged-out';

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
  } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async () => {
      try {
        const response = await fetch(`${AUTH_BASE_URL}/auth/status`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Origin': window.location.origin,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        return data;
      } catch (error) {
        throw error;
      }
    },
    enabled: isServerAvailable && !skipAuth && !isJustLoggedOut && (!hasRecentlyLoggedOut || isOnLoginPage), // Allow auth on login page
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    retry: 1, 
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Handle auth data when it changes
  useEffect(() => {
    // Don't process auth data if user was just logged out or recently logged out (unless on login page)
    if (isJustLoggedOut || (hasRecentlyLoggedOut && !isOnLoginPage)) {
      clearAuth();
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

          // Prefetch groups if groups beta feature is enabled and user doesn't already have groups loaded
          if (authData.user.beta_features?.groups && !authData.user.groups) {
            queryClient.prefetchQuery({
              queryKey: ['userGroups', authData.user.id],
              queryFn: async () => {
                try {
                  const response = await fetch(`${AUTH_BASE_URL}/auth/groups`, {
                    method: 'GET',
                    credentials: 'include',
                  });
                  if (response.ok) {
                    const data = await response.json();
                    console.log('[useAuth] Groups prefetched successfully:', data.groups?.length || 0);
                    return data.groups || [];
                  }
                  return [];
                } catch (error) {
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
  }, [authData, queryError, instant, setAuthState, clearAuth, setError, isJustLoggedOut, hasRecentlyLoggedOut, isOnLoginPage]);

  // Calculate loading states with optimizations
  const isCombinedLoading = (
    (!hasCachedData && isChecking) || 
    (!hasCachedData && isQueryLoading) || 
    (isLoading && !authData && !hasCachedData)
  );
    
  const isAuthResolved = (
    hasCachedData || 
    (!isChecking && !isQueryLoading && (authData !== undefined || queryError) && !isLoggingOut)
  );


  // Helper function to update message color
  const updateUserMessageColor = async (newColor) => {
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
    bundestagApiEnabled,
    
    login,
    logout,
    setLoginIntent,
    
    updateUserMessageColor,
    setIgelModus,
    setBundestagApiEnabled,
    
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