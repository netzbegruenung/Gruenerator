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

  const generateText = useCallback(async (type, formData) => {
    const sharepicType = type === SHAREPIC_TYPES.QUOTE ? SHAREPIC_TYPES.QUOTE : SHAREPIC_TYPES.THREE_LINES;
    console.log(`Generating text for ${sharepicType}:`, formData);
    try {
      const submitFn = sharepicType === SHAREPIC_TYPES.QUOTE ? quoteSubmit.submitForm : dreizeilenSubmit.submitForm;
      const response = await submitFn(formData);
      console.log("Text generation response:", response);
      
      if (sharepicType === SHAREPIC_TYPES.QUOTE) {
        if (!response || !response.quote) {
          throw new Error('Unerwartete Antwortstruktur von der API');
        }
        return {
          quote: response.quote,
          name: formData.name
        };
      } else {
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
  }, [quoteSubmit, dreizeilenSubmit]);

  const generateImage = useCallback(async (formData) => {
    setLoading(true);
    setError('');
    try {
      console.log('Generating image with formData:', formData);
      const formDataToSend = new FormData();
      
      const imageToUse = formData.uploadedImage || formData.image;
      if (!imageToUse) {
        throw new Error('Kein Bild ausgewählt');
      }

      const imageFile = imageToUse instanceof File ? imageToUse : 
        new File([imageToUse], 'image.jpg', { type: imageToUse.type || 'image/jpeg' });
      formDataToSend.append('image', imageFile);

      if (formData.type === SHAREPIC_TYPES.QUOTE) {
        if (!formData.quote || !formData.name) {
          throw new Error('Zitat und Name sind erforderlich');
        }
        formDataToSend.append('quote', formData.quote);
        formDataToSend.append('name', formData.name);
      } else {
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

      const endpoint = formData.type === SHAREPIC_TYPES.QUOTE ? 
        'zitat_canvas' : 'dreizeilen_canvas';
        
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

  return {
    generateText,
    generateImage,
    loading,
    error,
    setError
  };
};