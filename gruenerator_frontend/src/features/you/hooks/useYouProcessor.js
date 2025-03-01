import { useState } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';

/**
 * Hook zur Verarbeitung von You-Anfragen
 * Kapselt die Logik für die Kategorisierung und Weiterleitung an die entsprechenden Backends
 */
const useYouProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState(null);
  
  // API-Hooks für die verschiedenen Endpunkte
  const youApi = useApiSubmit('you');
  const socialApi = useApiSubmit('claude_social');
  const redeApi = useApiSubmit('claude_rede');
  const universalApi = useApiSubmit('claude_universal');
  const antragApi = useApiSubmit('claude/antrag');
  
  // Funktion zum Verarbeiten der Anfrage
  const processPrompt = async (prompt) => {
    console.log('useYouProcessor - processPrompt aufgerufen mit:', prompt);
    if (!prompt.trim() || isProcessing) return null;
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Schritt 1: Kategorisierung
      const categorization = await youApi.submitForm({ prompt });
      const category = categorization.category || 'universal';
      
      // Schritt 2: Weiterleitung an das entsprechende Backend
      let apiResponse;
      let formData = { customPrompt: prompt };
      
      switch (category) {
        case 'social':
          formData = { 
            ...formData,
            platforms: ['facebook', 'twitter', 'instagram']
          };
          apiResponse = await socialApi.submitForm(formData);
          break;
        case 'rede':
          apiResponse = await redeApi.submitForm(formData);
          break;
        case 'antrag':
          apiResponse = await antragApi.submitForm(formData);
          break;
        case 'wahlprogramm':
        case 'universal':
        default:
          apiResponse = await universalApi.submitForm(formData);
          break;
      }
      
      // Ergebnis verarbeiten und setzen
      console.log('useYouProcessor - API-Antwort erhalten:', apiResponse);
      
      // Wenn apiResponse ein Objekt mit content-Eigenschaft ist, verwende diese
      const resultText = typeof apiResponse === 'object' && apiResponse.content 
        ? apiResponse.content 
        : typeof apiResponse === 'string' 
          ? apiResponse 
          : JSON.stringify(apiResponse);
      
      console.log('useYouProcessor - Ergebnis gesetzt:', resultText);
      console.log('useYouProcessor - Ergebnis Typ:', typeof resultText);
      
      setResult(resultText);
      return resultText;
    } catch (error) {
      console.error('useYouProcessor - Fehler bei der Verarbeitung:', error);
      setError(error.message || 'Ein Fehler ist aufgetreten');
      return null;
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Funktion zum Zurücksetzen
  const reset = () => {
    console.log('useYouProcessor - Reset aufgerufen');
    setResult('');
    setError(null);
  };
  
  // Bestimme, ob ein Fehler vorliegt
  const getError = () => {
    return youApi.error || socialApi.error || redeApi.error || universalApi.error || antragApi.error;
  };
  
  return {
    isProcessing,
    result,
    error,
    processPrompt,
    reset,
    getError
  };
};

export default useYouProcessor; 