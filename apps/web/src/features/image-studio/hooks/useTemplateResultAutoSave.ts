import { useEffect, useRef, useCallback } from 'react';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { useAutoSaveStore } from './useAutoSaveStore';
import { useShareStore } from '@gruenerator/shared/share';
import { getTypeConfig, getTemplateFieldConfig } from '../utils/typeConfig';
import { useImageHelpers } from './useImageHelpers';

export const useTemplateResultAutoSave = (): void => {
  const {
    type,
    generatedImageSrc,
    galleryEditMode
  } = useImageStudioStore();

  const {
    autoSaveStatus,
    lastAutoSavedImageSrc,
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc
  } = useAutoSaveStore();

  const { createImageShare } = useShareStore();
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
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc
  });

  // Update refs on each render
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
    setAutoSaveStatus,
    setAutoSavedShareToken,
    setLastAutoSavedImageSrc
  };

  // Stable auto-save function that reads from refs
  const performAutoSave = useCallback(async (imageSrc: string) => {
    const refs = latestRefs.current;

    if (!imageSrc) return;
    if (refs.fieldConfig?.showAutoSave === false) return;
    if (refs.galleryEditMode) return;
    if (refs.autoSaveStatus === 'saving') return;
    if (refs.lastAutoSavedImageSrc === imageSrc) return;

    console.log('[useTemplateResultAutoSave] Starting auto-save for:', refs.type);
    refs.setAutoSaveStatus('saving');

    try {
      const originalImage = await refs.getOriginalImageBase64();
      const metadata = refs.buildShareMetadata();
      const title = refs.typeConfig?.label || 'Sharepic';

      const share = await refs.createImageShare({
        imageData: imageSrc,
        title,
        imageType: refs.typeConfig?.legacyType || refs.type || '',
        metadata,
        originalImage: originalImage ?? undefined,
      });

      if (share?.shareToken) {
        console.log('[useTemplateResultAutoSave] Auto-save successful:', share.shareToken);
        refs.setAutoSavedShareToken(share.shareToken);
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
      performAutoSave(generatedImageSrc);
    }, 500);

    return () => clearTimeout(timer);
  }, [generatedImageSrc, performAutoSave]);
};

export default useTemplateResultAutoSave;
