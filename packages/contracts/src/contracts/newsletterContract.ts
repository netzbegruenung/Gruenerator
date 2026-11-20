/**
 * ts-rest contract for the one-click newsletter signup.
 *
 * POST /api/newsletter/subscribe — starts Brevo's double opt-in for the
 * signed-in person's account address. Auth is applied at the prefix in routes.ts.
 */
import { initContract } from '@ts-rest/core';

import {
  newsletterErrorSchema,
  newsletterSubscribeBodySchema,
  newsletterSubscribeResponseSchema,
} from '../schemas/newsletter.js';

const c = initContract();

export const newsletterContract = c.router(
  {
    subscribe: {
      method: 'POST',
      path: '/api/newsletter/subscribe',
      body: newsletterSubscribeBodySchema,
      responses: {
        200: newsletterSubscribeResponseSchema,
        202: newsletterSubscribeResponseSchema,
        422: newsletterErrorSchema,
        500: newsletterErrorSchema,
        502: newsletterErrorSchema,
        503: newsletterErrorSchema,
      },
      summary: 'Grünerator-Newsletter abonnieren (Double-Opt-In; ohne Adresse die des Kontos)',
    },
  },
  { pathPrefix: '' }
);
