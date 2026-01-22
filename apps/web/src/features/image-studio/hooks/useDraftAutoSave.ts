import { useShareStore } from '@gruenerator/shared/share';
import { useEffect, useRef, useCallback, useMemo } from 'react';

import useImageStudioStore from '../../../stores/imageStudioStore';
import { getTypeConfig, getTemplateFieldConfig } from '../utils/typeConfig';

import { useAutoSaveStore } from './useAutoSaveStore';
import { useImageHelpers } from './useImageHelpers';
import { useStepFlow } from './useStepFlow';

export const useDraftAutoSave = (): void => {
  const { type, generatedImageSrc, galleryEditMode } = useImageStudioStore();

  const {
    autoSaveStatus,
    autoSavedShareToken,
    lastAutoSavedImageSrc,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  } = useAutoSaveStore();

  const { createImageShare, updateImageShare } = useShareStore();
  const { getOriginalImageBase64, buildShareMetadata } = useImageHelpers();
  const { getFieldValue } = useStepFlow();

  const typeConfig = getTypeConfig(type || '');
  const fieldConfig = getTemplateFieldConfig(type || '');

  // Use refs to store latest values for the debounced function
  const latestRefs = useRef({
    type,
    typeConfig,
    fieldConfig,
    galleryEditMode,
    autoSaveStatus,
    autoSavedShareToken,
    lastAutoSavedImageSrc,
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

  // Update refs on render
  useEffect(() => {
    latestRefs.current = {
      type,
      typeConfig,
      fieldConfig,
      galleryEditMode,
      autoSaveStatus,
      autoSavedShareToken,
      lastAutoSavedImageSrc,
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
  }, [
    type,
    typeConfig,
    fieldConfig,
    galleryEditMode,
    autoSaveStatus,
    autoSavedShareToken,
    lastAutoSavedImageSrc,
    generatedImageSrc,
    getOriginalImageBase64,
    buildShareMetadata,
    createImageShare,
    updateImageShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
    getFieldValue,
  ]);

  const performSave = useCallback(async () => {
    const refs = latestRefs.current;

    // Safety checks
    if (refs.galleryEditMode) return; // Don't auto-save if editing existing gallery item (handle separately?)
    if (refs.autoSaveStatus === 'saving') return;
    if (!refs.generatedImageSrc && !refs.autoSavedShareToken) return; // Need an image to start

    // If we have no changes and already saved?
    // We check purely by triggering this function (debounced).

    console.log('[useDraftAutoSave] Starting save...');
    refs.setAutoSaveStatus('saving');

    try {
      const originalImage = await refs.getOriginalImageBase64();
      const metadata = refs.buildShareMetadata();
      const title = refs.typeConfig?.label || 'Draft';
      const imageSrc = refs.generatedImageSrc || refs.lastAutoSavedImageSrc || '';

      if (!imageSrc) {
        // Can't save without image?
        refs.setAutoSaveStatus('idle');
        return;
      }

      if (refs.autoSavedShareToken) {
        // UPDATE existing
        await refs.updateImageShare({
          shareToken: refs.autoSavedShareToken,
          title,
          metadata: metadata ?? undefined,
          imageBase64: imageSrc,
        });
        console.log('[useDraftAutoSave] Update successful');
      } else {
        // CREATE new
        const share = await refs.createImageShare({
          imageData: imageSrc,
          title,
          imageType: refs.typeConfig?.legacyType || refs.type || '',
          metadata: metadata,
          originalImage: originalImage ?? undefined,
          // status: 'draft' // If supported
        });
        if (share?.shareToken) {
          console.log('[useDraftAutoSave] Create successful:', share.shareToken);
          refs.setAutoSavedShareToken(share.shareToken);
        }
      }

      refs.setLastAutoSavedImageSrc(imageSrc);
      refs.setAutoSaveStatus('saved');

      // Revert to idle after delay?
      setTimeout(() => refs.setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('[useDraftAutoSave] Save failed:', error);
      refs.setAutoSaveStatus('error');
    }
  }, []);

  // Create debounced save using timeout ref pattern (similar to useDebouncedCallback)
  const debouncedSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const performSaveRef = useRef(performSave);

  // Keep performSave ref up to date
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

  // Trigger save when generatedImageSrc changes (immediate or debounced?)
  // If user clicked "Save", we want immediate feedback.
  useEffect(() => {
    if (generatedImageSrc && generatedImageSrc !== lastAutoSavedImageSrc) {
      void performSave(); // Immediate save for image changes
    }
  }, [generatedImageSrc, lastAutoSavedImageSrc, performSave]);

  // Trigger debounced save when form values change
  // For now, debouncedSave is available for future use when form state subscription is added
  // To support "Early Draft" (metadata only), we'll need access to form state
  void debouncedSave; // Mark as intentionally available for future use
};
