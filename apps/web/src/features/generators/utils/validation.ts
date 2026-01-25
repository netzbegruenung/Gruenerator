/**
 * Validation utilities and rules for custom generators
 * Consolidates validation logic scattered across CreateCustomGeneratorPage and FieldEditorAssistant
 */

import { GeneratorFormField } from '../types/generatorTypes';

/**
 * Centralized validation rule definitions for generator fields
 * Extracted from FieldEditorAssistant.tsx (lines 145-160) and CreateCustomGeneratorPage
 */
export const GENERATOR_VALIDATION_RULES = {
  // Basic info validations
  name: {
    required: 'Der Name des Grünerators darf nicht leer sein.',
  },
  slug: {
    required: 'Der URL-Pfad darf nicht leer sein.',
    pattern: {
      value: /^[a-z0-9-]+$/,
      message: 'Der URL-Pfad darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten.',
    },
    minLength: {
      value: 3,
      message: 'Der URL-Pfad muss mindestens 3 Zeichen lang sein.',
    },
  },
  title: {
    required: 'Der Titel darf nicht leer sein.',
  },
  description: {
    required: 'Die Beschreibung darf nicht leer sein.',
  },
  prompt: {
    required: 'Die Prompt-Vorlage darf nicht leer sein.',
  },

  // Field editor validations (from FieldEditorAssistant.tsx)
  fieldLabel: {
    required: 'Das Label darf nicht leer sein.',
    minLength: { value: 1, message: 'Label muss mindestens 1 Zeichen lang sein.' },
  },
  fieldName: {
    required: 'Technischer Name konnte nicht generiert werden.',
  },
};

/**
 * Validates field name uniqueness
 * Extracted from FieldEditorAssistant.tsx (lines 152-158)
 *
 * @param value - The field name to validate
 * @param existingNames - Array of existing field names
 * @param currentFieldName - The current field's name (for editing mode, to exclude self)
 * @returns Validation error message or true if valid
 */
export const validateFieldNameUniqueness = (
  value: string,
  existingNames: string[],
  currentFieldName?: string
): string | boolean => {
  const otherNames = currentFieldName
    ? existingNames.filter((n) => n !== currentFieldName)
    : existingNames;

  return (
    !otherNames.includes(value) ||
    `Der technische Name '${value}' wird bereits von einem anderen Feld verwendet.`
  );
};

/**
 * Auto-suggests field type based on label keywords
 * Extracted from FieldEditorAssistant.tsx (lines 111-117)
 *
 * Keywords that trigger 'textarea':
 * - beschreibung, text, inhalt, prompt, abschnitt
 *
 * @param label - The field label
 * @returns Suggested field type ('textarea' or 'text')
 *
 * @example
 * suggestFieldType('Beschreibung') // returns 'textarea'
 * suggestFieldType('Email') // returns 'text'
 */
export const suggestFieldType = (label: string): 'text' | 'textarea' => {
  const lowerLabel = label.toLowerCase();
  const textareaKeywords = ['beschreibung', 'text', 'inhalt', 'prompt', 'abschnitt'];

  return textareaKeywords.some((keyword) => lowerLabel.includes(keyword)) ? 'textarea' : 'text';
};

/**
 * Auto-suggests if field should be required based on label keywords
 * Extracted from FieldEditorAssistant.tsx (lines 120-124)
 *
 * Keywords that trigger required status:
 * - email, name, titel
 *
 * @param label - The field label
 * @returns Whether the field should be required
 *
 * @example
 * suggestRequiredStatus('Email Address') // returns true
 * suggestRequiredStatus('Optional Note') // returns false
 */
export const suggestRequiredStatus = (label: string): boolean => {
  const lowerLabel = label.toLowerCase();
  const requiredKeywords = ['email', 'name', 'titel'];

  return requiredKeywords.some((keyword) => lowerLabel.includes(keyword));
};

/**
 * Step validation data interface
 */
interface StepValidationData {
  slugAvailabilityError?: string | null;
  isCheckingSlug?: boolean;
  isEditingField?: boolean;
}

/**
 * Validates step-specific requirements
 * Extracted from CreateCustomGeneratorPage.tsx (lines 257-292)
 *
 * @param step - The current step number
 * @param data - Step-specific validation data
 * @returns Validation result with isValid flag and optional error message
 */
export const validateStep = (
  step: number,
  data: StepValidationData
): { isValid: boolean; error?: string } => {
  // Step constants (should match constants/steps.js)
  const STEPS = {
    BASICS: 1,
    FIELDS: 2,
    PROMPT: 3,
    REVIEW: 4,
  };

  switch (step) {
    case STEPS.BASICS:
      if (data.slugAvailabilityError) {
        return { isValid: false, error: data.slugAvailabilityError };
      }
      if (data.isCheckingSlug) {
        return { isValid: false, error: 'Die Verfügbarkeit des URL-Pfads wird noch geprüft...' };
      }
      return { isValid: true };

    case STEPS.FIELDS:
      if (data.isEditingField) {
        return {
          isValid: false,
          error: 'Bitte schließe zuerst den Feld-Editor (Speichern oder Abbrechen).',
        };
      }
      return { isValid: true };

    case STEPS.PROMPT:
    case STEPS.REVIEW:
      return { isValid: true };

    default:
      return { isValid: true };
  }
};
