import { useState } from 'react';
import { processText } from '../utils/apiClient';
import { parseEndpointResponse } from '../../utils/responseParser';

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
  [key: string]: unknown;
}

interface ApiSubmitResponse {
  [key: string]: unknown;
}

const useApiSubmit = (endpoint: string) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  const submitForm = async (formData: Record<string, unknown>, options: ApiSubmitOptions = {}): Promise<ApiSubmitResponse> => {

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
      const requestData: Record<string, unknown> = {
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


      const response = (await processText(endpoint, requestData)) as ApiSubmitResponse;

      // Special handling for plan mode responses
      // Plan mode returns { workflowId, plan, questions, ... } instead of { content, metadata }
      if (response && typeof response === 'object' && 'workflowId' in response) {
        // Return plan mode response directly without parsing
        return response;
      }

      // Special validation for /claude_social endpoint to catch raw AI responses
      if (endpoint === '/claude_social' && response && typeof response === 'object') {
        if ('tool_calls' in response) {
          console.error('[useApiSubmit] Received raw AI response with tool_calls - this should have been handled by backend:', response);
          throw new Error('Unexpected response format. Please try again without web search enabled.');
        }
        if ('stop_reason' in response || 'raw_content_blocks' in response) {
          console.error('[useApiSubmit] Received raw AI worker response structure:', response);
          throw new Error('Server returned invalid response format. Please try again.');
        }
      }

      // Parse response using centralized parser
      const parsedResult = parseEndpointResponse(response, endpoint);

      if (!parsedResult.success) {
        // Type narrowing: parsedResult is { success: false; error: string }
        const errorMessage = parsedResult.error;
        console.error(`[useApiSubmit] Failed to parse response for ${endpoint}:`, errorMessage);
        throw new Error(errorMessage || 'Leere Antwort von der KI erhalten.');
      }

      // Success - set state and return parsed content
      setSuccess(true);

      // Return the response in the expected format
      // Most endpoints expect { content, metadata } structure
      if (parsedResult.metadata) {
        return {
          ...parsedResult.metadata,
          content: parsedResult.content,
        };
      }

      // For string content without metadata, return structured response for consistency
      return {
        content: parsedResult.content,
        metadata: {},
      };
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error('Unknown error');
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
