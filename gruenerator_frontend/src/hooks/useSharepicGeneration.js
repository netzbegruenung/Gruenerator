import { useState, useCallback } from 'react';
import apiClient from '../components/utils/apiClient';
import { prepareDataForCanvas } from '../features/sharepic/dreizeilen/utils/dataPreparation';
import { DEFAULT_COLORS } from '../components/utils/constants';

/**
 * Hook for generating sharepics using existing backend endpoints
 * @returns {Object} Hook object with generateSharepic function and loading state
 */
const useSharepicGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSharepic = useCallback(async (thema, details, uploadedImage = null, sharepicType = 'dreizeilen', zitatAuthor = null) => {
    setLoading(true);
    setError(null);

    try {
      console.log('[useSharepicGeneration] Starting sharepic generation:', { thema, details, hasImage: !!uploadedImage, sharepicType, zitatAuthor });

      if (sharepicType === 'quote') {
        return await generateQuoteSharepic(thema, details, zitatAuthor, uploadedImage);
      }

      // Step 1: Generate text using existing dreizeilen_claude endpoint
      const textResponse = await apiClient.post('/dreizeilen_claude', {
        thema,
        details
      });

      console.log('[useSharepicGeneration] Text generation response:', textResponse);
      console.log('[useSharepicGeneration] Response data structure:', textResponse.data);

      // Handle Axios response wrapper - extract data
      const responseData = textResponse.data || textResponse;
      console.log('[useSharepicGeneration] Processed response data:', responseData);

      if (!responseData.mainSlogan) {
        throw new Error('Keine gültige Slogan-Antwort erhalten');
      }

      const slogan = responseData.mainSlogan;

      // Step 2: Generate image using existing dreizeilen_canvas endpoint
      const formData = prepareDataForCanvas(
        {
          line1: slogan.line1 || '',
          line2: slogan.line2 || '',
          line3: slogan.line3 || '',
          uploadedImage: uploadedImage
        },
        {
          colorScheme: DEFAULT_COLORS, // Use full Green Party color scheme array
          fontSize: 85, // Default font size
          balkenOffset: [50, -100, 50], // Default offsets
          balkenGruppenOffset: [0, 0],
          sunflowerOffset: [0, 0],
          sunflowerPosition: 'bottomRight'
        },
        'dreizeilen'
      );

      console.log('[useSharepicGeneration] Prepared FormData for canvas generation');

      const imageResponse = await apiClient.post('/dreizeilen_canvas', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('[useSharepicGeneration] Image generation response received');
      console.log('[useSharepicGeneration] Image response structure:', imageResponse.data);

      // Handle Axios response wrapper - extract data
      const imageData = imageResponse.data || imageResponse;
      console.log('[useSharepicGeneration] Processed image data:', imageData);

      if (!imageData.image) {
        throw new Error('Keine gültige Bild-Antwort erhalten');
      }

      // Return combined result
      return {
        text: `${slogan.line1 || ''}\n${slogan.line2 || ''}\n${slogan.line3 || ''}`.trim(),
        image: imageData.image,
        slogans: responseData.alternatives || [], // Include alternatives for potential future use
        type: 'dreizeilen'
      };

    } catch (err) {
      console.error('[useSharepicGeneration] Error generating sharepic:', err);
      setError(err.message || 'Fehler bei der Sharepic-Generierung');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const generateQuoteSharepic = useCallback(async (thema, details, zitatAuthor, uploadedImage) => {
    console.log('[useSharepicGeneration] Starting quote sharepic generation');

    if (!zitatAuthor) {
      throw new Error('Autor ist für Zitat-Sharepics erforderlich');
    }

    // Step 1: Generate quote text using existing zitat_claude endpoint
    const textResponse = await apiClient.post('/zitat_claude', {
      thema,
      details
    });

    console.log('[useSharepicGeneration] Quote text generation response:', textResponse);

    // Handle Axios response wrapper - extract data
    const responseData = textResponse.data || textResponse;
    console.log('[useSharepicGeneration] Processed quote response data:', responseData);

    // Handle the actual response structure with alternatives array and main quote
    if (!responseData || (!responseData.alternatives && !responseData.quote)) {
      throw new Error('Keine gültigen Zitate erhalten');
    }

    // Use the main quote if available, otherwise fall back to first alternative
    const mainQuote = responseData.quote || 
      (responseData.alternatives && responseData.alternatives[0]?.quote);

    if (!mainQuote) {
      throw new Error('Keine gültige Zitat-Antwort erhalten');
    }

    // Step 2: Generate image using existing zitat_canvas endpoint
    const formData = prepareDataForCanvas(
      {
        quote: mainQuote,
        name: zitatAuthor,
        uploadedImage: uploadedImage
      },
      {
        colorScheme: DEFAULT_COLORS,
        fontSize: 85
      },
      'quote'
    );

    console.log('[useSharepicGeneration] Prepared FormData for quote canvas generation');

    const imageResponse = await apiClient.post('/zitat_canvas', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    console.log('[useSharepicGeneration] Quote image generation response received');

    // Handle Axios response wrapper - extract data
    const imageData = imageResponse.data || imageResponse;
    console.log('[useSharepicGeneration] Processed quote image data:', imageData);

    if (!imageData.image) {
      throw new Error('Keine gültige Bild-Antwort erhalten');
    }

    // Return combined result
    return {
      text: `"${mainQuote}" - ${zitatAuthor}`,
      image: imageData.image,
      quotes: responseData.alternatives || [], // Use alternatives array from response
      type: 'quote'
    };
  }, []);

  return {
    generateSharepic,
    loading,
    error
  };
};

export default useSharepicGeneration;