/**
 * ts-rest contract router for image picker endpoints.
 *
 * Covers:
 *   POST /api/image-picker/select
 *   GET  /api/image-picker/stats
 *   GET  /api/image-picker/catalog
 *   POST /api/image-picker/clear-cache
 *   POST /api/image-picker/validate
 *   GET  /api/image-picker/stock-catalog
 *   POST /api/image-picker/download-track
 *
 * Mount BEFORE the legacy pickerController router in routes.ts so ts-rest
 * matches its own routes first; unmatched paths fall through to the legacy
 * router (which handles GET /stock-image/:filename binary serving).
 *
 * No requireAuth at prefix — image picker routes are public per legacy router.
 */

import { imagePickerContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import ImageSelectionService from '../../services/image/ImageSelectionService.js';
import { enhanceWithAttribution } from '../../services/image/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';
import { safeFetch } from '../../utils/validation/urlSecurity.js';

import type { Application } from 'express';

const log = createLogger('imagePickerContractRouter');
const imagePickerService = ImageSelectionService;

const s = initServer();

export const imagePickerContractRouter = s.router(imagePickerContract, {
  select: async (args) => {
    try {
      const { text, type: _type, tags: _tags, maxCandidates } = args.body;

      if (!text || text.trim().length === 0) {
        return {
          status: 400 as const,
          body: {
            success: false,
            error: 'Valid text is required for image selection',
            code: 'INVALID_TEXT',
          },
        };
      }

      if (text.length > 2000) {
        return {
          status: 400 as const,
          body: {
            success: false,
            error: 'Text too long (max 2000 characters)',
            code: 'TEXT_TOO_LONG',
          },
        };
      }

      const options: { maxCandidates?: number } = {};
      if (maxCandidates && maxCandidates > 0 && maxCandidates <= 20) {
        options.maxCandidates = maxCandidates;
      }

      const workerPool = getAIWorkerPool(args.req);
      const result = await imagePickerService.selectBestImage(text, workerPool, options, args.req);

      return {
        status: 200 as const,
        body: {
          success: true,
          selectedImage: {
            filename: result.selectedImage.filename,
            category: result.selectedImage.category,
            tags: result.selectedImage.tags,
            alt_text: result.selectedImage.alt_text,
            path: `/api/image-picker/stock-image/${result.selectedImage.filename}`,
          },
          confidence: result.confidence,
          reasoning: result.reasoning,
          alternatives: result.alternatives.map((alt) => ({
            filename: alt.filename,
            category: alt.category,
            tags: alt.tags,
            alt_text: alt.alt_text,
            path: `/api/image-picker/stock-image/${alt.filename}`,
          })),
          metadata: {
            totalImages: result.metadata.totalImages,
            candidatesFound: result.metadata.candidatesFound,
            detectedThemes: result.metadata.themes,
            extractedKeywords: result.metadata.keywords,
            processingTime: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      log.error('[imagePickerContract.select] Error:', error);
      const err = error as Error;
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Internal server error during image selection',
          code: 'SELECTION_ERROR',
          message: err.message,
        },
      };
    }
  },

  getStats: async (_args) => {
    try {
      const stats = imagePickerService.getStats();
      return {
        status: 200 as const,
        body: {
          success: true,
          stats: {
            ...stats,
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
          },
        },
      };
    } catch (error) {
      log.error('[imagePickerContract.getStats] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Failed to get service statistics', code: 'STATS_ERROR' },
      };
    }
  },

  getCatalog: async (_args) => {
    try {
      await imagePickerService.initialize();
      const catalog = imagePickerService.getCatalog();

      return {
        status: 200 as const,
        body: {
          success: true,
          ...(catalog != null && { catalog }),
          count: catalog?.images?.length ?? 0,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      log.error('[imagePickerContract.getCatalog] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Failed to get image catalog', code: 'CATALOG_ERROR' },
      };
    }
  },

  clearCache: async (_args) => {
    try {
      imagePickerService.clearCache();
      return {
        status: 200 as const,
        body: {
          success: true,
          message: 'Cache cleared successfully',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      log.error('[imagePickerContract.clearCache] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Failed to clear cache', code: 'CACHE_CLEAR_ERROR' },
      };
    }
  },

  validate: async (args) => {
    try {
      const { filename } = args.body;
      const exists = await imagePickerService.validateImageExists(filename);
      const imagePath = imagePickerService.getImagePath(filename);

      return {
        status: 200 as const,
        body: {
          success: true,
          filename,
          exists,
          path: exists ? `/api/image-picker/stock-image/${filename}` : null,
          fullPath: imagePath,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      log.error('[imagePickerContract.validate] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, error: 'Failed to validate image', code: 'VALIDATION_ERROR' },
      };
    }
  },

  getStockCatalog: async (args) => {
    try {
      const category = args.query.category ?? undefined;

      await imagePickerService.initialize();
      const catalog = imagePickerService.getCatalog();

      if (!catalog?.images) {
        return {
          status: 404 as const,
          body: {
            success: false,
            error: 'Image catalog not found',
            code: 'CATALOG_NOT_FOUND',
          },
        };
      }

      let images = catalog.images.map(enhanceWithAttribution);

      if (category && category !== 'all') {
        images = images.filter((img) => img.category === category);
      }

      const categories = [...new Set(catalog.images.map((img) => img.category))].sort();

      return {
        status: 200 as const,
        body: {
          success: true,
          images: images as Record<string, unknown>[],
          count: images.length,
          totalCount: catalog.images.length,
          categories,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      log.error('[imagePickerContract.getStockCatalog] Error:', error);
      const err = error as Error;
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Failed to get stock image catalog',
          code: 'STOCK_CATALOG_ERROR',
          message: err.message,
        },
      };
    }
  },

  downloadTrack: async (args) => {
    try {
      const { filename, downloadLocation } = args.body;

      if (downloadLocation) {
        try {
          await safeFetch(downloadLocation, {}, { allowedHosts: ['api.unsplash.com'] });
          log.debug(`[imagePickerContract] Download tracked for ${filename}`);
        } catch (error) {
          log.warn(`[imagePickerContract] Failed to track download for ${filename}:`, error);
        }
      }

      return {
        status: 200 as const,
        body: {
          success: true,
          tracked: !!downloadLocation,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      log.error('[imagePickerContract.downloadTrack] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Failed to track download',
          code: 'DOWNLOAD_TRACK_ERROR',
        },
      };
    }
  },
});

/**
 * Mount the ts-rest image picker contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy pickerController router.
 */
export function mountImagePickerContractRouter(app: Application): void {
  createExpressEndpoints(imagePickerContract, imagePickerContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'imagePickerContract'),
  });
}
