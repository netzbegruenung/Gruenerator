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
      
      if (response && response.content) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
        return response.content;
      } else {
        throw new Error('Unerwartete Antwortstruktur von der API');
      }
    } catch (error) {
      console.error(`[useApiSubmit] Error processing ${endpoint}:`, error);
      setError('Es gab einen Fehler. Bitte versuchen Sie es später erneut.');
      throw error; // Werfen Sie den Fehler, damit er in der aufrufenden Komponente behandelt werden kann
    } finally {
      setLoading(false);
    }
  };

  return { submitForm, loading, success, error };
};

export default useApiSubmit;