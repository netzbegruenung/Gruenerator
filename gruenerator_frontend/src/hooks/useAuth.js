import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useBetaFeaturesWithSWR } from './useBetaFeaturesWithSWR';

// Auth Backend URL aus Environment Variable oder Fallback zu aktuellem Host
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL || '';

/**
 * Helper function to check if server is available
 */
const checkServerHealth = async (baseUrl) => {
  try {
    const response = await fetch(`${baseUrl}/health`, {
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
    console.warn('[useAuth] Cache read failed:', error);
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
    console.warn('[useAuth] Cache write failed:', error);
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
    deutschlandmodus,
    setAuthState,
    setLoading,
    setError,
    clearAuth,
    updateBetaFeature,
    updateMessageColor,
    login,
    logout,
    register,
    deleteAccount,
    sendPasswordResetEmail,
    updatePassword,
    updateProfile,
    updateAvatar,
    canManageAccount,
  } = useAuthStore();

  const [hasInitializedFromCache, setHasInitializedFromCache] = useState(false);
  const queryClient = useQueryClient();

  // SWR für Beta Features
  const { data: queriedBetaFeatures, isLoading: isLoadingBetaFeatures } = useBetaFeaturesWithSWR();
  
  // Merge features: queriedBetaFeatures als Basis, betaFeatures (Store) hat Vorrang
  const displayBetaFeatures = {
    ...queriedBetaFeatures,
    ...betaFeatures
  };

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
      betaFeatures: {},
      selectedMessageColor: '#008939',
      deutschlandmodus: null,
      login,
      logout: () => {},
      updateUserBetaFeatures: () => {},
      updateUserMessageColor: () => {},
      register: () => {},
      deleteAccount: () => {},
      sendPasswordResetEmail: () => {},
      updatePassword: () => {},
      updateProfile: () => {},
      updateAvatar: () => {},
      refetchAuth: () => {},
      session: null,
      supabase: null,
      setDeutschlandmodusInContext: () => {},
      canManageAccount: false,
    };
  }

  // Load cached state immediately for instant mode
  const cachedAuth = instant ? getCachedAuthState() : null;
  const [hasCachedData] = useState(!!cachedAuth);
  
  // Initialize with cached data if available
  useEffect(() => {
    if (cachedAuth && !hasInitializedFromCache) {
      console.log('[useAuth DEBUG] Initializing state from cache.');
      setAuthState(cachedAuth);
      setHasInitializedFromCache(true);
    }
  }, [cachedAuth, hasInitializedFromCache, setAuthState]);

  const { isServerAvailable, isChecking } = useServerAvailability(lazy || (instant && hasCachedData));

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
      console.log('[useAuth DEBUG] queryFn starting.');
      try {
        const response = await fetch(`${AUTH_BASE_URL}/api/auth/status`, {
          method: 'GET',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('[useAuth DEBUG] queryFn success, data received:', { isAuthenticated: data.isAuthenticated, user: !!data.user });
        return data;
      } catch (error) {
        console.error('[useAuth DEBUG] queryFn error:', error);
        throw error;
      }
    },
    enabled: isServerAvailable && !skipAuth,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    retry: 1, 
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Handle auth data when it changes
  useEffect(() => {
    if (authData) {
      console.log('[useAuth DEBUG] useEffect handling authData:', { isAuthenticated: authData.isAuthenticated, user: !!authData.user });
      
      if (instant) {
        setCachedAuthState(authData);
      }

      const { isAuthenticated: currentIsAuthenticated, user: currentUser } = useAuthStore.getState();

      if (authData.isAuthenticated && authData.user) {
        // Prevent infinite loop by only setting state if user is different
        if (authData.user.id !== currentUser?.id) {
          console.log('[useAuth DEBUG] User changed. Setting authenticated state for user:', authData.user.id);
          setAuthState({
            user: authData.user,
            isAuthenticated: authData.isAuthenticated,
            supabaseSession: authData.supabaseSession
          });
        }

        if (authData.supabaseSession) {
          console.log('[useAuth DEBUG] Supabase session available, initializing...');
          try {
            const { initializeSupabaseAuth } = useAuthStore.getState();
            initializeSupabaseAuth();
          } catch (error) {
            console.warn('[useAuth DEBUG] Supabase auth initialization warning:', error);
          }
        }
      } else if (currentIsAuthenticated) {
        // Only clear auth if user was previously authenticated
        console.log('[useAuth DEBUG] Clearing auth - user not authenticated');
        clearAuth();
      }
    } else if (queryError) {
      console.error('[useAuth DEBUG] Query error, clearing auth:', queryError);
      setError(queryError.message);
      clearAuth();
    }
  }, [authData, queryError, instant, setAuthState, clearAuth, setError]);

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

  console.log(`[useAuth DEBUG] Render. IsAuthenticated: ${isAuthenticated}, User: ${user ? `ID ${user.id}` : 'null'}, Loading: ${isCombinedLoading}`);

  // Helper function to update user beta features
  const updateUserBetaFeatures = async (featureKey, isEnabled) => {
    if (!user) {
      console.error('User not logged in, cannot update beta features.');
      return;
    }

    try {
      console.log(`[useAuth] Updating beta feature '${featureKey}' to ${isEnabled}`);
      await updateBetaFeature(featureKey, isEnabled);
      console.log(`[useAuth] Beta feature '${featureKey}' successfully updated to ${isEnabled}`);
      
      // Invalidate beta features query to force refresh
      queryClient.invalidateQueries({ queryKey: ['betaFeatures', user.id] });
      // Also refetch auth data to ensure sync
      refetchAuth();
    } catch (err) {
      console.error(`[useAuth] Failed to update beta feature '${featureKey}':`, err);
      throw err;
    }
  };

  // Helper function to update message color
  const updateUserMessageColor = async (newColor) => {
    if (!user) {
      console.error('User not logged in, cannot update message color.');
      return;
    }

    try {
      console.log(`[useAuth] Updating message color to: ${newColor}`);
      await updateMessageColor(newColor);
      console.log(`[useAuth] Message color successfully updated to: ${newColor}`);
    } catch (err) {
      console.error(`[useAuth] Failed to update message color:`, err);
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
    isLoadingBetaFeatures, // New: indicates if beta features are loading
    
    betaFeatures: displayBetaFeatures,
    selectedMessageColor,
    deutschlandmodus,
    
    login,
    logout,
    
    updateUserBetaFeatures,
    updateUserMessageColor,
    
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
    setDeutschlandmodusInContext: (value) => {
      console.warn('setDeutschlandmodusInContext is deprecated. Use updateUserBetaFeatures instead.');
    },
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