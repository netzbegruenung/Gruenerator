/**
 * useSharepicGeneration Hook
 * Platform-agnostic hook for sharepic generation using the global API client.
 */

import { useState, useCallback } from 'react';
import { getGlobalApiClient } from '../../api/client';
import {
  SHAREPIC_ENDPOINT,
  DEFAULT_SHAREPICS_ENDPOINT,
  SHAREPIC_TYPE_MAP,
} from '../constants';
import type {
  SharepicType,
  SharepicGenerationOptions,
  SharepicResult,
  SharepicRequest,
  SharepicResponse,
  DefaultSharepicsResponse,
} from '../types';

export interface UseSharepicGenerationOptions {
  /** Callback when generation succeeds */
  onSuccess?: (result: SharepicResult | SharepicResult[]) => void;
  /** Callback when generation fails */
  onError?: (error: Error) => void;
}

export interface UseSharepicGenerationReturn {
  /** Generate a sharepic with the given options */
  generateSharepic: (options: SharepicGenerationOptions) => Promise<SharepicResult | SharepicResult[]>;
  /** Whether generation is in progress */
  loading: boolean;
  /** The last error that occurred, if any */
  error: Error | null;
  /** Reset the hook state */
  reset: () => void;
}

/**
 * Platform-agnostic hook for sharepic generation.
 *
 * Uses the global API client configured at app startup via setGlobalApiClient().
 * Handles both single sharepic generation and default (3 auto) generation.
 *
 * @example
 * ```tsx
 * import { useSharepicGeneration } from '@gruenerator/shared/sharepic';
 *
 * function MyComponent() {
 *   const { generateSharepic, loading } = useSharepicGeneration({
 *     onSuccess: (result) => console.log('Generated:', result),
 *     onError: (error) => console.error('Failed:', error.message),
 *   });
 *
 *   const handleGenerate = async () => {
 *     const result = await generateSharepic({
 *       type: 'dreizeilen',
 *       thema: 'Klimaschutz jetzt!',
 *     });
 *   };
 *
 *   return (
 *     <button onClick={handleGenerate} disabled={loading}>
 *       {loading ? 'Generiere...' : 'Sharepic erstellen'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useSharepicGeneration(
  options: UseSharepicGenerationOptions = {}
): UseSharepicGenerationReturn {
  const { onSuccess, onError } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  /**
   * Generate default sharepics (3 auto-generated variations)
   */
  const generateDefaultSharepics = useCallback(
    async (options: SharepicGenerationOptions): Promise<SharepicResult[]> => {
      const client = getGlobalApiClient();

      const requestData: Partial<SharepicRequest> = {
        thema: options.thema,
        details: options.details,
      };

      if (options.customPrompt) {
        requestData.customPrompt = options.customPrompt;
      }

      if (options.usePrivacyMode) {
        requestData.usePrivacyMode = true;
      }

      const response = await client.post<DefaultSharepicsResponse>(
        DEFAULT_SHAREPICS_ENDPOINT,
        requestData
      );

      const data = response.data || (response as unknown as DefaultSharepicsResponse);

      if (!data.success || !data.sharepics) {
        throw new Error('Fehler bei der Sharepic-Generierung');
      }

      return data.sharepics;
    },
    []
  );

  /**
   * Generate a single sharepic of a specific type
   */
  const generateUnifiedSharepic = useCallback(
    async (options: SharepicGenerationOptions): Promise<SharepicResult> => {
      const client = getGlobalApiClient();
      const backendType = SHAREPIC_TYPE_MAP[options.type];

      const requestData: SharepicRequest = {
        type: backendType,
        thema: options.thema,
        details: options.details,
      };

      // Add author for quote types
      if (options.author) {
        requestData.name = options.author;
      }

      if (options.customPrompt) {
        requestData.customPrompt = options.customPrompt;
      }

      if (options.usePrivacyMode) {
        requestData.usePrivacyMode = true;
      }

      if (options.useProMode) {
        requestData.useBedrock = true;
      }

      // Add image data if provided (for dreizeilen, quote types)
      if (options.imageData && (options.type === 'dreizeilen' || options.type === 'quote')) {
        // Extract MIME type from data URL
        const mimeMatch = options.imageData.match(/^data:([^;]+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

        requestData.attachments = [
          {
            type: mimeType,
            data: options.imageData,
          },
        ];
      }

      const response = await client.post<SharepicResponse>(SHAREPIC_ENDPOINT, requestData);
      const data = response.data || (response as unknown as SharepicResponse);

      if (!data.success) {
        throw new Error(data.error || 'Fehler bei der Sharepic-Generierung');
      }

      return {
        image: data.image,
        text: data.text,
        type: data.type,
        originalImage: data.originalImage,
        alternatives: data.alternatives,
        id: `sharepic-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: new Date().toISOString(),
      };
    },
    []
  );

  /**
   * Main generation function - routes to appropriate handler based on type
   */
  const generateSharepic = useCallback(
    async (options: SharepicGenerationOptions): Promise<SharepicResult | SharepicResult[]> => {
      setLoading(true);
      setError(null);

      try {
        let result: SharepicResult | SharepicResult[];

        if (options.type === 'default') {
          result = await generateDefaultSharepics(options);
        } else {
          result = await generateUnifiedSharepic(options);
        }

        onSuccess?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unbekannter Fehler');
        setError(error);
        onError?.(error);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [generateDefaultSharepics, generateUnifiedSharepic, onSuccess, onError]
  );

  return {
    generateSharepic,
    loading,
    error,
    reset,
  };
}
