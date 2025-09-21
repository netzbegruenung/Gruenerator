import { useState, useCallback } from 'react';
import apiClient from '../components/utils/apiClient';
import { generateSharepicImage } from '../features/sharepic/core/services/sharepicImageService';

/**
 * Hook for generating sharepics using existing backend endpoints
 * @returns {Object} Hook object with generateSharepic function and loading state
 */
const useSharepicGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSharepic = useCallback(async (thema, details, uploadedImage = null, sharepicType = 'dreizeilen', zitatAuthor = null, customPrompt = null, attachments = null, usePrivacyMode = false, provider = null) => {
    setLoading(true);
    setError(null);

    try {
      console.log('[useSharepicGeneration] Starting sharepic generation:', { 
        thema, 
        details, 
        hasImage: !!uploadedImage, 
        sharepicType, 
        zitatAuthor, 
        hasCustomPrompt: !!customPrompt,
        hasAttachments: attachments && attachments.length > 0,
        usePrivacyMode,
        provider
      });

      // Route to appropriate generation function based on type
      switch (sharepicType) {
        case 'quote':
          return await generateQuoteSharepic(thema, details, zitatAuthor, uploadedImage, customPrompt, attachments, usePrivacyMode, provider);
        case 'quote_pure':
          return await generateQuotePureSharepic(thema, details, zitatAuthor, customPrompt, attachments, usePrivacyMode, provider);
        case 'info':
          return await generateInfoSharepic(thema, details, customPrompt, attachments, usePrivacyMode, provider);
        case 'headline':
          return await generateHeadlineSharepic(thema, details, customPrompt, attachments, usePrivacyMode, provider);
        case 'dreizeilen':
        default:
          return await generateDreizeilenSharepic(thema, details, uploadedImage, customPrompt, attachments, usePrivacyMode, provider);
      }

    } catch (err) {
      console.error('[useSharepicGeneration] Error generating sharepic:', err);
      setError(err.message || 'Fehler bei der Sharepic-Generierung');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const generateDreizeilenSharepic = useCallback(async (thema, details, uploadedImage, customPrompt = null, attachments = null, usePrivacyMode = false, provider = null) => {
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

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      requestData.attachments = attachments;
    }

    // Add privacy mode and provider if specified
    if (usePrivacyMode) {
      requestData.usePrivacyMode = usePrivacyMode;
      if (provider) {
        requestData.provider = provider;
      }
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
    const image = await generateSharepicImage('dreizeilen', {
      line1: slogan.line1 || '',
      line2: slogan.line2 || '',
      line3: slogan.line3 || '',
      uploadedImage
    });

    if (!image) {
      throw new Error('Keine gültige Bild-Antwort erhalten');
    }

    // Return combined result
    return {
      text: `${slogan.line1 || ''}\n${slogan.line2 || ''}\n${slogan.line3 || ''}`.trim(),
      image,
      slogans: responseData.alternatives || [], // Include alternatives for potential future use
      type: 'dreizeilen'
    };
  }, []);

  const generateQuoteSharepic = useCallback(async (thema, details, zitatAuthor, uploadedImage, customPrompt = null, attachments = null, usePrivacyMode = false, provider = null) => {
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

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      requestData.attachments = attachments;
    }

    // Add privacy mode and provider if specified
    if (usePrivacyMode) {
      requestData.usePrivacyMode = usePrivacyMode;
      if (provider) {
        requestData.provider = provider;
      }
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
    const image = await generateSharepicImage('quote', {
      quote: mainQuote,
      name: zitatAuthor,
      uploadedImage
    });

    if (!image) {
      throw new Error('Keine gültige Bild-Antwort erhalten');
    }

    // Return combined result
    return {
      text: `"${mainQuote}" - ${zitatAuthor}`,
      image,
      quotes: responseData.alternatives || [], // Use alternatives array from response
      type: 'quote',
      originalImage: uploadedImage // Preserve original background image for editing
    };
  }, []);

  const generateQuotePureSharepic = useCallback(async (thema, details, zitatAuthor, customPrompt = null, attachments = null, usePrivacyMode = false, provider = null) => {
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

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      requestData.attachments = attachments;
    }

    // Add privacy mode and provider if specified
    if (usePrivacyMode) {
      requestData.usePrivacyMode = usePrivacyMode;
      if (provider) {
        requestData.provider = provider;
      }
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

    const image = await generateSharepicImage('quote_pure', {
      quote: mainQuote,
      name: zitatAuthor
    });

    if (!image) {
      throw new Error('Keine gültige Bild-Antwort erhalten');
    }

    // Return combined result
    return {
      text: `"${mainQuote}" - ${zitatAuthor}`,
      image,
      quotes: responseData.alternatives || [],
      type: 'quote_pure'
    };
  }, []);

  const generateInfoSharepic = useCallback(async (thema, details, customPrompt = null, attachments = null, usePrivacyMode = false, provider = null) => {
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

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      requestData.attachments = attachments;
    }

    // Add privacy mode and provider if specified
    if (usePrivacyMode) {
      requestData.usePrivacyMode = usePrivacyMode;
      if (provider) {
        requestData.provider = provider;
      }
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
    const image = await generateSharepicImage('info', {
      header,
      subheader,
      body
    });

    if (!image) {
      throw new Error('Keine gültige Bild-Antwort erhalten');
    }

    // Return combined result
    return {
      text: `${header}\n${subheader || ''}\n${body || ''}`.trim(),
      image,
      alternatives: responseData.alternatives || [],
      type: 'info'
    };
  }, []);

  const generateHeadlineSharepic = useCallback(async (thema, details, customPrompt = null, attachments = null, usePrivacyMode = false, provider = null) => {
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

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      requestData.attachments = attachments;
    }

    // Add privacy mode and provider if specified
    if (usePrivacyMode) {
      requestData.usePrivacyMode = usePrivacyMode;
      if (provider) {
        requestData.provider = provider;
      }
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
    const image = await generateSharepicImage('headline', {
      line1: slogan.line1 || '',
      line2: slogan.line2 || '',
      line3: slogan.line3 || ''
    });

    if (!image) {
      throw new Error('Keine gültige Bild-Antwort erhalten');
    }

    // Return combined result
    return {
      text: `${slogan.line1 || ''}\n${slogan.line2 || ''}\n${slogan.line3 || ''}`.trim(),
      image,
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
