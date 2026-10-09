/**
 * ts-rest contract for the Grünerator-Vorlagen catalogue of sharepics.
 *
 * Mount prefix: /api/sharepic-vorlagen
 *
 * The thumbnail (`GET /api/sharepic-vorlagen/:id/thumb`) is binary and stays a
 * plain Express route next to this one.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  sharepicVorlageIdSchema,
  sharepicVorlageSchema,
  sharepicVorlagenErrorSchema,
  sharepicVorlagenListResponseSchema,
  vorlagenLandQuerySchema,
} from '../schemas/sharepicVorlagen.js';

const c = initContract();

export const sharepicVorlagenContract = c.router(
  {
    list: {
      method: 'GET',
      path: '/api/sharepic-vorlagen',
      query: vorlagenLandQuerySchema,
      responses: {
        200: sharepicVorlagenListResponseSchema,
        401: sharepicVorlagenErrorSchema,
      },
      summary:
        "The Vorlagen of the viewer's country, detected from the profile; instance admins may pick the other with `land`",
    },
    get: {
      method: 'GET',
      path: '/api/sharepic-vorlagen/:id',
      pathParams: z.object({ id: sharepicVorlageIdSchema }),
      responses: {
        200: sharepicVorlageSchema,
        401: sharepicVorlagenErrorSchema,
        404: sharepicVorlagenErrorSchema,
      },
      summary: 'One Vorlage, to compose and copy into a new canvas',
    },
  },
  { pathPrefix: '' }
);
