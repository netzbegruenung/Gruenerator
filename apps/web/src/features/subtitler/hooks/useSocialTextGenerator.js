import { useState, useCallback } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';

const useSocialTextGenerator = () => {
  const [socialText, setSocialText] = useState('');
  const { submitForm, loading: isGenerating, error, resetSuccess } = useApiSubmit('/subtitler/generate-social');

  const generateSocialText = useCallback(async (subtitles) => {
    if (!subtitles) return;
    
    try {
      const response = await submitForm({ subtitles });
      if (response) {
        // Extrahiere den content aus der API-Antwort
        const content = typeof response === 'object' && response.content 
          ? response.content 
          : response;
        setSocialText(content);
      }
    } catch (err) {
      console.error('[useSocialTextGenerator] Fehler beim Generieren des Social Texts:', err);
    }
  }, [submitForm]);

  const reset = useCallback(() => {
    setSocialText('');
    resetSuccess();
  }, [resetSuccess]);

  return {
    socialText,
    isGenerating,
    error,
    generateSocialText,
    reset
  };
};

export default useSocialTextGenerator; 