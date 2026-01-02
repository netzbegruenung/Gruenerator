/**
 * useKiImageGeneration Hook
 * Hook for FLUX API-based KI image generation/editing
 */

import { useState, useCallback } from 'react';
import { getGlobalApiClient } from '../../api/client.js';
import type {
  KiCreateRequest,
  KiEditRequest,
  UseKiImageGenerationOptions,
  UseKiImageGenerationReturn,
  ImageStudioKiType,
} from '../types.js';
import { KI_TYPE_CONFIGS } from '../constants.js';

/**
 * Error messages for KI generation
 */
const KI_ERROR_MESSAGES = {
  GENERATION_ERROR: 'Bei der Bildgenerierung ist ein Fehler aufgetreten.',
  RATE_LIMIT_EXCEEDED: 'Du hast das Limit für KI-Bildgenerierung erreicht. Bitte versuche es später erneut.',
  INVALID_REQUEST: 'Ungültige Anfrage. Bitte überprüfe deine Eingaben.',
  NO_IMAGE_DATA: 'Kein Bild für die Bearbeitung vorhanden.',
  INSTRUCTION_TOO_SHORT: 'Die Beschreibung ist zu kurz.',
};

/**
 * Hook for KI image generation using FLUX API
 *
 * Provides methods for:
 * - pure-create: Generate images from text descriptions
 * - green-edit/universal-edit: Edit images with AI instructions
 *
 * @example
 * ```tsx
 * const { generatePureCreate, generateKiEdit, loading, error } = useKiImageGeneration({
 *   onImageGenerated: (image) => console.log('Image ready'),
 *   onRateLimitExceeded: () => console.log('Rate limit hit'),
 * });
 *
 * // Generate new image from text
 * const image = await generatePureCreate({
 *   description: 'A green city with trees',
 *   variant: 'illustration-pure',
 * });
 *
 * // Edit existing image
 * const editedImage = await generateKiEdit('green-edit', {
 *   imageData: uploadedImageBase64,
 *   instruction: 'Add trees and bike lanes',
 *   infrastructureOptions: ['trees', 'bike-lanes'],
 * });
 * ```
 */
export function useKiImageGeneration(
  options: UseKiImageGenerationOptions = {}
): UseKiImageGenerationReturn {
  const { onImageGenerated, onError, onRateLimitExceeded } = options;

  const [loading, setLoading] = useState(false);
  const [rateLimitExceeded, setRateLimitExceeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
    setRateLimitExceeded(false);
  }, []);

  /**
   * Handle API errors
   */
  const handleError = useCallback(
    (err: unknown): string => {
      let errorMessage = KI_ERROR_MESSAGES.GENERATION_ERROR;

      if (err instanceof Error) {
        errorMessage = err.message;
      }

      // Check for API error response structure
      if (err && typeof err === 'object' && 'response' in err) {
        const apiErr = err as { response?: { status?: number; data?: { message?: string; error?: string } } };

        // Check for rate limit (429)
        if (apiErr.response?.status === 429) {
          errorMessage = KI_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED;
          setRateLimitExceeded(true);
          onRateLimitExceeded?.();
        } else if (apiErr.response?.data?.message) {
          errorMessage = apiErr.response.data.message;
        } else if (apiErr.response?.data?.error) {
          errorMessage = apiErr.response.data.error;
        }
      }

      setError(errorMessage);
      onError?.(errorMessage);
      return errorMessage;
    },
    [onError, onRateLimitExceeded]
  );

  /**
   * Generate image from text (pure-create)
   */
  const generatePureCreate = useCallback(
    async (request: KiCreateRequest): Promise<string> => {
      setLoading(true);
      setError(null);
      setRateLimitExceeded(false);

      try {
        const config = KI_TYPE_CONFIGS['pure-create'];

        // Validate description length
        if (request.description.length < (config.minInstructionLength || 5)) {
          throw new Error(KI_ERROR_MESSAGES.INSTRUCTION_TOO_SHORT);
        }

        const client = getGlobalApiClient();
        const response = await client.post(config.endpoint, {
          prompt: request.description,
          variant: request.variant,
        });

        // Extract image from response
        const imageData = response.data?.image || response.data?.imageUrl;
        if (!imageData) {
          throw new Error(KI_ERROR_MESSAGES.GENERATION_ERROR);
        }

        // Ensure base64 format
        const imageBase64 = imageData.startsWith('data:')
          ? imageData
          : `data:image/png;base64,${imageData}`;

        onImageGenerated?.(imageBase64);
        return imageBase64;
      } catch (err: unknown) {
        const errorMessage = handleError(err);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [onImageGenerated, handleError]
  );

  /**
   * Edit image with KI instructions (green-edit, universal-edit)
   */
  const generateKiEdit = useCallback(
    async (
      type: 'green-edit' | 'universal-edit',
      request: KiEditRequest
    ): Promise<string> => {
      setLoading(true);
      setError(null);
      setRateLimitExceeded(false);

      try {
        const config = KI_TYPE_CONFIGS[type];

        // Validate image data
        if (!request.imageData) {
          throw new Error(KI_ERROR_MESSAGES.NO_IMAGE_DATA);
        }

        // Validate instruction length
        if (request.instruction.length < (config.minInstructionLength || 15)) {
          throw new Error(KI_ERROR_MESSAGES.INSTRUCTION_TOO_SHORT);
        }

        // Build prompt based on type
        let prompt = request.instruction;

        // For green-edit, add infrastructure options to prompt
        if (type === 'green-edit' && request.infrastructureOptions?.length) {
          const optionLabels: Record<string, string> = {
            trees: 'Bäume und Straßengrün',
            flowers: 'Bepflanzung und bienenfreundliche Blumen',
            'bike-lanes': 'Geschützte Fahrradwege',
            benches: 'Sitzbänke im Schatten',
            sidewalks: 'Breitere Gehwege',
            tram: 'Straßenbahn',
            'bus-stop': 'Bushaltestelle',
          };

          const selectedOptions = request.infrastructureOptions
            .map(opt => optionLabels[opt] || opt)
            .join(', ');

          prompt = `${request.instruction}. Füge hinzu: ${selectedOptions}`;
        }

        const client = getGlobalApiClient();
        const response = await client.post(config.endpoint, {
          prompt,
          image: request.imageData,
          mode: type === 'green-edit' ? 'green-edit' : 'universal',
        });

        // Extract image from response
        const imageData = response.data?.image || response.data?.imageUrl;
        if (!imageData) {
          throw new Error(KI_ERROR_MESSAGES.GENERATION_ERROR);
        }

        // Ensure base64 format
        const imageBase64 = imageData.startsWith('data:')
          ? imageData
          : `data:image/png;base64,${imageData}`;

        onImageGenerated?.(imageBase64);
        return imageBase64;
      } catch (err: unknown) {
        const errorMessage = handleError(err);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [onImageGenerated, handleError]
  );

  return {
    generatePureCreate,
    generateKiEdit,
    loading,
    rateLimitExceeded,
    error,
    clearError,
  };
}
