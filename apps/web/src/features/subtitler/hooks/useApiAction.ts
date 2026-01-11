/**
 * Generic API action hook for subtitler feature
 *
 * Wraps the existing useApiSubmit hook with type-safe request/response handling.
 * Eliminates duplicate patterns in:
 * - useSubtitleCorrection.js
 * - useSocialTextGenerator.js
 *
 * Builds on existing app patterns:
 * - Uses @components/hooks/useApiSubmit for API calls
 * - Uses @components/utils/errorHandling for error handling
 */

import { useState, useCallback } from 'react';
import useApiSubmit from '../../../components/hooks/useApiSubmit';
import { handleError } from '../../../components/utils/errorHandling';
import type { ErrorState } from '../../../components/utils/errorHandling';

interface UseApiActionOptions<TRequest, TResponse> {
  /**
   * API endpoint path
   */
  endpoint: string;

  /**
   * Optional transform function to process response
   */
  transformResponse?: (response: unknown) => TResponse;

  /**
   * Optional success callback
   */
  onSuccess?: (data: TResponse) => void;

  /**
   * Optional error callback
   */
  onError?: (error: ErrorState) => void;
}

interface UseApiActionReturn<TRequest, TResponse> {
  /**
   * Response data (null until first successful call)
   */
  data: TResponse | null;

  /**
   * Loading state
   */
  loading: boolean;

  /**
   * Error state (uses app-wide ErrorState structure)
   */
  error: ErrorState | null;

  /**
   * Success state
   */
  success: boolean;

  /**
   * Execute the API action
   */
  execute: (request: TRequest) => Promise<TResponse>;

  /**
   * Clear stored data
   */
  clearData: () => void;

  /**
   * Reset all state (data, error, success)
   */
  reset: () => void;
}

/**
 * Generic API action hook with type safety
 *
 * @example
 * ```typescript
 * const { data, loading, error, execute } = useApiAction<
 *   SubtitleSegment[],
 *   CorrectionResponse
 * >({
 *   endpoint: '/subtitler/correct-subtitles',
 *   transformResponse: (response) => response as CorrectionResponse
 * });
 *
 * const result = await execute(segments);
 * ```
 */
export function useApiAction<TRequest = unknown, TResponse = unknown>(
  options: UseApiActionOptions<TRequest, TResponse>
): UseApiActionReturn<TRequest, TResponse> {
  const [data, setData] = useState<TResponse | null>(null);
  const [errorState, setErrorState] = useState<ErrorState | null>(null);

  // Use existing app-wide useApiSubmit hook
  const { submitForm, loading, error: apiError, success, resetState } = useApiSubmit(options.endpoint);

  /**
   * Execute the API action with type-safe request/response
   */
  const execute = useCallback(
    async (request: TRequest): Promise<TResponse> => {
      try {
        // Clear previous error
        setErrorState(null);

        // Call API using existing submitForm
        const response = await submitForm(request as Record<string, unknown>);

        // Transform response if transformer provided
        const transformed = options.transformResponse
          ? options.transformResponse(response)
          : (response as TResponse);

        // Store data
        setData(transformed);

        // Call success callback if provided
        if (options.onSuccess) {
          options.onSuccess(transformed);
        }

        return transformed;
      } catch (err) {
        // Use existing app-wide error handling
        handleError(err, setErrorState);

        // Call error callback if provided
        if (options.onError && errorState) {
          options.onError(errorState);
        }

        throw err;
      }
    },
    [submitForm, options.transformResponse, options.onSuccess, options.onError, errorState]
  );

  /**
   * Clear stored data without resetting other state
   */
  const clearData = useCallback(() => {
    setData(null);
  }, []);

  /**
   * Reset all state
   */
  const reset = useCallback(() => {
    setData(null);
    setErrorState(null);
    resetState();
  }, [resetState]);

  // Return error from either errorState or fallback to apiError string
  const finalError = errorState || (apiError ? {
    title: 'Fehler',
    message: apiError
  } as ErrorState : null);

  return {
    data,
    loading,
    error: finalError,
    success,
    execute,
    clearData,
    reset
  };
}

export default useApiAction;
