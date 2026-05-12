import { type UserProfile } from '@gruenerator/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import apiClient, { notifyAuthConfirmed } from '../components/utils/apiClient';
import {
  INSTANT_AUTH_CACHE,
  LOGIN_INTENT,
  LOGOUT_TIMESTAMP,
  SESSION_ACTIVE,
} from '../features/auth/storageKeys';
import { authClient } from '../lib/authClient';
import { sessionUserToProfile } from '../lib/sessionUserToProfile';
import { useAuthStore, type User } from '../stores/authStore';

/**
 * Hit Better Auth's native session endpoint and adapt the response to the
 * canonical `AuthData` shape. Replaces the previous wrapper at
 * `GET /api/auth/status`.
 */
async function fetchAuthStatus(): Promise<AuthData> {
  const { data, error } = await authClient.getSession();
  if (error) throw error;
  if (!data?.user) return { isAuthenticated: false };
  return {
    isAuthenticated: true,
    user: sessionUserToProfile(data.user as unknown as Record<string, unknown>),
  };
}

interface AuthOptions {
  skipAuth?: boolean;
  lazy?: boolean;
  instant?: boolean;
}

interface AuthData {
  isAuthenticated: boolean;
  user?: UserProfile;
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
    const hasVisitedBefore = sessionStorage.getItem(SESSION_ACTIVE);

    if (!hasVisitedBefore) {
      // Mark this session as active
      sessionStorage.setItem(SESSION_ACTIVE, 'true');

      // Check for potentially corrupted logout timestamp
      const logoutTimestamp = localStorage.getItem(LOGOUT_TIMESTAMP);
      if (logoutTimestamp) {
        const timestamp = parseInt(logoutTimestamp);
        const now = Date.now();

        // If timestamp is invalid, in the future, or older than 1 hour, it's likely corrupted
        if (isNaN(timestamp) || timestamp > now || now - timestamp > 60 * 60 * 1000) {
          localStorage.removeItem(LOGOUT_TIMESTAMP);
        }
      }

      // Also clean up any stale login intent
      const loginIntent = localStorage.getItem(LOGIN_INTENT);
      if (loginIntent) {
        const intentTime = parseInt(loginIntent);
        if (
          isNaN(intentTime) ||
          intentTime > Date.now() ||
          Date.now() - intentTime > 10 * 60 * 1000
        ) {
          localStorage.removeItem(LOGIN_INTENT);
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
    const loginIntent = localStorage.getItem(LOGIN_INTENT);
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
      localStorage.removeItem(LOGIN_INTENT);
    }

    // Check logout timestamp only if no recent login intent
    const logoutTimestamp = localStorage.getItem(LOGOUT_TIMESTAMP);
    if (logoutTimestamp) {
      const timestamp = parseInt(logoutTimestamp);

      // Validate timestamp is a valid number
      if (isNaN(timestamp) || timestamp <= 0) {
        localStorage.removeItem(LOGOUT_TIMESTAMP);
        return false;
      }

      // Check if timestamp is in the future (clock skew or invalid data)
      if (timestamp > Date.now()) {
        localStorage.removeItem(LOGOUT_TIMESTAMP);
        return false;
      }

      // Check if timestamp is unreasonably old (> 1 day)
      const timeSinceLogout = Date.now() - timestamp;
      if (timeSinceLogout > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(LOGOUT_TIMESTAMP);
        return false;
      }

      // Check if logout was within the last minute
      if (timeSinceLogout < 60 * 1000) {
        return true; // Block automatic auth
      } else {
        // Clean up old logout timestamp
        localStorage.removeItem(LOGOUT_TIMESTAMP);
      }
    }
  } catch (error) {
    console.warn('[useAuth] Error checking logout status, allowing auth:', error);
    // If we can't read from localStorage, assume not recently logged out
    // Also try to clean up potentially corrupted localStorage
    try {
      localStorage.removeItem(LOGOUT_TIMESTAMP);
      localStorage.removeItem(LOGIN_INTENT);
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
      const status = await fetchAuthStatus();
      const backendAuthenticated = status.isAuthenticated;

      if (backendAuthenticated) {
        console.warn(
          '[useAuth] Partial logout detected: Frontend logged out but backend still authenticated'
        );
        return {
          isPartialLogout: true,
          needsRecovery: true,
          frontendState: 'logged_out',
          backendState: 'authenticated',
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
    const baseURL =
      (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ||
      '/api';
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
    void checkServer();
  }, [skipCheck]);

  return { isServerAvailable, isChecking };
};

/**
 * Cache-first auth state loader. Returns the cached payload AND its timestamp
 * so React Query can be seeded via `initialData` + `initialDataUpdatedAt`,
 * keeping `staleTime` math correct (a 4-min-old cache stays fresh; a 6-min-old
 * cache is treated as stale and triggers a background refetch).
 */
const getCachedAuthEntry = (): { data: AuthData; timestamp: number } | null => {
  try {
    const cached = localStorage.getItem(INSTANT_AUTH_CACHE);
    if (cached) {
      const parsed = JSON.parse(cached) as { timestamp?: number; data?: AuthData };
      if (parsed.timestamp && parsed.data && Date.now() - parsed.timestamp < 5 * 60 * 1000) {
        return { data: parsed.data, timestamp: parsed.timestamp };
      }
    }
  } catch {
    // Cache read failed, return null
  }
  return null;
};

const getCachedAuthState = (): AuthData | null => getCachedAuthEntry()?.data ?? null;

/**
 * Save auth state to cache
 */
const setCachedAuthState = (data: AuthData) => {
  try {
    localStorage.setItem(
      INSTANT_AUTH_CACHE,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    // Cache write failed, ignore
  }
};

const clearCachedAuthState = () => {
  try {
    localStorage.removeItem(INSTANT_AUTH_CACHE);
  } catch {
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
/**
 * Build the synthetic AuthData returned by `queryFn` when E2E auth bypass is on.
 */
const buildE2EBypassAuthData = (): AuthData => {
  const now = new Date().toISOString();
  return {
    isAuthenticated: true,
    user: {
      id: '00000000-0000-4000-a000-000000000001',
      email: 'dev@gruenerator.de',
      display_name: 'Test User',
      avatar_robot_id: 1,
      beta_features: { workplace: true },
      user_defaults: {},
      locale: 'de-DE',
      groups_enabled: true,
      custom_generators: true,
      database_access: true,
      collab: true,
      notebook: true,
      sharepic: true,
      anweisungen: true,
      labor_enabled: true,
      sites_enabled: true,
      chat: true,
      interactive_antrag_enabled: true,
      vorlagen: true,
      video_editor: true,
      created_at: now,
      updated_at: now,
    },
  };
};

/**
 * All side effects of a resolved `/auth/status` answer in one place.
 *
 * Why this is a regular function called from `queryFn` (not a `useEffect`):
 * the previous `useEffect`-mirror let an "already-guest, server-still-guest"
 * answer flow through guard checks (`if (currentIsAuthenticated) clearAuth()`)
 * that short-circuited the bootstrap signal. Running side effects exactly once
 * per fetch in the queryFn body has no equivalent silent-skip path.
 */
const applyAuthAnswer = (data: AuthData, queryClient: ReturnType<typeof useQueryClient>) => {
  const { isAuthenticated: currentIsAuthenticated, user: currentUser } = useAuthStore.getState();

  if (data.isAuthenticated && data.user) {
    // Cache ONLY positive answers. A guest answer in INSTANT_AUTH_CACHE acts
    // as `initialData` for React Query on the next page load (e.g. the
    // post-Keycloak-callback `/workplace` mount), which puts the query into
    // `success` state with `{isAuthenticated: false}` before any network call
    // — and with `refetchOnMount: false` the queryFn never fires to correct it.
    // RequireAuth then bounces synchronously to `/login?redirectTo=/workplace`,
    // trapping the user in a redirect loop after a successful OAuth callback.
    // The cost of one-way caching is a stale-positive flash after cross-device
    // logout; `refetchOnMount: 'always'` on the query handles that.
    setCachedAuthState(data);

    notifyAuthConfirmed();
    try {
      localStorage.removeItem(LOGIN_INTENT);
    } catch {
      // Ignore localStorage errors
    }

    const authUser = data.user as User | null | undefined;
    if (authUser?.id !== currentUser?.id) {
      useAuthStore.getState().setAuthState({
        user: authUser ?? null,
        isAuthenticated: data.isAuthenticated,
      });

      // Consolidated init: single request seeds all query caches
      const userId = authUser?.id ?? '';
      apiClient
        .get('/auth/init', { skipAuthRedirect: true })
        .then((response) => {
          const { groups, savedTexts, notebookCollections, recentActivity, profile } =
            response.data as Record<string, unknown[]>;
          if (groups) queryClient.setQueryData(['userGroups', userId], groups);
          if (savedTexts) queryClient.setQueryData(['userTexts', userId], savedTexts);
          if (notebookCollections)
            queryClient.setQueryData(['notebookCollections', userId], notebookCollections);
          if (recentActivity) queryClient.setQueryData(['recent-activity'], recentActivity);
          if (profile) queryClient.setQueryData(['profileData', userId], profile);
        })
        .catch((error: unknown) => {
          console.warn('[useAuth] Init prefetch failed, falling back:', error);
        });
    }
  } else {
    // Server says guest. Wipe any positive entry from the instant-auth cache
    // so the next page load does not seed React Query with a false positive
    // (and, more importantly, leaves no false negative behind for the
    // post-login `/workplace` mount to read).
    clearCachedAuthState();

    if (currentIsAuthenticated) {
      // Full teardown: clears persisted state, profile store, etc.
      useAuthStore.getState().clearAuth();
    } else {
      // Reflect the server answer into the store so `hasServerConfirmed` is
      // freshly accurate.
      useAuthStore.getState().setAuthState({ user: null, isAuthenticated: false });
    }
  }
};

export const useAuth = (options: AuthOptions = {}) => {
  const { skipAuth = false, lazy = false, instant = false } = options;

  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    isLoggingOut,
    selectedMessageColor,
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
    setLoginIntent,
  } = useAuthStore();

  const queryClient = useQueryClient();

  // Read the instant-auth cache once at mount. Used both to seed React Query
  // via `initialData` (so the splash never shows on the warm path) and to
  // skip the dev-only server-health probe.
  const [cachedEntry] = useState<{ data: AuthData; timestamp: number } | null>(() =>
    !skipAuth && instant ? getCachedAuthEntry() : null
  );
  const hasCachedData = !!cachedEntry;

  const { isServerAvailable, isChecking } = useServerAvailability(
    lazy || (instant && hasCachedData)
  );

  const {
    data: authData,
    isLoading: isQueryLoading,
    error: queryError,
    refetch: refetchAuth,
  } = useQuery<AuthData>({
    queryKey: ['authStatus'],
    queryFn: async (): Promise<AuthData> => {
      if (import.meta.env.VITE_E2E_AUTH_BYPASS === 'true') {
        const data = buildE2EBypassAuthData();
        applyAuthAnswer(data, queryClient);
        return data;
      }

      try {
        const data = await fetchAuthStatus();
        applyAuthAnswer(data, queryClient);
        return data;
      } catch (error) {
        // Session probe failed. Tear down auth state and rethrow so React
        // Query enters its error branch. `useAuthBootstrapped` treats `error`
        // as "bootstrapped" (the splash unhangs into Startseite via the guard).
        clearCachedAuthState();
        useAuthStore.getState().clearAuth();
        throw error;
      }
    },
    enabled: isServerAvailable && !skipAuth,
    initialData: cachedEntry?.data,
    initialDataUpdatedAt: cachedEntry?.timestamp,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 1,
    // Auth specifically must stay live: sessions can die while a tab sits
    // idle (Better Auth cookie revalidation against a stale row). On focus
    // we want the UI to learn about it immediately, rather than waiting for
    // the next user-triggered API call to 401 and trip the redirect path.
    refetchOnWindowFocus: true,
    // 'always' so a fresh page load (Cmd+R, Keycloak callback redirect,
    // cross-device logout) revalidates against the backend even when the
    // 5-minute persisted positive cache seeds React Query via `initialData`.
    // The combination of cache-positive-only + refetchOnMount:'always' gives
    // us instant /workplace render on the warm path AND prompt correction
    // when the cached state has gone stale.
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  // Calculate loading states with optimizations
  const isCombinedLoading =
    (!hasCachedData && isChecking) ||
    (!hasCachedData && isQueryLoading) ||
    (isLoading && !authData && !hasCachedData);

  const isAuthResolved =
    hasCachedData ||
    (!isChecking && !isQueryLoading && (authData !== undefined || queryError) && !isLoggingOut);

  // Helper function to update message color
  const updateUserMessageColor = async (newColor: string) => {
    if (!user) {
      return;
    }
    await updateMessageColor(newColor);
  };

  const isInitialLoad = useMemo(
    () => !hasCachedData && (isChecking || (isQueryLoading && !authData)),
    [hasCachedData, isChecking, isQueryLoading, authData]
  );

  return useMemo(() => {
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
        login,
        logout: () => {},
        updateUserMessageColor: async () => {},
        register: () => {},
        deleteAccount: async () => ({ success: false, message: '' }),
        sendPasswordResetEmail: async () => ({ success: false, message: '' }),
        updatePassword: () => {},
        updateProfile: async () => ({}),
        updateAvatar: async () => ({}),
        refetchAuth: () => {},
        setLoginIntent: () => {},
        session: null,
        canManageAccount: (): boolean => false,
      };
    }

    return {
      user,
      isAuthenticated,
      loading: isCombinedLoading,
      error,
      isLoggingOut,
      isAuthResolved,
      isInitialLoad,
      hasCachedData,
      selectedMessageColor,
      login,
      logout,
      setLoginIntent,
      updateUserMessageColor,
      register,
      deleteAccount,
      sendPasswordResetEmail,
      updatePassword,
      updateProfile,
      updateAvatar,
      refetchAuth,
      session: null,
      canManageAccount,
    };
  }, [
    skipAuth,
    user,
    isAuthenticated,
    isCombinedLoading,
    error,
    isLoggingOut,
    isAuthResolved,
    isInitialLoad,
    hasCachedData,
    selectedMessageColor,
    login,
    logout,
    setLoginIntent,
    updateUserMessageColor,
    register,
    deleteAccount,
    sendPasswordResetEmail,
    updatePassword,
    updateProfile,
    updateAvatar,
    refetchAuth,
    canManageAccount,
  ]);
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
