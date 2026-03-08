import { useShareStore } from '@gruenerator/shared/share';
import { useEffect, useRef, useCallback, useMemo } from 'react';

import useImageStudioStore from '../../../stores/imageStudioStore';
import { getTypeConfig, getTemplateFieldConfig } from '../utils/typeConfig';

import { useAutoSaveStore } from './useAutoSaveStore';
import { useImageHelpers } from './useImageHelpers';
import { useStepFlow } from './useStepFlow';

const MAX_RETRY_COUNT = 3;

export const useDraftAutoSave = (): void => {
  const { type, generatedImageSrc, galleryEditMode } = useImageStudioStore();

  // Only subscribe to action setters (stable references) — not state values
  const setAutoSaveStatus = useAutoSaveStore((s) => s.setAutoSaveStatus);
  const setAutoSavedShareToken = useAutoSaveStore((s) => s.setAutoSavedShareToken);
  const setLastAutoSavedImageSrc = useAutoSaveStore((s) => s.setLastAutoSavedImageSrc);

  const { createImageShare, updateImageShare } = useShareStore();
  const { getOriginalImageBase64, buildShareMetadata } = useImageHelpers();
  const { getFieldValue } = useStepFlow();

  const typeConfig = getTypeConfig(type || '');
  const fieldConfig = getTemplateFieldConfig(type || '');

  const retryCountRef = useRef(0);

  // Use refs to store latest values for the debounced function
  const latestRefs = useRef({
    type,
    typeConfig,
    fieldConfig,
    galleryEditMode,
    generatedImageSrc,
    getOriginalImageBase64,
    buildShareMetadata,
    createImageShare,
    updateImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
    getFieldValue,
  });

  // Update refs via effect (React hooks lint forbids ref updates during render)
  useEffect(() => {
    latestRefs.current = {
      type,
      typeConfig,
      fieldConfig,
      galleryEditMode,
      generatedImageSrc,
      getOriginalImageBase64,
      buildShareMetadata,
      createImageShare,
      updateImageShare,
      setAutoSaveStatus,
      setAutoSavedShareToken,
      setLastAutoSavedImageSrc,
      getFieldValue,
    };
  });

  const performSave = useCallback(async () => {
    const refs = latestRefs.current;
    // Read current store state directly to avoid stale closures
    const storeState = useAutoSaveStore.getState();

    // Safety checks
    if (refs.galleryEditMode) return;
    if (storeState.autoSaveStatus === 'saving') return;
    if (!refs.generatedImageSrc && !storeState.autoSavedShareToken) return;

    refs.setAutoSaveStatus('saving');

    try {
      const originalImage = await refs.getOriginalImageBase64();
      const metadata = refs.buildShareMetadata();
      const title = refs.typeConfig?.label || 'Draft';
      const imageSrc = refs.generatedImageSrc || storeState.lastAutoSavedImageSrc || '';

      if (!imageSrc) {
        refs.setAutoSaveStatus('idle');
        return;
      }

      if (storeState.autoSavedShareToken) {
        // UPDATE existing
        await refs.updateImageShare({
          shareToken: storeState.autoSavedShareToken,
          title,
          metadata: metadata ?? undefined,
          imageBase64: imageSrc,
        });
      } else {
        // CREATE new
        const share = await refs.createImageShare({
          imageData: imageSrc,
          title,
          imageType: refs.typeConfig?.legacyType || refs.type || '',
          metadata: metadata,
          originalImage: originalImage ?? undefined,
          status: 'draft',
        });
        if (share?.shareToken) {
          refs.setAutoSavedShareToken(share.shareToken);
        }
      }

      refs.setLastAutoSavedImageSrc(imageSrc);
      refs.setAutoSaveStatus('saved');
      retryCountRef.current = 0;

      // Revert to idle after delay
      setTimeout(() => refs.setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[useDraftAutoSave] Save failed:', error);
      retryCountRef.current += 1;
      refs.setAutoSaveStatus('error');

      if (retryCountRef.current >= MAX_RETRY_COUNT) {
        console.warn('[useDraftAutoSave] Max retries reached, stopping auto-save attempts');
      }
    }
  }, []);

  // Create debounced save using timeout ref pattern
  const debouncedSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const performSaveRef = useRef(performSave);

  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  // Cleanup debounce timeout on unmount
  useEffect(() => {
    return () => {
      if (debouncedSaveTimeoutRef.current) {
        clearTimeout(debouncedSaveTimeoutRef.current);
      }
    };
  }, []);

  const debouncedSave = useMemo(() => {
    return () => {
      if (debouncedSaveTimeoutRef.current) {
        clearTimeout(debouncedSaveTimeoutRef.current);
      }
      debouncedSaveTimeoutRef.current = setTimeout(() => {
        void performSaveRef.current();
      }, 2000);
    };
  }, []);

  // Trigger save when generatedImageSrc changes
  useEffect(() => {
    const storeState = useAutoSaveStore.getState();
    if (
      generatedImageSrc &&
      generatedImageSrc !== storeState.lastAutoSavedImageSrc &&
      retryCountRef.current < MAX_RETRY_COUNT
    ) {
      void performSave();
    }
  }, [generatedImageSrc, performSave]);

  // Mark debouncedSave as intentionally available for future use
  void debouncedSave;
};
