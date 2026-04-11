/**
 * ts-rest contract for /api/search
 *
 * Covers the standard web search endpoint.
 * The deep-research and analyze endpoints are excluded from the pilot —
 * their response shapes are large and AI-generated; model them incrementally.
 */
import { initContract } from '@ts-rest/core';

import {
  searchBodySchema,
  searchResponseSchema,
  searchErrorResponseSchema,
  searchStatusResponseSchema,
} from '../schemas/search.js';

const c = initContract();

export const searchContract = c.router(
  {
    /**
     * POST /api/search
     * Standard web search. Returns structured results with optional AI summary.
     */
    search: {
      method: 'POST',
      path: '/api/search',
      body: searchBodySchema,
      responses: {
        200: searchResponseSchema,
        400: searchErrorResponseSchema,
        500: searchErrorResponseSchema,
      },
      summary: 'Web search with optional AI summary',
    },

    /**
     * GET /api/search/status
     * Health/status of the search service.
     */
    status: {
      method: 'GET',
      path: '/api/search/status',
      responses: {
        200: searchStatusResponseSchema,
        503: searchStatusResponseSchema,
      },
      summary: 'Search service health check',
    },
  },
  { pathPrefix: '' }
);
