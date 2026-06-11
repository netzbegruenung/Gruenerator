/**
 * ts-rest contract for /api/auth/notebook (interaction routes).
 *
 * QA interaction, research search, recent documents, statistics, and public
 * token access. The /api/auth/notebook-collections CRUD surface lives in
 * notebookCollectionsContract.
 *
 * Mixed authentication: `getFilters`, recent/stats, and the two `/public/*`
 * routes do NOT require auth; `askMulti` and `askSingle` do. Auth is enforced
 * per-handler in the contract router, not via prefix middleware.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  askQuestionBodySchema,
  notebookErrorResponseSchema,
  notebookFiltersResponseSchema,
  notebookPublicCollectionResponseSchema,
  notebookQAResponseSchema,
  notebookRecentResponseSchema,
  notebookResearchSearchBodySchema,
  notebookResearchSearchResponseSchema,
  notebookStatsResponseSchema,
} from '../schemas/notebook.js';

const c = initContract();

export const notebookContract = c.router(
  {
    /**
     * GET /api/auth/notebook/collections/:id/filters
     * Get available filter values for a system collection.
     * No auth required — returns empty filter map for unknown collections.
     */
    getFilters: {
      method: 'GET',
      path: '/api/auth/notebook/collections/:id/filters',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: notebookFiltersResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Get filter values for a notebook collection',
    },

    /**
     * POST /api/auth/notebook/multi/ask
     * Ask a question across multiple system collections.
     * Requires authentication (req.user).
     */
    askMulti: {
      method: 'POST',
      path: '/api/auth/notebook/multi/ask',
      body: askQuestionBodySchema,
      responses: {
        200: notebookQAResponseSchema,
        400: notebookErrorResponseSchema,
        401: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Ask a question across multiple collections',
    },

    /**
     * POST /api/auth/notebook/:id/ask
     * Ask a question of a single collection owned by the user.
     * Requires authentication.
     */
    askSingle: {
      method: 'POST',
      path: '/api/auth/notebook/:id/ask',
      pathParams: z.object({ id: z.string() }),
      body: askQuestionBodySchema,
      responses: {
        200: notebookQAResponseSchema,
        400: notebookErrorResponseSchema,
        401: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Ask a question of a single collection',
    },

    /**
     * POST /api/auth/notebook/:id/research-search
     * Chunk-level manual research search over a single user-owned notebook.
     * Requires authentication + ownership. System collection IDs are rejected
     * here — use the `/research/search` route for those.
     */
    researchSearch: {
      method: 'POST',
      path: '/api/auth/notebook/:id/research-search',
      pathParams: z.object({ id: z.string() }),
      body: notebookResearchSearchBodySchema,
      responses: {
        200: notebookResearchSearchResponseSchema,
        400: notebookErrorResponseSchema,
        401: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Manual research over a single user-owned notebook (chunk-level)',
    },

    /**
     * GET /api/auth/notebook/collections/:id/recent
     * Most recently published documents of a single system collection.
     * No auth required (system-collection data only).
     */
    getCollectionRecent: {
      method: 'GET',
      path: '/api/auth/notebook/collections/:id/recent',
      pathParams: z.object({ id: z.string() }),
      query: z.object({ limit: z.string().nullish() }),
      responses: {
        200: notebookRecentResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Recently published documents of a notebook collection',
    },

    /**
     * GET /api/auth/notebook/recent
     * Merged recent documents across multiple system collections.
     * No auth required (system-collection data only).
     */
    getRecent: {
      method: 'GET',
      path: '/api/auth/notebook/recent',
      query: z.object({ collections: z.string(), limit: z.string().nullish() }),
      responses: {
        200: notebookRecentResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Recently published documents across notebook collections',
    },

    /**
     * GET /api/auth/notebook/collections/:id/stats
     * Aggregated statistics for a single system collection (24h server cache).
     */
    getCollectionStats: {
      method: 'GET',
      path: '/api/auth/notebook/collections/:id/stats',
      pathParams: z.object({ id: z.string() }),
      query: z.object({ refresh: z.string().nullish() }),
      responses: {
        200: notebookStatsResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Statistics for a notebook collection',
    },

    /**
     * GET /api/auth/notebook/stats
     * Merged statistics across multiple system collections.
     */
    getStats: {
      method: 'GET',
      path: '/api/auth/notebook/stats',
      query: z.object({ collections: z.string(), refresh: z.string().nullish() }),
      responses: {
        200: notebookStatsResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Statistics across notebook collections',
    },

    /**
     * GET /api/auth/notebook/public/:token
     * Token-gated public read access to a notebook collection metadata.
     * No auth required — access is enforced via the token itself.
     */
    getPublic: {
      method: 'GET',
      path: '/api/auth/notebook/public/:token',
      pathParams: z.object({ token: z.string() }),
      responses: {
        200: notebookPublicCollectionResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Read a publicly shared notebook collection',
    },

    /**
     * POST /api/auth/notebook/public/:token/ask
     * Ask a question of a publicly shared notebook collection.
     * No auth required — access is enforced via the token.
     */
    askPublic: {
      method: 'POST',
      path: '/api/auth/notebook/public/:token/ask',
      pathParams: z.object({ token: z.string() }),
      body: askQuestionBodySchema,
      responses: {
        200: notebookQAResponseSchema,
        400: notebookErrorResponseSchema,
        403: notebookErrorResponseSchema,
        404: notebookErrorResponseSchema,
        500: notebookErrorResponseSchema,
      },
      summary: 'Ask a question of a publicly shared collection',
    },
  },
  { pathPrefix: '' }
);
