/**
 * ts-rest contract router for /api/unsplash
 *
 * Covers:
 *   GET  /api/unsplash/search          — search photos
 *   POST /api/unsplash/track-download  — track a download (API compliance)
 *
 * Mount BEFORE the legacy unsplashRouter in routes.ts so ts-rest matches
 * its own routes first; unmatched paths (GET /stats, POST /clear-cache)
 * fall through to the legacy router.
 *
 * Authentication: routes are public — consistent with existing
 * publicReadLimiter-only mount in routes.ts.
 */

import { unsplashContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  getUnsplashService,
  UnsplashApiError,
  UnsplashRateLimitError,
} from '../../services/unsplash/UnsplashApiService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('unsplashContract');

const s = initServer();

export const unsplashContractRouter = s.router(unsplashContract, {
  searchPhotos: async (args) => {
    try {
      const queryStr = args.query.query;
      const pageStr = args.query.page ?? null;
      const perPageStr = args.query.per_page ?? null;

      if (!queryStr || queryStr.trim().length === 0) {
        return {
          status: 400 as const,
          body: {
            error: 'Missing or invalid query parameter',
            message: 'Query parameter is required and must be a non-empty string',
          },
        };
      }

      const pageNum = pageStr ? parseInt(pageStr, 10) : 1;
      const perPage = perPageStr ? parseInt(perPageStr, 10) : 20;

      if (isNaN(pageNum) || pageNum < 1) {
        return {
          status: 400 as const,
          body: { error: 'Invalid page parameter', message: 'Page must be a positive integer' },
        };
      }

      if (isNaN(perPage) || perPage < 1 || perPage > 30) {
        return {
          status: 400 as const,
          body: {
            error: 'Invalid per_page parameter',
            message: 'per_page must be between 1 and 30',
          },
        };
      }

      const service = getUnsplashService();
      const result = await service.searchPhotos(queryStr.trim(), pageNum, perPage);
      return { status: 200 as const, body: result };
    } catch (error) {
      log.error('[unsplashContract.searchPhotos] Error:', error);

      if (error instanceof UnsplashRateLimitError) {
        return {
          status: 429 as const,
          body: {
            error: 'Rate limit exceeded',
            message: 'Unsplash API rate limit reached. Please try again later.',
            retryAfter: 3600,
          },
        };
      }

      if (error instanceof UnsplashApiError) {
        // UnsplashApiError has a statusCode — fall through to 500 to avoid
        // dynamic status codes which ts-rest requires to be declared.
        return {
          status: 500 as const,
          body: {
            error: 'Unsplash API error',
            message: (error as Error).message,
          },
        };
      }

      return {
        status: 500 as const,
        body: {
          error: 'Internal server error',
          message: 'Failed to search Unsplash photos',
        },
      };
    }
  },

  trackDownload: async (args) => {
    try {
      const { downloadLocation } = args.body;
      const service = getUnsplashService();
      await service.trackDownload(downloadLocation);
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[unsplashContract.trackDownload] Error:', error);
      // Intentionally non-blocking — return 200 even on failure
      return {
        status: 200 as const,
        body: {
          success: false,
          warning: 'Download tracking failed but request succeeded',
        },
      };
    }
  },
});

/**
 * Mount the Unsplash contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy unsplashRouter.
 */
export function mountUnsplashContractRouter(app: Application): void {
  createExpressEndpoints(unsplashContract, unsplashContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'unsplashContract'),
  });
}
