import { useShareStore } from '@gruenerator/shared/share';
import { useEffect, useLayoutEffect, useRef, useCallback } from 'react';

import { useAutoSaveStore, useAutoSaveStoreApi } from '../stores/useAutoSaveStore';

interface ShareMetadata {
  [key: string]: unknown;
  sharepicType: string;
  hasOriginalImage: boolean;
  content: Record<string, unknown>;
  styling: Record<string, unknown>;
}

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
  /**
   * Captures the current stage as a data URL for the unmount flush.
   * Must be safe to call during teardown (return null when the stage is gone).
   */
  captureImage?: () => string | null;
  /**
   * Reports the share token whenever a save creates or adopts one. Invoked
   * from the save routine itself so a token resolving after unmount (flush
   * save, in-flight save) still reaches the host.
   */
  onShareToken?: (token: string) => void;
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
  canvasState: Record<string, unknown>,
  hasOriginalImage: boolean
): ShareMetadata {
  const metadata: ShareMetadata = {
    sharepicType: canvasType,
    hasOriginalImage,
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
      currentImageSrc: canvasState.currentImageSrc as string | undefined,
      backgroundImageOpacity: canvasState.backgroundImageOpacity as number | undefined,
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
      currentImageSrc: canvasState.currentImageSrc as string | undefined,
      backgroundImageOpacity: canvasState.backgroundImageOpacity as number | undefined,
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
      currentImageSrc: canvasState.currentImageSrc as string | undefined,
      backgroundImageOpacity: canvasState.backgroundImageOpacity as number | undefined,
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
  const autoSaveStoreApi = useAutoSaveStoreApi();
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
    captureImage: options.captureImage,
    onShareToken: options.onShareToken,
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
    captureImage: options.captureImage,
    onShareToken: options.onShareToken,
    createImageShare,
    updateImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  };

  // Stable auto-save function that reads from refs
  const performAutoSave = useCallback(
    async (imageSrc: string) => {
      const refs = latestRefs.current;
      // Read current store state directly to avoid stale closures
      const storeState = autoSaveStoreApi.getState();

      if (!imageSrc) return;
      if (refs.enabled === false) return;
      if (storeState.autoSaveStatus === 'saving') return;
      if (storeState.lastAutoSavedImageSrc === imageSrc) {
        storeState.setDirty(false);
        return;
      }

      refs.setAutoSaveStatus('saving');

      try {
        const title = `Canvas: ${refs.canvasType}`;

        let share;

        // Resolve the original background. Prefer the in-state Blob; if unavailable
        // (image arrived via imageSrc URL prop), fetch the URL once. Without this
        // fallback, sharepics created with a default background lose it on reload
        // because hasOriginalImage flagged true but no file was ever uploaded.
        let originalImageBase64: string | undefined;
        const bgFile = refs.canvasState.backgroundImageFile as File | Blob | null | undefined;
        const currentImageSrc = refs.canvasState.currentImageSrc as string | undefined;
        if (bgFile) {
          try {
            originalImageBase64 = await fileToBase64(bgFile);
          } catch (err) {
            console.warn('[AutoSave] Failed to convert background image to base64:', err);
          }
        } else if (currentImageSrc) {
          try {
            const res = await fetch(currentImageSrc);
            if (res.ok) {
              const blob = await res.blob();
              originalImageBase64 = await fileToBase64(blob);
            }
          } catch (err) {
            console.warn('[AutoSave] Failed to fetch background image URL for upload:', err);
          }
        }

        const metadata = buildCanvasShareMetadata(
          refs.canvasType,
          refs.canvasState,
          !!originalImageBase64
        );

        // If we already have a shareToken, update the existing entry instead of creating new
        if (storeState.autoSavedShareToken) {
          share = await refs.updateImageShare({
            shareToken: storeState.autoSavedShareToken,
            imageBase64: imageSrc,
            title,
            metadata,
            originalImage: originalImageBase64,
          });
        } else {
          share = await refs.createImageShare({
            imageData: imageSrc,
            title,
            imageType: refs.canvasType,
            metadata,
            originalImage: originalImageBase64,
            status: 'draft',
          });
        }

        if (share?.shareToken) {
          refs.setAutoSavedShareToken(share.shareToken);
          refs.setLastAutoSavedImageSrc(imageSrc);
          refs.setAutoSaveStatus('saved');
          autoSaveStoreApi.getState().setDirty(false);
          refs.onShareToken?.(share.shareToken);
        } else {
          console.warn('[AutoSave][performAutoSave] api returned no shareToken');
          refs.setAutoSaveStatus('error');
        }
      } catch (error) {
        console.error('[AutoSave][performAutoSave] error:', error);
        refs.setAutoSaveStatus('error');
      }
    },
    [autoSaveStoreApi]
  );

  // Only trigger on generatedImage changes
  useEffect(() => {
    if (!generatedImage) return;

    const timer = setTimeout(() => {
      performAutoSave(generatedImage);
    }, 500);

    return () => clearTimeout(timer);
  }, [generatedImage, performAutoSave]);

  const generatedImageRef = useRef(generatedImage);
  generatedImageRef.current = generatedImage;

  // Flush a pending save immediately, bypassing the capture/save debounces.
  // Captures the stage fresh so edits made after the last debounced capture
  // (or while an element was still selected) are not lost.
  const flushPendingAutoSave = useCallback(() => {
    const refs = latestRefs.current;
    if (refs.enabled === false) return;
    const storeState = autoSaveStoreApi.getState();
    if (!storeState.isDirty) return;
    // Capture BEFORE checking for an in-flight save — the stage dies with the
    // unmount, but the store object outlives it for the deferred path below.
    let image: string | null = null;
    try {
      image = refs.captureImage?.() ?? null;
    } catch {
      image = null;
    }
    image = image || generatedImageRef.current;
    if (!image) return;
    if (storeState.autoSaveStatus === 'saving') {
      // A debounced save is in flight with an older snapshot. Dropping here
      // would lose the newest edits; defer until it settles, then save the
      // fresh capture (performAutoSave dedupes if it turns out identical).
      const flushImage = image;
      const unsubscribe = autoSaveStoreApi.subscribe((s) => {
        if (s.autoSaveStatus === 'saving') return;
        unsubscribe();
        void performAutoSave(flushImage);
      });
      return;
    }
    void performAutoSave(image);
  }, [autoSaveStoreApi, performAutoSave]);

  // Unmount flush must be a layout effect: SPA navigation unmounts the editor
  // and passive-effect cleanup runs after refs are detached (stage already
  // gone), while layout cleanup still sees the live Konva stage. The save
  // request itself survives the unmount.
  useLayoutEffect(() => {
    return () => flushPendingAutoSave();
  }, [flushPendingAutoSave]);

  // Warn before leaving while a save is in flight or edits are not yet persisted
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = autoSaveStoreApi.getState();
      const enabled = latestRefs.current.enabled !== false;
      if (s.autoSaveStatus === 'saving' || (enabled && s.isDirty)) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [autoSaveStoreApi]);

  // Expose a retry through the store so UI outside this hook (share section,
  // sidebar tab bar) can re-run a failed save.
  useEffect(() => {
    autoSaveStoreApi.getState().setRetryAutoSave(() => {
      const image = generatedImageRef.current;
      if (image) void performAutoSave(image);
    });
    return () => autoSaveStoreApi.getState().setRetryAutoSave(null);
  }, [autoSaveStoreApi, performAutoSave]);

  // Return status by reading directly from store (no subscription = no re-renders)
  return {
    status: autoSaveStoreApi.getState().autoSaveStatus,
    shareToken: autoSaveStoreApi.getState().autoSavedShareToken,
    retry: () => performAutoSave(generatedImage || ''),
  };
};

export default useCanvasAutoSave;
