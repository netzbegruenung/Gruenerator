/**
 * ts-rest contract for /api/trees (read-only).
 *
 * Serves the current user's daily "Bäume" budget. Writes happen server-side
 * from the metered call sites (image editing, Voice, DeepL, Deep Research) —
 * there is no client write endpoint.
 */
import { initContract } from '@ts-rest/core';

import { treeBudgetErrorSchema, treeBudgetStatusSchema } from '../schemas/trees.js';

const c = initContract();

export const treesContract = c.router(
  {
    /**
     * GET /api/trees/me
     * Used, limit, remaining and the next reset for the authenticated user.
     */
    getMyTrees: {
      method: 'GET',
      path: '/api/trees/me',
      responses: {
        200: treeBudgetStatusSchema,
        500: treeBudgetErrorSchema,
        503: treeBudgetErrorSchema,
      },
      summary: "The current user's daily Bäume budget",
    },
  },
  { pathPrefix: '' }
);
