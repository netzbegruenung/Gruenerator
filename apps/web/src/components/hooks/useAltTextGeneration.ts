import useApiSubmit from './useApiSubmit';

/**
 * Custom hook for alt text generation using the standard useApiSubmit pattern
 * Provides consistent loading states, error handling, and success feedback
 */
const useAltTextGeneration = () => {
  const { loading, success, error, submitForm, resetState, resetSuccess } = useApiSubmit('/claude_alttext');

  const generateAltTextForImage = async (imageBase64: string, imageDescription: string | null = null, features: Record<string, any> = {}) => {
    console.log('[useAltTextGeneration] Starting alt text generation:', {
      hasImageBase64: !!imageBase64,
      imageBase64Length: imageBase64?.length || 0,
      hasImageDescription: !!imageDescription,
      features
    });

    const formData = {
      imageBase64,
      imageDescription,
      ...features
    };

    try {
      const response = await submitForm(formData);
      console.log('[useAltTextGeneration] Alt text generation response:', response);
      return response;
    } catch (error) {
      console.error('[useAltTextGeneration] Alt text generation error:', error);
      throw error;
    }
  };

  return {
    loading,
    success,
    error,
    generateAltTextForImage,
    resetState,
    resetSuccess
  };
};

export default useAltTextGeneration;