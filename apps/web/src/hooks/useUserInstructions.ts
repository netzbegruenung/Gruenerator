import { useQuery } from '@tanstack/react-query';

import apiClient from '../components/utils/apiClient';

import { useAuth } from './useAuth';

/**
 * Hook to fetch user's unified custom instruction (Anweisung)
 * Returns a single instruction that applies to all generators.
 *
 * @param {string} _instructionType - DEPRECATED: No longer used, kept for backward compatibility
 * @param {boolean} isActive - Whether instructions are currently active (from Anweisungen toggle)
 * @returns {string|null} Custom prompt text or null
 */
export const useUserInstructions = (_instructionType: string, isActive = false) => {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['userInstructions', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/auth/anweisungen-wissen');
      const result = response.data;

      if (result.success) {
        return result.customPrompt || null;
      }

      return null;
    },
    enabled: !!user && isActive,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return isActive ? data : null;
};

export default useUserInstructions;
