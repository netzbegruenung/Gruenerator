/**
 * Image Studio Types
 * Platform-agnostic type definitions for image-studio feature
 */

import {
  type CanvasTemplateType,
  type ImageFormatId,
  type KiLabelMode,
} from '@gruenerator/contracts';

// ============================================================================
// CORE ENUMS
// ============================================================================

/**
 * Template types supported by image-studio (canvas-based rendering).
 *
 * A subset of the canonical `CanvasTemplateType` set in @gruenerator/contracts
 * (the single source of truth); the assertion below keeps it from drifting to a
 * value the canvas pipeline can't mint.
 */
export type ImageStudioTemplateType =
  | 'dreizeilen'
  | 'zitat'
  | 'zitat-pure'
  | 'info'
  | 'veranstaltung'
  | 'profilbild'
  | 'simple'
  | 'slider';

// Compile-time guard: every template type here must be a canonical canvas type.
type _AssertTemplateSubset = ImageStudioTemplateType extends CanvasTemplateType ? true : never;
const _assertTemplateSubset: _AssertTemplateSubset = true;
void _assertTemplateSubset;

/**
 * KI types supported by image-studio (FLUX API-based)
 */
export type ImageStudioKiType = 'pure-create' | 'green-edit' | 'universal-edit';

/**
 * Subcategory for KI types
 */
export type KiSubcategory = 'edit' | 'create';

// ============================================================================
// CANVAS GENERATION TYPES
// ============================================================================

/**
 * Color scheme for dreizeilen type
 */
export interface ColorScheme {
  background: string;
  text: string;
}

/**
 * Font sizes for veranstaltung type
 */
export interface VeranstaltungFontSizes {
  eventTitle?: number;
  beschreibung?: number;
  weekday?: number;
  date?: number;
  time?: number;
  locationName?: number;
  address?: number;
}

/**
 * Canvas generation request for template types
 */
export interface CanvasGenerationRequest {
  type: ImageStudioTemplateType;
  /** Base64 image data (for types that require image) */
  imageData?: string;
  /** File URI for image (React Native - use instead of imageData for mobile) */
  imageUri?: string;
  /** Form data fields */
  formData: Record<string, string | number>;
  /** Color scheme (dreizeilen) */
  colorScheme?: ColorScheme[];
  /** Font size (zitat, dreizeilen) */
  fontSize?: number;
  /** Credit text (dreizeilen) */
  credit?: string;
  /** Bar offsets (dreizeilen) */
  balkenOffset?: [number, number, number];
  /** Bar group offset (dreizeilen) */
  balkenGruppenOffset?: [number, number];
  /** Sunflower offset (dreizeilen) */
  sunflowerOffset?: [number, number];
  /** Per-field font sizes (veranstaltung) */
  veranstaltungFieldFontSizes?: VeranstaltungFontSizes;
}

// ============================================================================
// KI GENERATION TYPES (FLUX API)
// ============================================================================

/**
 * Style variants for pure-create
 */
export type KiStyleVariant =
  'illustration-pure' | 'realistic-pure' | 'pixel-pure' | 'editorial-pure';

/**
 * Infrastructure options for green-edit
 */
export type GreenEditInfrastructure =
  'trees' | 'flowers' | 'bike-lanes' | 'benches' | 'sidewalks' | 'tram' | 'bus-stop';

/**
 * Pure Create request (text-to-image generation)
 */
export interface KiCreateRequest {
  description: string;
  /** Omitted: the server reads the style from the description (realistic unless asked otherwise). */
  variant?: KiStyleVariant;
  /** Output format; omitted: the server picks it from the description. */
  format?: ImageFormatId;
  /** Which AI label the backend burns in; omitted means 'full'. */
  kiLabel?: KiLabelMode;
  /** Experimental (FLUX 3): plan a bounding-box layout before generating. */
  layout?: boolean;
}

/**
 * KI Edit request (image editing with instructions)
 */
export interface KiEditRequest {
  imageData: string;
  instruction: string;
  infrastructureOptions?: GreenEditInfrastructure[];
}

/**
 * Configuration for a KI type
 */
export interface KiTypeConfig {
  id: ImageStudioKiType;
  label: string;
  description: string;
  category: 'ki';
  subcategory: KiSubcategory;
  /** Whether this type requires an image upload */
  requiresImage: boolean;
  /** API endpoint */
  endpoint: string;
  /** Minimum instruction length */
  minInstructionLength?: number;
  /** Whether this is rate-limited */
  isRateLimited: boolean;
}

/**
 * Options for useKiImageGeneration hook
 */
export interface UseKiImageGenerationOptions {
  onImageGenerated?: (imageBase64: string) => void;
  onError?: (error: string) => void;
  onRateLimitExceeded?: () => void;
}

/**
 * Return type for useKiImageGeneration hook
 */
export interface UseKiImageGenerationReturn {
  /** Generate image from text (pure-create) */
  generatePureCreate: (request: KiCreateRequest) => Promise<string>;
  /** Edit image with instructions (green-edit, universal-edit) */
  generateKiEdit: (
    type: 'green-edit' | 'universal-edit',
    request: KiEditRequest
  ) => Promise<string>;
  /** Loading state */
  loading: boolean;
  /** Rate limit exceeded */
  rateLimitExceeded: boolean;
  /** Current error */
  error: string | null;
  /** Reset error state */
  clearError: () => void;
}
