import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import apiClient from '../lib/apiClient';
import { useAuthStore } from '../stores/authStore';

interface AuthStatusResponse {
  isAuthenticated: boolean;
  user?: {
    id: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
    avatar_robot_id?: number;
  };
}

/**
 * Auth hook that queries backend auth status
 * Automatically updates auth store when status changes
 */
export const useAuth = () => {
  const { setAuthState, clearAuth } = useAuthStore();

  const {
    data: authData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['authStatus'],
    queryFn: async (): Promise<AuthStatusResponse> => {
      const response = await apiClient.get('/auth/status');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Sync auth store for consumers that read from the store directly
  useEffect(() => {
    if (authData?.isAuthenticated && authData.user) {
      setAuthState({
        user: authData.user,
        isAuthenticated: true,
      });
    } else if (authData && !authData.isAuthenticated) {
      clearAuth();
    }
  }, [authData, setAuthState, clearAuth]);

  // Derive auth state directly from query data to avoid the render gap
  // where isLoading=false but the useEffect hasn't synced the store yet
  const isAuthenticated = authData?.isAuthenticated ?? false;
  const user = authData?.user ?? null;

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
  };
};

/**
 * Hook for public pages that don't require auth
 */
export const usePublicAuth = () => {
  return useAuth();
};
