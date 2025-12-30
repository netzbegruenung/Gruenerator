/**
 * Image Studio Module
 * Shared image-studio functionality for web and mobile
 */

// Types
export type {
  // Form data types
  FormFieldValue,
  ImageStudioFormData,
  // Core types
  ImageStudioTemplateType,
  ImageStudioStep,
  ImageStudioEndpoints,
  ImageStudioTypeConfig,
  InputFieldConfig,
  TemplateFieldConfig,
  TextGenerationRequest,
  DreizeilenResponse,
  QuoteResponse,
  InfoResponse,
  VeranstaltungResponse,
  TextGenerationResponse,
  NormalizedTextResult,
  ColorScheme,
  VeranstaltungFontSizes,
  CanvasGenerationRequest,
  CanvasGenerationResult,
  Text2SharepicRequest,
  Text2SharepicResult,
  ImageStudioResult,
  ImageStudioState,
  UseImageStudioOptions,
  UseImageStudioReturn,
} from './types';

// Constants
export {
  IMAGE_STUDIO_TYPE_CONFIGS,
  TEMPLATE_FIELD_CONFIGS,
  mapTextResponse,
  getTypeConfig,
  getFieldConfig,
  getAllTemplateTypes,
  getTypesRequiringImage,
  getTypesWithTextGeneration,
  typeRequiresImage,
  typeHasTextGeneration,
  getTextEndpoint,
  getCanvasEndpoint,
  getInputFields,
  getPreviewFields,
} from './constants';

// Validation
export {
  ERROR_MESSAGES,
  validateField,
  validateInputFields,
  validateTextGenerationInput,
  validateCanvasInput,
  validateFormData,
  validateTextResponse,
  validateCanvasResponse,
} from './utils/validation';
export type { ImageStudioValidationResult } from './utils/validation';

// Hooks
export { useImageStudio } from './hooks/useImageStudio';
export { useImageStudioCanvas } from './hooks/useImageStudioCanvas';
export type {
  UseImageStudioCanvasOptions,
  UseImageStudioCanvasReturn,
} from './hooks/useImageStudioCanvas';
