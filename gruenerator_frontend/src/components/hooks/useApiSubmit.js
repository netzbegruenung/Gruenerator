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
        console.log(`[useApiSubmit] Using provider: ${response.provider}`);
        
        if (response.provider === 'openai') {
          setError('Backup-System wird verwendet aufgrund temporärer Probleme.');
        }
        
        setSuccess(true);
        return response.content || response.result;
      } else {
        throw new Error('Unerwartete Antwortstruktur von der API');
      }
    } catch (error) {
      console.error(`[useApiSubmit] Error processing ${endpoint}:`, error);
      
      if (error.response?.status === 529) {
        setError('Der Server ist momentan überlastet. Ein neuer Versuch wird automatisch gestartet...');
      } else if (error.response?.status === 503) {
        setError('Der Service ist vorübergehend nicht verfügbar. Ein neuer Versuch wird automatisch gestartet...');
      } else {
        setError('Es gab einen Fehler. Bitte versuchen Sie es später erneut.');
      }
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