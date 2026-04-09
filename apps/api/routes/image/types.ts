/**
 * Image Routes - Type Definitions
 */

import { type Request } from 'express';

import { type UserProfile } from '../../services/user/types.js';

import type {
  ImageGenerationStatus,
  ImageGenerationResult,
} from '../../services/counters/types.js';
import type { ImageCatalogEntry } from '../../services/image/types.js';
import type AIWorkerPool from '../../workers/aiWorkerPool.js';
import type { ParamsDictionary } from 'express-serve-static-core';

// ============================================================================
// Request Types
// ============================================================================

/**
 * Base authenticated request with user attached
 */
export interface AuthenticatedRequest<P = ParamsDictionary> extends Request<P> {
  user?: UserProfile | undefined;
  app: Request['app'] & {
    locals: {
      aiWorkerPool?: AIWorkerPool | undefined;
    };
  };
}

// ============================================================================
// Image Generation Types
// ============================================================================

/**
 * Response for generation status endpoint
 */
export interface GenerationStatusResponse {
  success: boolean;
  data?: ImageGenerationStatus & {
    timeUntilReset: string;
    userId: string;
  };
  error?: string | undefined;
}

/**
 * Response for increment endpoint
 */
export interface GenerationIncrementResponse {
  success: boolean;
  data?: ImageGenerationResult | undefined;
  error?: string | undefined;
}

/**
 * Response for reset endpoint
 */
export interface GenerationResetResponse {
  success: boolean;
  message?: string | undefined;
  error?: string | undefined;
}

// ============================================================================
// Image Picker Types
// ============================================================================

/**
 * Request body for image selection
 */
export interface ImageSelectRequestBody {
  text: string;
  type?: string | undefined;
  tags?: string[] | undefined;
  maxCandidates?: number | undefined;
}

/**
 * Request body for image validation
 */
export interface ImageValidateRequestBody {
  filename: string;
}

/**
 * Selected image in response
 */
export interface SelectedImageResponse {
  filename: string;
  category: string;
  tags: string[];
  alt_text: string;
  path: string;
}

/**
 * Response for image selection endpoint
 */
export interface ImageSelectResponse {
  success: boolean;
  selectedImage?: SelectedImageResponse | undefined;
  confidence?: number | undefined;
  reasoning?: string | undefined;
  alternatives?: SelectedImageResponse[] | undefined;
  metadata?: {
    totalImages: number;
    candidatesFound: number;
    detectedThemes: string[];
    extractedKeywords: string[];
    processingTime: string;
  };
  error?: string | undefined;
  code?: string | undefined;
  message?: string | undefined;
}

/**
 * Response for stats endpoint
 */
export interface ImagePickerStatsResponse {
  success: boolean;
  stats?: {
    uptime: number;
    timestamp: string;
    [key: string]: unknown;
  };
  error?: string | undefined;
  code?: string | undefined;
}

/**
 * Response for catalog endpoint
 */
export interface ImageCatalogResponse {
  success: boolean;
  catalog?: {
    images: ImageCatalogEntry[];
    [key: string]: unknown;
  };
  count?: number | undefined;
  timestamp?: string | undefined;
  error?: string | undefined;
  code?: string | undefined;
}

/**
 * Response for stock catalog with attribution
 */
export interface StockCatalogResponse {
  success: boolean;
  images?: Record<string, unknown>[] | undefined;
  count?: number | undefined;
  totalCount?: number | undefined;
  categories?: string[] | undefined;
  timestamp?: string | undefined;
  error?: string | undefined;
  code?: string | undefined;
  message?: string | undefined;
}

/**
 * Response for cache clear endpoint
 */
export interface CacheClearResponse {
  success: boolean;
  message?: string | undefined;
  timestamp?: string | undefined;
  error?: string | undefined;
  code?: string | undefined;
}

/**
 * Response for image validation endpoint
 */
export interface ImageValidateResponse {
  success: boolean;
  filename?: string | undefined;
  exists?: boolean | undefined;
  path?: string | null | undefined;
  fullPath?: string | undefined;
  timestamp?: string | undefined;
  error?: string | undefined;
  code?: string | undefined;
}

/**
 * Query params for stock catalog
 */
export interface StockCatalogQuery {
  category?: string | undefined;
}

/**
 * Query params for stock image serving
 */
export interface StockImageQuery {
  size?: 'thumb' | string | undefined;
}
