/**
 * Image Routes - Main Entry Point
 *
 * Aggregates all image-related controllers and exports them individually.
 * This allows flexibility in how routes are mounted in the main app.
 *
 * Controllers:
 * - generationController: Image generation limits and status (/api/image-generation)
 * - pickerController: AI-powered image selection (/api/image-picker)
 */

import generationController from './generationController.js';
import pickerController from './pickerController.js';

export { generationController, pickerController };

export type {
  AuthenticatedRequest,
  GenerationStatusResponse,
  GenerationIncrementResponse,
  GenerationResetResponse,
  ImageSelectRequestBody,
  ImageValidateRequestBody,
  ImageSelectResponse,
  ImagePickerStatsResponse,
  ImageCatalogResponse,
  CacheClearResponse,
  ImageValidateResponse,
  StockCatalogResponse,
  StockCatalogQuery,
  StockImageQuery,
} from './types.js';
