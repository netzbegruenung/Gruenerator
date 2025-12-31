import { useQuery } from '@tanstack/react-query';
import { useOptimizedAuth } from './useAuth';
import apiClient from '../components/utils/apiClient';

/**
 * React Query hook for managing image generation limits
 * Fetches current user's daily image generation status
 */
export const useImageGenerationLimit = () => {
  const { user, isAuthenticated } = useOptimizedAuth();

  return useQuery({
    queryKey: ['imageGenerationStatus', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/image-generation/status');
      const data = response.data;

      if (!data.success) {
        throw new Error(data.message || 'Failed to get image generation status');
      }

      return data.data;
    },
    enabled: !!user && isAuthenticated,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    retry: (failureCount, error: any) => {
      // Don't retry on auth errors
      if (error.message?.includes('401')) return false;
      return failureCount < 3;
    }
  });
};

export default useImageGenerationLimit;