import { useState, useCallback } from 'react';
import { handleError } from '../../utils/errorHandling';
import { SHAREPIC_TYPES } from '../../utils/constants';

export const useSharepicGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateText = useCallback(async (type, formData) => {
    const sharepicType = type === SHAREPIC_TYPES.QUOTE ? SHAREPIC_TYPES.QUOTE : SHAREPIC_TYPES.THREE_LINES;
    console.log(`Generating text for ${sharepicType}:`, formData);
    try {
      const apiRoute = sharepicType === SHAREPIC_TYPES.QUOTE ? '/api/quote_claude' : '/api/dreizeilen_claude';

      const response = await fetch(apiRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!response.ok) throw new Error('Netzwerkfehler');
      const data = await response.json();
      console.log("Text generation response:", data);
      return data;
    } catch (err) {
      console.error("Error generating text:", err);
      throw err;
    }
  }, []);

  const generateImage = useCallback(async (formData) => {
    setLoading(true);
    setError('');
    try {
      const sharepicType = formData.type === SHAREPIC_TYPES.QUOTE ? SHAREPIC_TYPES.QUOTE : SHAREPIC_TYPES.THREE_LINES;
      console.log(`Generating image for ${sharepicType}:`, formData);
      
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        if (key === 'image' && formData[key] instanceof File) {
          formDataToSend.append(key, formData[key]);
        } else {
          formDataToSend.append(key, String(formData[key]));
        }
      });
      
      const apiRoute = sharepicType === SHAREPIC_TYPES.QUOTE ? '/api/quote_canvas' : '/api/dreizeilen_canvas';

      const response = await fetch(apiRoute, {
        method: 'POST',
        body: formDataToSend,
      });
      
      if (!response.ok) throw new Error('Netzwerkfehler bei der Bilderstellung');
      
      const result = await response.json();
      console.log("Image data received:", result);
      
      return result.image;
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