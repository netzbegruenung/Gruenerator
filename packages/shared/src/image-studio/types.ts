/**
 * Image Studio Types
 * Platform-agnostic type definitions for image-studio feature
 */

// ============================================================================
// CORE ENUMS
// ============================================================================

/**
 * Template types supported by image-studio (canvas-based rendering)
 */
export type ImageStudioTemplateType =
  | 'dreizeilen'
  | 'zitat'
  | 'zitat-pure'
  | 'info'
  | 'veranstaltung';

/**
 * KI types supported by image-studio (FLUX API-based)
 */
export type ImageStudioKiType =
  | 'pure-create'
  | 'green-edit'
  | 'universal-edit';

/**
 * All image studio types (templates + KI)
 */
export type ImageStudioType = ImageStudioTemplateType | ImageStudioKiType;

/**
 * Category for organizing types
 */
export type ImageStudioCategory = 'templates' | 'ki';

/**
 * Subcategory for KI types
 */
export type KiSubcategory = 'edit' | 'create';

/**
 * Form step identifiers
 */
export type ImageStudioStep =
  | 'select'    // Type selection
  | 'input'     // Form input (template types)
  | 'ki-input'  // KI input (KI types)
  | 'image'     // Image upload (if required)
  | 'text'      // Text selection/alternatives
  | 'result';   // Final result

// ============================================================================
// TYPE CONFIGURATION
// ============================================================================

/**
 * API endpoints for a type
 */
export interface ImageStudioEndpoints {
  /** Text generation endpoint (Claude API) */
  text?: string;
  /** Canvas rendering endpoint */
  canvas?: string;
}

/**
 * Configuration for an image-studio type (platform-agnostic)
 */
export interface ImageStudioTypeConfig {
  id: ImageStudioTemplateType;
  label: string;
  description: string;
  /** Whether this type requires an image upload */
  requiresImage: boolean;
  /** Whether this type uses Claude for text generation */
  hasTextGeneration: boolean;
  /** API endpoints */
  endpoints: ImageStudioEndpoints;
  /** Legacy type name for backend compatibility */
  legacyType: string;
  /** Whether this is a beta feature */
  isBeta?: boolean;
  /** Whether to do input before image selection */
  inputBeforeImage?: boolean;
  /** Whether to preload text and image suggestion in parallel */
  parallelPreload?: boolean;
}

// ============================================================================
// FORM DATA TYPES
// ============================================================================

/**
 * Valid form field value types for Image Studio
 * - string: text fields, select values, generated content
 * - number: font sizes, offsets, numeric settings
 */
export type FormFieldValue = string | number;

/**
 * Generic form data type for image studio forms
 * Used by stores, validation, and API requests
 */
export type ImageStudioFormData = Record<string, FormFieldValue>;

// ============================================================================
// FORM FIELD CONFIGURATION
// ============================================================================

/**
 * Single input field configuration
 */
export interface InputFieldConfig {
  name: string;
  type: 'text' | 'textarea' | 'select';
  label: string;
  subtitle?: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  rows?: number;
  options?: Array<{ value: string; label: string }>;
}

/**
 * Per-type field configuration for dynamic form rendering
 */
export interface TemplateFieldConfig {
  /** Fields shown in the input step */
  inputFields: InputFieldConfig[];
  /** Fields shown in the preview/edit step */
  previewFields: InputFieldConfig[];
  /** Field names included in result */
  resultFields: string[];
  /** Whether to show image upload UI */
  showImageUpload: boolean;
  /** Whether to show color scheme controls */
  showColorControls: boolean;
  /** Whether to show font size control */
  showFontSizeControl: boolean;
  /** Whether to show grouped font size controls (veranstaltung) */
  showGroupedFontSizeControl?: boolean;
  /** Whether to show advanced editing (offsets, etc.) */
  showAdvancedEditing: boolean;
  /** Whether to show credit field */
  showCredit: boolean;
  /** Whether to show alternatives selection */
  showAlternatives: boolean;
  /** Custom button text for alternatives */
  alternativesButtonText?: string;
  /** Whether to show the edit panel */
  showEditPanel: boolean;
  /** Whether to show preview labels */
  showPreviewLabels?: boolean;
  /** Whether to use minimal layout */
  minimalLayout: boolean;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Base request for text generation
 */
export interface TextGenerationRequest {
  thema: string;
  name?: string;      // For quote types
  source?: string;    // Always 'image-studio'
  count?: number;     // Number of alternatives (default 5)
}

/**
 * Dreizeilen (3-line slogan) response
 */
export interface DreizeilenResponse {
  mainSlogan: {
    line1: string;
    line2: string;
    line3: string;
  };
  alternatives: Array<{
    line1: string;
    line2: string;
    line3: string;
  }>;
  searchTerms?: string[];
}

/**
 * Quote response (zitat, zitat-pure)
 */
export interface QuoteResponse {
  quote: string;
  name: string;
  alternatives: Array<{
    quote: string;
  }>;
}

/**
 * Info response
 */
export interface InfoResponse {
  header: string;
  subheader: string;
  body: string;
  alternatives: Array<{
    header: string;
    subheader: string;
    body: string;
  }>;
  searchTerms?: string[];
}

/**
 * Veranstaltung (event) response
 */
export interface VeranstaltungResponse {
  eventTitle: string;
  beschreibung: string;
  weekday: string;
  date: string;
  time: string;
  locationName: string;
  address: string;
  alternatives: Array<{
    eventTitle: string;
    beschreibung: string;
    weekday: string;
    date: string;
    time: string;
    locationName: string;
    address: string;
  }>;
  searchTerms?: string[];
}

/**
 * Union type for all text generation responses
 */
export type TextGenerationResponse =
  | DreizeilenResponse
  | QuoteResponse
  | InfoResponse
  | VeranstaltungResponse;

/**
 * Normalized text generation result
 */
export interface NormalizedTextResult {
  /** Main generated fields */
  fields: Record<string, string>;
  /** Alternative variations */
  alternatives: Array<Record<string, string>>;
  /** Search terms for image suggestion */
  searchTerms?: string[];
}

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

/**
 * Result from canvas generation
 */
export interface CanvasGenerationResult {
  /** Base64 encoded PNG image */
  image: string;
}

// ============================================================================
// KI GENERATION TYPES (FLUX API)
// ============================================================================

/**
 * Style variants for pure-create
 */
export type KiStyleVariant =
  | 'illustration-pure'
  | 'realistic-pure'
  | 'pixel-pure'
  | 'editorial-pure';

/**
 * Infrastructure options for green-edit
 */
export type GreenEditInfrastructure =
  | 'trees'
  | 'flowers'
  | 'bike-lanes'
  | 'benches'
  | 'sidewalks'
  | 'tram'
  | 'bus-stop';

/**
 * Pure Create request (text-to-image generation)
 */
export interface KiCreateRequest {
  description: string;
  variant: KiStyleVariant;
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
 * KI generation result
 */
export interface KiGenerationResult {
  image: string;
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

// ============================================================================
// COMPOSITE TYPES
// ============================================================================

/**
 * Complete image-studio generation result
 */
export interface ImageStudioResult {
  /** Base64 encoded PNG image */
  image: string;
  /** Original text generation response (if applicable) */
  textResult?: NormalizedTextResult;
}

/**
 * Image-studio state for mobile/shared store
 */
export interface ImageStudioState {
  type: ImageStudioTemplateType | null;
  currentStep: ImageStudioStep;
  formData: ImageStudioFormData;
  uploadedImage: string | null;
  generatedText: NormalizedTextResult | null;
  generatedImage: string | null;
  selectedAlternativeIndex: number;
  loading: boolean;
  error: string | null;
}

/**
 * KI-specific state for image studio
 */
export interface KiImageStudioState {
  /** Selected KI type */
  kiType: ImageStudioKiType | null;
  /** Selected category */
  category: ImageStudioCategory;
  /** Instruction/description for generation */
  instruction: string;
  /** Selected style variant (pure-create) */
  variant: KiStyleVariant;
  /** Selected infrastructure options (green-edit) */
  infrastructureOptions: GreenEditInfrastructure[];
  /** Uploaded image for edit types */
  uploadedImage: string | null;
  /** Generated result image */
  generatedImage: string | null;
  /** Loading state for KI generation */
  kiLoading: boolean;
  /** Rate limit exceeded */
  rateLimitExceeded: boolean;
  /** Error message */
  error: string | null;
}

/**
 * Hook options for useImageStudio
 */
export interface UseImageStudioOptions {
  onTextGenerated?: (result: NormalizedTextResult) => void;
  onImageGenerated?: (imageBase64: string) => void;
  onError?: (error: string) => void;
}

/**
 * Return type for useImageStudio hook
 */
export interface UseImageStudioReturn {
  /** Generate text for a given type */
  generateText: (type: ImageStudioTemplateType, formData: TextGenerationRequest) => Promise<NormalizedTextResult>;
  /** Generate canvas image */
  generateCanvas: (type: ImageStudioTemplateType, request: CanvasGenerationRequest) => Promise<string>;
  /** Loading state */
  loading: boolean;
  /** Text generation loading state */
  textLoading: boolean;
  /** Canvas generation loading state */
  canvasLoading: boolean;
  /** Current error */
  error: string | null;
  /** Reset error state */
  clearError: () => void;
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
  generateKiEdit: (type: 'green-edit' | 'universal-edit', request: KiEditRequest) => Promise<string>;
  /** Loading state */
  loading: boolean;
  /** Rate limit exceeded */
  rateLimitExceeded: boolean;
  /** Current error */
  error: string | null;
  /** Reset error state */
  clearError: () => void;
}
