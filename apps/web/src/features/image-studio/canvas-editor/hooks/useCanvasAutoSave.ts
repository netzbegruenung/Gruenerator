import { useShareStore } from '@gruenerator/shared/share';
import { useEffect, useRef, useCallback } from 'react';

import { useAutoSaveStore } from '../../hooks/useAutoSaveStore';

import type { ShareMetadata } from '../../types/templateResultTypes';

/**
 * Convert a File/Blob to base64 data URL
 */
async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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
      fontSize: canvasState.fontSize as number | undefined,
      colorScheme: canvasState.colorSchemeId as string | undefined,
      balkenWidthScale: canvasState.balkenWidthScale as number | undefined,
      balkenScale: canvasState.balkenScale as number | undefined,
      balkenOffset: canvasState.balkenOffset as number[] | undefined,
      barOffsets: canvasState.barOffsets as [number, number, number] | undefined,
      sunflowerPos: canvasState.sunflowerPos as { x: number; y: number } | null | undefined,
      sunflowerSize: canvasState.sunflowerSize as { w: number; h: number } | null | undefined,
      sunflowerVisible: canvasState.sunflowerVisible as boolean | undefined,
      sunflowerOpacity: canvasState.sunflowerOpacity as number | undefined,
      balkenOpacity: canvasState.balkenOpacity as number | undefined,
      imageOffset: canvasState.imageOffset as { x: number; y: number } | undefined,
      imageScale: canvasState.imageScale as number | undefined,
      selectedIcons: canvasState.selectedIcons as string[] | undefined,
      iconStates: canvasState.iconStates as Record<string, unknown> | undefined,
      shapeInstances: canvasState.shapeInstances as unknown[] | undefined,
      layerOrder: canvasState.layerOrder as string[] | undefined,
      additionalTexts: canvasState.additionalTexts as unknown[] | undefined,
    };
  } else if (canvasType === 'zitat' || canvasType === 'zitat-pure') {
    metadata.content = {
      quote: canvasState.quote || '',
      name: canvasState.name || '',
    };
    metadata.styling = {
      fontSize: canvasState.fontSize as number | undefined,
      colorScheme: canvasState.colorSchemeId as string | undefined,
      imageOffset: canvasState.imageOffset as { x: number; y: number } | undefined,
      imageScale: canvasState.imageScale as number | undefined,
      sunflowerPos: canvasState.sunflowerPos as { x: number; y: number } | null | undefined,
      sunflowerSize: canvasState.sunflowerSize as { w: number; h: number } | null | undefined,
      sunflowerVisible: canvasState.sunflowerVisible as boolean | undefined,
      sunflowerOpacity: canvasState.sunflowerOpacity as number | undefined,
      selectedIcons: canvasState.selectedIcons as string[] | undefined,
      iconStates: canvasState.iconStates as Record<string, unknown> | undefined,
      shapeInstances: canvasState.shapeInstances as unknown[] | undefined,
      layerOrder: canvasState.layerOrder as string[] | undefined,
      additionalTexts: canvasState.additionalTexts as unknown[] | undefined,
    };
  } else if (canvasType === 'info') {
    metadata.content = {
      header: canvasState.header || '',
      subheader: canvasState.subheader || '',
      body: canvasState.body || '',
    };
    metadata.styling = {
      fontSize: canvasState.fontSize as number | undefined,
      colorScheme: canvasState.colorSchemeId as string | undefined,
      imageOffset: canvasState.imageOffset as { x: number; y: number } | undefined,
      imageScale: canvasState.imageScale as number | undefined,
      sunflowerPos: canvasState.sunflowerPos as { x: number; y: number } | null | undefined,
      sunflowerSize: canvasState.sunflowerSize as { w: number; h: number } | null | undefined,
      sunflowerVisible: canvasState.sunflowerVisible as boolean | undefined,
      sunflowerOpacity: canvasState.sunflowerOpacity as number | undefined,
      selectedIcons: canvasState.selectedIcons as string[] | undefined,
      iconStates: canvasState.iconStates as Record<string, unknown> | undefined,
      shapeInstances: canvasState.shapeInstances as unknown[] | undefined,
      layerOrder: canvasState.layerOrder as string[] | undefined,
      additionalTexts: canvasState.additionalTexts as unknown[] | undefined,
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
 *
 * Note: This hook no longer subscribes to autoSaveStatus to avoid triggering
 * re-renders in parent components. SidebarTabBar reads status directly from store.
 */
export const useCanvasAutoSave = (
  generatedImage: string | null,
  options: CanvasAutoSaveOptions
): CanvasAutoSaveReturn => {
  // Only get action setters - no state subscriptions to avoid re-renders
  const setAutoSaveStatus = useAutoSaveStore((s) => s.setAutoSaveStatus);
  const setAutoSavedShareToken = useAutoSaveStore((s) => s.setAutoSavedShareToken);
  const setLastAutoSavedImageSrc = useAutoSaveStore((s) => s.setLastAutoSavedImageSrc);

  const { createImageShare, updateImageShare } = useShareStore();

  // Use refs to store latest values without causing effect re-runs
  const latestRefs = useRef({
    canvasType: options.canvasType,
    canvasState: options.canvasState,
    enabled: options.enabled,
    createImageShare,
    updateImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  });

  // Update refs on each render
  latestRefs.current = {
    canvasType: options.canvasType,
    canvasState: options.canvasState,
    enabled: options.enabled,
    createImageShare,
    updateImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  };

  // Stable auto-save function that reads from refs
  const performAutoSave = useCallback(async (imageSrc: string) => {
    const refs = latestRefs.current;
    // Read current store state directly to avoid stale closures
    const storeState = useAutoSaveStore.getState();

    if (!imageSrc) {
      console.log('[AutoSave] Skipped: No image source');
      return;
    }
    if (refs.enabled === false) {
      console.log('[AutoSave] Skipped: Disabled');
      return;
    }
    if (storeState.autoSaveStatus === 'saving') {
      console.log('[AutoSave] Skipped: Already saving');
      return;
    }
    if (storeState.lastAutoSavedImageSrc === imageSrc) {
      console.log('[AutoSave] Skipped: Same image already saved');
      return;
    }

    console.log('[AutoSave] Starting save...', {
      canvasType: refs.canvasType,
      hasExistingToken: !!storeState.autoSavedShareToken,
      imageLength: imageSrc.length,
    });

    refs.setAutoSaveStatus('saving');

    try {
      const metadata = buildCanvasShareMetadata(refs.canvasType, refs.canvasState);
      const title = `Canvas: ${refs.canvasType}`;

      let share;

      // Convert backgroundImageFile to base64 if present
      let originalImageBase64: string | undefined;
      const bgFile = refs.canvasState.backgroundImageFile as File | Blob | null | undefined;
      if (bgFile) {
        try {
          originalImageBase64 = await fileToBase64(bgFile);
        } catch (err) {
          console.warn('[AutoSave] Failed to convert background image to base64:', err);
        }
      }

      // If we already have a shareToken, update the existing entry instead of creating new
      if (storeState.autoSavedShareToken) {
        console.log('[AutoSave] Updating existing share:', storeState.autoSavedShareToken);
        share = await refs.updateImageShare({
          shareToken: storeState.autoSavedShareToken,
          imageBase64: imageSrc,
          title,
          metadata,
          originalImage: originalImageBase64,
        });
      } else {
        console.log('[AutoSave] Creating new share entry');
        share = await refs.createImageShare({
          imageData: imageSrc,
          title,
          imageType: refs.canvasType,
          metadata,
          originalImage: originalImageBase64,
        });
      }

      if (share?.shareToken) {
        console.log('[AutoSave] Success! Token:', share.shareToken);
        refs.setAutoSavedShareToken(share.shareToken);
        refs.setLastAutoSavedImageSrc(imageSrc);
        refs.setAutoSaveStatus('saved');
      } else {
        console.log('[AutoSave] No shareToken in response');
      }
    } catch (error) {
      console.error('[AutoSave] Error:', error);
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

  // Return status by reading directly from store (no subscription = no re-renders)
  return {
    status: useAutoSaveStore.getState().autoSaveStatus,
    shareToken: useAutoSaveStore.getState().autoSavedShareToken,
    retry: () => performAutoSave(generatedImage || ''),
  };
};

export default useCanvasAutoSave;
