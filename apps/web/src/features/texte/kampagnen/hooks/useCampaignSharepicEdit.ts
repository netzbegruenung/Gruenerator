import { useState, useCallback } from 'react';

import apiClient from '../../../../components/utils/apiClient';

interface RegenerateParams {
  campaignId: string;
  variant: string;
  location: string;
  details: string;
  editedLines: Record<string, string>;
  features: Record<string, unknown>;
}

/**
 * Hook for editing and regenerating campaign sharepics
 */
const useCampaignSharepicEdit = () => {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerationError, setRegenerationError] = useState<string | null>(null);

  /**
   * Regenerate a single campaign sharepic with edited text
   */
  const regenerateSharepic = useCallback(
    async ({ campaignId, variant, location, details, editedLines, features }: RegenerateParams) => {
      setIsRegenerating(true);
      setRegenerationError(null);

      try {
        const response = await apiClient.post('/campaign_generate', {
          campaignId: campaignId,
          campaignTypeId: variant,
          thema: location,
          details: details || '',
          lineOverrides: editedLines,
          count: 1,
          ...features,
        });

        const result = response.data;

        if (!result.success || !result.sharepics || result.sharepics.length === 0) {
          throw new Error('Keine Sharepics vom Server empfangen');
        }

        return result.sharepics[0];
      } catch (error: unknown) {
        console.error('[useCampaignSharepicEdit] Regeneration failed:', error);
        const axiosError = error as { response?: { data?: { error?: string } }; message?: string };
        const errorMessage =
          axiosError?.response?.data?.error || axiosError.message || 'Fehler beim Regenerieren';
        setRegenerationError(errorMessage);
        throw error;
      } finally {
        setIsRegenerating(false);
      }
    },
    []
  );

  /**
   * Clear regeneration error
   */
  const clearError = useCallback(() => {
    setRegenerationError(null);
  }, []);

  return {
    regenerateSharepic,
    isRegenerating,
    regenerationError,
    clearError,
  };
};

export default useCampaignSharepicEdit;
