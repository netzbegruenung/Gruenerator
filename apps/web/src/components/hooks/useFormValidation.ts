import { useState, useCallback } from 'react';

interface ValidationRule {
  required?: boolean;
  min?: number;
  max?: number;
  message?: string;
}

type ValidationRules = Record<string, ValidationRule>;

interface UseFormValidationReturn {
  errors: Record<string, string>;
  validateForm: (formData: Record<string, string>) => boolean;
}

export const useFormValidation = (validationRules: ValidationRules): UseFormValidationReturn => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = useCallback(
    (formData: Record<string, string>): boolean => {
      const newErrors: Record<string, string> = {};
      Object.keys(validationRules).forEach((field) => {
        const value = formData[field];
        const fieldRules = validationRules[field];

        if (fieldRules.required && (!value || value.trim() === '')) {
          newErrors[field] = fieldRules.message || `${field} ist erforderlich`;
        } else if (fieldRules.min && Number(value) < fieldRules.min) {
          newErrors[field] =
            fieldRules.message || `${field} muss mindestens ${fieldRules.min} sein`;
        } else if (fieldRules.max && Number(value) > fieldRules.max) {
          newErrors[field] = fieldRules.message || `${field} darf maximal ${fieldRules.max} sein`;
        }
      });

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    },
    [validationRules]
  );

  return { errors, validateForm };
};
