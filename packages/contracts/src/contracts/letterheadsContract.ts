/**
 * ts-rest contract for a user's letterheads (Absender for the PDF export).
 *
 * User-scoped: every handler filters by the authenticated user, so a guessed id
 * cannot read or overwrite someone else's Absender. Auth via `requireAuth` at
 * the /api/auth prefix.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  letterheadCreateBodySchema,
  letterheadErrorSchema,
  letterheadListResponseSchema,
  letterheadResponseSchema,
  letterheadUpdateBodySchema,
} from '../schemas/letterhead.js';

const c = initContract();

export const letterheadsContract = c.router(
  {
    listLetterheads: {
      method: 'GET',
      path: '/api/auth/letterheads',
      responses: {
        200: letterheadListResponseSchema,
        401: letterheadErrorSchema,
        500: letterheadErrorSchema,
      },
      summary: 'List the letterheads of the account',
    },

    createLetterhead: {
      method: 'POST',
      path: '/api/auth/letterheads',
      body: letterheadCreateBodySchema,
      responses: {
        201: letterheadResponseSchema,
        401: letterheadErrorSchema,
        // Labels are unique per user — the picker must stay unambiguous.
        409: letterheadErrorSchema,
        500: letterheadErrorSchema,
      },
      summary: 'Create a letterhead',
    },

    updateLetterhead: {
      method: 'PATCH',
      path: '/api/auth/letterheads/:id',
      pathParams: z.object({ id: z.string() }),
      body: letterheadUpdateBodySchema,
      responses: {
        200: letterheadResponseSchema,
        401: letterheadErrorSchema,
        404: letterheadErrorSchema,
        409: letterheadErrorSchema,
        500: letterheadErrorSchema,
      },
      summary: 'Update a letterhead',
    },

    deleteLetterhead: {
      method: 'DELETE',
      path: '/api/auth/letterheads/:id',
      pathParams: z.object({ id: z.string() }),
      body: z.object({}).optional(),
      responses: {
        200: z.object({ success: z.literal(true) }),
        401: letterheadErrorSchema,
        404: letterheadErrorSchema,
        500: letterheadErrorSchema,
      },
      summary: 'Delete a letterhead',
    },
  },
  { pathPrefix: '' }
);
