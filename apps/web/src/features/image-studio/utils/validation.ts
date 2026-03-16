/**
 * Image Studio Validation Utility
 * Config-driven validation using TYPE_CONFIG.validation rules
 */
import { getTypeConfig } from './typeConfig';

interface ValidationRules {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  message?: string;
}

type ValidationErrors = Record<string, string>;

/**
 * Validates form data against TYPE_CONFIG.validation rules
 */
export const validateFormData = (type: string, formData: Record<string, unknown>): ValidationErrors => {
  const config = getTypeConfig(type);
  const errors: ValidationErrors = {};

  if (!config?.validation) {
    return errors;
  }

  Object.entries(config.validation as Record<string, ValidationRules>).forEach(([field, rules]) => {
    const value = formData[field];

    // Required check
    if (rules.required) {
      const isEmpty =
        value === null ||
        value === undefined ||
        (typeof value === 'string' && value.trim().length === 0);

      if (isEmpty) {
        errors[field] = rules.message || `${field} ist erforderlich`;
        return; // Skip other checks if required fails
      }
    }

    // MinLength check (only for strings)
    if (rules.minLength && typeof value === 'string') {
      if (value.trim().length < rules.minLength) {
        errors[field] = rules.message || `Mindestens ${rules.minLength} Zeichen erforderlich`;
      }
    }

    // MaxLength check (only for strings)
    if (rules.maxLength && typeof value === 'string') {
      if (value.trim().length > rules.maxLength) {
        errors[field] = rules.message || `Maximal ${rules.maxLength} Zeichen erlaubt`;
      }
    }
  });

  return errors;
};

/**
 * Checks if form data is valid
 */
export const isFormValid = (type: string, formData: Record<string, unknown>): boolean => {
  return Object.keys(validateFormData(type, formData)).length === 0;
};

/**
 * Gets validation rules for a specific field
 */
export const getFieldValidation = (type: string, field: string): ValidationRules | null => {
  const config = getTypeConfig(type);
  return (config?.validation as Record<string, ValidationRules> | undefined)?.[field] || null;
};

export default {
  validateFormData,
  isFormValid,
  getFieldValidation,
};
