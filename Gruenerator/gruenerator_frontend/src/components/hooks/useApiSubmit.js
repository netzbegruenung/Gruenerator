import { useState } from 'react';
import { processText } from '../utils/apiClient';

const useApiSubmit = (endpoint) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const submitForm = async (formData) => {
    setLoading(true);
    setSuccess(false);
    setError('');
    try {
      console.log(`[useApiSubmit] Submitting to ${endpoint}:`, formData);
      const response = await processText(endpoint, formData);
      console.log(`[useApiSubmit] Received response from ${endpoint}:`, response);

      if (response && typeof response === 'object') {
        setSuccess(true);
        // Extrahieren Sie den 'content' aus der Antwort, falls vorhanden
        return response.content || response;
      } else {
        throw new Error('Unerwartete Antwortstruktur von der API');
      }
    } catch (error) {
      console.error(`[useApiSubmit] Error processing ${endpoint}:`, error);
      setError('Es gab einen Fehler. Bitte versuchen Sie es später erneut.');
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const resetSuccess = () => {
    setSuccess(false);
  };

  return { submitForm, loading, success, resetSuccess, error };
};

export default useApiSubmit;