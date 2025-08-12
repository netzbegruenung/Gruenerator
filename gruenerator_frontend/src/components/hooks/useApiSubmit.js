import { useState } from 'react';
import { processText } from '../utils/apiClient';
import { useAuthStore } from '../../stores/authStore';
import useGeneratedTextStore from '../../stores/core/generatedTextStore';

// Helper function to determine generator type from endpoint
const getGeneratorTypeFromEndpoint = (endpoint) => {
  const endpointMap = {
    '/claude_social': 'social_media',
    'claude_social': 'social_media',
    '/claude_gruene_jugend': 'gruenejugend',
    'claude_gruene_jugend': 'gruenejugend',
    'claude/antrag': 'antrag',
    'claude/antrag-simple': 'antrag',
    'antraege/generate-simple': 'antrag',
    '/claude_universal': 'universal',
    'claude_universal': 'universal',
    '/claude_rede': 'universal',
    'claude_rede': 'universal',
    '/claude_wahlprogramm': 'universal',
    'claude_wahlprogramm': 'universal'
  };
  return endpointMap[endpoint];
};

// Helper function to add memory in background (non-blocking)
const addMemoryInBackground = async (endpoint, formData, response, memoryEnabled) => {
  // Skip memory addition if not in development environment
  const isDevelopment = import.meta.env.VITE_APP_ENV === 'development';
  if (!isDevelopment) {
    console.log('[useApiSubmit] Skipping memory - not in development environment');
    return;
  }

  // Skip memory addition if memory is disabled
  if (!memoryEnabled) {
    console.log('[useApiSubmit] Skipping memory - memory functionality is disabled');
    return;
  }

  try {
    const generatorType = getGeneratorTypeFromEndpoint(endpoint);
    if (!generatorType) {
      console.log('[useApiSubmit] Skipping memory - not a generator endpoint:', endpoint);
      return;
    }

    // Prepare memory data
    const memoryData = {
      generatorType,
      ...formData
    };

    console.log('[useApiSubmit] Adding memory in background for:', generatorType);
    
    // Non-blocking call - don't await to avoid blocking user experience
    processText('/mem0/add-generator', memoryData).catch(error => {
      console.warn('[useApiSubmit] Background memory addition failed:', error.message);
      // Silently fail - memory errors shouldn't affect user experience
    });

  } catch (error) {
    console.warn('[useApiSubmit] Memory background process error:', error.message);
    // Don't throw - memory failure shouldn't affect generation
  }
};

const useApiSubmit = (endpoint) => {
  const { memoryEnabled } = useAuthStore();
  const { generatedText } = useGeneratedTextStore();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const submitForm = async (formData, options = {}) => {
    
    setLoading(true);
    setSuccess(false);
    setError('');
    setRetryCount(0);

    try {
      // Bedrock is now the default provider (Deutschland mode is always enabled)
      const requestData = {
        ...formData,
        useBedrock: true, // Always use Bedrock now
        // Privacy mode provider selection is now handled by backend automatically
        // Remove hardcoded provider selection - let backend determine provider based on request count
        onRetry: (attempt, delay) => {
          setRetryCount(attempt);
          setError(`Verbindungsprobleme. Neuer Versuch in ${Math.round(delay/1000)} Sekunden... (Versuch ${attempt}/3)`);
        }
      };
      
      console.log(`[useApiSubmit] Submitting to ${endpoint}:`, {
        useBedrock: true,
        provider: requestData.provider || 'default',
        usePrivacyMode: formData.usePrivacyMode,
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
      } else if (endpoint === 'zitat_abyssale') {
        console.log('[useApiSubmit] Processing zitat_abyssale response:', response);
        if (response && response.success && response.quote && response.image) {
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
      } else if (endpoint === 'claude/antrag' || endpoint === 'claude/antrag-simple' || endpoint === 'antraege/generate-simple' || endpoint === '/antraege/generate-simple') {
        console.log('[useApiSubmit] Processing antrag response:', response);
        if (response) {
          // Prüfe auf verschiedene mögliche Antwortstrukturen
          if (response.content) {
            setSuccess(true);
            // Add memory for successful antrag generation
            addMemoryInBackground(endpoint, formData, response, memoryEnabled);
            return response; // Return full response with metadata for title extraction
          } else if (response.metadata && response.metadata.content) {
            setSuccess(true);
            // Add memory for successful antrag generation
            addMemoryInBackground(endpoint, formData, response, memoryEnabled);
            return { content: response.metadata.content, metadata: response.metadata }; // Return structured response
          } else if (typeof response === 'string') {
            setSuccess(true);
            // Add memory for successful antrag generation
            addMemoryInBackground(endpoint, formData, response, memoryEnabled);
            return { content: response, metadata: {} }; // Wrap string response for consistency
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
      } else if (endpoint === '/claude_social') {
        console.log('[useApiSubmit] Processing claude_social response:', response);
        if (response && response.content) {
          setSuccess(true);
          // Add memory for successful social media generation
          addMemoryInBackground(endpoint, formData, response, memoryEnabled);
          return response; // Return full response with metadata for title extraction
        } else if (response && typeof response === 'string') {
          // Fallback if response is already a string
          setSuccess(true);
          // Add memory for successful social media generation
          addMemoryInBackground(endpoint, formData, response, memoryEnabled);
          return { content: response, metadata: {} }; // Wrap string response for consistency
        }
      } else if (endpoint === '/claude_gruene_jugend') {
        console.log('[useApiSubmit] Processing claude_gruene_jugend response:', response);
        if (response && response.content) {
          setSuccess(true);
          // Add memory for successful gruene jugend generation
          addMemoryInBackground(endpoint, formData, response, memoryEnabled);
          return response; // Return full response with metadata for title extraction
        } else if (response && typeof response === 'string') {
          // Fallback if response is already a string
          setSuccess(true);
          // Add memory for successful gruene jugend generation
          addMemoryInBackground(endpoint, formData, response, memoryEnabled);
          return { content: response, metadata: {} }; // Wrap string response for consistency
        }
      } else if (endpoint === '/claude_gruenerator_ask') {
        console.log('[useApiSubmit] Processing claude_gruenerator_ask response:', response);
        if (response && response.answer) {
          setSuccess(true);
          return response; // Return the full response with answer, sources, etc.
        }
      } else if (endpoint === '/custom_generator') {
        console.log('[useApiSubmit] Processing custom_generator response:', response);
        if (response && response.content) {
          setSuccess(true);
          return response; // Return the full response with content
        } else if (response && typeof response === 'string') {
          // Fallback if response is already a string
          setSuccess(true);
          return { content: response };
        }
      } else if (endpoint === '/bundestag/search' || endpoint === 'bundestag/search') {
        console.log('[useApiSubmit] Processing bundestag/search response:', response);
        console.log('[useApiSubmit] Response structure check:', {
          hasResponse: !!response,
          hasSuccess: !!response?.success,
          hasResults: response?.results !== undefined,
          resultsType: typeof response?.results,
          isResultsArray: Array.isArray(response?.results),
          resultsLength: response?.results?.length
        });
        
        if (response && response.success && Array.isArray(response.results)) {
          setSuccess(true);
          console.log('[useApiSubmit] Bundestag search successful, returning response with', response.results.length, 'results');
          return response; // Return full response with success, query, and results
        } else {
          console.error('[useApiSubmit] Invalid bundestag response structure:', {
            response: response,
            hasSuccess: response?.success,
            resultsType: typeof response?.results,
            isArray: Array.isArray(response?.results)
          });
          throw new Error('Invalid response format from Bundestag API');
        }
      } else if (endpoint === 'info_claude') {
        console.log('[useApiSubmit] Processing info_claude response:', response);
        if (response && response.mainInfo) {
          setSuccess(true);
          return {
            header: response.mainInfo.header,
            subheader: response.mainInfo.subheader,
            body: response.mainInfo.body,
            alternatives: response.alternatives || [],
            searchTerms: response.searchTerms || []
          };
        } else {
          console.error('[useApiSubmit] Invalid info_claude response structure:', {
            response: response,
            hasMainInfo: !!response?.mainInfo,
            mainInfoKeys: response?.mainInfo ? Object.keys(response.mainInfo) : []
          });
          throw new Error('Invalid response format from Info Claude API');
        }
      } else if (endpoint === 'headline_claude') {
        console.log('[useApiSubmit] Processing headline_claude response:', response);
        if (response && response.mainSlogan) {
          setSuccess(true);
          return {
            mainSlogan: response.mainSlogan,
            alternatives: response.alternatives || [],
            searchTerms: response.searchTerms || []
          };
        } else {
          console.error('[useApiSubmit] Invalid headline_claude response structure:', {
            response: response,
            hasMainSlogan: !!response?.mainSlogan
          });
          throw new Error('Invalid response format from Headline Claude API');
        }
      } else if (endpoint === '/claude_alttext') {
        console.log('[useApiSubmit] Processing claude_alttext response:', response);
        if (response && response.altText) {
          setSuccess(true);
          return response; // Return full response with altText and metadata
        } else {
          console.error('[useApiSubmit] Invalid claude_alttext response structure:', {
            response: response,
            hasAltText: !!response?.altText
          });
          throw new Error('Keine Alt-Text-Antwort von der KI erhalten.');
        }
      }

      // Fallback für alle anderen Endpoints
      console.log('[useApiSubmit] Fallback handling for endpoint:', endpoint);
      if (response) {
        setSuccess(true);
        // Add memory for successful generation (fallback)
        addMemoryInBackground(endpoint, formData, response, memoryEnabled);
        // If response has content and metadata structure, preserve it; otherwise return as-is
        if (response.content && response.metadata) {
          return response; // Already structured response
        } else if (typeof response === 'string') {
          return { content: response, metadata: {} }; // Wrap string for consistency
        }
        return response; // Return as-is for other structured responses
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