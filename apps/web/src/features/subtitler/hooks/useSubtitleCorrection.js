import { useState, useCallback } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';

/**
 * Hook for AI-powered subtitle correction.
 * Sends subtitle segments to the backend for grammar/spelling/punctuation corrections.
 */
const useSubtitleCorrection = () => {
  const [corrections, setCorrections] = useState(null);
  const { submitForm, loading, error, success, resetState } = useApiSubmit('/subtitler/correct-subtitles');

  const correctSubtitles = useCallback(async (segments) => {
    try {
      const response = await submitForm({ segments });
      setCorrections(response);
      return response;
    } catch (err) {
      console.error('[useSubtitleCorrection] Error:', err);
      throw err;
    }
  }, [submitForm]);

  const clearCorrections = useCallback(() => {
    setCorrections(null);
  }, []);

  const reset = useCallback(() => {
    setCorrections(null);
    resetState();
  }, [resetState]);

  return {
    corrections,
    loading,
    error,
    success,
    correctSubtitles,
    clearCorrections,
    reset
  };
};

export default useSubtitleCorrection;
