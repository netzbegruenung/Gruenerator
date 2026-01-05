import { useState } from 'react';
import { processText } from '../utils/apiClient';
// @ts-ignore - useGeneratedTextStore might be in JS or missing types
import useGeneratedTextStore from '../../stores/core/generatedTextStore';

// Helper function to determine generator type from endpoint
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getGeneratorTypeFromEndpoint = (endpoint: string): string | undefined => {
  const endpointMap: Record<string, string> = {
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

interface ApiSubmitOptions {
  [key: string]: any;
}

interface ApiSubmitResponse {
  [key: string]: any;
}

const useApiSubmit = (endpoint: string) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { generatedText } = useGeneratedTextStore();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const submitForm = async (formData: Record<string, any>, options: ApiSubmitOptions = {}): Promise<any> => {

    setLoading(true);
    setSuccess(false);
    setError('');
    setRetryCount(0);

    try {
      // Derive mode flags
      const privacyMode = !!formData.usePrivacyMode;
      const proMode = !!formData.useProMode;
      const useBedrock = !!formData.useBedrock;


      // Pass only intent flags; provider/model selection remains on the backend.
      const requestData = {
        ...formData,
        ...options,
        usePrivacyMode: privacyMode,
        useProMode: proMode,
        useBedrock: useBedrock,
        onRetry: (attempt: number, delay: number) => {
          setRetryCount(attempt);
          setError(`Verbindungsprobleme. Neuer Versuch in ${Math.round(delay / 1000)} Sekunden... (Versuch ${attempt}/3)`);
        }
      };


      const response = await processText(endpoint, requestData) as ApiSubmitResponse;


      // Spezielle Behandlung für verschiedene Endpoints
      if (endpoint === 'claude/search-query') {
        if (response && response.content) {
          setSuccess(true);
          return response;
        }
      } else if (endpoint === '/dreizeilen_claude' || endpoint === 'dreizeilen_claude') {
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
        if (response) {
          // Prüfe auf verschiedene mögliche Antwortstrukturen
          if (response.content) {
            setSuccess(true);
            return response; // Return full response with metadata for title extraction
          } else if (response.metadata && (response.metadata as any).content) {
            setSuccess(true);
            return { content: (response.metadata as any).content, metadata: response.metadata }; // Return structured response
          } else if (typeof response === 'string') {
            setSuccess(true);
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
        if (response && response.category) {
          setSuccess(true);
          return {
            category: response.category,
            originalPrompt: response.originalPrompt || ''
          };
        }
      } else if (endpoint === '/generate_generator_config') {
        if (response &&
          typeof response === 'object' &&
          typeof response.name === 'string' &&
          typeof response.slug === 'string' &&
          Array.isArray(response.fields) &&
          typeof response.prompt === 'string' &&
          response.fields.every((field: any) =>
            typeof field === 'object' &&
            field !== null &&
            typeof field.label === 'string' &&
            typeof field.name === 'string' &&
            (field.type === 'text' || field.type === 'textarea' || field.type === 'select') &&
            typeof field.required === 'boolean' &&
            // Validate options array for select fields
            (field.type !== 'select' || (Array.isArray(field.options) && field.options.length > 0 &&
              field.options.every((opt: any) => opt && typeof opt.label === 'string' && typeof opt.value === 'string')))
          )
        ) {
          setSuccess(true);
          return response;
        } else {
          console.error('[useApiSubmit] Invalid structure for /generate_generator_config:', response);
          throw new Error('Ungültiges JSON-Format in der generierten Konfiguration. Bitte versuche es erneut.');
        }
      } else if (endpoint === '/claude_social') {

        // Check for unexpected object structures that could cause React rendering errors
        if (response && typeof response === 'object' && response.tool_calls) {
          console.error('[useApiSubmit] Received raw AI response with tool_calls - this should have been handled by backend:', response);
          throw new Error('Unexpected response format. Please try again without web search enabled.');
        }

        // Check for other problematic object structures
        if (response && typeof response === 'object' && (response.stop_reason || response.raw_content_blocks)) {
          console.error('[useApiSubmit] Received raw AI worker response structure:', response);
          throw new Error('Server returned invalid response format. Please try again.');
        }

        if (response && response.content) {
          setSuccess(true);
          return response; // Return full response with metadata for title extraction
        } else if (response && typeof response === 'string') {
          // Fallback if response is already a string
          setSuccess(true);
          return { content: response, metadata: {} }; // Wrap string response for consistency
        }
      } else if (endpoint === '/claude_gruene_jugend') {
        if (response && response.content) {
          setSuccess(true);
          return response; // Return full response with metadata for title extraction
        } else if (response && typeof response === 'string') {
          // Fallback if response is already a string
          setSuccess(true);
          return { content: response, metadata: {} }; // Wrap string response for consistency
        }
      } else if (endpoint === '/claude_gruenerator_ask') {
        if (response && response.answer) {
          setSuccess(true);
          return response; // Return the full response with answer, sources, etc.
        }
      } else if (endpoint === '/custom_generator') {
        if (response && response.content) {
          setSuccess(true);
          return response; // Return the full response with content
        } else if (response && typeof response === 'string') {
          // Fallback if response is already a string
          setSuccess(true);
          return { content: response };
        }
      } else if (endpoint === 'info_claude') {
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
      } else if (endpoint === '/subtitler/correct-subtitles' || endpoint === 'subtitler/correct-subtitles') {
        if (response && typeof response.hasCorrections === 'boolean') {
          setSuccess(true);
          return response;
        } else {
          console.error('[useApiSubmit] Invalid subtitle correction response:', response);
          throw new Error('Ungültige Antwort von der Korrektur-KI.');
        }
      }

      // Fallback für alle anderen Endpoints
      console.log('[useApiSubmit] Fallback handling for endpoint:', endpoint);
      if (response) {
        setSuccess(true);
        // If response has content and metadata structure, preserve it; otherwise return as-is
        if (response.content && response.metadata) {
          return response; // Already structured response
        } else if (typeof response === 'string') {
          return { content: response, metadata: {} }; // Wrap string for consistency
        }
        return response; // Return as-is for other structured responses
      }

      throw new Error('Leere Antwort von der KI erhalten.');
    } catch (err: any) {
      console.error('[useApiSubmit] Submit error:', err);
      setError(`${err.name || 'Fehler'}: ${err.message}`);
      setSuccess(false);
      throw err;
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
