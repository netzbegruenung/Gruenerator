import { useCallback } from 'react';

import useGeneratedTextStore from '../stores/core/generatedTextStore';

/**
 * Parsed response structure with discriminated union for success/error
 */
export type ParsedResponse<T = string> =
  | {
      success: true;
      content: T;
      metadata?: Record<string, unknown>;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Configuration for generator response hook
 */
export interface ResponseParserConfig {
  /**
   * Component name for storing generated text
   * Used as key in generatedTextStore
   */
  componentName: string;

  /**
   * Optional callback when generation succeeds
   * @param content - Generated content
   * @param metadata - Optional metadata from response
   */
  onSuccess?: (content: string, metadata?: Record<string, unknown>) => void;
}

/**
 * Return value from useGeneratorResponse hook
 */
export interface ResponseParserReturn {
  /**
   * Parses API response into standardized format
   *
   * Handles both string responses and {content, metadata} objects
   * Returns discriminated union for type-safe error handling
   *
   * @param response - Raw API response
   * @param endpoint - Endpoint name (for future endpoint-specific parsing)
   * @returns Parsed response with success/error discrimination
   *
   * @example
   * ```typescript
   * const result = parseResponse(apiResponse, '/claude_social');
   * if (result.success) {
   *   console.log(result.content); // string
   *   console.log(result.metadata); // Record<string, unknown> | undefined
   * } else {
   *   console.error(result.error); // string
   * }
   * ```
   */
  parseResponse: <T = string>(response: unknown, endpoint: string) => ParsedResponse<T>;

  /**
   * Updates generated text in store
   *
   * Stores content in generatedTextStore with optional metadata
   * Triggers onSuccess callback if provided
   *
   * @param content - Generated text content
   * @param metadata - Optional metadata to store with content
   *
   * @example
   * ```typescript
   * const result = parseResponse(apiResponse, '/endpoint');
   * if (result.success) {
   *   updateGeneratedText(result.content, result.metadata);
   * }
   * ```
   */
  updateGeneratedText: (content: string, metadata?: Record<string, unknown>) => void;
}

/**
 * Standardizes response parsing and text store updates
 *
 * This hook provides type-safe response parsing with discriminated unions
 * and consistent generatedTextStore updates across all generators.
 *
 * **Replaces this pattern:**
 * ```typescript
 * const response = await submitForm(data);
 * if (response) {
 *   const content = typeof response === 'string' ? response : response.content;
 *   const metadata = typeof response === 'object' ? response.metadata : {};
 *   if (content) {
 *     setGeneratedText(componentName, content, metadata);
 *     setTimeout(resetSuccess, 3000);
 *   }
 * }
 * ```
 *
 * **With this:**
 * ```typescript
 * const result = parseResponse(response, endpoint);
 * if (result.success) {
 *   updateGeneratedText(result.content, result.metadata);
 * }
 * ```
 *
 * @param config - Response parser configuration
 * @returns Parser functions for response handling
 *
 * @example
 * ```typescript
 * const { parseResponse, updateGeneratedText } = useGeneratorResponse({
 *   componentName: 'presse-social',
 *   onSuccess: (content, metadata) => {
 *     console.log('Generated:', content);
 *   }
 * });
 *
 * const onSubmit = async () => {
 *   const response = await apiClient.post('/endpoint', data);
 *   const result = parseResponse(response, '/endpoint');
 *
 *   if (result.success) {
 *     updateGeneratedText(result.content, result.metadata);
 *   } else {
 *     console.error(result.error);
 *   }
 * };
 * ```
 */
export function useGeneratorResponse(config: ResponseParserConfig): ResponseParserReturn {
  const { setGeneratedText } = useGeneratedTextStore();

  /**
   * Parses API response with type guards
   * Handles multiple response formats for backward compatibility
   */
  const parseResponse = useCallback(
    <T = string>(
      response: unknown,
      endpoint: string // eslint-disable-line @typescript-eslint/no-unused-vars
    ): ParsedResponse<T> => {
      // Handle null/undefined response
      if (response === null || response === undefined) {
        return {
          success: false,
          error: 'Empty response received from API',
        };
      }

      // Handle string response (legacy format)
      if (typeof response === 'string') {
        return {
          success: true,
          content: response as T,
          metadata: undefined,
        };
      }

      // Handle object response
      if (typeof response === 'object') {
        const responseObj = response as Record<string, unknown>;

        // Standard format: { content: string, metadata?: object }
        if ('content' in responseObj) {
          const content = responseObj.content;

          // Validate content is string-like
          if (
            typeof content === 'string' ||
            typeof content === 'number' ||
            typeof content === 'boolean'
          ) {
            return {
              success: true,
              content: String(content) as T,
              metadata:
                'metadata' in responseObj &&
                typeof responseObj.metadata === 'object' &&
                responseObj.metadata !== null
                  ? (responseObj.metadata as Record<string, unknown>)
                  : undefined,
            };
          }
        }

        // Handle error responses
        if ('error' in responseObj && typeof responseObj.error === 'string') {
          return {
            success: false,
            error: responseObj.error,
          };
        }

        // Unexpected object structure
        return {
          success: false,
          error: 'Invalid response format: missing content field',
        };
      }

      // Unexpected type
      return {
        success: false,
        error: `Unexpected response type: ${typeof response}`,
      };
    },
    []
  );

  /**
   * Updates generated text store and triggers success callback
   */
  const updateGeneratedText = useCallback(
    (content: string, metadata?: Record<string, unknown>) => {
      // Store generated text
      setGeneratedText(config.componentName, content, metadata);

      // Trigger success callback if provided
      if (config.onSuccess) {
        config.onSuccess(content, metadata);
      }
    },
    [config.componentName, config.onSuccess, setGeneratedText]
  );

  return {
    parseResponse,
    updateGeneratedText,
  };
}

/**
 * Type guard to check if a response is successful
 *
 * @param response - Parsed response to check
 * @returns True if response is successful
 *
 * @example
 * ```typescript
 * const result = parseResponse(apiResponse, '/endpoint');
 * if (isSuccessResponse(result)) {
 *   // result.content is accessible
 *   console.log(result.content);
 * } else {
 *   // result.error is accessible
 *   console.error(result.error);
 * }
 * ```
 */
export function isSuccessResponse<T>(
  response: ParsedResponse<T>
): response is Extract<ParsedResponse<T>, { success: true }> {
  return response.success === true;
}

/**
 * Type guard to check if a response is an error
 *
 * @param response - Parsed response to check
 * @returns True if response is an error
 *
 * @example
 * ```typescript
 * const result = parseResponse(apiResponse, '/endpoint');
 * if (isErrorResponse(result)) {
 *   console.error('Generation failed:', result.error);
 * }
 * ```
 */
export function isErrorResponse<T>(
  response: ParsedResponse<T>
): response is Extract<ParsedResponse<T>, { success: false }> {
  return response.success === false;
}
