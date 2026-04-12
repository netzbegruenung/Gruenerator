/**
 * ts-rest contract for the Unsplash image API proxy.
 *
 * Covers:
 * - apps/api/routes/unsplash/unsplashRoutes.ts
 *
 * This is a thin backend proxy to Unsplash's REST API. Response shapes
 * for 200 OK use z.unknown() — external: Unsplash REST API response.
 * The only validated fields are those the frontend is known to depend on.
 *
 * Routes are public (no requireAuth).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  unsplashSearchQuerySchema,
  unsplashSearchResponseSchema,
  trackDownloadBodySchema,
  trackDownloadResponseSchema,
  unsplashErrorSchema,
  unsplashRateLimitErrorSchema,
} from '../schemas/unsplash.js';

const c = initContract();

export const unsplashContract = c.router(
  {
    /**
     * GET /api/unsplash/search
     *
     * Search Unsplash photos. The response body matches the Unsplash REST API
     * shape: { results: StockImage[], total: number, total_pages: number }.
     */
    searchPhotos: {
      method: 'GET',
      path: '/api/unsplash/search',
      query: unsplashSearchQuerySchema,
      responses: {
        200: unsplashSearchResponseSchema, // external: Unsplash REST API v1 search response
        400: unsplashErrorSchema,
        429: unsplashRateLimitErrorSchema,
        500: unsplashErrorSchema,
      },
      summary: 'Search Unsplash photos',
    },

    /**
     * POST /api/unsplash/track-download
     *
     * Trigger an Unsplash download tracking event (API compliance).
     * The response is always 200 regardless of tracking success.
     */
    trackDownload: {
      method: 'POST',
      path: '/api/unsplash/track-download',
      body: trackDownloadBodySchema,
      responses: {
        200: trackDownloadResponseSchema,
        400: unsplashErrorSchema,
        500: unsplashErrorSchema,
      },
      summary: 'Track an Unsplash photo download (API compliance)',
    },
  },
  { pathPrefix: '' }
);
