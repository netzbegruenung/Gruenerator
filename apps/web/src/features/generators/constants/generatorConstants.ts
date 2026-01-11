/**
 * Shared constants for custom generators feature
 * Consolidates magic numbers and repeated constants
 */

import { GeneratorFormData } from '../types/generatorTypes';

/**
 * Step definitions for the generator creation wizard
 * Re-exported from steps.js for TypeScript convenience
 */
export const STEPS = {
  BASICS: 1,
  FIELDS: 2,
  PROMPT: 3,
  REVIEW: 4
} as const;

/**
 * Mode selection step (before the wizard starts)
 * Extracted from CreateCustomGeneratorPage.tsx (line 58)
 */
export const MODE_SELECTION = -1;

/**
 * Initial form data for creating a new generator
 * Extracted from CreateCustomGeneratorPage.tsx (lines 61-69)
 */
export const INITIAL_GENERATOR_FORM_DATA: GeneratorFormData = {
  name: '',
  slug: '',
  fields: [],
  prompt: '',
  title: '',
  description: '',
  contact_email: ''
};

/**
 * Field editor constraints
 */
export const MAX_FIELDS_PER_GENERATOR = 5;

/**
 * Minimum slug length requirement
 */
export const MIN_SLUG_LENGTH = 3;

/**
 * Debounce delay for slug availability checking (in milliseconds)
 * Extracted from CreateCustomGeneratorPage.tsx (line 59)
 */
export const SLUG_CHECK_DEBOUNCE_MS = 750;

/**
 * Display names for field types (for UI)
 */
export const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Kurzer Text',
  textarea: 'Langer Text',
  select: 'Auswahlfeld'
};
