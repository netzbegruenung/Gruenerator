/**
 * ts-rest contract for the public, unauthenticated board endpoint.
 *
 * Kept separate from boardsContract because GET /api/boards/public/:id must be
 * mounted BEFORE the requireAuth gate (see apps/api/routes.ts). Folding it into
 * boardsContract would risk a future edit auth-gating a public share link.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { publicBoardResponseSchema, boardErrorResponseSchema } from '../schemas/boards.js';

const c = initContract();

export const publicBoardsContract = c.router(
  {
    /** GET /api/boards/public/:id (no auth) */
    getPublicBoard: {
      method: 'GET',
      path: '/api/boards/public/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: publicBoardResponseSchema,
        404: boardErrorResponseSchema,
        500: boardErrorResponseSchema,
      },
      summary: 'Resolve a publicly shared board',
    },
  },
  { pathPrefix: '' }
);
