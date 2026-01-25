import { useEffect } from 'react';
import { type FieldValues, type UseFormSetValue } from 'react-hook-form';

import { sanitizeFieldName } from '../utils/sanitization';
import { suggestFieldType, suggestRequiredStatus } from '../utils/validation';

interface UseFieldAutoSuggestOptions<T extends FieldValues> {
  label: string;
  setValue: UseFormSetValue<T>;
  currentType?: string;
}

export const useFieldAutoSuggest = <T extends FieldValues>({
  label,
  setValue,
  currentType,
}: UseFieldAutoSuggestOptions<T>): void => {
  useEffect(() => {
    if (!label) return;

    const sanitizedName = sanitizeFieldName(label);
    (setValue as UseFormSetValue<FieldValues>)('name', sanitizedName, { shouldValidate: false });

    if (!currentType || currentType === 'text') {
      const suggestedType = suggestFieldType(label);
      (setValue as UseFormSetValue<FieldValues>)('type', suggestedType, { shouldValidate: false });
    }

    const shouldBeRequired = suggestRequiredStatus(label);
    if (shouldBeRequired) {
      (setValue as UseFormSetValue<FieldValues>)('required', true, { shouldValidate: false });
    }
  }, [label, setValue, currentType]);
};
