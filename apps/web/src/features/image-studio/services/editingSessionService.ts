import { type CanvasTemplateType } from '@gruenerator/contracts';

import apiClient from '../../../components/utils/apiClient';
import { isMintableCanvasType } from '../utils/canvasTypeFields';
import {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  FORM_STEPS,
  isImageStudioType,
  type ImageStudioType,
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
  /**
   * Canvas-editor output format id (see packages/canvas-editor/src/formats/index.ts).
   * Optional for backward-compatibility with rows persisted before multi-format.
   * Loader fallbacks default missing values to 'post-portrait' (the legacy sharepic).
   */
  formatId?: string;
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

const LEGACY_TYPE_MAP: Record<string, ImageStudioType> = {
  Dreizeilen: IMAGE_STUDIO_TYPES.DREIZEILEN,
  Zitat: IMAGE_STUDIO_TYPES.ZITAT,
  Zitat_Pure: IMAGE_STUDIO_TYPES.ZITAT_PURE,
  Info: IMAGE_STUDIO_TYPES.INFO,
};

const EDIT_SESSION_TYPE_MAP: Record<string, ImageStudioType> = {
  dreizeilen: IMAGE_STUDIO_TYPES.DREIZEILEN,
  default: IMAGE_STUDIO_TYPES.DREIZEILEN,
  zitat: IMAGE_STUDIO_TYPES.ZITAT,
  'zitat-pure': IMAGE_STUDIO_TYPES.ZITAT_PURE,
  info: IMAGE_STUDIO_TYPES.INFO,
};

/**
 * Resolve a stored/legacy sharepic type string to a known ImageStudioType, or
 * null when it can't be resolved. Prevents an unknown string from being written
 * to `state.type` and later crashing the canvas mint.
 */
function resolveStudioType(raw: string | null): ImageStudioType | null {
  if (!raw) return null;
  const mapped = LEGACY_TYPE_MAP[raw] ?? raw;
  return isImageStudioType(mapped) ? mapped : null;
}

export function parseSharepicForEditing(
  sharepicData: OriginalSharepicData,
  source = 'presseSocial'
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    editingSource: source,
    originalSharepicData: sharepicData,
    generatedImageSrc: sharepicData.image || null,
    currentStep: FORM_STEPS.RESULT,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
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
      result.type =
        sharepicData.type === 'quote_pure'
          ? IMAGE_STUDIO_TYPES.ZITAT_PURE
          : IMAGE_STUDIO_TYPES.ZITAT;
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

export async function loadGalleryEditData(
  editData: GalleryEditData
): Promise<Record<string, unknown>> {
  const { shareToken, content, styling, originalImageUrl, title, formatId } = editData;
  const sharepicType = content?.sharepicType || styling?.sharepicType;
  const mappedType = resolveStudioType(sharepicType ?? null);

  const formData: Record<string, unknown> = {
    galleryEditMode: true,
    editShareToken: shareToken,
    editTitle: title,
    isEditSession: true,
    hasOriginalImage: !!originalImageUrl,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    type: mappedType,
    // Multi-format: legacy gallery rows lack formatId — fall back to the
    // default sharepic dimensions so existing saves still load correctly.
    selectedFormatId: formatId ?? 'post-portrait',
    // Open the canvas editor only for a MINTABLE type. A non-mintable or
    // unresolved type must NOT jump to CANVAS_EDIT (that would crash the mint) —
    // fall back to TYPE_SELECT so the user can pick.
    currentStep:
      mappedType && isMintableCanvasType(mappedType)
        ? FORM_STEPS.CANVAS_EDIT
        : FORM_STEPS.TYPE_SELECT,
    editingSource: 'gallery',
  };

  if (styling) {
    if (styling.fontSize) formData.fontSize = styling.fontSize;
    if (styling.colorScheme) formData.colorScheme = styling.colorScheme;
    if (styling.balkenOffset) formData.balkenOffset = styling.balkenOffset;
    if (styling.balkenGruppenOffset) formData.balkenGruppenOffset = styling.balkenGruppenOffset;
    if (styling.sunflowerOffset) formData.sunflowerOffset = styling.sunflowerOffset;
    if (styling.credit) formData.credit = styling.credit;
    if (styling.veranstaltungFieldFontSizes)
      formData.veranstaltungFieldFontSizes = styling.veranstaltungFieldFontSizes;
  }

  if (content) {
    // Normalize sharepicType to lowercase for comparison (handles both legacy and modern formats)
    const normalizedType = sharepicType?.toLowerCase().replace('_', '-');

    // Handle backwards compatibility: old saves wrapped content in canvasState
    const canvasState = content.canvasState as Record<string, unknown> | undefined;
    const effectiveContent = canvasState || content;

    if (normalizedType === 'info') {
      formData.header = effectiveContent.header || '';
      formData.subheader = effectiveContent.subheader || '';
      formData.body = effectiveContent.body || '';
    } else if (normalizedType === 'zitat' || normalizedType === 'zitat-pure') {
      formData.quote = effectiveContent.quote || '';
      formData.name = effectiveContent.name || '';
    } else {
      formData.line1 = effectiveContent.line1 || '';
      formData.line2 = effectiveContent.line2 || '';
      formData.line3 = effectiveContent.line3 || '';
      if (effectiveContent.line4) formData.line4 = effectiveContent.line4;
      if (effectiveContent.line5) formData.line5 = effectiveContent.line5;
    }
  }

  if (originalImageUrl) {
    try {
      const urlPath = originalImageUrl.startsWith('/api')
        ? originalImageUrl.slice(4)
        : originalImageUrl;
      const response = await apiClient.get(urlPath, { responseType: 'blob' });
      formData.uploadedImage = response.data;
      formData.file = response.data;
    } catch (error) {
      // 404 just means the original was never stored or has been cleaned up —
      // expected for shares saved without a background image. The backend
      // self-heals stale metadata on the next request, so this won't repeat.
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 404) {
        console.warn('[loadGalleryEditData] Failed to fetch original image:', error);
      }
    }
  }

  // If type is 'zitat' and no image was loaded, fall back to 'zitat-pure'
  if (formData.type === IMAGE_STUDIO_TYPES.ZITAT && !formData.uploadedImage) {
    formData.type = IMAGE_STUDIO_TYPES.ZITAT_PURE;
  }

  return formData;
}

export async function loadEditSessionData(
  editSessionId: string
): Promise<Record<string, unknown> | null> {
  try {
    const sessionDataStr = sessionStorage.getItem(editSessionId);
    if (!sessionDataStr) {
      console.warn('[EditingSessionService] No session data found for:', editSessionId);
      return null;
    }

    const sessionData = JSON.parse(sessionDataStr) as EditSessionData;
    const { data, source } = sessionData;

    if (!data) {
      console.warn('[EditingSessionService] Invalid session data structure');
      return null;
    }

    const mappedType = data.type
      ? EDIT_SESSION_TYPE_MAP[data.type] || IMAGE_STUDIO_TYPES.DREIZEILEN
      : IMAGE_STUDIO_TYPES.DREIZEILEN;

    const formData: Record<string, unknown> = {
      category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
      type: mappedType,
      currentStep: FORM_STEPS.INPUT,
      editingSource: source || 'external',
      isEditSession: true,
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
        const response = await apiClient.get<{ imageData?: string; hasOriginalImage?: boolean }>(
          `/sharepic/edit-session/${data.imageSessionId}`
        );
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

export interface AISelectedImage {
  filename: string;
  path: string;
  alt_text: string;
  category?: string;
}

export function parseAIGeneratedData(
  sharepicType: string,
  generatedData: Record<string, string>,
  selectedImage?: AISelectedImage | null
): Record<string, unknown> {
  // Legacy ids from older payloads/sessions → canonical CanvasTemplateType.
  // Values are compile-checked against the canonical enum; canonical ids need
  // no entry (isImageStudioType covers every CanvasTemplateType by the
  // alignment assertion in typeConfig/constants).
  const LEGACY_TYPE_ALIASES: Record<string, CanvasTemplateType> = {
    zitat_pure: 'zitat-pure',
  };

  // Resolve to a known type; only advance to CANVAS_EDIT for a MINTABLE type so
  // a non-mintable/unrecognized type can't crash the canvas mint.
  const candidate = LEGACY_TYPE_ALIASES[sharepicType] ?? sharepicType;
  const mappedType: ImageStudioType | null = isImageStudioType(candidate) ? candidate : null;

  const formData: Record<string, unknown> = {
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    type: mappedType,
    currentStep:
      mappedType && isMintableCanvasType(mappedType)
        ? FORM_STEPS.CANVAS_EDIT
        : FORM_STEPS.TYPE_SELECT,
    aiGeneratedContent: true,
    editingSource: 'aiPrompt',
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
  } else if (mappedType === IMAGE_STUDIO_TYPES.VERANSTALTUNG) {
    formData.eventTitle = generatedData.eventTitle || '';
    formData.weekday = generatedData.weekday || '';
    formData.date = generatedData.date || '';
    formData.time = generatedData.time || '';
    formData.locationName = generatedData.locationName || '';
    formData.address = generatedData.address || '';
    formData.beschreibung = generatedData.beschreibung || '';
  } else if (mappedType === IMAGE_STUDIO_TYPES.SIMPLE) {
    formData.headline = generatedData.headline || '';
    formData.subtext = generatedData.subtext || '';
  }

  // Add selected image if provided
  if (selectedImage?.path) {
    // Use same baseURL pattern as apiClient for consistent URL resolution
    const apiBaseUrl =
      (import.meta as unknown as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL ||
      '/api';
    const fullImagePath = `${apiBaseUrl}${selectedImage.path}`;
    formData.uploadedImage = fullImagePath;
    formData.credit = selectedImage.alt_text || '';
  }

  return formData;
}
