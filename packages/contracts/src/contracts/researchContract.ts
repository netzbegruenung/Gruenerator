/**
 * ts-rest contract for /api/research/* — manual research over system
 * collections (Grundsatzprogramme, Landesverbände, Bundestagsfraktion, …).
 *
 * Covers the 4 endpoints in apps/api/routes/research/researchContractRouter.ts.
 * All routes are auth-gated via `requireAuth` prefix middleware on
 * `/api/research` (see routes.ts) — not per-handler.
 */
import { initContract } from '@ts-rest/core';

import {
  researchCollectionsResponseSchema,
  researchErrorResponseSchema,
  researchFiltersQuerySchema,
  researchFiltersResponseSchema,
  researchSearchBodySchema,
  researchSearchResponseSchema,
  researchSimilarBodySchema,
} from '../schemas/research.js';

const c = initContract();

export const researchContract = c.router(
  {
    /**
     * GET /api/research/collections
     * List all system collections with their filterable field names.
     */
    collections: {
      method: 'GET',
      path: '/api/research/collections',
      responses: {
        200: researchCollectionsResponseSchema,
        500: researchErrorResponseSchema,
      },
      summary: 'List system research collections',
    },

    /**
     * GET /api/research/filters?collectionIds=a,b
     * Aggregated filter facet values across the requested collections.
     */
    filters: {
      method: 'GET',
      path: '/api/research/filters',
      query: researchFiltersQuerySchema,
      responses: {
        200: researchFiltersResponseSchema,
        400: researchErrorResponseSchema,
        500: researchErrorResponseSchema,
      },
      summary: 'Get aggregated filter values for system collections',
    },

    /**
     * POST /api/research/search
     * Manual research search across one or more system collections.
     */
    search: {
      method: 'POST',
      path: '/api/research/search',
      body: researchSearchBodySchema,
      responses: {
        200: researchSearchResponseSchema,
        400: researchErrorResponseSchema,
        500: researchErrorResponseSchema,
      },
      summary: 'Search system research collections',
    },

    /**
     * POST /api/research/similar
     * Find documents similar to a given source URL within one collection.
     */
    similar: {
      method: 'POST',
      path: '/api/research/similar',
      body: researchSimilarBodySchema,
      responses: {
        200: researchSearchResponseSchema,
        400: researchErrorResponseSchema,
        500: researchErrorResponseSchema,
      },
      summary: 'Find similar documents within a collection',
    },
  },
  { pathPrefix: '' }
);
