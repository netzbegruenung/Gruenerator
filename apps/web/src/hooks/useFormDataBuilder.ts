import { useMemo, useCallback } from 'react';
import type { FeatureState } from './useGeneratorSetup';

/**
 * Configuration for form data builder hook
 */
export interface FormDataBuilderConfig {
  /**
   * Current feature toggle states
   */
  readonly features: FeatureState;

  /**
   * User's custom prompt (null if not set)
   */
  readonly customPrompt: string | null;

  /**
   * Selected document IDs from knowledge system
   */
  readonly selectedDocumentIds: readonly string[];

  /**
   * Selected text IDs from text library
   */
  readonly selectedTextIds: readonly string[];

  /**
   * File attachments and crawled URLs
   */
  readonly attachments?: readonly unknown[];

  /**
   * Form field names to extract for search query
   * Uses these fields to build a space-separated query string
   *
   * @example ['inhalt', 'zitatgeber', 'thema']
   */
  readonly searchQueryFields?: readonly string[];
}

/**
 * Return value from useFormDataBuilder hook
 */
export interface FormDataBuilderReturn {
  /**
   * Builds complete submission data by merging form data with
   * features, attachments, custom prompt, and selections
   *
   * Generic type T is preserved and extended with required fields
   *
   * @param formData - Raw form data from form submission
   * @returns Complete submission data ready for API
   *
   * @example
   * ```typescript
   * const data = builder.buildSubmissionData({
   *   inhalt: 'My content',
   *   platforms: ['instagram', 'twitter']
   * });
   * // data is typed with all original fields + merged fields
   * ```
   */
  buildSubmissionData: <T extends Record<string, unknown>>(
    formData: T
  ) => T & {
    customPrompt: string | null;
    selectedDocumentIds: string[];
    selectedTextIds: string[];
    attachments: unknown[];
    searchQuery: string;
  } & FeatureState;

  /**
   * Extracts search query from form data fields
   *
   * @param formData - Form data object
   * @param fields - Optional field names to extract (overrides config)
   * @returns Space-separated query string
   *
   * @example
   * ```typescript
   * const query = builder.extractSearchQuery(
   *   { inhalt: 'Hello', zitatgeber: 'John' },
   *   ['inhalt', 'zitatgeber']
   * );
   * // Returns: "Hello John"
   * ```
   */
  extractSearchQuery: (
    formData: Record<string, unknown>,
    fields?: readonly string[]
  ) => string;
}

/**
 * Consolidates form data building logic into a single hook
 *
 * This hook eliminates duplicate implementations of:
 * - Feature state merging
 * - Attachment handling
 * - Custom prompt insertion
 * - Document/text selection
 * - Search query extraction
 *
 * **Replaces this pattern:**
 * ```typescript
 * const features = getFeatureState();
 * const formDataToSubmit = {
 *   ...formData,
 *   ...features,
 *   customPrompt,
 *   selectedDocumentIds: selectedDocumentIds || [],
 *   selectedTextIds: selectedTextIds || [],
 *   attachments: allAttachments,
 *   searchQuery: extractQueryFromFormData(formData)
 * };
 * ```
 *
 * **With this:**
 * ```typescript
 * const data = builder.buildSubmissionData(formData);
 * ```
 *
 * @param config - Form data builder configuration
 * @returns Builder functions for form data composition
 *
 * @example
 * ```typescript
 * const setup = useGeneratorSetup({ ... });
 * const builder = useFormDataBuilder({
 *   ...setup,
 *   attachments: myAttachments,
 *   searchQueryFields: ['inhalt', 'thema']
 * });
 *
 * const onSubmit = async (formData: MyFormData) => {
 *   const submissionData = builder.buildSubmissionData(formData);
 *   await apiClient.post('/endpoint', submissionData);
 * };
 * ```
 */
export function useFormDataBuilder(
  config: FormDataBuilderConfig
): FormDataBuilderReturn {
  // Memoize attachments array to prevent unnecessary re-renders
  const attachments = useMemo(
    () => (config.attachments ? [...config.attachments] : []),
    [config.attachments]
  );

  /**
   * Extracts search query from specified fields
   * Type-safe with unknown value handling
   */
  const extractSearchQuery = useCallback(
    (
      formData: Record<string, unknown>,
      fields?: readonly string[]
    ): string => {
      const fieldsToExtract = fields || config.searchQueryFields || [];

      const queryParts: string[] = [];

      for (const fieldName of fieldsToExtract) {
        const value = formData[fieldName];

        // Type-safe value extraction
        if (value !== null && value !== undefined) {
          const stringValue = String(value).trim();
          if (stringValue) {
            queryParts.push(stringValue);
          }
        }
      }

      return queryParts.join(' ');
    },
    [config.searchQueryFields]
  );

  /**
   * Builds complete submission data with type preservation
   * Generic T ensures all original form fields are preserved
   */
  const buildSubmissionData = useCallback(
    <T extends Record<string, unknown>>(formData: T) => {
      // Extract search query before building final data
      const searchQuery = extractSearchQuery(formData);

      // Build submission data with all required fields
      // Type intersection preserves original formData type T
      return {
        ...formData,
        ...config.features,
        customPrompt: config.customPrompt,
        selectedDocumentIds: [...config.selectedDocumentIds],
        selectedTextIds: [...config.selectedTextIds],
        attachments,
        searchQuery,
      } as T & {
        customPrompt: string | null;
        selectedDocumentIds: string[];
        selectedTextIds: string[];
        attachments: unknown[];
        searchQuery: string;
      } & FeatureState;
    },
    [
      config.features,
      config.customPrompt,
      config.selectedDocumentIds,
      config.selectedTextIds,
      attachments,
      extractSearchQuery,
    ]
  );

  return {
    buildSubmissionData,
    extractSearchQuery,
  };
}

/**
 * Type guard to check if an object contains valid form data fields
 *
 * @param value - Value to check
 * @param requiredFields - Required field names
 * @returns True if value has all required fields
 *
 * @example
 * ```typescript
 * if (hasRequiredFields(formData, ['inhalt', 'platforms'])) {
 *   // formData is guaranteed to have these fields
 *   const data = builder.buildSubmissionData(formData);
 * }
 * ```
 */
export function hasRequiredFields<T extends Record<string, unknown>>(
  value: unknown,
  requiredFields: readonly string[]
): value is T {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return requiredFields.every((field) => field in value);
}
