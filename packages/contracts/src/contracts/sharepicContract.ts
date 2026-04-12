/**
 * ts-rest contract for sharepic canvas endpoints.
 *
 * Covers:
 * - POST /api/campaign_canvas  (sharepic_canvas/campaign_canvas.ts)
 *
 * All routes are public (no requireAuth) — consistent with the existing
 * campaign_canvas route in routes.ts (standardMutationLimiter only).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  campaignCanvasBodySchema,
  campaignCanvasSuccessSchema,
  campaignCanvasErrorSchema,
} from '../schemas/sharepic.js';

const c = initContract();

export const sharepicContract = c.router(
  {
    /**
     * POST /api/campaign_canvas
     *
     * Render a campaign sharepic from a config + text data.
     * Returns a base64-encoded PNG image and the rendered credit text.
     */
    generateCampaignCanvas: {
      method: 'POST',
      path: '/api/campaign_canvas',
      body: campaignCanvasBodySchema,
      responses: {
        200: campaignCanvasSuccessSchema,
        400: campaignCanvasErrorSchema,
        500: z.object({ success: z.boolean(), error: z.unknown() }),
      },
      summary: 'Render a campaign canvas sharepic',
    },
  },
  { pathPrefix: '' }
);
