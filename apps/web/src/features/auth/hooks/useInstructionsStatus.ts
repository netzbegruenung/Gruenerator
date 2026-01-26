import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../../hooks/useAuth';
import { profileApiService } from '../services/profileApiService';

/**
 * Hook to check if user has instructions for a specific generator type
 * @param {string} instructionType - The instruction type ('antrag', 'social', 'universal', 'gruenejugend')
 * @param {object} options - Query options
 * @returns {object} Query result with instruction status data
 */
export const useInstructionsStatusForType = (
  instructionType: string | undefined,
  options: Record<string, unknown> = {}
) => {
  const { user, isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['instructionsStatus', instructionType, user?.id],
    queryFn: () => profileApiService.getInstructionsStatusForType(instructionType!),
    enabled: !!(user?.id && isAuthenticated && instructionType),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
    ...options,
  });
};

/**
 * Legacy hook name for backwards compatibility
 * @deprecated Use useInstructionsStatusForType instead
 */
export const useInstructionsStatus = useInstructionsStatusForType;

export default useInstructionsStatusForType;
