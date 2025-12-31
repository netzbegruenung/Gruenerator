/**
 * Image Studio Validation Utility
 * Config-driven validation using TYPE_CONFIG.validation rules
 */
import { getTypeConfig } from './typeConfig';

/**
 * Validates form data against TYPE_CONFIG.validation rules
 * @param {string} type - Image studio type ID
 * @param {object} formData - Form data to validate
 * @returns {object} Error object with field names as keys and messages as values
 */
export const validateFormData = (type, formData) => {
  const config = getTypeConfig(type);
  const errors = {};

  if (!config?.validation) {
    return errors;
  }

  Object.entries(config.validation).forEach(([field, rules]) => {
    const value = formData[field];

    // Required check
    if (rules.required) {
      const isEmpty = value === null ||
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
 * @param {string} type - Image studio type ID
 * @param {object} formData - Form data to validate
 * @returns {boolean} True if valid
 */
export const isFormValid = (type, formData) => {
  return Object.keys(validateFormData(type, formData)).length === 0;
};

/**
 * Gets validation rules for a specific field
 * @param {string} type - Image studio type ID
 * @param {string} field - Field name
 * @returns {object|null} Validation rules or null
 */
export const getFieldValidation = (type, field) => {
  const config = getTypeConfig(type);
  return config?.validation?.[field] || null;
};

export default {
  validateFormData,
  isFormValid,
  getFieldValidation
};
