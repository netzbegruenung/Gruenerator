/**
 * Text sanitization utilities for custom generators
 * Consolidates sanitization logic that was duplicated across multiple files
 */

/**
 * Sanitizes text for URL-friendly slugs (using hyphens)
 * Used for generator slug generation
 *
 * Replaces the inline logic from CreateCustomGeneratorPage.tsx (lines 98-107):
 * - Converts to lowercase
 * - Replaces spaces with hyphens
 * - Removes all non-alphanumeric characters except hyphens
 *
 * @param text - The text to sanitize
 * @returns URL-friendly slug with hyphens
 *
 * @example
 * sanitizeSlug('My Custom Generator') // returns 'my-custom-generator'
 * sanitizeSlug('Test & Example!') // returns 'test-example'
 */
export const sanitizeSlug = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '');    // Remove non-alphanumeric except hyphens
};

/**
 * Sanitizes text for form field names (using underscores)
 * Used for generating technical field names from labels
 *
 * Replaces the generateSanitizedName function from FieldEditorAssistant.tsx (lines 28-33):
 * - Converts to lowercase
 * - Replaces spaces with underscores
 * - Removes all non-alphanumeric characters except underscores
 *
 * @param text - The text to sanitize
 * @returns Field name with underscores
 *
 * @example
 * sanitizeFieldName('Email Address') // returns 'email_address'
 * sanitizeFieldName('User\'s Name') // returns 'users_name'
 */
export const sanitizeFieldName = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/\s+/g, '_')           // Replace spaces with underscores
    .replace(/[^a-z0-9_]/g, '');    // Remove non-alphanumeric except underscores
};

/**
 * Sanitizes text for select option values (using underscores)
 * Follows the same pattern as field names for consistency
 *
 * @param text - The text to sanitize
 * @returns Option value with underscores
 *
 * @example
 * sanitizeOptionValue('Option One') // returns 'option_one'
 * sanitizeOptionValue('Yes & No') // returns 'yes_no'
 */
export const sanitizeOptionValue = (text: string): string => {
  return sanitizeFieldName(text); // Same logic as field names
};
