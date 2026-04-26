/**
 * ts-rest contract for canvas AI suggestions.
 *
 * One endpoint:
 *   POST /api/canvas/ai-suggest
 *
 * The frontend sends the user's prompt plus a template-shaped snapshot and
 * the per-template capability declaration. The backend builds a tool-calling
 * prompt against the regolo provider, validates the AI's tool-call args
 * against canvasAiSuggestResponseSchema, and returns typed suggestions.
 *
 * No authentication required at the contract level — the route is mounted
 * with the canvas_ai rate-limit middleware which enforces anonymous quotas.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  canvasAiSuggestErrorSchema,
  canvasAiSuggestRequestSchema,
  canvasAiSuggestResponseSchema,
} from '../schemas/canvasAi.js';

const c = initContract();

export const canvasAiContract = c.router(
  {
    /**
     * POST /api/canvas/ai-suggest
     *
     * Generate canvas operation suggestions from a natural-language prompt
     * and the current canvas snapshot. Returns up to 6 suggestions, each
     * containing 1–8 operations the user can apply with one click.
     */
    suggest: {
      method: 'POST',
      path: '/api/canvas/ai-suggest',
      body: canvasAiSuggestRequestSchema,
      responses: {
        200: canvasAiSuggestResponseSchema,
        400: canvasAiSuggestErrorSchema,
        429: z.object({ error: z.literal('rate_limited'), message: z.string() }),
        500: canvasAiSuggestErrorSchema,
      },
      summary: 'Generate canvas operation suggestions from a prompt',
    },
  },
  { pathPrefix: '' }
);
