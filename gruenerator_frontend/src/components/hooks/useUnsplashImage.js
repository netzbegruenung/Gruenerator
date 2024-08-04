import { useState, useCallback, useRef, useEffect } from 'react';
import debounce from 'lodash/debounce';

export const useUnsplashImage = () => {
  const [unsplashImages, setUnsplashImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pageRef = useRef(1);
  const isMountedRef = useRef(true);

  const fetchUnsplashImages = useCallback(
    debounce(async (searchTerms = [], isNewSearch = false) => {
      if (!isMountedRef.current) return [];

      setLoading(true);
      setError(null);
      
      try {
        const query = searchTerms.join(',');
        const url = `/api/unsplash/random-images?query=${encodeURIComponent(query)}`;
        console.log('Fetching images from:', url);
    
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const imagesData = await response.json();
        console.log('Received image data:', imagesData);
    
        const processedImages = imagesData.map((imageData) => ({
          id: imageData.imageUrl, // Verwenden Sie die imageUrl als ID
          previewUrl: imageData.imageUrl,
          fullImageUrl: imageData.imageUrl,
          photographerName: imageData.photographerName,
          photographerUsername: imageData.photographerUsername,
          downloadLocation: imageData.downloadLocation,
        }));
    
        console.log('Processed images:', processedImages);
        if (!isMountedRef.current) return [];

        if (isNewSearch) {
          setUnsplashImages(processedImages);
          pageRef.current = 2;
        } else {
          setUnsplashImages((prevImages) => [...prevImages, ...processedImages]);
          pageRef.current += 1;
        }

        return processedImages;
      } catch (error) {
        if (isMountedRef.current) {
          setError(`Fehler beim Laden der Unsplash-Bilder: ${error.message}`);
        }
        console.error('Error fetching Unsplash images:', error);
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
    fetchUnsplashImages, 
    fetchFullSizeImage,
    triggerDownload,
    setUnsplashImages 
  };
};