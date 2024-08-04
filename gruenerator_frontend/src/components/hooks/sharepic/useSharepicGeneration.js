import { useState, useCallback } from 'react';
import { handleError } from '../../utils/errorHandling';
import { SHAREPIC_TYPES } from '../../utils/constants'; // Fügen Sie diesen Import hinzu

export const useSharepicGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateText = useCallback(async (type, formData) => {
    console.log(`Generating text for ${type}:`, formData);
    try {
      let apiRoute;
      if (type === SHAREPIC_TYPES.THREE_LINES) {
        apiRoute = '/api/dreizeilen_claude';
      } else if (type === SHAREPIC_TYPES.QUOTE) {
        apiRoute = '/api/quote_claude';
      } else {
        throw new Error('Ungültiger Sharepic-Typ');
      }

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
      console.log(`Generating image for ${formData.type}:`, formData);
      
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        if (key === 'image' && formData[key] instanceof File) {
          formDataToSend.append(key, formData[key]);
        } else {
          formDataToSend.append(key, String(formData[key]));
        }
      });
      
      const apiRoute = formData.type === SHAREPIC_TYPES.THREE_LINES ? '/api/dreizeilen_canvas' : '/api/quote_canvas';

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
  const modifyImage = useCallback(async (instruction, currentParams) => {
    console.log("Sending modification request:", { instruction, currentParams });

    setLoading(true);
    setError('');
    try {
      console.log("Modifying image with instruction:", instruction);
      const response = await fetch('/api/ai-image-modification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInstruction: instruction, currentImageParams: currentParams }),
      });
      if (!response.ok) throw new Error('Netzwerkfehler bei der Bildmodifikation');
      const modifiedParams = await response.json();
      console.log("Modified image params:", modifiedParams);
      return modifiedParams;
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
    modifyImage,
    loading,
    error,
    setError
  };
};