import { useState, useCallback } from 'react';
import { handleError } from '../../../../components/utils/errorHandling';
import { SHAREPIC_TYPES } from '../../../../components/utils/constants';
import useApiSubmit from '../../../../components/hooks/useApiSubmit';
import apiClient from '../../../../components/utils/apiClient';

export const useSharepicGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const quoteSubmit = useApiSubmit('zitat_claude');
  const dreizeilenSubmit = useApiSubmit('dreizeilen_claude');
  const infoSubmit = useApiSubmit('info_claude');
  const headlineSubmit = useApiSubmit('headline_claude');
  const zitatPureSubmit = useApiSubmit('zitat_pure_claude');
  // const abyssaleSubmit = useApiSubmit('zitat_abyssale'); // Commented out for now

  const generateText = useCallback(async (type, formData) => {
    console.log(`[useSharepicGeneration] Generating text for ${type}:`, formData);
    console.log('[useSharepicGeneration] Input validation:', {
      hasThema: !!formData.thema,
      themaLength: formData.thema?.length,
      hasDetails: !!formData.details,
      detailsLength: formData.details?.length,
      isEmpty: !formData.thema || formData.thema.trim() === ''
    });
    try {
      let submitFn;
      let isQuoteType = false;
      let isInfoType = false;
      
      // Route to correct endpoint based on type
      switch (type) {
        case SHAREPIC_TYPES.QUOTE:
          submitFn = quoteSubmit.submitForm;
          isQuoteType = true;
          break;
        case SHAREPIC_TYPES.QUOTE_PURE:
          submitFn = zitatPureSubmit.submitForm;
          isQuoteType = true;
          break;
        case SHAREPIC_TYPES.INFO:
          submitFn = infoSubmit.submitForm;
          isInfoType = true;
          break;
        case SHAREPIC_TYPES.HEADLINE:
          submitFn = headlineSubmit.submitForm;
          break;
        case SHAREPIC_TYPES.THREE_LINES:
        default:
          submitFn = dreizeilenSubmit.submitForm;
          break;
      }
      
      const dataToSend = {
        ...formData,
        source: 'sharepicgenerator',
        count: 5
      };

      console.log('[useSharepicGeneration] Sending to backend:', {
        type,
        source: dataToSend.source,
        hasThema: !!dataToSend.thema,
        hasDetails: !!dataToSend.details,
        dataToSend
      });

      const response = await submitFn(dataToSend);
      console.log("[useSharepicGeneration] Text generation response:", {
        success: !!response,
        responseKeys: response ? Object.keys(response) : [],
        response
      });
      
      // Handle different response structures based on type
      if (isQuoteType) {
        if (!response || !response.quote) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          quote: response.quote,
          name: formData.name,
          alternatives: response.alternatives || []
        };
      } else if (isInfoType) {
        if (!response || !response.header || !response.body) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          header: response.header,
          subheader: response.subheader || '',
          body: response.body,
          alternatives: response.alternatives || [],
          searchTerms: response.searchTerms || []
        };
      } else {
        // Dreizeilen and Headline types
        if (!response || !response.mainSlogan || !response.alternatives) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          mainSlogan: response.mainSlogan,
          alternatives: response.alternatives,
          searchTerms: response.searchTerms || []
        };
      }
    } catch (err) {
      console.error("Error generating text:", err);
      throw err;
    }
  }, [quoteSubmit, dreizeilenSubmit, infoSubmit, headlineSubmit, zitatPureSubmit]);

  const generateImage = useCallback(async (formData) => {
    setLoading(true);
    setError('');
    try {
      console.log('Generating image with formData:', formData);
      const formDataToSend = new FormData();
      
      // Determine if this type needs an image upload
      const needsImageUpload = formData.type === SHAREPIC_TYPES.QUOTE || formData.type === SHAREPIC_TYPES.THREE_LINES;
      
      if (needsImageUpload) {
        const imageToUse = formData.uploadedImage || formData.image;
        if (!imageToUse) {
          throw new Error('Kein Bild ausgewählt');
        }

        const imageFile = imageToUse instanceof File ? imageToUse : 
          new File([imageToUse], 'image.jpg', { type: imageToUse.type || 'image/jpeg' });
        formDataToSend.append('image', imageFile);
      }

      // Add type-specific form data
      if (formData.type === SHAREPIC_TYPES.QUOTE || formData.type === SHAREPIC_TYPES.QUOTE_PURE) {
        // Quote types (both regular and pure)
        if (!formData.quote || !formData.name) {
          throw new Error('Zitat und Name sind erforderlich');
        }
        formDataToSend.append('quote', formData.quote);
        formDataToSend.append('name', formData.name);
      } else if (formData.type === SHAREPIC_TYPES.INFO) {
        // Info type - combine subheader + body for backend
        if (!formData.header || !formData.body) {
          throw new Error('Header und Body sind erforderlich');
        }
        formDataToSend.append('header', formData.header);
        
        // Combine subheader and body - subheader becomes first sentence (bold)
        const combinedBody = formData.subheader && formData.body 
          ? `${formData.subheader}. ${formData.body}`
          : formData.subheader || formData.body || '';
        formDataToSend.append('body', combinedBody);
      } else {
        // Three-line types (Dreizeilen, Headline)
        formDataToSend.append('line1', formData.line1 || '');
        formDataToSend.append('line2', formData.line2 || '');
        formDataToSend.append('line3', formData.line3 || '');

        const fieldsToAdd = {
          type: formData.type,
          fontSize: formData.fontSize || '85',
          credit: formData.credit || '',
          balkenOffset_0: formData.balkenOffset?.[0] || '50',
          balkenOffset_1: formData.balkenOffset?.[1] || '-100',
          balkenOffset_2: formData.balkenOffset?.[2] || '50',
          balkenGruppe_offset_x: formData.balkenGruppenOffset?.[0] || '0',
          balkenGruppe_offset_y: formData.balkenGruppenOffset?.[1] || '0',
          sunflower_offset_x: formData.sunflowerOffset?.[0] || '0',
          sunflower_offset_y: formData.sunflowerOffset?.[1] || '0'
        };

        Object.entries(fieldsToAdd).forEach(([key, value]) => {
          formDataToSend.append(key, String(value));
        });

        if (formData.colorScheme) {
          formData.colorScheme.forEach((color, index) => {
            if (formDataToSend.get(`line${index + 1}`)) {
              formDataToSend.append(`colors_${index}_background`, color.background);
              formDataToSend.append(`colors_${index}_text`, color.text);
            }
          });
        }
      }

      console.log('Sending FormData:', Object.fromEntries(formDataToSend.entries()));

      // Route to correct canvas endpoint based on type
      let endpoint;
      switch (formData.type) {
        case SHAREPIC_TYPES.QUOTE:
          endpoint = 'zitat_canvas';
          break;
        case SHAREPIC_TYPES.QUOTE_PURE:
          endpoint = 'zitat_pure_canvas';
          break;
        case SHAREPIC_TYPES.INFO:
          endpoint = 'info_canvas';
          break;
        case SHAREPIC_TYPES.HEADLINE:
          endpoint = 'headline_canvas';
          break;
        case SHAREPIC_TYPES.THREE_LINES:
        default:
          endpoint = 'dreizeilen_canvas';
          break;
      }
        
      const response = await apiClient.post(endpoint, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      return response.data.image;

    } catch (err) {
      handleError(err, setError);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Commented out for now - Abyssale professional template mode
  // const generateAbyssaleImage = useCallback(async (formData) => {
  //   setLoading(true);
  //   setError('');
  //   try {
  //     console.log('Generating Abyssale image with formData:', formData);
  //     
  //     if (formData.type !== SHAREPIC_TYPES.QUOTE) {
  //       throw new Error('Abyssale generation is currently only supported for quotes');
  //     }
  //     
  //     if (!formData.quote || !formData.name) {
  //       throw new Error('Quote and name are required for Abyssale generation');
  //     }
  //     
  //     const requestData = {
  //       thema: formData.thema || '',
  //       details: formData.details || '',
  //       quote: formData.quote,
  //       name: formData.name
  //     };
  //     
  //     console.log('Sending Abyssale request:', requestData);
  //     
  //     const response = await abyssaleSubmit.submitForm(requestData);
  //     console.log('Abyssale generation response:', response);
  //     
  //     if (!response || !response.success) {
  //       throw new Error(response?.error || 'Failed to generate Abyssale image');
  //     }
  //     
  //     // Return the base64 image data (same as regular generation)
  //     return response.image;

  //   } catch (err) {
  //     handleError(err, setError);
  //     throw err;
  //   } finally {
  //     setLoading(false);  
  //   }
  // }, [abyssaleSubmit]);

  return {
    generateText,
    generateImage,
    // generateAbyssaleImage, // Commented out for now
    loading,
    error,
    setError
  };
};