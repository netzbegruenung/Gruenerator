/**
 * Validation Utilities
 * Form validation functions for text generators.
 */

import type {
  PresseSocialRequest,
  AntragRequest,
  UniversalRequest,
  AltTextRequest,
  LeichteSpracheRequest,
  TextImproverRequest,
  ValidationResult,
} from '../types';
import { VALIDATION_MESSAGES } from '../constants';

/**
 * Validates a PresseSocial generator request.
 *
 * Required:
 * - inhalt: Non-empty content
 * - platforms: At least one platform selected
 *
 * @param data - Partial PresseSocialRequest to validate
 * @returns ValidationResult with errors object
 */
export function validatePresseSocialRequest(
  data: Partial<PresseSocialRequest>
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.inhalt?.trim()) {
    errors.inhalt = VALIDATION_MESSAGES.INHALT_REQUIRED;
  }

  if (!data.platforms || data.platforms.length === 0) {
    errors.platforms = VALIDATION_MESSAGES.PLATFORM_REQUIRED;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates an Antrag generator request.
 *
 * Required:
 * - inhalt: Non-empty content
 * - requestType: Must be specified
 *
 * @param data - Partial AntragRequest to validate
 * @returns ValidationResult with errors object
 */
export function validateAntragRequest(
  data: Partial<AntragRequest>
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.inhalt?.trim()) {
    errors.inhalt = VALIDATION_MESSAGES.THEMA_REQUIRED;
  }

  if (!data.requestType) {
    errors.requestType = VALIDATION_MESSAGES.REQUEST_TYPE_REQUIRED;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates a Universal generator request.
 *
 * Required:
 * - inhalt: Non-empty content
 *
 * Additional validation based on textType could be added here.
 *
 * @param data - Partial UniversalRequest to validate
 * @returns ValidationResult with errors object
 */
export function validateUniversalRequest(
  data: Partial<UniversalRequest>
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.inhalt?.trim()) {
    errors.inhalt = VALIDATION_MESSAGES.INHALT_REQUIRED;
  }

  // Type-specific validation
  if (data.textType === 'rede' && data.redezeit !== undefined) {
    if (data.redezeit < 1 || data.redezeit > 5) {
      errors.redezeit = 'Redezeit muss zwischen 1 und 5 Minuten liegen';
    }
  }

  if (data.textType === 'wahlprogramm' && data.zeichenanzahl !== undefined) {
    if (data.zeichenanzahl < 1000 || data.zeichenanzahl > 3500) {
      errors.zeichenanzahl = 'Zeichenanzahl muss zwischen 1000 und 3500 liegen';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates an Alt-Text generator request.
 *
 * Required:
 * - imageBase64: Non-empty base64 image data
 *
 * @param data - Partial AltTextRequest to validate
 * @returns ValidationResult with errors object
 */
export function validateAltTextRequest(
  data: Partial<AltTextRequest>
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.imageBase64?.trim()) {
    errors.imageBase64 = VALIDATION_MESSAGES.IMAGE_REQUIRED;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates a Leichte Sprache generator request.
 *
 * Required:
 * - originalText: Non-empty text to simplify
 *
 * @param data - Partial LeichteSpracheRequest to validate
 * @returns ValidationResult with errors object
 */
export function validateLeichteSpracheRequest(
  data: Partial<LeichteSpracheRequest>
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.originalText?.trim()) {
    errors.originalText = VALIDATION_MESSAGES.TEXT_REQUIRED;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates a Text Improver generator request.
 *
 * Required:
 * - originalText: Non-empty text to improve
 * - action: A valid text improvement action
 *
 * @param data - Partial TextImproverRequest to validate
 * @returns ValidationResult with errors object
 */
export function validateTextImproverRequest(
  data: Partial<TextImproverRequest>
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!data.originalText?.trim()) {
    errors.originalText = VALIDATION_MESSAGES.TEXT_REQUIRED;
  }

  if (!data.action) {
    errors.action = VALIDATION_MESSAGES.ACTION_REQUIRED;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Generic validation helper to check if a string is non-empty.
 *
 * @param value - String value to check
 * @returns true if string is non-empty after trimming
 */
export function isNonEmpty(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Gets the first validation error message from a ValidationResult.
 * Useful for displaying a single error to the user.
 *
 * @param result - ValidationResult object
 * @returns First error message or null if valid
 */
export function getFirstError(result: ValidationResult): string | null {
  if (result.valid) return null;
  const firstKey = Object.keys(result.errors)[0];
  return firstKey ? result.errors[firstKey] : null;
}
