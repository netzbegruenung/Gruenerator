/**
 * Campaign Form Validation Utility
 * Validates user input against campaign JSON formValidation rules
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Validation rules for a single field
 */
export interface FieldValidationRules {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  errorMessage?: string;
}

/**
 * Form validation configuration
 */
export type FormValidation = Record<string, FieldValidationRules>;

/**
 * Campaign configuration with validation
 */
export interface CampaignConfig {
  formValidation?: FormValidation;
  [key: string]: any;
}

/**
 * User input data
 */
export type UserInputs = Record<string, any>;

/**
 * Validation errors
 */
export type ValidationErrors = Record<string, string>;

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Complete validation result
 */
export interface CompleteValidationResult {
  valid: boolean;
  errors: ValidationErrors;
}

// ============================================================================
// Custom Error Class
// ============================================================================

/**
 * Custom validation error with field information
 */
export class ValidationError extends Error {
  field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a single field value against validation rules
 * @param fieldName - Name of the field being validated
 * @param value - Value to validate
 * @param rules - Validation rules from campaign JSON
 * @returns Validation result with error message if invalid
 */
export function validateField(
  fieldName: string,
  value: any,
  rules: FieldValidationRules
): ValidationResult {
  if (!rules) {
    return { valid: true, error: null };
  }

  const stringValue = value ? String(value).trim() : '';

  if (rules.required && !stringValue) {
    return {
      valid: false,
      error: rules.errorMessage || `${fieldName} ist erforderlich`,
    };
  }

  if (!stringValue && !rules.required) {
    return { valid: true, error: null };
  }

  if (rules.minLength && stringValue.length < rules.minLength) {
    return {
      valid: false,
      error:
        rules.errorMessage || `${fieldName} muss mindestens ${rules.minLength} Zeichen lang sein`,
    };
  }

  if (rules.maxLength && stringValue.length > rules.maxLength) {
    return {
      valid: false,
      error: rules.errorMessage || `${fieldName} darf maximal ${rules.maxLength} Zeichen lang sein`,
    };
  }

  if (rules.pattern) {
    const regex = new RegExp(rules.pattern);
    if (!regex.test(stringValue)) {
      return {
        valid: false,
        error: rules.errorMessage || `${fieldName} hat ein ungültiges Format`,
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Validate all form inputs against campaign formValidation rules
 * @param inputs - User input data (e.g., { location: 'Berlin', details: '...' })
 * @param campaignConfig - Campaign configuration from JSON
 * @returns Complete validation result with all errors
 */
export function validateCampaignInputs(
  inputs: UserInputs,
  campaignConfig: CampaignConfig
): CompleteValidationResult {
  const formValidation = campaignConfig.formValidation || {};
  const errors: ValidationErrors = {};
  let isValid = true;

  for (const [fieldName, rules] of Object.entries(formValidation)) {
    const value = inputs[fieldName];
    const result = validateField(fieldName, value, rules);

    if (!result.valid) {
      errors[fieldName] = result.error!;
      isValid = false;
    }
  }

  return { valid: isValid, errors };
}

/**
 * Validate and throw error if validation fails
 * @param inputs - User input data
 * @param campaignConfig - Campaign configuration from JSON
 * @throws {ValidationError} If validation fails
 */
export function validateCampaignInputsOrThrow(
  inputs: UserInputs,
  campaignConfig: CampaignConfig
): void {
  const { valid, errors } = validateCampaignInputs(inputs, campaignConfig);

  if (!valid) {
    const firstError = Object.entries(errors)[0];
    throw new ValidationError(firstError[0], firstError[1]);
  }
}
