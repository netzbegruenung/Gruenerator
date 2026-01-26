/**
 * useImageAutoSave Hook
 * Auto-saves generated images to the gallery with metadata for later editing
 */

import { useEffect, useCallback } from 'react';
import { useShareStore } from '@gruenerator/shared/share';
import { useImageStudioStore } from '../stores/imageStudioStore';

interface AutoSaveResult {
  status: 'idle' | 'saving' | 'saved' | 'error';
  shareToken: string | null;
  retry: () => void;
}

/**
 * Builds metadata for saving images based on type (template or KI)
 */
function buildMetadata(
  state: ReturnType<typeof useImageStudioStore.getState>
): Record<string, unknown> {
  const { type, kiType, formData, modifications, kiInstruction, kiVariant, uploadedImageBase64 } =
    state;

  const metadata: Record<string, unknown> = {
    hasOriginalImage: !!uploadedImageBase64,
    generatedAt: new Date().toISOString(),
  };

  // KI types
  if (kiType) {
    metadata.sharepicType = kiType;
    metadata.kiConfig = {
      kiType,
      prompt: kiInstruction || null,
      variant: kiVariant || null,
    };
  }
  // Template types
  else if (type) {
    metadata.sharepicType = type;
    metadata.content = { ...formData };
    if (modifications) {
      const mods = modifications as unknown as Record<string, unknown>;
      metadata.styling = {
        colorScheme: mods.colorScheme,
        fontSize: mods.fontSize,
        balkenOffset: mods.balkenOffset,
        credit: mods.credit,
      };
    }
  }

  return metadata;
}

/**
 * Hook to auto-save generated images to the gallery
 *
 * @returns Auto-save status and retry function
 */
export function useImageAutoSave(): AutoSaveResult {
  const {
    type,
    kiType,
    generatedImage,
    uploadedImageBase64,
    autoSaveStatus,
    autoSavedShareToken,
    lastAutoSavedImageSrc,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  } = useImageStudioStore();

  const { createImageShare } = useShareStore();

  const performAutoSave = useCallback(async () => {
    // Skip if no image to save
    if (!generatedImage) return;

    // Skip if already saving
    if (autoSaveStatus === 'saving') return;

    // Skip if already saved this image
    if (lastAutoSavedImageSrc === generatedImage) return;

    // Skip if no type selected
    if (!type && !kiType) return;

    setAutoSaveStatus('saving');

    try {
      const state = useImageStudioStore.getState();
      const metadata = buildMetadata(state);
      const title = kiType ? `KI ${kiType}` : type ? `Sharepic ${type}` : 'Sharepic';

      const share = await createImageShare({
        imageData: generatedImage,
        title,
        imageType: kiType || type || 'sharepic',
        metadata,
        originalImage: uploadedImageBase64 || undefined,
      });

      if (share?.shareToken) {
        setAutoSavedShareToken(share.shareToken);
        setLastAutoSavedImageSrc(generatedImage);
        setAutoSaveStatus('saved');
      } else {
        setAutoSaveStatus('error');
      }
    } catch (error) {
      console.error('[useImageAutoSave] Auto-save failed:', error);
      setAutoSaveStatus('error');
    }
  }, [
    generatedImage,
    autoSaveStatus,
    lastAutoSavedImageSrc,
    type,
    kiType,
    uploadedImageBase64,
    createImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  ]);

  // Auto-save when generated image changes
  useEffect(() => {
    if (generatedImage && generatedImage !== lastAutoSavedImageSrc) {
      // Delay auto-save slightly to let the UI settle
      const timer = setTimeout(performAutoSave, 500);
      return () => clearTimeout(timer);
    }
  }, [generatedImage, lastAutoSavedImageSrc, performAutoSave]);

  return {
    status: autoSaveStatus,
    shareToken: autoSavedShareToken,
    retry: performAutoSave,
  };
}

export default useImageAutoSave;
