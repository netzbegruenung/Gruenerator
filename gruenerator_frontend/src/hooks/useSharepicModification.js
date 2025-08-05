import { useState, useCallback, useMemo } from 'react';
import { debounce } from 'lodash';
import { prepareDataForDreizeilenCanvas } from '../features/sharepic/dreizeilen/utils/dataPreparation';
import { ERROR_MESSAGES } from '../components/utils/constants';

/**
 * Custom hook for modifying sharepic images
 * Extracted from sharepicStore to improve separation of concerns
 * 
 * @returns {Object} Hook object with modify functions and state
 */
const useSharepicModification = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const modifySharepic = useCallback(async (formData, modificationData) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('Modifying image with data:', { formData, modificationData });
      
      // Prepare the form data for the API call
      const formDataToSend = prepareDataForDreizeilenCanvas(formData, modificationData);

      // Make the API call
      const response = await fetch('/api/dreizeilen_canvas', {
        method: 'POST',
        body: formDataToSend,
      });

      if (!response.ok) {
        throw new Error(ERROR_MESSAGES.NETWORK_ERROR);
      }

      const result = await response.json();
      if (!result.image) {
        throw new Error(ERROR_MESSAGES.NO_IMAGE_DATA);
      }

      console.log('Image successfully modified');
      return {
        image: result.image,
        modificationData: {
          fontSize: modificationData.fontSize,
          balkenOffset: modificationData.balkenOffset,
          colorScheme: modificationData.colorScheme,
          credit: modificationData.credit,
        }
      };
    } catch (err) {
      console.error('Error in modifySharepic:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Create debounced version for UI responsiveness
  const debouncedModifySharepic = useMemo(
    () => debounce(modifySharepic, 300),
    [modifySharepic]
  );

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    modifySharepic,
    debouncedModifySharepic,
    loading,
    error,
    setError,
    clearError
  };
};

export default useSharepicModification;