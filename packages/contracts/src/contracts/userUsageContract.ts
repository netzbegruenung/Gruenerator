/**
 * ts-rest contract for /api/usage (read-only).
 *
 * Serves the current user's own consumption statistics for the profile
 * "Nutzung" tab. Writes happen server-side from the AI call sites via
 * UsageTrackingService — there is no client write endpoint.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { getUserUsageResponseSchema, userUsageErrorResponseSchema } from '../schemas/userUsage.js';

const c = initContract();

export const userUsageContract = c.router(
  {
    /**
     * GET /api/usage/me?days=30
     * Totals, daily series and breakdowns for the authenticated user.
     */
    getMyUsage: {
      method: 'GET',
      path: '/api/usage/me',
      // Optional, not `.default()`: a defaulted field types the parsed query as
      // required `number`, which no longer satisfies Express' ParsedQs index
      // signature and breaks the shared validation-error handler's typing.
      query: z.object({
        days: z.coerce.number().int().min(1).max(365).optional(),
      }),
      responses: {
        200: getUserUsageResponseSchema,
        400: userUsageErrorResponseSchema,
        500: userUsageErrorResponseSchema,
      },
      summary: "Get the current user's AI consumption statistics",
    },
  },
  { pathPrefix: '' }
);
