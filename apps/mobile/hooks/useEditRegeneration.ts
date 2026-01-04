/**
 * useEditRegeneration Hook
 * Provides debounced canvas regeneration for template editing
 */

import { useCallback, useRef } from 'react';
import { useDebouncedCallback } from './useDebounced';
import { useImageStudio } from '@gruenerator/shared/image-studio';
import { useImageStudioStore } from '../stores/imageStudioStore';
import type { ImageStudioTemplateType, DreizeilenModificationParams, ModificationParams } from '@gruenerator/shared/image-studio';

interface UseEditRegenerationOptions {
  debounceMs?: number;
}

interface UseEditRegenerationResult {
  regenerate: () => void;
  debouncedRegenerate: () => void;
  isRegenerating: boolean;
}

export function useEditRegeneration(
  options: UseEditRegenerationOptions = {}
): UseEditRegenerationResult {
  const { debounceMs = 500 } = options;
  const isRegeneratingRef = useRef(false);

  const {
    type,
    formData,
    modifications,
    uploadedImageUri,
    uploadedImageBase64,
    canvasLoading,
    setGeneratedImage,
    setCanvasLoading,
    setError,
  } = useImageStudioStore();

  const { generateCanvas } = useImageStudio({
    onImageGenerated: (image) => {
      setGeneratedImage(image);
      isRegeneratingRef.current = false;
    },
    onError: (err) => {
      setError(err);
      isRegeneratingRef.current = false;
    },
  });

  const buildRequest = useCallback(
    (templateType: ImageStudioTemplateType, mods: ModificationParams | null) => {
      const baseRequest = {
        type: templateType,
        formData,
        // Use imageUri for React Native (preferred), fallback to imageData
        imageUri: uploadedImageUri || undefined,
        imageData: uploadedImageBase64 || undefined,
      };

      if (!mods) {
        return baseRequest;
      }

      if (templateType === 'dreizeilen') {
        const dm = mods as DreizeilenModificationParams;
        return {
          ...baseRequest,
          fontSize: dm.fontSize,
          balkenOffset: dm.balkenOffset,
          balkenGruppenOffset: dm.balkenGruppenOffset,
          sunflowerOffset: dm.sunflowerOffset,
          colorScheme: dm.colorScheme,
          credit: dm.credit,
        };
      }

      if (templateType === 'zitat' || templateType === 'zitat-pure') {
        return {
          ...baseRequest,
          fontSize: (mods as any).fontSize,
        };
      }

      return baseRequest;
    },
    [formData, uploadedImageUri, uploadedImageBase64]
  );

  const regenerate = useCallback(async () => {
    if (!type || isRegeneratingRef.current) return;

    isRegeneratingRef.current = true;
    setCanvasLoading(true);
    setError(null);

    try {
      const request = buildRequest(type, modifications);
      await generateCanvas(type, request);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler bei der Bildgenerierung');
      isRegeneratingRef.current = false;
    } finally {
      setCanvasLoading(false);
    }
  }, [type, modifications, buildRequest, generateCanvas, setCanvasLoading, setError]);

  const debouncedRegenerate = useDebouncedCallback(regenerate, debounceMs);

  return {
    regenerate,
    debouncedRegenerate,
    isRegenerating: canvasLoading,
  };
}
