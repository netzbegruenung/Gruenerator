import { useState, useCallback } from 'react';
import apiClient from '../../../components/utils/apiClient';

export const useKiEditSubmit = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = useCallback(async ({ image, instruction, type, precision }) => {
    if (!image) {
      throw new Error('Bitte lade ein Bild hoch');
    }

    if (!instruction || instruction.trim().length < 10) {
      throw new Error('Bitte gib eine Anweisung ein (mindestens 10 Zeichen)');
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', image);
      formData.append('text', instruction.trim());
      formData.append('type', type || 'green-edit');
      formData.append('precision', precision ? 'true' : 'false');

      const response = await apiClient.post('/flux/green-edit/prompt', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response?.data?.image?.base64) {
        return response.data.image.base64;
      }

      throw new Error('Keine Bilddaten in der Antwort');
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message || 'Bildgenerierung fehlgeschlagen';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { submit, loading, error, clearError };
};

export default useKiEditSubmit;
