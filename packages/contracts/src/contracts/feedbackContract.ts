/**
 * ts-rest contract for the in-app feedback widget.
 *
 * POST /api/feedback → emails the reported feedback (message + page context +
 * optional screenshot) to the operator. Auth-protected (requireAuth at prefix
 * in routes.ts), so the handler can attribute feedback to the signed-in user.
 */
import { initContract } from '@ts-rest/core';

import {
  feedbackErrorSchema,
  feedbackSubmitResponseSchema,
  feedbackSubmitSchema,
} from '../schemas/feedback.js';

const c = initContract();

export const feedbackContract = c.router(
  {
    submit: {
      method: 'POST',
      path: '/api/feedback',
      body: feedbackSubmitSchema,
      responses: {
        200: feedbackSubmitResponseSchema,
        400: feedbackErrorSchema,
        401: feedbackErrorSchema,
        500: feedbackErrorSchema,
        502: feedbackErrorSchema,
        503: feedbackErrorSchema,
      },
      summary: 'Nutzer-Feedback per E-Mail an den Betreiber senden',
    },
  },
  { pathPrefix: '' }
);
