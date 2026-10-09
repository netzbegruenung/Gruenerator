/**
 * ts-rest contract for opening an explainable by share token.
 *
 * Kept separate from explainablesContract because it must be mounted BEFORE
 * the requireAuth gate (optionalAuth): `public` links work logged out, while
 * `authenticated` links answer 401 with `share_mode` so the page can ask for a
 * login instead of showing a dead link.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { explainableDtoSchema, explainableErrorSchema } from '../schemas/explainables.js';

const c = initContract();

export const publicExplainablesContract = c.router(
  {
    getShared: {
      method: 'GET',
      path: '/api/explainables/shared/:token',
      pathParams: z.object({ token: z.string().regex(/^[a-f0-9]{32}$/) }),
      responses: {
        200: explainableDtoSchema,
        401: explainableErrorSchema,
        404: explainableErrorSchema,
      },
      summary: 'Resolve a shared explainable',
    },
  },
  { pathPrefix: '' }
);
