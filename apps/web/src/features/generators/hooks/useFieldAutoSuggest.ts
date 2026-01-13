/**
 * Custom hook for automatic field property suggestions based on label
 *
 * Extracted from FieldEditorAssistant.tsx (lines 104-129)
 * Auto-generates:
 * - Sanitized field name from label
 * - Field type based on keywords
 * - Required status based on keywords
 */

import { useEffect } from 'react';
import { UseFormSetValue } from 'react-hook-form';
import { suggestFieldType, suggestRequiredStatus } from '../utils/validation';
import { sanitizeFieldName } from '../utils/sanitization';

interface UseFieldAutoSuggestOptions {
  label: string;
  setValue: UseFormSetValue<Record<string, unknown>>;
  currentType?: string;
}

/**
 * Hook to auto-suggest field properties based on label
 *
 * @param options - Configuration options
 * @param options.label - The field label to analyze
 * @param options.setValue - React Hook Form setValue function
 * @param options.currentType - Current field type (to avoid overriding manual changes)
 *
 * @example
 * useFieldAutoSuggest({ label: watchedLabel, setValue, currentType: watchedType });
 */
export const useFieldAutoSuggest = ({
  label,
  setValue,
  currentType
}: UseFieldAutoSuggestOptions): void => {
  useEffect(() => {
    if (!label) return;

    const sanitizedName = sanitizeFieldName(label);
    setValue('name', sanitizedName, { shouldValidate: false });

    if (!currentType || currentType === 'text') {
      const suggestedType = suggestFieldType(label);
      setValue('type', suggestedType, { shouldValidate: false });
    }

    const shouldBeRequired = suggestRequiredStatus(label);
    if (shouldBeRequired) {
      setValue('required', true, { shouldValidate: false });
    }
  }, [label, setValue, currentType]);
};
