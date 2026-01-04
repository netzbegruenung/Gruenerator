import { useState, useCallback, useMemo } from 'react';
import { debounce } from 'lodash';
import { prepareDataForCanvas } from '../features/sharepic/dreizeilen/utils/dataPreparation';
import { ERROR_MESSAGES } from '../components/utils/constants';
import apiClient from '../components/utils/apiClient';

/** Type for sharepic form data */
interface SharepicFormData {
  type?: string;
  thema?: string;
  details?: string;
  quote?: string;
  name?: string;
  header?: string;
  body?: string;
  uploadedImage?: string | File;
  image?: string | File;
  file?: string | File;
  fontSize?: string | number;
}

/** Type for sharepic modification data */
interface SharepicModificationData {
  fontSize?: string | number;
  balkenOffset?: number[];
  colorScheme?: Array<{ background: string }>;
  credit?: string;
  image?: string | File;
  headerColor?: string;
  bodyColor?: string;
  headerFontSize?: string | number;
  bodyFontSize?: string | number;
}

/** Return type for modify sharepic result */
interface ModifySharepicResult {
  image: string;
  modificationData: Partial<SharepicModificationData>;
}

/** Return type for the hook */
interface UseSharepicModificationReturn {
  modifySharepic: (formData: SharepicFormData, modificationData: SharepicModificationData) => Promise<ModifySharepicResult>;
  debouncedModifySharepic: (formData: SharepicFormData, modificationData: SharepicModificationData) => void;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  clearError: () => void;
}

/**
 * Custom hook for modifying sharepic images
 * Extracted from sharepicStore to improve separation of concerns
 *
 * @returns Hook object with modify functions and state
 */
const useSharepicModification = (): UseSharepicModificationReturn => {
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Helper function to get the correct API endpoint based on sharepic type
  const getEndpointForType = (type: string): string => {
    const endpoints: Record<string, string> = {
      'Dreizeilen': '/dreizeilen_canvas',
      'Zitat': '/zitat_canvas',
      'Zitat_Pure': '/zitat_pure_canvas',
      'Info': '/info_canvas'
    };
    return endpoints[type] || '/dreizeilen_canvas';
  };

  // Helper function to map frontend types to data preparation types
  const mapTypeForDataPreparation = (type: string): string => {
    const typeMap: Record<string, string> = {
      'Dreizeilen': 'dreizeilen',
      'Zitat': 'quote',
      'Zitat_Pure': 'quote_pure',
      'Info': 'info'
    };
    return typeMap[type] || 'dreizeilen';
  };

  const modifySharepic = useCallback(async (formData: SharepicFormData, modificationData: SharepicModificationData): Promise<ModifySharepicResult> => {
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
      } else if (dataPreparationType === 'quote_pure') {
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
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Error in modifySharepic:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Helper function to prepare data for Info sharepics
  const prepareDataForInfoCanvas = (formData: SharepicFormData, modificationData: SharepicModificationData): FormData => {
    const formDataToSend = new FormData();

    formDataToSend.append('header', String(formData.header || ''));
    formDataToSend.append('body', String(formData.body || ''));
    formDataToSend.append('headerColor', String(modificationData.headerColor || '#FFFFFF'));
    formDataToSend.append('bodyColor', String(modificationData.bodyColor || '#FFFFFF'));
    formDataToSend.append('headerFontSize', String(modificationData.headerFontSize || 89));
    formDataToSend.append('bodyFontSize', String(modificationData.bodyFontSize || 40));

    return formDataToSend;
  };

  // Helper function to prepare data for text-only sharepics (Zitat_Pure)
  const prepareDataForTextOnlyCanvas = (formData: SharepicFormData, modificationData: SharepicModificationData, type: string): FormData => {
    const formDataToSend = new FormData();

    if (type === 'quote_pure') {
      formDataToSend.append('quote', formData.quote || '');
      formDataToSend.append('name', formData.name || '');
    }

    formDataToSend.append('fontSize', String(modificationData.fontSize || formData.fontSize || '85'));

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