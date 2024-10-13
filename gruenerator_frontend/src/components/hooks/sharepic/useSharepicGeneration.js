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
    console.log('generateImage called with formData:', formData);
    setLoading(true);
    setError('');
    try {
      const sharepicType = formData.type === SHAREPIC_TYPES.QUOTE ? SHAREPIC_TYPES.QUOTE : SHAREPIC_TYPES.THREE_LINES;
      console.log(`Generating image for ${sharepicType}:`, formData);
      
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        console.log(`Appending ${key} to formData`);
        if (key === 'image') {
          if (formData[key] instanceof File) {
            formDataToSend.append(key, formData[key]);
            console.log(`Appended file: ${formData[key].name}, type: ${formData[key].type}, size: ${formData[key].size} bytes`);
          } else if (formData[key] instanceof Blob) {
            formDataToSend.append(key, formData[key], 'unsplash_image.png');
            console.log(`Appended blob, type: ${formData[key].type}, size: ${formData[key].size} bytes`);
          } else {
            console.error(`Invalid image data: ${typeof formData[key]}`, formData[key]);
            throw new Error('Ungültiges Bildformat');
          }
        } else {
          formDataToSend.append(key, String(formData[key]));
        }
      });
      
      const apiRoute = sharepicType === SHAREPIC_TYPES.QUOTE ? '/api/quote_canvas' : '/api/dreizeilen_canvas';
      console.log('Sending request to:', apiRoute);

      const response = await fetch(apiRoute, {
        method: 'POST',
        body: formDataToSend,
      });
      
      console.log('Response received:', response);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Server response:', response.status, errorText);
        throw new Error(`Netzwerkfehler bei der Bilderstellung: ${response.status} ${errorText}`);
      }
      
      const result = await response.json();
      console.log("Image data received:", result);
      
      if (!result.image) {
        throw new Error('Keine Bilddaten in der Serverantwort');
      }
      
      return result.image;
    } catch (err) {
      console.error("Error generating image:", err);
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