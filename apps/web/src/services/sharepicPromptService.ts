import apiClient from '../components/utils/apiClient';

interface SharepicGeneratedData {
  line1?: string;
  line2?: string;
  line3?: string;
  quote?: string;
  name?: string;
  header?: string;
  subheader?: string;
  body?: string;
}

export interface SharepicFromPromptResult {
  success: boolean;
  type: 'dreizeilen' | 'zitat-pure' | 'info';
  data: SharepicGeneratedData;
  error?: string;
}

/**
 * Generate sharepic content from a natural language prompt.
 * Uses the chat API to classify intent and generate text.
 */
export async function generateSharepicFromPrompt(prompt: string): Promise<SharepicFromPromptResult> {
  try {
    const response = await apiClient.post('/chat', {
      message: prompt,
      context: {},
      attachments: [],
      usePrivacyMode: false
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

    const agent = responseData.agent;
    const content = responseData.content;

    // Map backend agent to frontend type
    if (agent === 'dreizeilen' || agent === 'sharepic_auto') {
      const sharepic = content?.sharepic || {};
      const mainSlogan = sharepic.mainSlogan || {};

      return {
        success: true,
        type: 'dreizeilen',
        data: {
          line1: mainSlogan.line1 || sharepic.line1 || '',
          line2: mainSlogan.line2 || sharepic.line2 || '',
          line3: mainSlogan.line3 || sharepic.line3 || ''
        }
      };
    }

    if (agent === 'zitat' || agent === 'zitat_pure' || agent === 'quote') {
      const sharepic = content?.sharepic || {};

      return {
        success: true,
        type: 'zitat-pure',
        data: {
          quote: sharepic.quote || content?.quote || '',
          name: sharepic.name || content?.name || ''
        }
      };
    }

    if (agent === 'info') {
      const sharepic = content?.sharepic || {};
      const mainInfo = sharepic.mainInfo || {};

      return {
        success: true,
        type: 'info',
        data: {
          header: mainInfo.header || sharepic.header || '',
          subheader: mainInfo.subheader || sharepic.subheader || '',
          body: mainInfo.body || sharepic.body || ''
        }
      };
    }

    // If the response is not a recognized sharepic type, try to parse text response
    if (content?.text) {
      // Default to dreizeilen for unrecognized types
      const lines = content.text.split('\n').filter((l: string) => l.trim()).slice(0, 3);

      return {
        success: true,
        type: 'dreizeilen',
        data: {
          line1: lines[0] || '',
          line2: lines[1] || '',
          line3: lines[2] || ''
        }
      };
    }

    return {
      success: false,
      type: 'dreizeilen',
      data: {},
      error: 'Konnte den Sharepic-Typ nicht erkennen. Bitte versuche es mit einer spezifischeren Beschreibung.'
    };

  } catch (error: any) {
    console.error('[ImageStudioService] Error generating sharepic from prompt:', error);

    return {
      success: false,
      type: 'dreizeilen',
      data: {},
      error: error.response?.data?.error || error.message || 'Ein Fehler ist aufgetreten'
    };
  }
}
