/**
 * ts-rest contract for the daily briefing (`/api/briefing`).
 *
 * Mirrors apps/api/routes/briefing/briefingContractRouter.ts. Auth sits on the
 * prefix in routes.ts; the user is always the authenticated one.
 */
import { initContract } from '@ts-rest/core';

import {
  briefingDevRerunBodySchema,
  briefingErrorResponseSchema,
  briefingOkResponseSchema,
  briefingOpenedParamsSchema,
  briefingTodayResponseSchema,
} from '../schemas/briefing.js';

const c = initContract();

const errors = {
  401: briefingErrorResponseSchema,
  500: briefingErrorResponseSchema,
} as const;

export const briefingContract = c.router(
  {
    /** Build today's briefing if it does not exist yet. Idempotent per user and day. */
    today: {
      method: 'POST',
      path: '/api/briefing/today',
      body: c.noBody(),
      responses: { 200: briefingTodayResponseSchema, ...errors },
      summary: "Ensure today's briefing",
    },
    /** The person opened the briefing thread (sidebar or bell): clears both markers. */
    opened: {
      method: 'POST',
      path: '/api/briefing/:threadId/opened',
      pathParams: briefingOpenedParamsSchema,
      body: c.noBody(),
      responses: { 200: briefingOkResponseSchema, 404: briefingErrorResponseSchema, ...errors },
      summary: 'Mark a briefing as opened',
    },
    /** Development only (404 elsewhere): drop today's briefing and build it again. */
    devRerun: {
      method: 'POST',
      path: '/api/dev/briefing/rerun',
      body: briefingDevRerunBodySchema,
      responses: { 200: briefingTodayResponseSchema, 404: briefingErrorResponseSchema, ...errors },
      summary: 'Rebuild the briefing (dev auth bypass only)',
    },
  },
  { pathPrefix: '' }
);
