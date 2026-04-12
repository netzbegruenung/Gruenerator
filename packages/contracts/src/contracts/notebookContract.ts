/**
 * ts-rest contract for /api/auth/notebook (interaction routes).
 *
 * Covers the 5 endpoints in apps/api/routes/notebook/interactionController.ts.
 * The /api/auth/notebook-collections CRUD surface (collectionsController.ts,
 * 10 routes) is NOT in scope for this contract — see the roadmap Phase 4.1
 * batch plan.
 *
 * Mixed authentication: `getFilters` and the two `/public/*` routes do NOT
 * require auth; `askMulti` and `askSingle` do. Auth is enforced per-handler
 * in the contract router, not via prefix middleware.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  askQuestionBodySchema,
  notebookErrorResponseSchema,
  notebookFiltersResponseSchema,
  notebookPublicCollectionResponseSchema,
  notebookQAResponseSchema,
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
