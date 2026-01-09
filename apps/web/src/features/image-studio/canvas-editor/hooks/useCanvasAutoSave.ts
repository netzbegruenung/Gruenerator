import { useEffect, useRef, useCallback } from 'react';
import { useAutoSaveStore } from '../../hooks/useAutoSaveStore';
import { useShareStore } from '@gruenerator/shared/share';
import type { ShareMetadata } from '../../types/templateResultTypes';

interface CanvasAutoSaveOptions {
  canvasType: string;
  canvasState: Record<string, unknown>;
  enabled?: boolean;
}

interface CanvasAutoSaveReturn {
  status: 'idle' | 'saving' | 'saved' | 'error';
  shareToken: string | null;
  retry: () => Promise<void>;
}

/**
 * Build metadata for canvas share
 * Adapted from useImageHelpers.buildShareMetadata but for canvas-specific data
 */
function buildCanvasShareMetadata(
  canvasType: string,
  canvasState: Record<string, unknown>
): ShareMetadata {
  const metadata: ShareMetadata = {
    sharepicType: canvasType,
    hasOriginalImage: !!canvasState.currentImageSrc,
    content: {},
    styling: {},
    generatedAt: new Date().toISOString(),
  };

  // Extract canvas-specific content based on type
  if (canvasType === 'dreizeilen') {
    metadata.content = {
      line1: canvasState.line1 || '',
      line2: canvasState.line2 || '',
      line3: canvasState.line3 || '',
    };
    metadata.styling = {
      fontSize: canvasState.fontSize,
      colorScheme: canvasState.colorSchemeId,
      balkenWidthScale: canvasState.balkenWidthScale,
      balkenScale: canvasState.balkenScale,
      balkenOffset: canvasState.balkenOffset,
      barOffsets: canvasState.barOffsets,
      sunflowerPos: canvasState.sunflowerPos,
      sunflowerSize: canvasState.sunflowerSize,
      sunflowerVisible: canvasState.sunflowerVisible,
      sunflowerOpacity: canvasState.sunflowerOpacity,
      balkenOpacity: canvasState.balkenOpacity,
      imageOffset: canvasState.imageOffset,
      imageScale: canvasState.imageScale,
      selectedIcons: canvasState.selectedIcons,
      iconStates: canvasState.iconStates,
      shapeInstances: canvasState.shapeInstances,
      layerOrder: canvasState.layerOrder,
      additionalTexts: canvasState.additionalTexts,
    };
  } else {
    // Generic canvas - store full state
    metadata.content = { canvasState };
    metadata.styling = {};
  }

  return metadata;
}

/**
 * Auto-save canvas to gallery database
 * Adapted from useTemplateResultAutoSave for canvas-specific use
 */
export const useCanvasAutoSave = (
  generatedImage: string | null,
  options: CanvasAutoSaveOptions
): CanvasAutoSaveReturn => {
  const {
    autoSaveStatus,
    lastAutoSavedImageSrc,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  } = useAutoSaveStore();

  const { createImageShare } = useShareStore();

  // Use refs to store latest values without causing effect re-runs
  const latestRefs = useRef({
    canvasType: options.canvasType,
    canvasState: options.canvasState,
    enabled: options.enabled,
    autoSaveStatus,
    lastAutoSavedImageSrc,
    createImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  });

  // Update refs on each render
  latestRefs.current = {
    canvasType: options.canvasType,
    canvasState: options.canvasState,
    enabled: options.enabled,
    autoSaveStatus,
    lastAutoSavedImageSrc,
    createImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  };

  // Stable auto-save function that reads from refs
  const performAutoSave = useCallback(async (imageSrc: string) => {
    const refs = latestRefs.current;

    if (!imageSrc) return;
    if (refs.enabled === false) return;
    if (refs.autoSaveStatus === 'saving') return;
    if (refs.lastAutoSavedImageSrc === imageSrc) return;

    refs.setAutoSaveStatus('saving');

    try {
      const metadata = buildCanvasShareMetadata(refs.canvasType, refs.canvasState);
      const title = `Canvas: ${refs.canvasType}`;

      const share = await refs.createImageShare({
        imageData: imageSrc,
        title,
        imageType: refs.canvasType,
        metadata,
        originalImage: (refs.canvasState.currentImageSrc as string) ?? undefined,
      });

      if (share?.shareToken) {
        refs.setAutoSavedShareToken(share.shareToken);
        refs.setLastAutoSavedImageSrc(imageSrc);
        refs.setAutoSaveStatus('saved');
      }
    } catch (error) {
      refs.setAutoSaveStatus('error');
    }
  }, []);

  // Only trigger on generatedImage changes
  useEffect(() => {
    if (!generatedImage) return;

    const timer = setTimeout(() => {
      performAutoSave(generatedImage);
    }, 500);

    return () => clearTimeout(timer);
  }, [generatedImage, performAutoSave]);

  return {
    status: autoSaveStatus,
    shareToken: useAutoSaveStore.getState().autoSavedShareToken,
    retry: () => performAutoSave(generatedImage || ''),
  };
};

export default useCanvasAutoSave;
