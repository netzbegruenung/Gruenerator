/**
 * useImageStudioCanvas Hook
 * Platform-agnostic hook for canvas-based image generation
 */

import { useState, useCallback } from 'react';
import { getGlobalApiClient } from '../../api/client.js';
import type {
  ImageStudioTemplateType,
  CanvasGenerationRequest,
} from '../types.js';
import { getTypeConfig, getCanvasEndpoint } from '../constants.js';
import {
  validateCanvasInput,
  validateCanvasResponse,
  ERROR_MESSAGES,
} from '../utils/validation.js';

export interface UseImageStudioCanvasOptions {
  onSuccess?: (imageBase64: string) => void;
  onError?: (error: string) => void;
}

export interface UseImageStudioCanvasReturn {
  /**
   * Generate image via canvas endpoint
   * @param type - The template type
   * @param request - Canvas generation request with form data and optional image
   * @returns Base64 encoded PNG image
   */
  generateCanvas: (
    type: ImageStudioTemplateType,
    request: CanvasGenerationRequest
  ) => Promise<string>;

  /** Whether generation is in progress */
  loading: boolean;

  /** Current error message */
  error: string | null;

  /** Reset error state */
  clearError: () => void;
}

/**
 * Hook for canvas-based image generation
 * Handles multipart form data submission to canvas endpoints
 */
export function useImageStudioCanvas(
  options: UseImageStudioCanvasOptions = {}
): UseImageStudioCanvasReturn {
  const { onSuccess, onError } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Build FormData for canvas request
   */
  const buildFormData = useCallback(
    (type: ImageStudioTemplateType, request: CanvasGenerationRequest): FormData => {
      const formData = new FormData();
      const config = getTypeConfig(type);

      // Add image if provided
      if (request.imageData) {
        // Handle base64 image data
        const base64Data = request.imageData.replace(/^data:image\/\w+;base64,/, '');
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        formData.append('image', blob, 'image.jpg');
      }

      // Type-specific form fields
      switch (type) {
        case 'dreizeilen':
          formData.append('line1', request.formData.line1?.toString() || '');
          formData.append('line2', request.formData.line2?.toString() || '');
          formData.append('line3', request.formData.line3?.toString() || '');
          formData.append('type', config?.legacyType || 'Dreizeilen');
          formData.append('fontSize', (request.fontSize || 85).toString());
          formData.append('credit', request.credit || '');

          // Bar offsets
          const balkenOffset = request.balkenOffset || [50, -100, 50];
          formData.append('balkenOffset_0', balkenOffset[0].toString());
          formData.append('balkenOffset_1', balkenOffset[1].toString());
          formData.append('balkenOffset_2', balkenOffset[2].toString());

          // Bar group offset
          const balkenGruppenOffset = request.balkenGruppenOffset || [0, 0];
          formData.append('balkenGruppe_offset_x', balkenGruppenOffset[0].toString());
          formData.append('balkenGruppe_offset_y', balkenGruppenOffset[1].toString());

          // Sunflower offset
          const sunflowerOffset = request.sunflowerOffset || [0, 0];
          formData.append('sunflower_offset_x', sunflowerOffset[0].toString());
          formData.append('sunflower_offset_y', sunflowerOffset[1].toString());

          // Color scheme
          if (request.colorScheme && Array.isArray(request.colorScheme)) {
            request.colorScheme.forEach((color, index) => {
              if (request.formData[`line${index + 1}`]) {
                formData.append(`colors_${index}_background`, color.background);
                formData.append(`colors_${index}_text`, color.text);
              }
            });
          }
          break;

        case 'zitat':
          formData.append('quote', request.formData.quote?.toString() || '');
          formData.append('name', request.formData.name?.toString() || '');
          formData.append('fontSize', (request.fontSize || 60).toString());
          break;

        case 'zitat-pure':
          formData.append('quote', request.formData.quote?.toString() || '');
          formData.append('name', request.formData.name?.toString() || '');
          formData.append('quoteFontSize', (request.fontSize || 60).toString());
          break;

        case 'info':
          formData.append('header', request.formData.header?.toString() || '');
          // Combine subheader and body for backend
          const subheader = request.formData.subheader?.toString() || '';
          const body = request.formData.body?.toString() || '';
          const combinedBody = subheader && body ? `${subheader}. ${body}` : subheader || body;
          formData.append('body', combinedBody);
          break;

        case 'veranstaltung':
          formData.append('eventTitle', request.formData.eventTitle?.toString() || '');
          formData.append('beschreibung', request.formData.beschreibung?.toString() || '');
          formData.append('weekday', request.formData.weekday?.toString() || '');
          formData.append('date', request.formData.date?.toString() || '');
          formData.append('time', request.formData.time?.toString() || '');
          formData.append('locationName', request.formData.locationName?.toString() || '');
          formData.append('address', request.formData.address?.toString() || '');

          // Per-field font sizes
          const fontSizes = request.veranstaltungFieldFontSizes || {};
          formData.append('fontSizeEventTitle', (fontSizes.eventTitle || 94).toString());
          formData.append('fontSizeBeschreibung', (fontSizes.beschreibung || 62).toString());
          formData.append('fontSizeWeekday', (fontSizes.weekday || 57).toString());
          formData.append('fontSizeDate', (fontSizes.date || 55).toString());
          formData.append('fontSizeTime', (fontSizes.time || 55).toString());
          formData.append('fontSizeLocationName', (fontSizes.locationName || 42).toString());
          formData.append('fontSizeAddress', (fontSizes.address || 42).toString());
          break;
      }

      return formData;
    },
    []
  );

  const generateCanvas = useCallback(
    async (
      type: ImageStudioTemplateType,
      request: CanvasGenerationRequest
    ): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        // Validate input
        const validation = validateCanvasInput(type, request.formData, !!request.imageData);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // Get endpoint
        const endpoint = getCanvasEndpoint(type);
        if (!endpoint) {
          throw new Error(ERROR_MESSAGES.NO_CANVAS_ENDPOINT);
        }

        // Build form data
        const formData = buildFormData(type, request);

        // Make API request
        const client = getGlobalApiClient();
        const response = await client.post(endpoint, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        // Validate response
        const responseValidation = validateCanvasResponse(response.data);
        if (!responseValidation.valid) {
          throw new Error(responseValidation.error);
        }

        const imageBase64 = response.data.image;
        onSuccess?.(imageBase64);
        return imageBase64;
      } catch (err: any) {
        const errorMessage =
          err.response?.data?.message || err.message || ERROR_MESSAGES.GENERATION_ERROR;
        setError(errorMessage);
        onError?.(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    [buildFormData, onSuccess, onError]
  );

  return {
    generateCanvas,
    loading,
    error,
    clearError,
  };
}
