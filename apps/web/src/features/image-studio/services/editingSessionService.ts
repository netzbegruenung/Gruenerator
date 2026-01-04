import apiClient from '../../../components/utils/apiClient';
import {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  FORM_STEPS
} from '../utils/typeConfig';

export interface GalleryEditData {
  shareToken: string;
  content?: {
    sharepicType?: string;
    header?: string;
    subheader?: string;
    body?: string;
    quote?: string;
    name?: string;
    line1?: string;
    line2?: string;
    line3?: string;
    line4?: string;
    line5?: string;
    [key: string]: unknown;
  };
  styling?: {
    sharepicType?: string;
    fontSize?: number;
    colorScheme?: Record<string, string>;
    balkenOffset?: number[];
    balkenGruppenOffset?: [number, number];
    sunflowerOffset?: [number, number];
    credit?: string;
    veranstaltungFieldFontSizes?: Record<string, number>;
    [key: string]: unknown;
  };
  originalImageUrl?: string;
  title?: string;
}

export interface EditSessionData {
  data?: {
    type?: string;
    text?: string;
    imageSessionId?: string;
    hasImage?: boolean;
    [key: string]: unknown;
  };
  source?: string;
}

export interface OriginalSharepicData {
  image?: string;
  type?: string;
  text?: string;
  [key: string]: unknown;
}

const LEGACY_TYPE_MAP: Record<string, string> = {
  'Dreizeilen': IMAGE_STUDIO_TYPES.DREIZEILEN,
  'Zitat': IMAGE_STUDIO_TYPES.ZITAT,
  'Zitat_Pure': IMAGE_STUDIO_TYPES.ZITAT_PURE,
  'Info': IMAGE_STUDIO_TYPES.INFO
};

const EDIT_SESSION_TYPE_MAP: Record<string, string> = {
  'dreizeilen': IMAGE_STUDIO_TYPES.DREIZEILEN,
  'default': IMAGE_STUDIO_TYPES.DREIZEILEN,
  'zitat': IMAGE_STUDIO_TYPES.ZITAT,
  'zitat-pure': IMAGE_STUDIO_TYPES.ZITAT_PURE,
  'info': IMAGE_STUDIO_TYPES.INFO
};

export function parseSharepicForEditing(
  sharepicData: OriginalSharepicData,
  source = 'presseSocial'
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    editingSource: source,
    originalSharepicData: sharepicData,
    generatedImageSrc: sharepicData.image || null,
    currentStep: FORM_STEPS.RESULT,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES
  };

  if (sharepicData.type === 'info') {
    const lines = (sharepicData.text || '').split('\n').filter((line: string) => line.trim());
    result.type = IMAGE_STUDIO_TYPES.INFO;
    result.header = lines[0] || '';
    result.subheader = lines[1] || '';
    result.body = lines.slice(2).join('\n') || '';
  } else if (sharepicData.type === 'quote' || sharepicData.type === 'quote_pure') {
    let quoteMatch = (sharepicData.text || '').match(/^"(.*)" - (.*)$/);

    if (!quoteMatch) {
      const lastDashIndex = (sharepicData.text || '').lastIndexOf(' - ');
      if (lastDashIndex !== -1) {
        const quote = sharepicData.text!.substring(0, lastDashIndex);
        const name = sharepicData.text!.substring(lastDashIndex + 3);
        quoteMatch = [sharepicData.text, quote, name] as RegExpMatchArray;
      }
    }

    if (quoteMatch) {
      result.type = sharepicData.type === 'quote_pure' ? IMAGE_STUDIO_TYPES.ZITAT_PURE : IMAGE_STUDIO_TYPES.ZITAT;
      result.quote = quoteMatch[1];
      result.name = quoteMatch[2];
    }
  } else if (sharepicData.type === 'dreizeilen') {
    const lines = (sharepicData.text || '').split('\n').filter((line: string) => line.trim());
    result.type = IMAGE_STUDIO_TYPES.DREIZEILEN;
    result.line1 = lines[0] || '';
    result.line2 = lines[1] || '';
    result.line3 = lines[2] || '';
  }

  return result;
}

export async function loadGalleryEditData(editData: GalleryEditData): Promise<Record<string, unknown>> {
  const { shareToken, content, styling, originalImageUrl, title } = editData;
  const sharepicType = content?.sharepicType || styling?.sharepicType;
  const mappedType = sharepicType ? (LEGACY_TYPE_MAP[sharepicType] || sharepicType) : null;

  const formData: Record<string, unknown> = {
    galleryEditMode: true,
    editShareToken: shareToken,
    editTitle: title,
    isEditSession: true,
    hasOriginalImage: true,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    type: mappedType,
    currentStep: FORM_STEPS.RESULT,
    editingSource: 'gallery'
  };

  if (styling) {
    if (styling.fontSize) formData.fontSize = styling.fontSize;
    if (styling.colorScheme) formData.colorScheme = styling.colorScheme;
    if (styling.balkenOffset) formData.balkenOffset = styling.balkenOffset;
    if (styling.balkenGruppenOffset) formData.balkenGruppenOffset = styling.balkenGruppenOffset;
    if (styling.sunflowerOffset) formData.sunflowerOffset = styling.sunflowerOffset;
    if (styling.credit) formData.credit = styling.credit;
    if (styling.veranstaltungFieldFontSizes) formData.veranstaltungFieldFontSizes = styling.veranstaltungFieldFontSizes;
  }

  if (content) {
    if (sharepicType === 'Info') {
      formData.header = content.header || '';
      formData.subheader = content.subheader || '';
      formData.body = content.body || '';
    } else if (sharepicType === 'Zitat' || sharepicType === 'Zitat_Pure') {
      formData.quote = content.quote || '';
      formData.name = content.name || '';
    } else {
      formData.line1 = content.line1 || '';
      formData.line2 = content.line2 || '';
      formData.line3 = content.line3 || '';
      if (content.line4) formData.line4 = content.line4;
      if (content.line5) formData.line5 = content.line5;
    }
  }

  if (originalImageUrl) {
    try {
      const urlPath = originalImageUrl.startsWith('/api') ? originalImageUrl.slice(4) : originalImageUrl;
      const response = await apiClient.get(urlPath, { responseType: 'blob' });
      formData.uploadedImage = response.data;
      formData.file = response.data;
    } catch (error) {
      console.warn('[EditingSessionService] Failed to fetch original image:', error);
    }
  }

  return formData;
}

export async function loadEditSessionData(editSessionId: string): Promise<Record<string, unknown> | null> {
  try {
    const sessionDataStr = sessionStorage.getItem(editSessionId);
    if (!sessionDataStr) {
      console.warn('[EditingSessionService] No session data found for:', editSessionId);
      return null;
    }

    const sessionData: EditSessionData = JSON.parse(sessionDataStr);
    const { data, source } = sessionData;

    if (!data) {
      console.warn('[EditingSessionService] Invalid session data structure');
      return null;
    }

    const mappedType = data.type
      ? (EDIT_SESSION_TYPE_MAP[data.type] || IMAGE_STUDIO_TYPES.DREIZEILEN)
      : IMAGE_STUDIO_TYPES.DREIZEILEN;

    const formData: Record<string, unknown> = {
      category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
      type: mappedType,
      currentStep: FORM_STEPS.INPUT,
      editingSource: source || 'external',
      isEditSession: true
    };

    if (data.text) {
      if (mappedType === IMAGE_STUDIO_TYPES.ZITAT || mappedType === IMAGE_STUDIO_TYPES.ZITAT_PURE) {
        formData.quote = data.text;
      } else if (mappedType === IMAGE_STUDIO_TYPES.INFO) {
        formData.body = data.text;
      } else {
        const lines = data.text.split('\n').filter((l: string) => l.trim());
        formData.line1 = lines[0] || '';
        formData.line2 = lines[1] || '';
        formData.line3 = lines[2] || '';
      }
    }

    if (data.imageSessionId && data.hasImage) {
      try {
        const response = await apiClient.get(`/sharepic/edit-session/${data.imageSessionId}`);
        const imageData = response.data;
        if (imageData.imageData) {
          const fetchRes = await fetch(imageData.imageData);
          const blob = await fetchRes.blob();
          formData.uploadedImage = blob;
          formData.file = blob;
          formData.hasOriginalImage = !!imageData.hasOriginalImage;
        }
      } catch (error) {
        console.warn('[EditingSessionService] Failed to fetch session image:', error);
      }
    }

    sessionStorage.removeItem(editSessionId);
    return formData;
  } catch (error) {
    console.error('[EditingSessionService] Error loading edit session:', error);
    return null;
  }
}

export function parseAIGeneratedData(
  sharepicType: string,
  generatedData: Record<string, string>
): Record<string, unknown> {
  const typeMap: Record<string, string> = {
    'dreizeilen': IMAGE_STUDIO_TYPES.DREIZEILEN,
    'zitat-pure': IMAGE_STUDIO_TYPES.ZITAT_PURE,
    'zitat_pure': IMAGE_STUDIO_TYPES.ZITAT_PURE,
    'info': IMAGE_STUDIO_TYPES.INFO
  };

  const mappedType = typeMap[sharepicType] || sharepicType;

  const formData: Record<string, unknown> = {
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    type: mappedType,
    currentStep: FORM_STEPS.CANVAS_EDIT,
    aiGeneratedContent: true,
    editingSource: 'aiPrompt'
  };

  if (mappedType === IMAGE_STUDIO_TYPES.DREIZEILEN) {
    formData.line1 = generatedData.line1 || '';
    formData.line2 = generatedData.line2 || '';
    formData.line3 = generatedData.line3 || '';
  } else if (mappedType === IMAGE_STUDIO_TYPES.ZITAT_PURE) {
    formData.quote = generatedData.quote || '';
    formData.name = generatedData.name || '';
  } else if (mappedType === IMAGE_STUDIO_TYPES.INFO) {
    formData.header = generatedData.header || '';
    formData.subheader = generatedData.subheader || '';
    formData.body = generatedData.body || '';
  }

  return formData;
}
