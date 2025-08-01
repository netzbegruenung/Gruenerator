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

  const generateSharepic = useCallback(async (thema, details, uploadedImage = null, sharepicType = 'dreizeilen', zitatAuthor = null, customPrompt = null) => {
    setLoading(true);
    setError(null);

    try {
      console.log('[useSharepicGeneration] Starting sharepic generation:', { thema, details, hasImage: !!uploadedImage, sharepicType, zitatAuthor, hasCustomPrompt: !!customPrompt });

      // Route to appropriate generation function based on type
      switch (sharepicType) {
        case 'quote':
          return await generateQuoteSharepic(thema, details, zitatAuthor, uploadedImage, customPrompt);
        case 'quote_pure':
          return await generateQuotePureSharepic(thema, details, zitatAuthor, customPrompt);
        case 'info':
          return await generateInfoSharepic(thema, details, customPrompt);
        case 'headline':
          return await generateHeadlineSharepic(thema, details, customPrompt);
        case 'dreizeilen':
        default:
          return await generateDreizeilenSharepic(thema, details, uploadedImage, customPrompt);
      }

    } catch (err) {
      console.error('[useSharepicGeneration] Error generating sharepic:', err);
      setError(err.message || 'Fehler bei der Sharepic-Generierung');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const generateDreizeilenSharepic = useCallback(async (thema, details, uploadedImage, customPrompt = null) => {
    console.log('[useSharepicGeneration] Starting dreizeilen sharepic generation');

    // Step 1: Generate text using existing dreizeilen_claude endpoint
    const requestData = {
      thema,
      details
    };
    
    // Add customPrompt if provided (knowledge from KnowledgeSelector)
    if (customPrompt) {
      requestData.customPrompt = customPrompt;
    }

    const textResponse = await apiClient.post('/dreizeilen_claude', requestData);

    console.log('[useSharepicGeneration] Text generation response:', textResponse);

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
  }, []);

  const generateQuoteSharepic = useCallback(async (thema, details, zitatAuthor, uploadedImage, customPrompt = null) => {
    console.log('[useSharepicGeneration] Starting quote sharepic generation');

    if (!zitatAuthor) {
      throw new Error('Autor ist für Zitat-Sharepics erforderlich');
    }

    // Step 1: Generate quote text using existing zitat_claude endpoint
    const requestData = {
      thema,
      details
    };
    
    // Add customPrompt if provided (knowledge from KnowledgeSelector)
    if (customPrompt) {
      requestData.customPrompt = customPrompt;
    }

    const textResponse = await apiClient.post('/zitat_claude', requestData);

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

  const generateQuotePureSharepic = useCallback(async (thema, details, zitatAuthor, customPrompt = null) => {
    console.log('[useSharepicGeneration] Starting quote pure sharepic generation');

    if (!zitatAuthor) {
      throw new Error('Autor ist für Zitat-Pure-Sharepics erforderlich');
    }

    // Step 1: Generate quote text using existing zitat_pure_claude endpoint
    const requestData = {
      thema,
      details
    };
    
    // Add customPrompt if provided (knowledge from KnowledgeSelector)
    if (customPrompt) {
      requestData.customPrompt = customPrompt;
    }

    const textResponse = await apiClient.post('/zitat_pure_claude', requestData);

    console.log('[useSharepicGeneration] Quote pure text generation response:', textResponse);

    // Handle Axios response wrapper - extract data
    const responseData = textResponse.data || textResponse;
    console.log('[useSharepicGeneration] Processed quote pure response data:', responseData);

    if (!responseData || !responseData.quote) {
      throw new Error('Keine gültige Zitat-Pure-Antwort erhalten');
    }

    const mainQuote = responseData.quote;

    // Step 2: Generate image using existing zitat_pure_canvas endpoint
    const formData = new FormData();
    formData.append('quote', mainQuote);
    formData.append('name', zitatAuthor);

    console.log('[useSharepicGeneration] Prepared FormData for quote pure canvas generation');

    const imageResponse = await apiClient.post('/zitat_pure_canvas', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    console.log('[useSharepicGeneration] Quote pure image generation response received');

    // Handle Axios response wrapper - extract data
    const imageData = imageResponse.data || imageResponse;
    console.log('[useSharepicGeneration] Processed quote pure image data:', imageData);

    if (!imageData.image) {
      throw new Error('Keine gültige Bild-Antwort erhalten');
    }

    // Return combined result
    return {
      text: `"${mainQuote}" - ${zitatAuthor}`,
      image: imageData.image,
      quotes: responseData.alternatives || [],
      type: 'quote_pure'
    };
  }, []);

  const generateInfoSharepic = useCallback(async (thema, details, customPrompt = null) => {
    console.log('[useSharepicGeneration] Starting info sharepic generation');

    // Step 1: Generate info text using existing info_claude endpoint
    const requestData = {
      thema,
      details
    };
    
    // Add customPrompt if provided (knowledge from KnowledgeSelector)
    if (customPrompt) {
      requestData.customPrompt = customPrompt;
    }

    const textResponse = await apiClient.post('/info_claude', requestData);

    console.log('[useSharepicGeneration] Info text generation response:', textResponse);

    // Handle Axios response wrapper - extract data
    const responseData = textResponse.data || textResponse;
    console.log('[useSharepicGeneration] Processed info response data:', responseData);

    if (!responseData || !responseData.mainInfo || !responseData.mainInfo.header) {
      throw new Error('Keine gültige Info-Antwort erhalten');
    }

    const { header, subheader, body } = responseData.mainInfo;

    // Step 2: Generate image using existing info_canvas endpoint
    const formData = new FormData();
    formData.append('header', header);
    
    // Combine subheader and body for backend compatibility
    const combinedBody = subheader && body 
      ? `${subheader}. ${body}`
      : subheader || body || '';
    formData.append('body', combinedBody);

    console.log('[useSharepicGeneration] Prepared FormData for info canvas generation');

    const imageResponse = await apiClient.post('/info_canvas', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    console.log('[useSharepicGeneration] Info image generation response received');

    // Handle Axios response wrapper - extract data
    const imageData = imageResponse.data || imageResponse;
    console.log('[useSharepicGeneration] Processed info image data:', imageData);

    if (!imageData.image) {
      throw new Error('Keine gültige Bild-Antwort erhalten');
    }

    // Return combined result
    return {
      text: `${header}\n${subheader || ''}\n${body || ''}`.trim(),
      image: imageData.image,
      alternatives: responseData.alternatives || [],
      type: 'info'
    };
  }, []);

  const generateHeadlineSharepic = useCallback(async (thema, details, customPrompt = null) => {
    console.log('[useSharepicGeneration] Starting headline sharepic generation');

    // Step 1: Generate headline text using existing headline_claude endpoint
    const requestData = {
      thema,
      details
    };
    
    // Add customPrompt if provided (knowledge from KnowledgeSelector)
    if (customPrompt) {
      requestData.customPrompt = customPrompt;
    }

    const textResponse = await apiClient.post('/headline_claude', requestData);

    console.log('[useSharepicGeneration] Headline text generation response:', textResponse);

    // Handle Axios response wrapper - extract data
    const responseData = textResponse.data || textResponse;
    console.log('[useSharepicGeneration] Processed headline response data:', responseData);

    if (!responseData.mainSlogan) {
      throw new Error('Keine gültige Headline-Antwort erhalten');
    }

    const slogan = responseData.mainSlogan;

    // Step 2: Generate image using existing headline_canvas endpoint
    const formData = new FormData();
    formData.append('line1', slogan.line1 || '');
    formData.append('line2', slogan.line2 || '');
    formData.append('line3', slogan.line3 || '');

    console.log('[useSharepicGeneration] Prepared FormData for headline canvas generation');

    const imageResponse = await apiClient.post('/headline_canvas', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    console.log('[useSharepicGeneration] Headline image generation response received');

    // Handle Axios response wrapper - extract data
    const imageData = imageResponse.data || imageResponse;
    console.log('[useSharepicGeneration] Processed headline image data:', imageData);

    if (!imageData.image) {
      throw new Error('Keine gültige Bild-Antwort erhalten');
    }

    // Return combined result
    return {
      text: `${slogan.line1 || ''}\n${slogan.line2 || ''}\n${slogan.line3 || ''}`.trim(),
      image: imageData.image,
      slogans: responseData.alternatives || [],
      type: 'headline'
    };
  }, []);

  return {
    generateSharepic,
    loading,
    error
  };
};

export default useSharepicGeneration;