/**
 * useImageStudio Hook
 * Main orchestrator hook for image-studio functionality
 * Composes useTextGeneration (from generators) and useImageStudioCanvas
 */

import { useState, useCallback } from 'react';
import { getGlobalApiClient } from '../../api/client';
import type {
  ImageStudioTemplateType,
  TextGenerationRequest,
  CanvasGenerationRequest,
  NormalizedTextResult,
  UseImageStudioOptions,
  UseImageStudioReturn,
  ImageStudioFormData,
} from '../types';
import {
  getTypeConfig,
  getTextEndpoint,
  mapTextResponse,
} from '../constants';
import {
  validateTextGenerationInput,
  validateTextResponse,
  ERROR_MESSAGES,
} from '../utils/validation';
import { useImageStudioCanvas } from './useImageStudioCanvas';

/**
 * Main hook for image-studio functionality
 *
 * Combines text generation and canvas generation into a unified API.
 * Uses the existing useTextGeneration pattern from generators module
 * for text generation, and useImageStudioCanvas for image rendering.
 *
 * @example
 * ```tsx
 * const { generateText, generateCanvas, loading, error } = useImageStudio({
 *   onTextGenerated: (result) => console.log('Text:', result),
 *   onImageGenerated: (image) => console.log('Image ready'),
 * });
 *
 * // Step 1: Generate text
 * const textResult = await generateText('dreizeilen', { thema: 'Klimaschutz' });
 *
 * // Step 2: Generate image with the text
 * const imageBase64 = await generateCanvas('dreizeilen', {
 *   type: 'dreizeilen',
 *   imageData: uploadedImageBase64,
 *   formData: textResult.fields,
 * });
 * ```
 */
export function useImageStudio(
  options: UseImageStudioOptions = {}
): UseImageStudioReturn {
  const { onTextGenerated, onImageGenerated, onError } = options;

  // Text generation state
  const [textLoading, setTextLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Canvas generation (via composed hook)
  const {
    generateCanvas: canvasGenerate,
    loading: canvasLoading,
    error: canvasError,
    clearError: clearCanvasError,
  } = useImageStudioCanvas({
    onSuccess: onImageGenerated,
    onError,
  });

  const clearError = useCallback(() => {
    setError(null);
    clearCanvasError();
  }, [clearCanvasError]);

  /**
   * Generate text using Claude API
   */
  const generateText = useCallback(
    async (
      type: ImageStudioTemplateType,
      formData: TextGenerationRequest
    ): Promise<NormalizedTextResult> => {
      setTextLoading(true);
      setError(null);

      try {
        const config = getTypeConfig(type);

        // Check if type supports text generation
        if (!config?.hasTextGeneration) {
          // Return empty result for types without text generation
          return { fields: {}, alternatives: [] };
        }

        // Validate input - cast TextGenerationRequest to ImageStudioFormData for validation
        const validation = validateTextGenerationInput(type, formData as unknown as ImageStudioFormData);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // Get endpoint
        const endpoint = getTextEndpoint(type);
        if (!endpoint) {
          throw new Error('Kein Text-Endpoint für diesen Typ konfiguriert');
        }

        // Prepare request data
        const requestData = {
          ...formData,
          source: 'image-studio',
          count: 5,
        };

        // Make API request
        const client = getGlobalApiClient();
        const response = await client.post(endpoint, requestData);

        // Validate response
        const responseValidation = validateTextResponse(type, response.data);
        if (!responseValidation.valid) {
          throw new Error(responseValidation.error);
        }

        // Map response to normalized format
        const result = mapTextResponse(type, response.data);

        onTextGenerated?.(result);
        return result;
      } catch (err: unknown) {
        let errorMessage = ERROR_MESSAGES.GENERATION_ERROR;
        if (err instanceof Error) {
          errorMessage = err.message;
        }
        // Check for API error response structure
        if (err && typeof err === 'object' && 'response' in err) {
          const apiErr = err as { response?: { data?: { message?: string } } };
          if (apiErr.response?.data?.message) {
            errorMessage = apiErr.response.data.message;
          }
        }
        setError(errorMessage);
        onError?.(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setTextLoading(false);
      }
    },
    [onTextGenerated, onError]
  );

  /**
   * Generate canvas image
   */
  const generateCanvas = useCallback(
    async (
      type: ImageStudioTemplateType,
      request: CanvasGenerationRequest
    ): Promise<string> => {
      return canvasGenerate(type, request);
    },
    [canvasGenerate]
  );

  // Combined loading state
  const loading = textLoading || canvasLoading;

  // Combined error (prefer text error, fall back to canvas error)
  const combinedError = error || canvasError;

  return {
    generateText,
    generateCanvas,
    loading,
    textLoading,
    canvasLoading,
    error: combinedError,
    clearError,
  };
}
