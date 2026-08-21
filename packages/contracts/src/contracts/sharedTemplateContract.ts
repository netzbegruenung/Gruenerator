/**
 * ts-rest contract for the link-shared view of a Grünerator-Vorlage.
 *
 * Mounted under `/api/vorlagen` with `optionalAuth` (NOT requireAuth): a
 * Vorlage shared with `share_mode='public'` must be readable without a login,
 * which is the whole point of the öffentliche Link. The handler decides per
 * request — 401 when the link needs an account, 404 when it is private or
 * simply not shared.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  sharedTemplateErrorResponseSchema,
  sharedTemplateResponseSchema,
} from '../schemas/sharedTemplate.js';

const c = initContract();

export const sharedTemplateContract = c.router(
  {
    /**
     * GET /api/vorlagen/geteilt/:id — the shared card for one Vorlage.
     * Declared before the legacy `/api/vorlagen/search` router is mounted; the
     * paths do not overlap.
     */
    getShared: {
      method: 'GET',
      path: '/api/vorlagen/geteilt/:id',
      pathParams: z.object({ id: z.string() }),
      responses: {
        200: sharedTemplateResponseSchema,
        401: sharedTemplateErrorResponseSchema,
        404: sharedTemplateErrorResponseSchema,
        500: sharedTemplateErrorResponseSchema,
      },
      summary: 'Read a link-shared Vorlage',
    },
  },
  { pathPrefix: '' }
);
