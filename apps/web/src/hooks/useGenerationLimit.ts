import { useQuery } from '@tanstack/react-query';

import apiClient from '../components/utils/apiClient';

import { useOptimizedAuth } from './useAuth';

// Types for generation limit data
interface GenerationLimitData {
  canGenerate: boolean;
  remaining: number;
  limit: number;
  unlimited: boolean;
  resetAt?: string;
  resourceType: string;
}

interface BulkLimitData {
  [resourceType: string]: GenerationLimitData;
}

/**
 * Universal React Query hook for managing generation limits across any resource type
 * Replaces the old useImageGenerationLimit with a universal, reusable approach
 *
 * Features:
 * - Works for ANY resource type (text, image, pdf_export, etc.)
 * - Supports both authenticated and anonymous users
 * - Automatic refetching on window focus
 * - Optimistic updates after generation
 * - Error handling with retry logic
 *
 * @param {string} resourceType - Type of resource ('text', 'image', 'pdf_export', etc.)
 * @returns {Object} React Query result with limit data
 *
 * @example
 * // In a text generator component:
 * const { data: limit, isLoading, refetch } = useGenerationLimit('text');
 * if (!limit?.canGenerate && !limit?.unlimited) {
 *   showLoginPrompt();
 * }
 *
 * @example
 * // In an image generator component:
 * const { data: limit } = useGenerationLimit('image');
 * console.log(`Remaining: ${limit?.remaining}/${limit?.limit}`);
 */
export const useGenerationLimit = (resourceType: string) => {
  const { user } = useOptimizedAuth();

  return useQuery<GenerationLimitData>({
    queryKey: ['generationLimit', resourceType, user?.id || 'anonymous'],
    queryFn: async (): Promise<GenerationLimitData> => {
      const response = await apiClient.get(`/rate-limit/${resourceType}`);
      const data = response.data;

      if (!data.success) {
        throw new Error(data.error || 'Failed to get generation limit status');
      }

      return data.data as GenerationLimitData;
    },
    enabled: true, // Always enabled - works for both authenticated and anonymous users
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnMount: true, // Refetch on component mount
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes (renamed from cacheTime in v5)
    retry: (failureCount, error) => {
      // Don't retry on client errors (4xx)
      if (
        error instanceof Error &&
        (error.message.includes('400') || error.message.includes('401'))
      ) {
        return false;
      }
      // Retry up to 3 times on network/server errors
      return failureCount < 3;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
};

/**
 * Hook for checking multiple resource limits at once
 * Useful for dashboard views or multi-resource pages
 *
 * @param {string[]} resourceTypes - Array of resource types to check
 * @returns {Object} Object with limits data and helper methods
 *
 * @example
 * const { limits, isLoading, refetchAll } = useMultipleGenerationLimits(['text', 'image']);
 * console.log(limits.text?.remaining); // 5
 * console.log(limits.image?.remaining); // 3
 */
export const useMultipleGenerationLimits = (resourceTypes: string[]) => {
  const { user } = useOptimizedAuth();

  return useQuery<BulkLimitData>({
    queryKey: ['generationLimitBulk', resourceTypes, user?.id || 'anonymous'],
    queryFn: async (): Promise<BulkLimitData> => {
      const response = await apiClient.post('/rate-limit/bulk', { resourceTypes });
      const data = response.data;

      if (!data.success) {
        throw new Error(data.error || 'Failed to get bulk limit status');
      }

      return data.data as BulkLimitData;
    },
    enabled: resourceTypes && resourceTypes.length > 0,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
};

/**
 * Get remaining generations for a resource type
 * Convenience hook that returns just the remaining count
 *
 * @param {string} resourceType - Type of resource
 * @returns {number|null} Remaining generations or null if unlimited/loading
 *
 * @example
 * const remaining = useRemainingGenerations('text');
 * if (remaining === 0) showLoginPrompt();
 */
export const useRemainingGenerations = (resourceType: string): number | null => {
  const { data: limit } = useGenerationLimit(resourceType);

  if (!limit) return null;
  if (limit.unlimited) return Infinity;
  return limit.remaining;
};

/**
 * Check if generation is allowed for a resource type
 * Convenience hook that returns boolean
 *
 * @param {string} resourceType - Type of resource
 * @returns {boolean|null} True if can generate, false if limit reached, null if loading
 *
 * @example
 * const canGenerate = useCanGenerate('text');
 * if (canGenerate === false) {
 *   alert('Limit reached! Please login.');
 * }
 */
export const useCanGenerate = (resourceType: string): boolean | null => {
  const { data: limit } = useGenerationLimit(resourceType);

  if (!limit) return null;
  if (limit.unlimited) return true;
  return limit.canGenerate;
};

export default useGenerationLimit;
