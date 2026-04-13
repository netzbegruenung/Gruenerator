/**
 * ts-rest contract for /api/recent-values
 *
 * Covers the full surface of recentValuesController.ts.
 * This is a high-traffic endpoint (called on every form field focus).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  saveRecentValueBodySchema,
  saveRecentValueResponseSchema,
  getRecentValuesResponseSchema,
  clearRecentValuesResponseSchema,
  getFieldTypesResponseSchema,
  recentValueErrorResponseSchema,
} from '../schemas/recentValues.js';

const c = initContract();

export const recentValuesContract = c.router(
  {
    /**
     * GET /api/recent-values
     * List all field types with their usage counts for the current user.
     */
    listFieldTypes: {
      method: 'GET',
      path: '/api/recent-values',
      responses: {
        200: getFieldTypesResponseSchema,
        500: recentValueErrorResponseSchema,
      },
      summary: 'List field types with counts',
    },

    /**
     * GET /api/recent-values/:fieldType
     * Get recent values for a specific field type.
     * Optional ?limit=N query param (defaults to 5 on the backend).
     */
    getByFieldType: {
      method: 'GET',
      path: '/api/recent-values/:fieldType',
      pathParams: z.object({ fieldType: z.string() }),
      query: z.object({
        limit: z.string().optional(), // query params are always strings
      }),
      responses: {
        200: getRecentValuesResponseSchema,
        400: recentValueErrorResponseSchema,
        500: recentValueErrorResponseSchema,
      },
      summary: 'Get recent values for a field type',
    },

    /**
     * POST /api/recent-values
     * Save a new recent value (upserts to top of list).
     */
    save: {
      method: 'POST',
      path: '/api/recent-values',
      body: saveRecentValueBodySchema,
      responses: {
        201: saveRecentValueResponseSchema,
        400: recentValueErrorResponseSchema,
        500: recentValueErrorResponseSchema,
      },
      summary: 'Save a recent value',
    },

    /**
     * DELETE /api/recent-values/:fieldType
     * Clear all recent values for a field type.
     */
    clearByFieldType: {
      method: 'DELETE',
      path: '/api/recent-values/:fieldType',
      pathParams: z.object({ fieldType: z.string() }),
      body: c.noBody(),
      responses: {
        200: clearRecentValuesResponseSchema,
        400: recentValueErrorResponseSchema,
        500: recentValueErrorResponseSchema,
      },
      summary: 'Clear recent values for a field type',
    },
  },
  { pathPrefix: '' }
);
