/**
 * Type definitions for ImageSelectionGraph
 * AI-powered selection of background images for sharepics
 */

/**
 * Individual image from catalog
 */
export interface CatalogImage {
  filename: string;
  alt_text: string;
  tags: string[];
  path?: string;
}

/**
 * Image catalog structure
 */
export interface ImageCatalog {
  images: CatalogImage[];
  version?: string;
  lastUpdated?: string;
}

/**
 * Image selection metadata
 */
export interface SelectionMetadata {
  totalImages?: number;
  selectionMethod?: 'direct_description_matching' | 'direct_ai_selection' | 'smart_fallback' | 'error_fallback';
  aiConfidence?: number;
  totalImagesConsidered?: number;
  parseError?: string;
  [key: string]: unknown;
}

/**
 * Main state for ImageSelectionGraph
 */
export interface ImageSelectionState {
  // Input parameters
  text: string;
  sharepicType: string;
  aiWorkerPool: any;
  req: any; // Express request object

  // Core data
  imageCatalog?: ImageCatalog;

  // Output
  selectedImage?: CatalogImage;
  confidence?: number;
  reasoning?: string;
  alternatives?: CatalogImage[];
  metadata?: SelectionMetadata;
  error?: string;
}

/**
 * Input for running image selection
 */
export interface ImageSelectionInput {
  text: string;
  sharepicType: string;
  aiWorkerPool: any;
  req: any;
}

/**
 * Output from image selection
 */
export interface ImageSelectionOutput {
  status: 'success' | 'error';
  selectedImage?: CatalogImage;
  confidence?: number;
  reasoning?: string;
  alternatives?: CatalogImage[];
  metadata?: SelectionMetadata;
  error?: string;
}

/**
 * AI selection response format
 */
export interface AISelectionResponse {
  selectedIndex: number;
  confidence?: number;
}
