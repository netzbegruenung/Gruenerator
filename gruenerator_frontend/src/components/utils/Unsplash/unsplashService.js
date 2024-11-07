//unsplashservice
import { useCallback, useRef, useEffect } from 'react';
import debounce from 'lodash/debounce';

const DEBOUNCE_TIME = 1000; // Ändern Sie dies von 300 auf 1000
const API_BASE_URL = '/api';

const createUnsplashImageObject = (imageData) => ({
  id: imageData.imageUrl,
  previewUrl: imageData.imageUrl,
  fullImageUrl: imageData.imageUrl,
  photographerName: imageData.photographerName,
  photographerUsername: imageData.photographerUsername,
  downloadLocation: imageData.downloadLocation,
});

export const useUnsplashService = (onImagesUpdate) => {

  const isMountedRef = useRef(true);

  const fetchFromAPI = useCallback(async (url) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }, []);

  const debouncedFetchUnsplashImages = debounce(async (searchTerms = [], isNewSearch = false, onImagesLoaded = () => {}) => {
    console.log('fetchUnsplashImages in service called with:', { searchTerms, isNewSearch });
    
    if (!isMountedRef.current || searchTerms.length === 0) {
      console.log('Exiting fetchUnsplashImages early');
      onImagesLoaded([]);
      return;
    }
  
    try {
      const query = searchTerms.join(',');
      const url = `${API_BASE_URL}/unsplash/search-images?query=${encodeURIComponent(query)}`;
      console.log('Fetching images from:', url);
  
      const imagesData = await fetchFromAPI(url);
      console.log('Received image data:', imagesData);
  
      if (!Array.isArray(imagesData) || imagesData.length === 0) {
        throw new Error('Keine Bilder gefunden');
      }
  
      const processedImages = imagesData.map(createUnsplashImageObject);
  
      console.log('Processed images:', processedImages);
      if (!isMountedRef.current) {
        console.log('Component unmounted, returning early');
        onImagesLoaded([]);
        return;
      }
  
      let newImages;
      if (isNewSearch) {
        newImages = processedImages;
      } else {
        const existingImages = await fetchFromAPI(`${API_BASE_URL}/unsplash/get-images`);
        newImages = [...existingImages, ...processedImages];
      }
  
      console.log('Setting Unsplash images:', newImages);
      onImagesUpdate(newImages);
      onImagesLoaded(newImages);
    } catch (error) {
      console.error('Error fetching Unsplash images:', error);
      if (isMountedRef.current) {
        onImagesUpdate([]);
        onImagesLoaded([]);
      }
    }
  }, DEBOUNCE_TIME);

const fetchUnsplashImages = (searchTerms, isNewSearch) => {
  return new Promise((resolve, reject) => {
    debouncedFetchUnsplashImages(searchTerms, isNewSearch, (images) => {
      if (images.length > 0) {
        resolve(images);
      } else {
        reject(new Error('Keine Bilder gefunden'));
      }
    });
  });
};
   
  const fetchFullSizeImage = useCallback(async (fullImageUrl) => {
    console.log('Starte Download des Vollbildes in unsplashService:', fullImageUrl);
    try {
      const proxyUrl = `${API_BASE_URL}/unsplash/proxy-image?url=${encodeURIComponent(fullImageUrl)}`;
      console.log('Verwende Proxy-URL in unsplashService:', proxyUrl);

      const startTime = Date.now();
      const imageResponse = await fetch(proxyUrl);
      const endTime = Date.now();
      console.log(`Fetch-Anfrage in unsplashService abgeschlossen in ${endTime - startTime}ms`);

      const contentType = imageResponse.headers.get('content-type');
      if (!imageResponse.ok || !contentType.startsWith('image/')) {
        console.error('Ungültiger Content-Type oder Fehler beim Abrufen des Bildes:', contentType, imageResponse.status);
        throw new Error(`Ungültiger Content-Type: ${contentType}`);
      }

      const blob = await imageResponse.blob();
      console.log('Blob erstellt in unsplashService. Größe:', blob.size, 'Bytes, Typ:', blob.type);

      if (blob.size < 1000) {
        console.warn('Warnung: Blob-Größe ist sehr klein (< 1000 Bytes). Möglicherweise kein gültiges Bild.');
      }

      const file = new File([blob], 'unsplash_full_image.jpg', { type: blob.type });
      console.log('File-Objekt erstellt in unsplashService:', file.name, file.type, file.size, 'Bytes');

      return file;
    } catch (error) {
      console.error('Fehler beim Herunterladen des Vollbildes in unsplashService:', error);
      throw error;
    }
  }, []);

  const triggerDownload = async (downloadLocation) => {
    try {
      const response = await fetch(`/api/unsplash/trigger-download?downloadLocation=${encodeURIComponent(downloadLocation)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const text = await response.text();
      console.log('Trigger download response:', text);
      return text === 'OK';
    } catch (error) {
      console.error('Error triggering download:', error);
      throw error;
    }
  };

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    fetchUnsplashImages,
    fetchFullSizeImage,
    triggerDownload
  };
};

export const getUnsplashAttribution = (photographerName) => 
  `Photo by ${photographerName} on Unsplash`;

export const getUnsplashAttributionLink = (photographerUsername) => 
  `https://unsplash.com/@${photographerUsername}?utm_source=your_app_name&utm_medium=referral`;

export const getUnsplashLink = () => 
  "https://unsplash.com/?utm_source=your_app_name&utm_medium=referral";