import { useQuery } from '@tanstack/react-query';
import { useOptimizedAuth } from './useAuth';

const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * React Query hook for managing image generation limits
 * Fetches current user's daily image generation status
 */
export const useImageGenerationLimit = () => {
  const { user, isAuthenticated } = useOptimizedAuth();

  return useQuery({
    queryKey: ['imageGenerationStatus', user?.id],
    queryFn: async () => {
      const response = await fetch(`${AUTH_BASE_URL}/image-generation/status`, {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image generation status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to get image generation status');
      }

      return data.data;
    },
    enabled: !!user && isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.message.includes('401')) return false;
      return failureCount < 3;
    }
  });
};

export default useImageGenerationLimit;