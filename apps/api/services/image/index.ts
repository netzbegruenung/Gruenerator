/**
 * Image Services - Barrel Export
 *
 * Centralized exports for all image-related services:
 * - ImageSelectionService: AI-powered image selection using LangGraph
 * - TemporaryImageStorage: Redis-backed ephemeral image storage
 * - ImagineCanvasRenderer: Canvas composition for FLUX images with text overlays
 * - UnsplashAttributionService: Unsplash image attribution parsing and formatting
 */

// Main service exports
export { default as ImageSelectionService } from './ImageSelectionService.js';
export { default as TemporaryImageStorage } from './TemporaryImageStorage.js';
export {
  UnsplashAttributionService,
  unsplashAttributionService,
} from './UnsplashAttributionService.js';

// Canvas renderer exports
export {
  composeImagineCreate,
  VARIANT_CONFIGS,
  FLUX_WIDTH,
  FLUX_HEIGHT,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  BRAND_COLORS,
} from './ImagineCanvasRenderer.js';

// Unsplash attribution exports (backward compatibility)
export {
  parseFilename,
  formatPhotographerName,
  buildUnsplashUrls,
  getAttribution,
  enhanceWithAttribution,
} from './UnsplashAttributionService.js';

// Type exports
export type {
  // ImageSelectionService types
  ImageCatalogEntry,
  ImageCatalog,
  ImageSelectionOptions,
  ImageSelectionResult,
  ImageSelectionServiceStats,

  // TemporaryImageStorage types
  ImageAttachment,
  ImageStorageSession,
  ImageStorageStats,

  // ImagineCanvasRenderer types
  VariantConfig,
  ImagineComposeOptions,
  BrandColors,
  GradientConfig,
  BarConfig,
  TemplateConfig,

  // UnsplashAttribution types
  UnsplashParsedFilename,
  UnsplashUrls,
  UnsplashAttribution,
  ImageWithAttribution,
} from './types.js';
