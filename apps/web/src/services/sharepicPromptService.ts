import apiClient from '../components/utils/apiClient';

interface SharepicGeneratedData {
  // Dreizeilen
  line1?: string;
  line2?: string;
  line3?: string;
  // Zitat
  quote?: string;
  name?: string;
  // Info
  header?: string;
  subheader?: string;
  body?: string;
  // Veranstaltung
  eventTitle?: string;
  weekday?: string;
  date?: string;
  time?: string;
  locationName?: string;
  address?: string;
  beschreibung?: string;
  // Simple
  headline?: string;
  subtext?: string;
  // KI types
  prompt?: string;
  theme?: string;
}

export type SharepicType = 'dreizeilen' | 'zitat-pure' | 'info' | 'veranstaltung' | 'simple' | 'pure-create' | 'ki-sharepic';

export interface SelectedImage {
  filename: string;
  path: string;
  alt_text: string;
  category?: string;
}

export interface SharepicFromPromptResult {
  success: boolean;
  type: SharepicType;
  data: SharepicGeneratedData;
  selectedImage?: SelectedImage | null;
  isKiType?: boolean;
  error?: string;
  message?: string;
}

/**
 * Generate sharepic content from a natural language prompt.
 * Uses the dedicated prompt route for direct classification and generation.
 */
export async function generateSharepicFromPrompt(prompt: string): Promise<SharepicFromPromptResult> {
  try {
    const response = await apiClient.post('/sharepic/generate-from-prompt', {
      prompt
    });

    const responseData = response.data;

    if (!responseData.success) {
      return {
        success: false,
        type: 'dreizeilen',
        data: {},
        error: responseData.error || 'Unbekannter Fehler'
      };
    }

    // Handle KI types (need to redirect to KI flow)
    if (responseData.isKiType) {
      return {
        success: true,
        type: responseData.type as SharepicType,
        data: responseData.data || {},
        isKiType: true,
        message: responseData.message
      };
    }

    // Template types - data is already in the right format
    return {
      success: true,
      type: responseData.type as SharepicType,
      data: responseData.data || {},
      selectedImage: responseData.selectedImage || null,
      isKiType: false
    };

  } catch (error: any) {
    console.error('[SharepicPromptService] Error generating sharepic from prompt:', error);

    return {
      success: false,
      type: 'dreizeilen',
      data: {},
      error: error.response?.data?.error || error.message || 'Ein Fehler ist aufgetreten'
    };
  }
}
