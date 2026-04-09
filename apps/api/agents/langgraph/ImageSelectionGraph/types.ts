/**
 * Type definitions for ImageSelectionGraph
 * AI-powered selection of background images for sharepics
 */

import type AIWorkerPool from '../../../workers/aiWorkerPool.js';
import type { Request } from 'express';

/**
 * Individual image from catalog
 */
export interface CatalogImage {
  filename: string;
  alt_text: string;
  tags: string[];
  path?: string | undefined;
}

/**
 * Image catalog structure
 */
export interface ImageCatalog {
  images: CatalogImage[];
  version?: string | undefined;
  lastUpdated?: string | undefined;
}

/**
 * Image selection metadata
 */
export interface SelectionMetadata {
  totalImages?: number | undefined;
  selectionMethod?:
    | 'direct_description_matching'
    | 'direct_ai_selection'
    | 'smart_fallback'
    | 'error_fallback';
  aiConfidence?: number | undefined;
  totalImagesConsidered?: number | undefined;
  parseError?: string | undefined;
  [key: string]: unknown;
}

/**
 * Main state for ImageSelectionGraph
 */
export interface ImageSelectionState {
  // Input parameters
  text: string;
  sharepicType: string;
  aiWorkerPool: AIWorkerPool;
  req: Request;

  // Core data
  imageCatalog?: ImageCatalog | undefined;

  // Output
  selectedImage?: CatalogImage | undefined;
  confidence?: number | undefined;
  reasoning?: string | undefined;
  alternatives?: CatalogImage[] | undefined;
  metadata?: SelectionMetadata | undefined;
  error?: string | undefined;
}

/**
 * Input for running image selection
 */
export interface ImageSelectionInput {
  text: string;
  sharepicType: string;
  aiWorkerPool: AIWorkerPool;
  req: Request;
}

/**
 * Output from image selection
 */
export interface ImageSelectionOutput {
  status: 'success' | 'error';
  selectedImage?: CatalogImage | undefined;
  confidence?: number | undefined;
  reasoning?: string | undefined;
  alternatives?: CatalogImage[] | undefined;
  metadata?: SelectionMetadata | undefined;
  error?: string | undefined;
}

/**
 * AI selection response format
 */
export interface AISelectionResponse {
  selectedIndex: number;
  confidence?: number | undefined;
}
