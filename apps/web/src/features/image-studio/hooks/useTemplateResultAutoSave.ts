import { useEffect } from 'react';
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

  const typeConfig = getTypeConfig(type);
  const fieldConfig = getTemplateFieldConfig(type);

  useEffect(() => {
    const performAutoSave = async () => {
      if (!generatedImageSrc) return;
      if (fieldConfig?.showAutoSave === false) return;
      if (galleryEditMode) return;
      if (autoSaveStatus === 'saving') return;
      if (lastAutoSavedImageSrc === generatedImageSrc) return;

      setAutoSaveStatus('saving');

      try {
        const originalImage = await getOriginalImageBase64();
        const metadata = buildShareMetadata();
        const title = typeConfig?.label || 'Sharepic';

        const share = await createImageShare({
          imageData: generatedImageSrc,
          title,
          imageType: typeConfig?.legacyType || type || '',
          metadata,
          originalImage: originalImage ?? undefined,
        });

        if (share?.shareToken) {
          setAutoSavedShareToken(share.shareToken);
          setLastAutoSavedImageSrc(generatedImageSrc);
          setAutoSaveStatus('saved');
        }
      } catch (error) {
        console.error('[useTemplateResultAutoSave] Auto-save failed:', error);
        setAutoSaveStatus('error');
      }
    };

    const timer = setTimeout(performAutoSave, 500);
    return () => clearTimeout(timer);
  }, [generatedImageSrc, galleryEditMode, autoSaveStatus, lastAutoSavedImageSrc,
      getOriginalImageBase64, buildShareMetadata, createImageShare, typeConfig, type,
      setAutoSaveStatus, setAutoSavedShareToken, setLastAutoSavedImageSrc, fieldConfig]);
};

export default useTemplateResultAutoSave;
