/**
 * ts-rest contract for image picker endpoints.
 *
 * Covers:
 *   apps/api/routes/image/pickerController.ts — all JSON routes
 *
 * Mount prefix: /api/image-picker
 *
 * Skipped routes (binary file serving):
 *   GET /stock-image/:filename — serves image bytes directly via res.sendFile
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  imageSelectBodySchema,
  imageValidateBodySchema,
  imageDownloadTrackBodySchema,
  imageSelectResponseSchema,
  imageStatsResponseSchema,
  imageCatalogResponseSchema,
  cacheClearResponseSchema,
  imageValidateResponseSchema,
  stockCatalogResponseSchema,
  downloadTrackResponseSchema,
  imagePickerErrorResponseSchema,
} from '../schemas/imagePicker.js';

const c = initContract();

export const imagePickerContract = c.router(
  {
    /**
     * POST /api/image-picker/select
     * Select the best background image for given text using AI.
     */
    select: {
      method: 'POST',
      path: '/api/image-picker/select',
      body: imageSelectBodySchema,
      responses: {
        200: imageSelectResponseSchema,
        400: imagePickerErrorResponseSchema,
        500: imagePickerErrorResponseSchema,
      },
      summary: 'AI-powered image selection for given text',
    },

    /**
     * GET /api/image-picker/stats
     * Get image picker service statistics.
     */
    getStats: {
      method: 'GET',
      path: '/api/image-picker/stats',
      responses: {
        200: imageStatsResponseSchema,
        500: imagePickerErrorResponseSchema,
      },
      summary: 'Get image picker service statistics',
    },

    /**
     * GET /api/image-picker/catalog
     * Get the full image catalog.
     */
    getCatalog: {
      method: 'GET',
      path: '/api/image-picker/catalog',
      responses: {
        200: imageCatalogResponseSchema,
        500: imagePickerErrorResponseSchema,
      },
      summary: 'Get the full image catalog',
    },

    /**
     * POST /api/image-picker/clear-cache
     * Clear the selection cache.
     */
    clearCache: {
      method: 'POST',
      path: '/api/image-picker/clear-cache',
      body: c.noBody(),
      responses: {
        200: cacheClearResponseSchema,
        500: imagePickerErrorResponseSchema,
      },
      summary: 'Clear the image selection cache',
    },

    /**
     * POST /api/image-picker/validate
     * Validate that an image file exists.
     */
    validate: {
      method: 'POST',
      path: '/api/image-picker/validate',
      body: imageValidateBodySchema,
      responses: {
        200: imageValidateResponseSchema,
        400: imagePickerErrorResponseSchema,
        500: imagePickerErrorResponseSchema,
      },
      summary: 'Validate that an image file exists',
    },

    /**
     * GET /api/image-picker/stock-catalog
     * Get stock images with Unsplash attribution for frontend display.
     */
    getStockCatalog: {
      method: 'GET',
      path: '/api/image-picker/stock-catalog',
      query: z.object({ category: z.string().nullish() }),
      responses: {
        200: stockCatalogResponseSchema,
        404: imagePickerErrorResponseSchema,
        500: imagePickerErrorResponseSchema,
      },
      summary: 'Get stock image catalog with attribution',
    },

    /**
     * POST /api/image-picker/download-track
     * Track an Unsplash image download (required by Unsplash guidelines).
     */
    downloadTrack: {
      method: 'POST',
      path: '/api/image-picker/download-track',
      body: imageDownloadTrackBodySchema,
      responses: {
        200: downloadTrackResponseSchema,
        500: imagePickerErrorResponseSchema,
      },
      summary: 'Track an Unsplash image download',
    },
  },
  { pathPrefix: '' }
);
