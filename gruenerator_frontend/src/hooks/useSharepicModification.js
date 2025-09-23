import { useState, useCallback, useMemo } from 'react';
import { debounce } from 'lodash-es';
import { prepareDataForCanvas } from '../features/sharepic/dreizeilen/utils/dataPreparation';
import { ERROR_MESSAGES } from '../components/utils/constants';
import apiClient from '../components/utils/apiClient';

/**
 * Custom hook for modifying sharepic images
 * Extracted from sharepicStore to improve separation of concerns
 * 
 * @returns {Object} Hook object with modify functions and state
 */
const useSharepicModification = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper function to get the correct API endpoint based on sharepic type
  const getEndpointForType = (type) => {
    const endpoints = {
      'Dreizeilen': '/dreizeilen_canvas',
      'Zitat': '/zitat_canvas',
      'Zitat_Pure': '/zitat_pure_canvas',
      'Info': '/info_canvas',
      'Headline': '/headline_canvas'
    };
    return endpoints[type] || '/dreizeilen_canvas';
  };

  // Helper function to map frontend types to data preparation types
  const mapTypeForDataPreparation = (type) => {
    const typeMap = {
      'Dreizeilen': 'dreizeilen',
      'Zitat': 'quote',
      'Zitat_Pure': 'quote_pure',
      'Info': 'info',
      'Headline': 'headline'
    };
    return typeMap[type] || 'dreizeilen';
  };

  const modifySharepic = useCallback(async (formData, modificationData) => {
    setLoading(true);
    setError(null);

    try {
      console.log('Modifying image with data:', { formData, modificationData });

      // Determine the sharepic type from formData
      const sharepicType = formData.type || 'Dreizeilen';
      const dataPreparationType = mapTypeForDataPreparation(sharepicType);

      console.log(`Processing ${sharepicType} sharepic (${dataPreparationType} data preparation)`);

      // Prepare the form data for the API call based on type
      let formDataToSend;
      if (dataPreparationType === 'info') {
        // Info sharepics have different data structure
        formDataToSend = prepareDataForInfoCanvas(formData, modificationData);
      } else if (dataPreparationType === 'quote_pure' || dataPreparationType === 'headline') {
        // Text-only sharepics don't need image data
        formDataToSend = prepareDataForTextOnlyCanvas(formData, modificationData, dataPreparationType);
      } else {
        // Ensure image is available in modificationData if present in formData
        const imageData = formData.uploadedImage || formData.image || formData.file;
        if (imageData && !modificationData.image) {
          modificationData.image = imageData;
        }
        // Use existing unified preparation for dreizeilen and quote types
        formDataToSend = prepareDataForCanvas(formData, modificationData, dataPreparationType);
      }

      // Make the API call to the appropriate endpoint using apiClient
      const endpoint = getEndpointForType(sharepicType);
      const response = await apiClient.post(endpoint, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Handle Axios response wrapper - extract data
      const result = response.data || response;
      if (!result.image) {
        throw new Error(ERROR_MESSAGES.NO_IMAGE_DATA);
      }

      console.log(`${sharepicType} image successfully modified`);
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

  // Helper function to prepare data for Info sharepics
  const prepareDataForInfoCanvas = (formData, modificationData) => {
    const formDataToSend = new FormData();
    
    formDataToSend.append('header', formData.header || '');
    formDataToSend.append('body', formData.body || '');
    formDataToSend.append('headerColor', modificationData.headerColor || '#FFFFFF');
    formDataToSend.append('bodyColor', modificationData.bodyColor || '#FFFFFF');
    formDataToSend.append('headerFontSize', modificationData.headerFontSize || 89);
    formDataToSend.append('bodyFontSize', modificationData.bodyFontSize || 40);
    
    return formDataToSend;
  };

  // Helper function to prepare data for text-only sharepics (Zitat_Pure, Headline)
  const prepareDataForTextOnlyCanvas = (formData, modificationData, type) => {
    const formDataToSend = new FormData();
    
    if (type === 'quote_pure') {
      formDataToSend.append('quote', formData.quote || '');
      formDataToSend.append('name', formData.name || '');
    } else if (type === 'headline') {
      formDataToSend.append('line1', formData.line1 || '');
      formDataToSend.append('line2', formData.line2 || '');
      formDataToSend.append('line3', formData.line3 || '');
    }
    
    formDataToSend.append('fontSize', modificationData.fontSize || formData.fontSize || '85');
    
    return formDataToSend;
  };

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