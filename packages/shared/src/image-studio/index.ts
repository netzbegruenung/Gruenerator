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

// ============================================================================
// MODIFICATION TYPES
// ============================================================================

export type {
  Offset2D,
  BalkenOffset,
  FontSizeOption,
  GroupedFontSizes,
  BarColor,
  DreizeilenColorScheme,
  ColorSchemePreset,
  DreizeilenModificationParams,
  ZitatModificationParams,
  VeranstaltungModificationParams,
  ModificationParams,
  RangeControlConfig,
  ModificationControlsConfig,
  ModificationUIState,
} from './modification-types';

// ============================================================================
// MODIFICATION CONSTANTS
// ============================================================================

export {
  BRAND_COLORS,
  FONT_SIZES,
  ZITAT_FONT_SIZES,
  FONT_SIZE_OPTIONS,
  ZITAT_FONT_SIZE_OPTIONS,
  BALKEN_OFFSET_CONFIG,
  BALKEN_GRUPPE_STEP,
  SUNFLOWER_STEP,
  DEFAULT_COLOR_SCHEME,
  COLOR_SCHEME_PRESETS,
  DEFAULT_DREIZEILEN_PARAMS,
  DEFAULT_ZITAT_PARAMS,
  DEFAULT_GROUPED_FONT_SIZES,
  DEFAULT_VERANSTALTUNG_PARAMS,
  VERANSTALTUNG_BASE_FONT_SIZES,
  GROUPED_FONT_SIZE_FIELDS,
  MODIFICATION_CONTROLS_CONFIG,
  MODIFICATION_LABELS,
  getDefaultModificationParams,
  typeSupportsModifications,
} from './modification-constants';

// ============================================================================
// MODIFICATION VALIDATION
// ============================================================================

export {
  validateRange,
  validateFontSize,
  validateBalkenOffset,
  validateOffset2D,
  validateHexColor,
  validateBarColor,
  validateColorScheme,
  validateGroupedFontSizes,
  validateCredit,
  validateDreizeilenParams,
  validateZitatParams,
  validateVeranstaltungParams,
  validateModificationParams,
} from './modification-validation';
export type { ModificationValidationResult } from './modification-validation';

// ============================================================================
// MODIFICATION TRANSFORMERS
// ============================================================================

export {
  getContrastColor,
  normalizeBarColor,
  normalizeColorScheme,
  groupedToFieldFontSizes,
  fieldToGroupedFontSizes,
  applyDreizeilenParams,
  applyZitatParams,
  applyVeranstaltungParams,
  applyModificationParams,
  cloneModificationParams,
  areColorSchemesEqual,
  findColorSchemePresetId,
} from './modification-transformers';
