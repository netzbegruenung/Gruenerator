import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import apiClient from '../components/utils/apiClient';

/**
 * Simplified hook to fetch user's custom instructions (Anweisungen)
 * Replaces the over-engineered 282-line useKnowledge.js
 *
 * @param {string} instructionType - Type of instruction ('antrag', 'social', 'universal', etc.)
 * @param {boolean} isActive - Whether instructions are currently active (from Anweisungen toggle)
 * @returns {string|null} Custom prompt text or null
 */
export const useUserInstructions = (instructionType: string, isActive = false) => {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['userInstructions', user?.id],
    queryFn: async () => {
      const response = await apiClient.get('/auth/anweisungen-wissen');
      const result = response.data;

      if (result.success) {
        return {
          antrag: result.antragPrompt || null,
          antragGliederung: result.antragGliederung || null,
          social: result.socialPrompt || null,
          universal: result.universalPrompt || null,
          gruenejugend: result.gruenejugendPrompt || null,
          rede: result.redePrompt || null,
          buergeranfragen: result.buergeranfragenPrompt || null
        };
      }

      return null;
    },
    enabled: !!user && isActive,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    refetchOnWindowFocus: false,
  });

  // Return specific instruction type or null
  if (!isActive || !data) return null;
  return data[instructionType] || null;
};

export default useUserInstructions;
