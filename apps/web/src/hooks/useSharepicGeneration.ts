import { useState, useCallback } from 'react';
import apiClient from '../components/utils/apiClient';

type SharepicType = 'default' | 'quote' | 'quote_pure' | 'info' | 'headline' | 'dreizeilen';

interface SharepicAttachment {
  type: string;
  data: string;
  [key: string]: unknown;
}

interface UnifiedSharepicRequestData {
  type: string;
  thema: string;
  details?: string;
  name?: string;
  customPrompt?: string | null;
  attachments?: SharepicAttachment[];
  usePrivacyMode?: boolean;
  provider?: string | null;
  useBedrock?: boolean;
}

interface DefaultSharepicRequestData {
  thema: string;
  details?: string;
  customPrompt?: string | null;
  attachments?: SharepicAttachment[];
  usePrivacyMode?: boolean;
  provider?: string | null;
}

interface SharepicResult {
  image?: string;
  text?: string;
  type?: string;
  originalImage?: string | null;
  [key: string]: unknown;
}

interface UseSharepicGenerationReturn {
  generateSharepic: (
    thema: string,
    details?: string,
    uploadedImage?: File | Blob | null,
    sharepicType?: SharepicType,
    zitatAuthor?: string | null,
    customPrompt?: string | null,
    attachments?: SharepicAttachment[] | null,
    usePrivacyMode?: boolean,
    provider?: string | null,
    useProMode?: boolean
  ) => Promise<SharepicResult | SharepicResult[]>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook for generating sharepics using existing backend endpoints
 */
const useSharepicGeneration = (): UseSharepicGenerationReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateSharepic = useCallback(async (
    thema: string,
    details?: string,
    uploadedImage: File | Blob | null = null,
    sharepicType: SharepicType = 'dreizeilen',
    zitatAuthor: string | null = null,
    customPrompt: string | null = null,
    attachments: SharepicAttachment[] | null = null,
    usePrivacyMode = false,
    provider: string | null = null,
    useProMode = false
  ): Promise<SharepicResult | SharepicResult[]> => {
    setLoading(true);
    setError(null);

    try {
      // Route to appropriate generation function based on type
      switch (sharepicType) {
        case 'default':
          return await generateDefaultSharepics(thema, details, customPrompt, attachments, usePrivacyMode, provider);
        case 'quote':
          return await generateUnifiedSharepic('zitat', thema, details, uploadedImage, zitatAuthor, customPrompt, attachments, usePrivacyMode, provider, useProMode);
        case 'quote_pure':
          return await generateUnifiedSharepic('zitat_pure', thema, details, null, zitatAuthor, customPrompt, attachments, usePrivacyMode, provider, useProMode);
        case 'info':
          return await generateUnifiedSharepic('info', thema, details, null, null, customPrompt, attachments, usePrivacyMode, provider, useProMode);
        case 'headline':
          return await generateUnifiedSharepic('headline', thema, details, null, null, customPrompt, attachments, usePrivacyMode, provider, useProMode);
        case 'dreizeilen':
        default:
          return await generateUnifiedSharepic('dreizeilen', thema, details, uploadedImage, null, customPrompt, attachments, usePrivacyMode, provider, useProMode);
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Fehler bei der Sharepic-Generierung';
      console.error('[useSharepicGeneration] Error generating sharepic:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Unified sharepic generation function - handles all types via single backend endpoint
  const generateUnifiedSharepic = useCallback(async (
    type: string,
    thema: string,
    details?: string,
    uploadedImage: File | Blob | null = null,
    zitatAuthor: string | null = null,
    customPrompt: string | null = null,
    attachments: SharepicAttachment[] | null = null,
    usePrivacyMode = false,
    provider: string | null = null,
    useProMode = false
  ): Promise<SharepicResult> => {
    const requestData: UnifiedSharepicRequestData = {
      type,
      thema,
      details
    };

    // Add type-specific fields
    if (zitatAuthor) {
      requestData.name = zitatAuthor;
    }

    // Add customPrompt if provided (knowledge from KnowledgeSelector)
    if (customPrompt) {
      requestData.customPrompt = customPrompt;
    }

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      requestData.attachments = attachments;
    }

    // Add privacy mode and provider if specified
    if (usePrivacyMode) {
      requestData.usePrivacyMode = usePrivacyMode;
      if (provider) {
        requestData.provider = provider;
      }
    }

    // Add Pro mode flag for backend
    if (useProMode) {
      requestData.useBedrock = useProMode;
    }

    // Handle uploaded image for relevant types
    if (uploadedImage && (type === 'dreizeilen' || type === 'zitat')) {
      // Convert image to base64 for backend processing
      let imageBase64: string | null = null;
      if (uploadedImage instanceof File || uploadedImage instanceof Blob) {
        try {
          imageBase64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(uploadedImage);
          });
        } catch (error) {
          console.warn('[useSharepicGeneration] Failed to convert image to base64:', error);
        }
      }

      if (imageBase64) {
        // Format as attachment (backend expects attachments array)
        const imageAttachment = {
          type: imageBase64.split(';')[0].split(':')[1], // Extract MIME type (e.g., 'image/jpeg')
          data: imageBase64
        };
        // Add to attachments array
        requestData.attachments = requestData.attachments || [];
        requestData.attachments.push(imageAttachment);
      }
    }
    const response = await apiClient.post('/generate-sharepic', requestData);
    const responseData = response.data || response;

    if (!responseData.success) {
      throw new Error(responseData.error || 'Sharepic generation failed');
    }

    // Convert original image to base64 for storage if available
    let originalImageBase64: string | null = null;
    if (uploadedImage && (uploadedImage instanceof File || uploadedImage instanceof Blob)) {
      try {
        originalImageBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(uploadedImage);
        });
      } catch (error) {
        console.warn('[useSharepicGeneration] Failed to convert original image to base64:', error);
      }
    }

    // Return unified structure
    return {
      ...responseData,
      originalImage: originalImageBase64, // Preserve original background for editing
      success: undefined // Remove success flag from response structure
    };
  }, []);


  const generateDefaultSharepics = useCallback(async (
    thema: string,
    details?: string,
    customPrompt: string | null = null,
    attachments: SharepicAttachment[] | null = null,
    usePrivacyMode = false,
    provider: string | null = null
  ): Promise<SharepicResult[]> => {
    // Prepare request data
    const requestData: DefaultSharepicRequestData = {
      thema,
      details
    };

    // Add customPrompt if provided
    if (customPrompt) {
      requestData.customPrompt = customPrompt;
    }

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      requestData.attachments = attachments;
    }

    // Add privacy mode and provider if specified
    if (usePrivacyMode) {
      requestData.usePrivacyMode = usePrivacyMode;
      if (provider) {
        requestData.provider = provider;
      }
    }

    try {
      // Use backend service to generate all 3 sharepics
      const response = await apiClient.post('/default_claude', requestData);

      // Handle Axios response wrapper - extract data
      const responseData = response.data || response;

      if (!responseData.success || !responseData.sharepics) {
        throw new Error('Backend failed to generate default sharepics');
      }

      // Return the sharepics array directly (backend already formats them properly)
      return responseData.sharepics;

    } catch (error) {
      console.error('[useSharepicGeneration] Error in default generation:', error);
      throw error;
    }
  }, []);

  return {
    generateSharepic,
    loading,
    error
  };
};

export default useSharepicGeneration;
