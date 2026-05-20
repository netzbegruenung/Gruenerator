/**
 * ts-rest contract for user-facing email endpoints.
 *
 * Currently exposes only the diagnostic `test` endpoint used by the
 * profile → notifications page to verify SMTP connectivity.
 *
 * Auth-protected (requireAuth at prefix in routes.ts).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { emailTestErrorResponseSchema, emailTestResponseSchema } from '../schemas/email.js';

const c = initContract();

export const emailContract = c.router(
  {
    /**
     * POST /api/email/test
     * Sends a test email to the authenticated user's own email address.
     * Reveals SMTP configuration state in the response so the UI can
     * distinguish "creds missing on server" from "send failed".
     */
    test: {
      method: 'POST',
      path: '/api/email/test',
      body: z.object({}),
      responses: {
        200: emailTestResponseSchema,
        400: emailTestErrorResponseSchema,
        401: emailTestErrorResponseSchema,
        500: emailTestErrorResponseSchema,
        502: emailTestErrorResponseSchema,
        503: emailTestErrorResponseSchema,
      },
      summary: 'Send a test email to the authenticated user',
    },
  },
  { pathPrefix: '' }
);
