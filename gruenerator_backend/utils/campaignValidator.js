/**
 * Campaign Form Validation Utility
 * Validates user input against campaign JSON formValidation rules
 */

class ValidationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validate a single field value against validation rules
 * @param {string} fieldName - Name of the field being validated
 * @param {any} value - Value to validate
 * @param {Object} rules - Validation rules from campaign JSON
 * @returns {Object} - { valid: boolean, error: string|null }
 */
function validateField(fieldName, value, rules) {
  if (!rules) {
    return { valid: true, error: null };
  }

  const stringValue = value ? String(value).trim() : '';

  if (rules.required && !stringValue) {
    return {
      valid: false,
      error: rules.errorMessage || `${fieldName} ist erforderlich`
    };
  }

  if (!stringValue && !rules.required) {
    return { valid: true, error: null };
  }

  if (rules.minLength && stringValue.length < rules.minLength) {
    return {
      valid: false,
      error: rules.errorMessage || `${fieldName} muss mindestens ${rules.minLength} Zeichen lang sein`
    };
  }

  if (rules.maxLength && stringValue.length > rules.maxLength) {
    return {
      valid: false,
      error: rules.errorMessage || `${fieldName} darf maximal ${rules.maxLength} Zeichen lang sein`
    };
  }

  if (rules.pattern) {
    const regex = new RegExp(rules.pattern);
    if (!regex.test(stringValue)) {
      return {
        valid: false,
        error: rules.errorMessage || `${fieldName} hat ein ungültiges Format`
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Validate all form inputs against campaign formValidation rules
 * @param {Object} inputs - User input data (e.g., { location: 'Berlin', details: '...' })
 * @param {Object} campaignConfig - Campaign configuration from JSON
 * @returns {Object} - { valid: boolean, errors: Object }
 */
function validateCampaignInputs(inputs, campaignConfig) {
  const formValidation = campaignConfig.formValidation || {};
  const errors = {};
  let isValid = true;

  for (const [fieldName, rules] of Object.entries(formValidation)) {
    const value = inputs[fieldName];
    const result = validateField(fieldName, value, rules);

    if (!result.valid) {
      errors[fieldName] = result.error;
      isValid = false;
    }
  }

  return { valid: isValid, errors };
}

/**
 * Validate and throw error if validation fails
 * @param {Object} inputs - User input data
 * @param {Object} campaignConfig - Campaign configuration from JSON
 * @throws {ValidationError} If validation fails
 */
function validateCampaignInputsOrThrow(inputs, campaignConfig) {
  const { valid, errors } = validateCampaignInputs(inputs, campaignConfig);

  if (!valid) {
    const firstError = Object.entries(errors)[0];
    throw new ValidationError(firstError[0], firstError[1]);
  }
}

module.exports = {
  ValidationError,
  validateField,
  validateCampaignInputs,
  validateCampaignInputsOrThrow
};
