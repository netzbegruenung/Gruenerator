import { useState } from 'react';
import { processText } from '../utils/apiClient';

const useApiSubmit = (endpoint) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const submitForm = async (formData, useBackup = false) => {
    setLoading(true);
    setSuccess(false);
    setError('');
    setRetryCount(0);

    try {
      const requestData = {
        ...formData,
        useBackupProvider: useBackup,
        onRetry: (attempt, delay) => {
          setRetryCount(attempt);
          setError(`Verbindungsprobleme. Neuer Versuch in ${Math.round(delay/1000)} Sekunden... (Versuch ${attempt}/3)`);
        }
      };
      
      console.log(`[useApiSubmit] Submitting to ${endpoint}:`, {
        useBackup,
        formData: requestData,
        endpoint
      });

      const response = await processText(endpoint, requestData);
      
      console.log('[useApiSubmit] Response Details:', {
        hasContent: !!response.content,
        provider: response.metadata?.provider,
        backupRequested: response.metadata?.backupRequested,
        timestamp: response.metadata?.timestamp
      });

      // Spezielle Behandlung für verschiedene Endpoints
      if (endpoint === '/claude_social') {
        if (response && response.content) {
          setSuccess(true);
          return response; // Gebe komplette Response für Social Media zurück
        }
      } else if (endpoint.includes('etherpad')) {
        if (response && response.padURL) {
          setSuccess(true);
          return response;
        }
      } else if (endpoint === '/claude_text_adjustment') {
        if (response && response.suggestions && response.suggestions.length > 0) {
          setSuccess(true);
          return response.suggestions[0];
        }
      } else {
        // Standard AI-Response-Behandlung
        if (response && response.content) {
          setSuccess(true);
          return response.content;
        }
      }

      throw new Error('Unerwartete Antwortstruktur von der API');
    } catch (error) {
      console.error(`[useApiSubmit] Error:`, error);
      setError(error.message);
      throw error;
    } finally {
      setLoading(false);
      setRetryCount(0);
    }
  };

  const resetSuccess = () => {
    setSuccess(false);
  };

  return { submitForm, loading, success, resetSuccess, error, retryCount };
};

export default useApiSubmit;