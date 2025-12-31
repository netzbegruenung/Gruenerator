import { useState, useCallback } from 'react';
import apiClient from '../components/utils/apiClient';

/**
 * Custom hook for saving content to user's library
 * @returns {Object} Hook functions and states
 */
export const useSaveToLibrary = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  /**
   * Save content to user's library
   * @param {string} content - Content to save
   * @param {string} title - Title for the saved content
   * @param {string} type - Content type (defaults to 'universal')
   * @returns {Promise<Object>} Response data from API
   */
  const saveToLibrary = useCallback(async (content, title, type = 'universal') => {
    if (!content || !content.trim()) {
      console.warn("[useSaveToLibrary] No content provided for saving");
      setError('Kein Inhalt zum Speichern vorhanden.');
      return null;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(false);

    try {
      console.log("[useSaveToLibrary] Saving content to library...");
      
      const response = await apiClient.post('/auth/save-to-library', { 
        content: content.trim(),
        title: title || 'Unbenannter Text',
        type: type
      });

      console.log("[useSaveToLibrary] Content successfully saved to library");
      setSuccess(true);
      
      // Clear success state after 3 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 3000);

      return response.data;
    } catch (error) {
      console.error("[useSaveToLibrary] Error saving to library:", error);
      
      // Extract user-friendly error message
      let errorMessage = 'Fehler beim Speichern in der Bibliothek.';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Clear any existing error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clear any existing success state
   */
  const clearSuccess = useCallback(() => {
    setSuccess(false);
  }, []);

  return {
    saveToLibrary,
    isLoading,
    error,
    success,
    clearError,
    clearSuccess
  };
};

export default useSaveToLibrary;