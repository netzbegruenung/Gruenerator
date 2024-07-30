import { useState, useCallback } from 'react';
import { handleError } from '../../utils/errorHandling';
import { sharepicAPI } from '../../../services/api';

export const useSharepicGeneration = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateText = useCallback(async (type, formData) => {
    console.log(`Generating text for ${type}:`, formData);
    try {
      const response = await fetch(`/api/${type.toLowerCase()}_claude`, {
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
      const imageData = await sharepicAPI.generateImage(formData);
      console.log("Image data received:", imageData);
      return imageData;
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