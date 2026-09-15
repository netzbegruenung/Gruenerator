/**
 * ts-rest contract for /api/transparency (public, read-only).
 *
 * Platform-wide consumption and environmental footprint for the public
 * transparency page. No authentication: the response contains no per-user
 * value by construction, and requiring a login to see what the platform costs
 * would defeat the point of publishing it.
 *
 * The write path is the same one that feeds the personal usage tab —
 * UsageTrackingService, from the AI call sites. There is no client write
 * endpoint here either.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  getTransparencyStatsResponseSchema,
  transparencyErrorResponseSchema,
  transparencyLocaleSchema,
} from '../schemas/transparency.js';

const c = initContract();

export const transparencyContract = c.router(
  {
    /**
     * GET /api/transparency/usage?days=30&locale=at
     * Aggregate totals, footprint band, per-provider constants and breakdowns.
     * `locale` narrows the aggregate to one country's users; the suppression
     * threshold applies to the segment, so a thin one publishes nothing.
     */
    getTransparencyStats: {
      method: 'GET',
      path: '/api/transparency/usage',
      // Optional rather than `.default()`: a defaulted field types the parsed
      // query as required `number`, which stops satisfying Express' ParsedQs
      // index signature and breaks the shared validation-error handler.
      query: z.object({
        days: z.coerce.number().int().min(1).max(365).optional(),
        locale: transparencyLocaleSchema.optional(),
      }),
      responses: {
        200: getTransparencyStatsResponseSchema,
        400: transparencyErrorResponseSchema,
        500: transparencyErrorResponseSchema,
      },
      summary: 'Platform-wide AI consumption and CO2 footprint (public)',
    },
  },
  { pathPrefix: '' }
);
