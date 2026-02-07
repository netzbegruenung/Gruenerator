/**
 * Auth Hook for gruenerator-chat
 * Handles authentication flow and user session
 */

'use client';

import { useEffect } from 'react';
import apiClient from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';

let authCheckPromise: Promise<void> | null = null;

export function useAuth() {
  const { user, isAuthenticated, isLoading, error, setAuth, setLoading, setError } = useAuthStore();

  useEffect(() => {
    if (authCheckPromise) return;

    authCheckPromise = (async () => {
      try {
        setLoading(true);
        const response = await apiClient.get<{
          isAuthenticated: boolean;
          user?: {
            id: string;
            email?: string;
            display_name?: string;
            keycloak_id?: string;
          };
        }>('/api/auth/status');

        if (response.isAuthenticated && response.user) {
          setAuth(response.user);
        } else {
          setAuth(null);
        }
      } catch (_err) {
        setAuth(null);
        setError('Authentifizierung fehlgeschlagen');
      }
    })();
  }, [setAuth, setLoading, setError]);

  const login = (redirectTo?: string) => {
    const redirect = redirectTo || window.location.pathname;
    window.location.href = `/login?redirectTo=${encodeURIComponent(redirect)}`;
  };

  const logout = async () => {
    try {
      await apiClient.post('/api/auth/logout');
      useAuthStore.getState().logout();
      window.location.href = '/';
    } catch (err) {
      console.error('Logout failed:', err);
      window.location.href = '/';
    }
  };

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
  };
}
