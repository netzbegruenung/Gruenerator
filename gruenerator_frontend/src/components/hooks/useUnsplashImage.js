//useunsplashimage
import { useState, useCallback, useRef, useEffect } from 'react';
import debounce from 'lodash/debounce';

export const useUnsplashImage = () => {
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
        const url = `/api/unsplash/random-images?query=${encodeURIComponent(query)}`;
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
  
        // Rufe den Callback mit den geladenen Bildern auf
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
    console.log('Starte Download des Vollbildes:', fullImageUrl);
    try {
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(fullImageUrl)}`;
      console.log('Verwende Proxy-URL:', proxyUrl);

      const startTime = Date.now();
      const imageResponse = await fetch(proxyUrl);
      const endTime = Date.now();
      console.log(`Fetch-Anfrage abgeschlossen in ${endTime - startTime}ms`);

      if (!imageResponse.ok) {
        console.error('Fehler beim Abrufen des Bildes:', imageResponse.status, imageResponse.statusText);
        throw new Error(`Failed to fetch full-size image: ${imageResponse.statusText}`);
      }

      const contentType = imageResponse.headers.get('content-type');
      console.log('Content-Type des heruntergeladenen Bildes:', contentType);

      const contentLength = imageResponse.headers.get('content-length');
      console.log('Content-Length des heruntergeladenen Bildes:', contentLength);

      const blob = await imageResponse.blob();
      console.log('Blob erstellt. Größe:', blob.size, 'Bytes, Typ:', blob.type);

      if (blob.size < 1000) {
        console.error(`Heruntergeladenes Bild zu klein: ${blob.size} Bytes`);
        throw new Error('Heruntergeladenes Bild zu klein');
      }

      const file = new File([blob], 'unsplash_full_image.jpg', { type: 'image/jpeg' });
      console.log('File-Objekt erstellt:', file.name, file.type, file.size, 'Bytes');

      return file;
    } catch (error) {
      console.error('Fehler beim Herunterladen des Vollbildes:', error);
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