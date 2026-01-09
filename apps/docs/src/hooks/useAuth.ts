import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import apiClient from '../lib/apiClient';

interface AuthStatusResponse {
  isAuthenticated: boolean;
  user?: {
    id: string;
    email?: string;
    display_name?: string;
    avatar_url?: string;
  };
}

/**
 * Auth hook that queries backend auth status
 * Automatically updates auth store when status changes
 */
export const useAuth = () => {
  const { user, isAuthenticated, setAuthState, clearAuth } = useAuthStore();

  const { data: authData, isLoading, error } = useQuery({
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

  // Update auth store when data changes
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
