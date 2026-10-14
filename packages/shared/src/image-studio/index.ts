/**
 * Image Studio Module
 * Shared image-studio functionality for web and mobile
 */

// Types
export type {
  // Core types
  ImageStudioTemplateType,
  ImageStudioKiType,
  KiSubcategory,
  ColorScheme,
  VeranstaltungFontSizes,
  CanvasGenerationRequest,
  // KI types
  KiStyleVariant,
  GreenEditInfrastructure,
  KiCreateRequest,
  KiEditRequest,
  KiTypeConfig,
  UseKiImageGenerationOptions,
  UseKiImageGenerationReturn,
} from './types.js';

// Constants
export {
  // KI constants
  KI_TYPE_CONFIGS,
  STYLE_VARIANTS,
  DEFAULT_STYLE_VARIANT,
  IMAGE_FORMATS,
  IMAGE_FORMAT_IDS,
  DEFAULT_IMAGE_FORMAT,
  getImageFormat,
  INFRASTRUCTURE_OPTIONS,
  isKiType,
  getKiTypeConfig,
  getAllKiTypes,
  getKiTypesBySubcategory,
  kiTypeRequiresImage,
  getStyleVariant,
  getInfrastructureOption,
} from './constants.js';
export type { StyleVariantConfig, InfrastructureOptionConfig, ImageFormatId } from './constants.js';

// KI-Transparenz (Art. 50 KI-VO)
export { AI_IMAGE_TRANSPARENCY } from './ai-transparency.js';
export { sharepicSourceNote } from './sharepicSourceNote.js';
export { sharepicRevisionReply } from './sharepicRevisionReply.js';

// Hooks
export { useKiImageGeneration, buildPureCreateBody } from './hooks/useKiImageGeneration.js';

// ============================================================================
// IMAGE SOURCE (stock images, Unsplash)
// ============================================================================

export type {
  StockImageAttribution,
  StockImage,
  FetchStockImagesResponse,
  UnsplashSearchResult,
  ImageSourceTab,
} from './image-source-types.js';

export {
  STOCK_CATEGORY_LABELS,
  fetchStockImages,
  searchUnsplashImages,
  trackUnsplashDownload,
  trackUnsplashDownloadLive,
} from './image-source-service.js';

export { useUnsplashSearch } from './hooks/useUnsplashSearch.js';
export type { UnsplashSearchFn, UseUnsplashSearchReturn } from './hooks/useUnsplashSearch.js';

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
} from './modification-types.js';

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
} from './modification-constants.js';

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
} from './modification-validation.js';
export type { ModificationValidationResult } from './modification-validation.js';

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
} from './modification-transformers.js';
