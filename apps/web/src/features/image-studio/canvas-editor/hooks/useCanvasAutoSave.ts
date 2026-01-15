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
      fontSize: canvasState.fontSize as number | undefined,
      colorScheme: canvasState.colorSchemeId as string | undefined,
      balkenWidthScale: canvasState.balkenWidthScale as number | undefined,
      balkenScale: canvasState.balkenScale as number | undefined,
      balkenOffset: canvasState.balkenOffset as number[] | undefined,
      barOffsets: canvasState.barOffsets as [number, number, number] | undefined,
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
  } else if (canvasType === 'zitat' || canvasType === 'zitat-pure') {
    metadata.content = {
      quote: canvasState.quote || '',
      name: canvasState.name || '',
    };
    metadata.styling = {
      fontSize: canvasState.fontSize as number | undefined,
      colorScheme: canvasState.colorSchemeId as string | undefined,
      imageOffset: canvasState.imageOffset,
      imageScale: canvasState.imageScale,
      sunflowerPos: canvasState.sunflowerPos,
      sunflowerSize: canvasState.sunflowerSize,
      sunflowerVisible: canvasState.sunflowerVisible,
      sunflowerOpacity: canvasState.sunflowerOpacity,
      selectedIcons: canvasState.selectedIcons,
      iconStates: canvasState.iconStates,
      shapeInstances: canvasState.shapeInstances,
      layerOrder: canvasState.layerOrder,
      additionalTexts: canvasState.additionalTexts,
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
      imageOffset: canvasState.imageOffset,
      imageScale: canvasState.imageScale,
      sunflowerPos: canvasState.sunflowerPos,
      sunflowerSize: canvasState.sunflowerSize,
      sunflowerVisible: canvasState.sunflowerVisible,
      sunflowerOpacity: canvasState.sunflowerOpacity,
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

      // If we already have a shareToken, update the existing entry instead of creating new
      if (storeState.autoSavedShareToken) {
        console.log('[AutoSave] Updating existing share:', storeState.autoSavedShareToken);
        share = await refs.updateImageShare({
          shareToken: storeState.autoSavedShareToken,
          imageBase64: imageSrc,
          title,
          metadata,
        });
      } else {
        console.log('[AutoSave] Creating new share entry');
        share = await refs.createImageShare({
          imageData: imageSrc,
          title,
          imageType: refs.canvasType,
          metadata,
          originalImage: (refs.canvasState.currentImageSrc as string) ?? undefined,
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
