/**
 * Campaign Utilities Barrel Export
 * Provides all campaign-related utilities in one place
 */

// Response Parser exports
export {
  parseResponse,
  lineExtractor,
  multiLineExtractor,
  jsonExtractor,
  regexExtractor
} from './responseParser.js';

export type {
  LineExtractorConfig,
  MultiLineExtractorConfig,
  JsonExtractorConfig,
  RegexExtractorConfig,
  RegexPattern,
  ParserConfig,
  ParsedResponse
} from './responseParser.js';

// Validator exports
export {
  ValidationError,
  validateField,
  validateCampaignInputs,
  validateCampaignInputsOrThrow
} from './validator.js';

export type {
  FieldValidationRules,
  FormValidation,
  CampaignConfig,
  UserInputs,
  ValidationErrors,
  ValidationResult,
  CompleteValidationResult
} from './validator.js';
