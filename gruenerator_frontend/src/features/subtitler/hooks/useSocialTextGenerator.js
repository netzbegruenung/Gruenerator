import { useState, useCallback } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';

const useSocialTextGenerator = () => {
  const [socialText, setSocialText] = useState('');
  const { submitForm, loading: isGenerating, error, resetSuccess } = useApiSubmit('/subtitler/generate-social');

  const generateSocialText = useCallback(async (subtitles) => {
    if (!subtitles) return;
    
    try {
      const content = await submitForm({ subtitles });
      if (content) {
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