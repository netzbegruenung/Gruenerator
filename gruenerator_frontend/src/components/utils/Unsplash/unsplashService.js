import { useState, useCallback, useRef, useEffect } from 'react';
import debounce from 'lodash/debounce';

export const useUnsplashService = () => {
  const [unsplashImages, setUnsplashImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  const fetchUnsplashImages = useCallback(
    debounce(async (searchTerms = [], isNewSearch = false, onImagesLoaded) => {
      if (!isMountedRef.current) return [];

      setLoading(true);
      setError(null);

      try {
        const query = searchTerms.join(',');
        const url = `/api/unsplash/search-images?query=${encodeURIComponent(query)}`;
        console.log('useUnsplashImage: Fetching images from:', url);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const imagesData = await response.json();
        console.log('useUnsplashImage: Received image data:', imagesData);

        const processedImages = imagesData.map((imageData) => ({
          id: imageData.imageUrl,
          previewUrl: imageData.imageUrl,
          fullImageUrl: imageData.imageUrl,
          photographerName: imageData.photographerName,
          photographerUsername: imageData.photographerUsername,
          downloadLocation: imageData.downloadLocation,
        }));

        console.log('useUnsplashImage: Processed images:', processedImages);
        if (!isMountedRef.current) return [];

        if (isNewSearch) {
          setUnsplashImages(processedImages);
        } else {
          setUnsplashImages((prevImages) => [...prevImages, ...processedImages]);
        }

        if (onImagesLoaded) {
          onImagesLoaded(processedImages);
        }

        return processedImages;
      } catch (error) {
        console.error('useUnsplashImage: Error fetching Unsplash images:', error);
        if (isMountedRef.current) {
          setError(`Fehler beim Laden der Unsplash-Bilder: ${error.message}`);
        }
        if (onImagesLoaded) {
          onImagesLoaded([]);
        }
        return [];
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    }, 300),
    []
  );

  const fetchFullSizeImage = useCallback(async (fullImageUrl) => {
    try {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(fullImageUrl)}`;
      const imageResponse = await fetch(proxyUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch full-size image: ${imageResponse.statusText}`);
      }
      const blob = await imageResponse.blob();
      return new File([blob], 'unsplash_full_image.jpg', { type: 'image/jpeg' });
    } catch (error) {
      console.error('Error fetching full-size image:', error);
      throw error;
    }
  }, []);

  const triggerDownload = useCallback(async (downloadLocation) => {
    try {
      const downloadUrl = `/api/unsplash/trigger-download?downloadLocation=${encodeURIComponent(downloadLocation)}`;
      const downloadResponse = await fetch(downloadUrl);
      if (!downloadResponse.ok) {
        throw new Error(`Failed to trigger download: ${downloadResponse.statusText}`);
      }
    } catch (error) {
      console.warn(`Error triggering download: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    unsplashImages,
    loading,
    error,
    fetchUnsplashImages: (searchTerms, isNewSearch, callback) =>
      fetchUnsplashImages(searchTerms, isNewSearch, callback),
    fetchFullSizeImage,
    triggerDownload,
    setUnsplashImages
  };
};

export const getUnsplashAttribution = (photographerName) => {
  return `Photo by ${photographerName} on Unsplash`;
};

export const getUnsplashAttributionLink = (photographerUsername) => {
  return `https://unsplash.com/@${photographerUsername}?utm_source=your_app_name&utm_medium=referral`;
};

export const getUnsplashLink = () => {
  return "https://unsplash.com/?utm_source=your_app_name&utm_medium=referral";
};