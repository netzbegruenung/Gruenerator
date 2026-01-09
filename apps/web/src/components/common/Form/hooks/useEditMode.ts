import { useState, useCallback, useEffect } from 'react';

interface UseEditModeParams {
  enableEditMode: boolean;
  hasEditableContent: boolean;
  isMobileView: boolean;
  onImageEditModeChange?: ((isActive: boolean) => void) | null;
}

export function useEditMode(params: UseEditModeParams) {
  const { enableEditMode, hasEditableContent, isMobileView, onImageEditModeChange } = params;

  const [isEditModeToggled, setIsEditModeToggled] = useState(false);
  const [isImageEditActive, setIsImageEditActive] = useState(false);

  const isEditModeActive = isEditModeToggled && enableEditMode && hasEditableContent;

  const handleToggleEditMode = useCallback(() => {
    setIsEditModeToggled(prev => !prev);
  }, []);

  const handleToggleImageEdit = useCallback(() => {
    const newState = !isImageEditActive;
    setIsImageEditActive(newState);

    if (onImageEditModeChange) {
      onImageEditModeChange(newState);
    }
  }, [isImageEditActive, onImageEditModeChange]);

  // Scroll to top when edit mode is activated on mobile
  useEffect(() => {
    if (isEditModeActive && isMobileView) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isEditModeActive, isMobileView]);

  return {
    isEditModeToggled,
    isEditModeActive,
    isImageEditActive,
    handleToggleEditMode,
    handleToggleImageEdit
  };
}
