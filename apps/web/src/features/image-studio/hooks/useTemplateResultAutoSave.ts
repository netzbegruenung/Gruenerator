import { useShareStore } from '@gruenerator/shared/share';
import { useEffect, useRef, useCallback } from 'react';

import useImageStudioStore from '../../../stores/imageStudioStore';
import { getTypeConfig, getTemplateFieldConfig } from '../utils/typeConfig';

import { useAutoSaveStore } from './useAutoSaveStore';
import { useImageHelpers } from './useImageHelpers';

export const useTemplateResultAutoSave = (): void => {
  const { type, generatedImageSrc, galleryEditMode } = useImageStudioStore();

  const {
    autoSaveStatus,
    lastAutoSavedImageSrc,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  } = useAutoSaveStore();

  const { createImageShare, updateImageShare, publishShare } = useShareStore();
  const { getOriginalImageBase64, buildShareMetadata } = useImageHelpers();

  const typeConfig = getTypeConfig(type || '');
  const fieldConfig = getTemplateFieldConfig(type || '');

  // Use refs to store latest values without causing effect re-runs
  const latestRefs = useRef({
    type,
    typeConfig,
    fieldConfig,
    galleryEditMode,
    autoSaveStatus,
    lastAutoSavedImageSrc,
    getOriginalImageBase64,
    buildShareMetadata,
    createImageShare,
    updateImageShare,
    publishShare,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc,
  });

  // Update refs in an effect to avoid modifying refs during render
  useEffect(() => {
    latestRefs.current = {
      type,
      typeConfig,
      fieldConfig,
      galleryEditMode,
      autoSaveStatus,
      lastAutoSavedImageSrc,
      getOriginalImageBase64,
      buildShareMetadata,
      createImageShare,
      updateImageShare,
      publishShare,
      setAutoSaveStatus,
      setAutoSavedShareToken,
      setLastAutoSavedImageSrc,
    };
  });

  // Stable auto-save function that reads from refs
  const performAutoSave = useCallback(async (imageSrc: string) => {
    const refs = latestRefs.current;

    if (!imageSrc) return;
    if (refs.fieldConfig?.showAutoSave === false) return;
    if (refs.galleryEditMode) return;
    if (refs.autoSaveStatus === 'saving') return;
    if (refs.lastAutoSavedImageSrc === imageSrc) return;

    refs.setAutoSaveStatus('saving');

    try {
      const originalImage = await refs.getOriginalImageBase64();
      const metadata = refs.buildShareMetadata();
      const title = refs.typeConfig?.label || 'Sharepic';

      // Reuse an existing token (e.g. adopted from the canvas editor's
      // auto-save) instead of creating a duplicate gallery entry.
      const existingToken = useAutoSaveStore.getState().autoSavedShareToken;
      let shareToken: string | null = existingToken;
      if (existingToken) {
        try {
          await refs.updateImageShare({
            shareToken: existingToken,
            imageBase64: imageSrc,
            title,
            metadata,
            ...(originalImage ? { originalImage } : {}),
          });
        } catch (updateError) {
          // The share behind the token is gone (deleted from the gallery,
          // evicted). Drop the dead token so the next attempt creates a fresh
          // share instead of retrying the same failure forever.
          refs.setAutoSavedShareToken(null);
          throw updateError;
        }
        // The adopted token references a canvas-created DRAFT; this hook fires
        // on the explicit result/export step, where pre-dedupe behavior was a
        // fresh 'ready' share. Promote so the sharepic stays visible on
        // ready-only surfaces (media library).
        await refs.publishShare(existingToken);
      } else {
        const share = await refs.createImageShare({
          imageData: imageSrc,
          title,
          imageType: refs.typeConfig?.legacyType || refs.type || '',
          metadata,
          ...(originalImage ? { originalImage } : {}),
        });
        shareToken = share?.shareToken ?? null;
      }

      if (shareToken) {
        refs.setAutoSavedShareToken(shareToken);
        refs.setLastAutoSavedImageSrc(imageSrc);
        refs.setAutoSaveStatus('saved');
      }
    } catch (error) {
      console.error('[useTemplateResultAutoSave] Auto-save failed:', error);
      refs.setAutoSaveStatus('error');
    }
  }, []);

  // Only trigger on generatedImageSrc changes
  useEffect(() => {
    if (!generatedImageSrc) return;

    const timer = setTimeout(() => {
      void performAutoSave(generatedImageSrc);
    }, 500);

    return () => clearTimeout(timer);
  }, [generatedImageSrc, performAutoSave]);
};

export default useTemplateResultAutoSave;
