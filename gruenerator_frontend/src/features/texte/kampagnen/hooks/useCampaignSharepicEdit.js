import { useState, useCallback } from 'react';
import apiClient from '../../../../components/utils/apiClient';

/**
 * Hook for editing and regenerating campaign sharepics
 * @returns {Object} Hook methods and state
 */
const useCampaignSharepicEdit = () => {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerationError, setRegenerationError] = useState(null);

  /**
   * Regenerate a single campaign sharepic with edited text
   * @param {Object} params - Regeneration parameters
   * @param {string} params.variant - Campaign variant ID (e.g., 'christmas_poem_green_festive')
   * @param {string} params.location - Location/theme for the campaign
   * @param {string} params.details - Additional details
   * @param {Object} params.editedLines - Edited line text { line1, line2, line3, line4, line5 }
   * @param {Object} params.features - Feature toggles (usePrivacyMode, useBedrock, etc.)
   * @returns {Promise<Object>} Regenerated sharepic object
   */
  const regenerateSharepic = useCallback(async ({ variant, location, details, editedLines, features }) => {
    setIsRegenerating(true);
    setRegenerationError(null);

    try {
      const response = await apiClient.post('/campaign_generate', {
        campaignId: 'christmas2025',
        campaignTypeId: variant,
        thema: location,
        details: details || '',
        lineOverrides: editedLines,
        count: 1,
        ...features
      });

      const result = response.data;

      if (!result.success || !result.sharepics || result.sharepics.length === 0) {
        throw new Error('Keine Sharepics vom Server empfangen');
      }

      return result.sharepics[0];

    } catch (error) {
      console.error('[useCampaignSharepicEdit] Regeneration failed:', error);
      const errorMessage = error?.response?.data?.error || error.message || 'Fehler beim Regenerieren';
      setRegenerationError(errorMessage);
      throw error;
    } finally {
      setIsRegenerating(false);
    }
  }, []);

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
    clearError
  };
};

export default useCampaignSharepicEdit;
