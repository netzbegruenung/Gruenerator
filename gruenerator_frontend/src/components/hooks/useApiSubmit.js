import { useState, useContext } from 'react';
import { processText } from '../utils/apiClient';
import { SupabaseAuthContext } from '../../context/SupabaseAuthContext';

const useApiSubmit = (endpoint) => {
  const { deutschlandmodus } = useContext(SupabaseAuthContext);

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
      // Log the context value right before using it
      console.log('[useApiSubmit] Checking deutschlandmodus from context inside submitForm:', deutschlandmodus);

      const useBedrock = deutschlandmodus === true;
      
      const effectiveUseBackup = useBackup && !useBedrock;

      const requestData = {
        ...formData,
        useBedrock: useBedrock,
        useBackupProvider: effectiveUseBackup,
        onRetry: (attempt, delay) => {
          setRetryCount(attempt);
          setError(`Verbindungsprobleme. Neuer Versuch in ${Math.round(delay/1000)} Sekunden... (Versuch ${attempt}/3)`);
        }
      };
      
      console.log(`[useApiSubmit] Submitting to ${endpoint}:`, {
        useBackup,
        useBedrock,
        formData: requestData,
        endpoint
      });

      const response = await processText(endpoint, requestData);
      
      console.log('[useApiSubmit] Full API Response:', response);
      console.log('[useApiSubmit] Response Type:', typeof response);
      console.log('[useApiSubmit] Response Keys:', Object.keys(response));

      // Spezielle Behandlung für verschiedene Endpoints
      if (endpoint === 'claude/search-query') {
        console.log('[useApiSubmit] Processing search query response:', response);
        if (response && response.content) {
          setSuccess(true);
          return response;
        }
      } else if (endpoint === '/dreizeilen_claude' || endpoint === 'dreizeilen_claude') {
        console.log('[useApiSubmit] Processing dreizeilen_claude response:', {
          hasMainSlogan: !!response?.mainSlogan,
          hasAlternatives: !!response?.alternatives,
          mainSloganType: typeof response?.mainSlogan,
          alternativesType: typeof response?.alternatives
        });
        if (response && 
            typeof response === 'object' && 
            response.mainSlogan && 
            response.alternatives && 
            Array.isArray(response.alternatives)) {
          setSuccess(true);
          return response;
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
      } else if (endpoint === '/claude_chat') {
        if (response && (response.response || response.responseType === 'searchResults')) {
          // Wenn es sich um Suchergebnisse handelt
          if (response.responseType === 'searchResults' && Array.isArray(response.messages)) {
            setSuccess(true);
            return response;
          }
          
          // Bestehende Logik für Edit/Think-Modus
          if (response.response) {
            // Wenn textAdjustment vorhanden ist, validiere dessen Struktur
            if (response.textAdjustment) {
              const { type, newText } = response.textAdjustment;
              
              // Nur full oder selected Typen erlauben
              if (!type || !newText || (type !== 'full' && type !== 'selected')) {
                throw new Error(`Ungültiger Anpassungstyp: ${type || 'unbekannt'}`);
              }
              
              // Debugging-Ausgabe für newText
              console.log('[useApiSubmit] textAdjustment.newText:', newText?.substring(0, 50) + '...');
              
              // Füge Standardwerte für context und punctuation hinzu falls nicht vorhanden
              if (!response.textAdjustment.context) {
                response.textAdjustment.context = {
                  beforeContext: '',
                  text: type === 'selected' ? 
                        response.textAdjustment.selectedText || '' : 
                        response.fullText || '',
                  afterContext: ''
                };
              }
              if (!response.textAdjustment.punctuation) {
                response.textAdjustment.punctuation = {
                  startsWithPunctuation: false,
                  endsWithPunctuation: false,
                  type: 'phrase'
                };
              }
            }
            
            setSuccess(true);
            return response;
          }
        }
      } else if (endpoint === '/claude_think') {
        if (response && response.response) {
          setSuccess(true);
          return response;
        }
      } else if (endpoint === 'zitat_claude') {
        if (response && response.quote) {
          setSuccess(true);
          return response;
        }
      } else if (endpoint === 'search') {
        console.log('[useApiSubmit] Verarbeite Suchantwort:', response);
        // Überprüfe verschiedene mögliche Antwortstrukturen
        if (response && (Array.isArray(response.results) || Array.isArray(response))) {
          setSuccess(true);
          return response;
        }
      } else if (endpoint === 'claude/antrag' || endpoint === 'claude/antrag-simple' || endpoint === 'antraege/generate-simple') {
        console.log('[useApiSubmit] Processing antrag response:', response);
        if (response) {
          // Prüfe auf verschiedene mögliche Antwortstrukturen
          if (response.content) {
            setSuccess(true);
            return response;
          } else if (response.metadata && response.metadata.content) {
            setSuccess(true);
            return { content: response.metadata.content, metadata: response.metadata };
          } else if (typeof response === 'string') {
            setSuccess(true);
            return { content: response };
          }
        }
      } else if (endpoint === 'analyze') {
        if (response && response.status === 'success' && response.analysis) {
          setSuccess(true);
          return {
            analysis: response.analysis,
            sourceRecommendations: response.sourceRecommendations || [],
            claudeSourceTitles: response.claudeSourceTitles || []
          };
        }
      } else if (endpoint === 'you') {
        console.log('[useApiSubmit] Processing you response:', response);
        if (response && response.category) {
          setSuccess(true);
          return {
            category: response.category,
            originalPrompt: response.originalPrompt || ''
          };
        }
      } else if (endpoint === '/generate_generator_config') {
        console.log('[useApiSubmit] Processing generator_config response:', response);
        if (response && 
            typeof response === 'object' &&
            typeof response.name === 'string' &&
            typeof response.slug === 'string' &&
            Array.isArray(response.fields) &&
            typeof response.prompt === 'string' &&
            response.fields.every(field => 
                typeof field === 'object' && 
                field !== null && 
                typeof field.label === 'string' &&
                typeof field.name === 'string' &&
                (field.type === 'text' || field.type === 'textarea') &&
                typeof field.required === 'boolean'
            )
        ) {
            setSuccess(true);
            return response;
        } else {
            console.error('[useApiSubmit] Invalid structure for /generate_generator_config:', response);
            throw new Error('Ungültiges JSON-Format in der generierten Konfiguration. Bitte versuche es erneut.');
        }
      }

      // Fallback für alle anderen Endpoints
      console.log('[useApiSubmit] Fallback handling for endpoint:', endpoint);
      if (response) {
        setSuccess(true);
        return response;
      }

      throw new Error('Leere Antwort von der KI erhalten.');
    } catch (error) {
      console.error('[useApiSubmit] Submit error:', error);
      setError(`${error.name || 'Fehler'}: ${error.message}`);
      setSuccess(false);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const resetSuccess = () => {
    setSuccess(false);
  };

  const resetState = () => {
    setLoading(false);
    setSuccess(false);
    setError('');
    setRetryCount(0);
  };

  return {
    loading,
    success,
    error,
    retryCount,
    submitForm,
    resetSuccess,
    resetState
  };
};

export default useApiSubmit;