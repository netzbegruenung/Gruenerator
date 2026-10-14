/**
 * ts-rest contract for the owner's explainable endpoints. Mounted behind
 * requireAuth; binary routes (images, PDF) are plain Express next to it.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  createExplainableBodySchema,
  createExplainableResponseSchema,
  explainableDtoSchema,
  explainableErrorSchema,
  explainableShareResponseSchema,
  updateExplainableShareBodySchema,
} from '../schemas/explainables.js';

const c = initContract();

export const explainablesContract = c.router(
  {
    /** POST /api/explainables — from a persisted notebook answer */
    createFromMessage: {
      method: 'POST',
      path: '/api/explainables',
      body: createExplainableBodySchema,
      responses: {
        201: createExplainableResponseSchema,
        400: explainableErrorSchema,
        404: explainableErrorSchema,
        429: explainableErrorSchema,
        500: explainableErrorSchema,
        503: explainableErrorSchema,
      },
      summary: 'Create an explainable from a notebook answer',
    },
    /** :ref = slug suffix (from /erklaert/<slug>-<suffix>) or raw uuid */
    get: {
      method: 'GET',
      path: '/api/explainables/:ref',
      pathParams: z.object({ ref: z.string().min(1).max(200) }),
      responses: {
        200: explainableDtoSchema,
        404: explainableErrorSchema,
      },
      summary: 'Get an own explainable',
    },
    updateShare: {
      method: 'PATCH',
      path: '/api/explainables/:id/share',
      pathParams: z.object({ id: z.string().uuid() }),
      body: updateExplainableShareBodySchema,
      responses: {
        200: explainableShareResponseSchema,
        404: explainableErrorSchema,
      },
      summary: 'Change who can open the share link',
    },
    remove: {
      method: 'DELETE',
      path: '/api/explainables/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: c.noBody(),
      responses: {
        200: z.object({ success: z.literal(true) }),
        404: explainableErrorSchema,
      },
      summary: 'Move an explainable to the Papierkorb',
    },
  },
  { pathPrefix: '' }
);
