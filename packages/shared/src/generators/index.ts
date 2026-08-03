/**
 * Generators Module
 * Shared types, constants, utilities, and hooks for text generators.
 *
 * Usage:
 * ```ts
 * import {
 *   // Types
 *   type SocialPlatform,
 *   type PresseSocialRequest,
 *   type GeneratorResult,
 *
 *   // Constants
 *   GENERATOR_ENDPOINTS,
 *   SOCIAL_PLATFORMS,
 *   ANTRAG_TYPES,
 *
 *   // Utilities
 *   parseGeneratorResponse,
 *   parseGeneratorError,
 *   validatePresseSocialRequest,
 *
 *   // Hooks
 *   useTextGeneration,
 * } from '@gruenerator/shared/generators';
 * ```
 */

// Types
export type {
  SocialPlatform,
  AntragRequestType,
  UniversalTextType,
  AccessibilityMode,
  GeneratorFeatures,
  Attachment,
  BaseGeneratorRequest,
  PresseSocialRequest,
  AntragRequest,
  UniversalRequest,
  AltTextRequest,
  AltTextResponse,
  LeichteSpracheRequest,
  GeneratorResponse,
  GeneratorResult,
  GeneratorError,
  ValidationResult,
} from './types.js';

// Constants
export {
  GENERATOR_ENDPOINTS,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORMS_MOBILE,
  ANTRAG_TYPES,
  ACCESSIBILITY_MODES,
  GENERATOR_TITLES,
  FORM_PLACEHOLDERS,
  VALIDATION_MESSAGES,
  type PlatformOption,
  type AntragTypeOption,
  type AccessibilityModeOption,
} from './constants.js';

// Utilities
export {
  parseGeneratorResponse,
  extractContent,
  parseGeneratorError,
  getErrorMessage,
  validatePresseSocialRequest,
  validateAntragRequest,
  validateUniversalRequest,
  validateAltTextRequest,
  validateLeichteSpracheRequest,
  isNonEmpty,
  getFirstError,
} from './utils/index.js';

// Hooks
export {
  useTextGeneration,
  type UseTextGenerationOptions,
  type UseTextGenerationReturn,
  useTextEditActions,
  extractEditableText,
  applyChangesToContent,
  type EditChange,
  type ApplyChangesResult,
  type UseTextEditActionsReturn,
} from './hooks/index.js';

// Re-export store for convenience
export {
  useGeneratedTextStore,
  getGeneratedTextState,
  type ChatMessage,
  type GeneratedTextMetadata,
  type GeneratedTextState,
  type GeneratedTextActions,
  type GeneratedTextStore,
} from '../stores/generatedTextStore.js';
