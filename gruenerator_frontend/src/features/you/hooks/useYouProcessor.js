import { useState } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';

/**
 * Hook zur Verarbeitung von You-Anfragen mit Tool Use
 * Vereinfachte Logik - direkte Anfrage an You-API mit Tool Use
 */
const useYouProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState(null);
  
  const youApi = useApiSubmit('you');
  
  const processPrompt = async (prompt) => {
    console.log('useYouProcessor - processPrompt aufgerufen mit:', prompt);
    if (!prompt.trim() || isProcessing) return null;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Direkte Anfrage an You-API mit Tool Use
      const response = await youApi.submitForm({ prompt });
      
      console.log('useYouProcessor - API-Antwort erhalten:', response);
      
      const resultText = typeof response === 'object' && response.content 
        ? response.content 
        : typeof response === 'string' 
          ? response 
          : JSON.stringify(response);
      
      console.log('useYouProcessor - Ergebnis gesetzt:', resultText);
      
      setResult(resultText);
      return resultText;
    } catch (error) {
      console.error('useYouProcessor - Fehler:', error);
      setError(error.message || 'Ein Fehler ist aufgetreten');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };
  
  const reset = () => {
    console.log('useYouProcessor - Reset aufgerufen');
    setResult('');
    setError(null);
  };
  
  return {
    isProcessing,
    result,
    error,
    processPrompt,
    reset,
    getError: () => error || youApi.error
  };
};

export default useYouProcessor; 