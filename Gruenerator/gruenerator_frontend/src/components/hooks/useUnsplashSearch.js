import { useCallback } from 'react';
import { useSharepicGeneratorContext } from '../utils/Sharepic/SharepicGeneratorContext';

export function useUnsplashSearch() {
  const { updateFormData, setError, handleUnsplashSearch } = useSharepicGeneratorContext();

  const searchUnsplashImages = useCallback(async (query) => {
    console.log('searchUnsplashImages called with query:', query);
    updateFormData({ loading: true });
    setError(null);

    try {
      await handleUnsplashSearch(query);
    } catch (error) {
      console.error('Error fetching images:', error);
      setError('Fehler beim Laden der Bilder');
    } finally {
      updateFormData({ loading: false });
    }
  }, [handleUnsplashSearch, updateFormData, setError]);

  return { searchUnsplashImages };
}