/**
 * useTextGeneration Hook
 * Platform-agnostic hook for text generation using the global API client.
 */

import { useState, useCallback } from 'react';
import { getGlobalApiClient } from '../../api/client';
import { parseGeneratorResponse } from '../utils/responseParser';
import { parseGeneratorError } from '../utils/errorMessages';
import type { GeneratorResult, GeneratorError, BaseGeneratorRequest } from '../types';

export interface UseTextGenerationOptions {
  /** API endpoint path (e.g., '/claude_social') */
  endpoint: string;
  /** Callback when generation succeeds */
  onSuccess?: (result: GeneratorResult) => void;
  /** Callback when generation fails */
  onError?: (error: GeneratorError) => void;
}

export interface UseTextGenerationReturn {
  /** Trigger text generation with the given request data */
  generate: <T extends BaseGeneratorRequest>(data: T) => Promise<GeneratorResult>;
  /** Whether a generation is in progress */
  loading: boolean;
  /** The last error that occurred, if any */
  error: GeneratorError | null;
  /** The last successful result, if any */
  result: GeneratorResult | null;
  /** Reset the hook state (clear error and result) */
  reset: () => void;
}

/**
 * Platform-agnostic hook for text generation.
 *
 * Uses the global API client configured at app startup via setGlobalApiClient().
 * Handles response parsing and error mapping automatically.
 *
 * @example
 * ```tsx
 * import { useTextGeneration, GENERATOR_ENDPOINTS } from '@gruenerator/shared/generators';
 *
 * function MyComponent() {
 *   const { generate, loading, error, result } = useTextGeneration({
 *     endpoint: GENERATOR_ENDPOINTS.PRESSE_SOCIAL,
 *     onSuccess: (result) => console.log('Generated:', result.data?.content),
 *     onError: (error) => console.error('Failed:', error.message),
 *   });
 *
 *   const handleSubmit = async (formData) => {
 *     const result = await generate({
 *       inhalt: formData.content,
 *       platforms: ['instagram'],
 *     });
 *     if (result.success) {
 *       // Handle success
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleSubmit} disabled={loading}>
 *       {loading ? 'Generating...' : 'Generate'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useTextGeneration(options: UseTextGenerationOptions): UseTextGenerationReturn {
  const { endpoint, onSuccess, onError } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GeneratorError | null>(null);
  const [result, setResult] = useState<GeneratorResult | null>(null);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  const generate = useCallback(
    async <T extends BaseGeneratorRequest>(data: T): Promise<GeneratorResult> => {
      setLoading(true);
      setError(null);

      try {
        const client = getGlobalApiClient();
        const response = await client.post(endpoint, data);
        const parsed = parseGeneratorResponse(response);

        setResult(parsed);
        setLoading(false);

        if (parsed.success) {
          onSuccess?.(parsed);
        } else {
          const err: GeneratorError = {
            message: parsed.error || 'Unbekannter Fehler',
            isRetryable: false,
          };
          setError(err);
          onError?.(err);
        }

        return parsed;
      } catch (err) {
        const parsedError = parseGeneratorError(err);
        setError(parsedError);
        setLoading(false);
        onError?.(parsedError);

        return {
          success: false,
          error: parsedError.message,
        };
      }
    },
    [endpoint, onSuccess, onError]
  );

  return {
    generate,
    loading,
    error,
    result,
    reset,
  };
}
