/**
 * Image Routes - Type Definitions
 */

import { Request } from 'express';
import { UserProfile } from '../../services/user/types.js';
import type {
  ImageGenerationStatus,
  ImageGenerationResult,
} from '../../services/counters/types.js';
import type { ImageCatalogEntry } from '../../services/image/types.js';

// ============================================================================
// Request Types
// ============================================================================

/**
 * Base authenticated request with user attached
 */
export interface AuthenticatedRequest extends Request {
  user?: UserProfile;
  app: Request['app'] & {
    locals: {
      aiWorkerPool?: any;
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
  error?: string;
}

/**
 * Response for increment endpoint
 */
export interface GenerationIncrementResponse {
  success: boolean;
  data?: ImageGenerationResult;
  error?: string;
}

/**
 * Response for reset endpoint
 */
export interface GenerationResetResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ============================================================================
// Image Picker Types
// ============================================================================

/**
 * Request body for image selection
 */
export interface ImageSelectRequestBody {
  text: string;
  type?: string;
  tags?: string[];
  maxCandidates?: number;
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
  selectedImage?: SelectedImageResponse;
  confidence?: number;
  reasoning?: string;
  alternatives?: SelectedImageResponse[];
  metadata?: {
    totalImages: number;
    candidatesFound: number;
    detectedThemes: string[];
    extractedKeywords: string[];
    processingTime: string;
  };
  error?: string;
  code?: string;
  message?: string;
}

/**
 * Response for stats endpoint
 */
export interface ImagePickerStatsResponse {
  success: boolean;
  stats?: {
    uptime: number;
    timestamp: string;
    [key: string]: any;
  };
  error?: string;
  code?: string;
}

/**
 * Response for catalog endpoint
 */
export interface ImageCatalogResponse {
  success: boolean;
  catalog?: {
    images: ImageCatalogEntry[];
    [key: string]: any;
  };
  count?: number;
  timestamp?: string;
  error?: string;
  code?: string;
}

/**
 * Response for stock catalog with attribution
 */
export interface StockCatalogResponse {
  success: boolean;
  images?: any[];
  count?: number;
  totalCount?: number;
  categories?: string[];
  timestamp?: string;
  error?: string;
  code?: string;
  message?: string;
}

/**
 * Response for cache clear endpoint
 */
export interface CacheClearResponse {
  success: boolean;
  message?: string;
  timestamp?: string;
  error?: string;
  code?: string;
}

/**
 * Response for image validation endpoint
 */
export interface ImageValidateResponse {
  success: boolean;
  filename?: string;
  exists?: boolean;
  path?: string | null;
  fullPath?: string;
  timestamp?: string;
  error?: string;
  code?: string;
}

/**
 * Query params for stock catalog
 */
export interface StockCatalogQuery {
  category?: string;
}

/**
 * Query params for stock image serving
 */
export interface StockImageQuery {
  size?: 'thumb' | string;
}
