import { useAuthStore } from '../stores/authStore';
import type { User } from '../types/auth';

/**
 * Simplified auth hook for mobile/web usage
 * Provides essential auth state and actions
 */
export function useAuth() {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const error = useAuthStore((state) => state.error);
  const isLoggingOut = useAuthStore((state) => state.isLoggingOut);
  const locale = useAuthStore((state) => state.locale);
  const igelModus = useAuthStore((state) => state.igelModus);
  const selectedMessageColor = useAuthStore((state) => state.selectedMessageColor);

  const setAuthState = useAuthStore((state) => state.setAuthState);
  const setLoading = useAuthStore((state) => state.setLoading);
  const setError = useAuthStore((state) => state.setError);
  const setLoggingOut = useAuthStore((state) => state.setLoggingOut);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  const updateLocale = useAuthStore((state) => state.updateLocale);
  const updateIgelModus = useAuthStore((state) => state.updateIgelModus);
  const updateMessageColor = useAuthStore((state) => state.updateMessageColor);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    isLoggingOut,
    locale,
    igelModus,
    selectedMessageColor,

    setAuthState,
    setLoading,
    setError,
    setLoggingOut,
    clearAuth,
    updateProfile,
    updateLocale,
    updateIgelModus,
    updateMessageColor,
  };
}

/**
 * Hook for checking auth without subscribing to all state changes
 * Use this for simple authentication checks
 */
export function useIsAuthenticated(): boolean {
  return useAuthStore((state) => state.isAuthenticated);
}

/**
 * Hook for getting current user
 */
export function useUser(): User | null {
  return useAuthStore((state) => state.user);
}
