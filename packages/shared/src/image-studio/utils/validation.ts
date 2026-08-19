/**
 * Image Studio Validation Utils
 * Platform-agnostic form validation for image-studio
 */

import { getTypeConfig, getInputFields } from '../constants.js';

import type {
  ImageStudioTemplateType,
  InputFieldConfig,
  ImageStudioFormData,
  FormFieldValue,
  DreizeilenResponse,
  QuoteResponse,
  InfoResponse,
  VeranstaltungResponse,
  SimpleResponse,
  SliderResponse,
  TextGenerationResponse,
} from '../types.js';

/** Typed canvas response from the API */
interface CanvasApiResponse {
  image?: string;
}

// ============================================================================
// ERROR MESSAGES (German)
// ============================================================================

export const ERROR_MESSAGES = {
  UNKNOWN_TYPE: 'Unbekannter Bildtyp',
  IMAGE_REQUIRED: 'Bitte lade zuerst ein Bild hoch',
  QUOTE_REQUIRED: 'Bitte gib ein Zitat ein',
  NAME_REQUIRED: 'Bitte gib den Namen der zitierten Person ein',
  HEADER_REQUIRED: 'Bitte gib einen Header ein',
  BODY_REQUIRED: 'Bitte gib einen Body-Text ein',
  EVENT_TITLE_REQUIRED: 'Bitte gib einen Event-Titel ein',
  EVENT_DATE_REQUIRED: 'Bitte gib Wochentag, Datum und Uhrzeit ein',
  EVENT_LOCATION_REQUIRED: 'Bitte gib Veranstaltungsort und Adresse ein',
  DESCRIPTION_REQUIRED: 'Bitte gib eine Beschreibung ein',
  FIELD_REQUIRED: (label: string) => `${label} ist erforderlich`,
  FIELD_TOO_SHORT: (label: string, minLength: number) =>
    `${label} muss mindestens ${minLength} Zeichen haben`,
  FIELD_TOO_LONG: (label: string, maxLength: number) =>
    `${label} darf maximal ${maxLength} Zeichen haben`,
  UNEXPECTED_RESPONSE: 'Unerwartete Antwortstruktur von der API',
  NO_IMAGE_DATA: 'Keine Bilddaten empfangen',
  NO_CANVAS_ENDPOINT: 'Kein Canvas-Endpoint für diesen Typ konfiguriert',
  GENERATION_ERROR: 'Ein Fehler ist aufgetreten',
};

// ============================================================================
// VALIDATION RESULT
// ============================================================================

export interface ImageStudioValidationResult {
  valid: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

// ============================================================================
// FIELD VALIDATION
// ============================================================================

/**
 * Validate a single field value
 */
export function validateField(
  field: InputFieldConfig,
  value: FormFieldValue | undefined
): string | null {
  const stringValue = value?.toString().trim() || '';

  // Required check
  if (field.required && !stringValue) {
    return ERROR_MESSAGES.FIELD_REQUIRED(field.label);
  }

  // Skip other checks if empty and not required
  if (!stringValue) {
    return null;
  }

  // Min length check
  if (field.minLength && stringValue.length < field.minLength) {
    return ERROR_MESSAGES.FIELD_TOO_SHORT(field.label, field.minLength);
  }

  // Max length check
  if (field.maxLength && stringValue.length > field.maxLength) {
    return ERROR_MESSAGES.FIELD_TOO_LONG(field.label, field.maxLength);
  }

  return null;
}

/**
 * Validate all input fields for a type
 */
export function validateInputFields(
  type: ImageStudioTemplateType,
  formData: ImageStudioFormData
): ImageStudioValidationResult {
  const inputFields = getInputFields(type);
  const fieldErrors: Record<string, string> = {};

  for (const field of inputFields) {
    const error = validateField(field, formData[field.name]);
    if (error) {
      fieldErrors[field.name] = error;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      valid: false,
      error: Object.values(fieldErrors)[0], // Return first error as main error
      fieldErrors,
    };
  }

  return { valid: true };
}

// ============================================================================
// TYPE-SPECIFIC VALIDATION
// ============================================================================

/**
 * Validate form data for text generation
 */
export function validateTextGenerationInput(
  type: ImageStudioTemplateType,
  formData: ImageStudioFormData
): ImageStudioValidationResult {
  const config = getTypeConfig(type);

  if (!config) {
    return { valid: false, error: ERROR_MESSAGES.UNKNOWN_TYPE };
  }

  // Validate input fields
  return validateInputFields(type, formData);
}

/**
 * Validate form data for canvas generation
 */
export function validateCanvasInput(
  type: ImageStudioTemplateType,
  formData: ImageStudioFormData,
  hasImage: boolean
): ImageStudioValidationResult {
  const config = getTypeConfig(type);

  if (!config) {
    return { valid: false, error: ERROR_MESSAGES.UNKNOWN_TYPE };
  }

  // Check image requirement
  if (config.requiresImage && !hasImage) {
    return { valid: false, error: ERROR_MESSAGES.IMAGE_REQUIRED };
  }

  // Type-specific validation
  switch (type) {
    case 'dreizeilen':
      if (!formData.line1 && !formData.line2 && !formData.line3) {
        return { valid: false, error: 'Bitte gib mindestens eine Textzeile ein' };
      }
      break;

    case 'zitat':
    case 'zitat-pure':
      if (!formData.quote) {
        return { valid: false, error: ERROR_MESSAGES.QUOTE_REQUIRED };
      }
      if (!formData.name) {
        return { valid: false, error: ERROR_MESSAGES.NAME_REQUIRED };
      }
      break;

    case 'info':
      if (!formData.header) {
        return { valid: false, error: ERROR_MESSAGES.HEADER_REQUIRED };
      }
      if (!formData.body) {
        return { valid: false, error: ERROR_MESSAGES.BODY_REQUIRED };
      }
      break;

    case 'veranstaltung':
      if (!formData.eventTitle) {
        return { valid: false, error: ERROR_MESSAGES.EVENT_TITLE_REQUIRED };
      }
      if (!formData.weekday || !formData.date || !formData.time) {
        return { valid: false, error: ERROR_MESSAGES.EVENT_DATE_REQUIRED };
      }
      if (!formData.locationName || !formData.address) {
        return { valid: false, error: ERROR_MESSAGES.EVENT_LOCATION_REQUIRED };
      }
      break;

    case 'profilbild':
    case 'simple':
    case 'slider':
      break;
  }

  return { valid: true };
}

/**
 * Validate complete form data before generation
 */
export function validateFormData(
  type: ImageStudioTemplateType,
  formData: ImageStudioFormData,
  hasImage: boolean = false
): ImageStudioValidationResult {
  const config = getTypeConfig(type);

  if (!config) {
    return { valid: false, error: ERROR_MESSAGES.UNKNOWN_TYPE };
  }

  // For text generation types, validate input first
  if (config.hasTextGeneration) {
    const inputValidation = validateTextGenerationInput(type, formData);
    if (!inputValidation.valid) {
      return inputValidation;
    }
  }

  // Then validate canvas input
  return validateCanvasInput(type, formData, hasImage);
}

// ============================================================================
// RESPONSE VALIDATION
// ============================================================================

/**
 * Prüft, ob das Modell die tragenden Felder leer gelassen hat.
 *
 * Die STRUKTUR prüft diese Funktion nicht mehr — dafür gibt es den ts-rest-
 * Vertrag. Vorher stand hier eine zweite, handgeschriebene Beschreibung der
 * Antwortform, und sie war falsch: der Info-Zweig las `r.header` auf oberster
 * Ebene, wo der Draht `mainInfo.header` sendet. Ergebnis war „Unerwartete
 * Antwortstruktur von der API" bei jeder einzelnen Info-Generierung.
 */
export function validateTextResponse(
  type: ImageStudioTemplateType,
  response: TextGenerationResponse
): ImageStudioValidationResult {
  const empty = { valid: false, error: ERROR_MESSAGES.UNEXPECTED_RESPONSE };

  switch (type) {
    case 'dreizeilen': {
      const r = response as DreizeilenResponse;
      return r.mainSlogan.line1 ? { valid: true } : empty;
    }

    case 'zitat':
    case 'zitat-pure': {
      const r = response as QuoteResponse;
      return r.quote ? { valid: true } : empty;
    }

    case 'info': {
      const r = response as InfoResponse;
      return r.mainInfo.header && r.mainInfo.body ? { valid: true } : empty;
    }

    case 'veranstaltung': {
      const r = response as VeranstaltungResponse;
      return r.mainEvent.eventTitle ? { valid: true } : empty;
    }

    case 'simple': {
      const r = response as SimpleResponse;
      return r.mainSimple.headline ? { valid: true } : empty;
    }

    case 'slider': {
      const r = response as SliderResponse;
      return r.mainSlider.headline ? { valid: true } : empty;
    }

    case 'profilbild':
      return { valid: true };
  }
}

/**
 * Validate canvas generation response
 */
export function validateCanvasResponse(response: CanvasApiResponse): ImageStudioValidationResult {
  if (!response.image) {
    return { valid: false, error: ERROR_MESSAGES.NO_IMAGE_DATA };
  }
  return { valid: true };
}
