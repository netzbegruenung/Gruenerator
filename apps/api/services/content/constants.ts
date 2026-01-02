/**
 * Content Detection Service Constants
 */

/**
 * Enhanced regex for detecting URLs in text
 * Supports http and https protocols with various URL formats
 */
export const URL_REGEX =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

/**
 * Fields in request objects that may contain URLs
 */
export const URL_SCANNABLE_FIELDS = [
  'thema',
  'theme',
  'details',
  'customPrompt',
  'instructions',
  'was',
  'wie',
  'zitatgeber',
  'schwerpunkte',
  'rolle'
] as const;
