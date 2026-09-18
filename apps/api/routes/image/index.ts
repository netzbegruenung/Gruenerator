/**
 * Image Routes - Main Entry Point
 *
 * Aggregates all image-related controllers and exports them individually.
 * This allows flexibility in how routes are mounted in the main app.
 *
 * Controllers:
 * - pickerController: AI-powered image selection (/api/image-picker)
 */

import pickerController from './pickerController.js';

export { pickerController };

export type {
  AuthenticatedRequest,
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
