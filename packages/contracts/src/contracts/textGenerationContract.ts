/**
 * ts-rest contracts for text generation endpoints.
 *
 * Covers:
 * - POST /api/antraege/generate-simple  (simpleGeneration.ts)
 * - POST /api/claude_social/strategy    (texte/social.ts)
 * - POST /api/claude_social/production  (texte/social.ts)
 *
 * SSE/streaming paths (when ?stream=true or Accept: text/event-stream) are
 * intentionally NOT modelled here — Session N+5 handles SSE contract design.
 *
 * All routes require authentication (enforced via requireAuth in routes.ts).
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  simpleGenerationBodySchema,
  socialStrategyBodySchema,
  socialProductionBodySchema,
  textGenErrorSchema,
} from '../schemas/textGeneration.js';

const c = initContract();

export const textGenerationContract = c.router(
  {
    /**
     * POST /api/antraege/generate-simple
     *
     * Non-streaming Antrag generation via LangGraph prompt processor.
     * When useAgentMode=true the request is forwarded to the AntragAgentGraph
     * pipeline (same JSON response shape).
     *
     * The actual response payload is produced by processGraphRequest /
     * processAntragAgentRequest — its shape varies by prompt type.
     * z.unknown() is intentional here.
     */
    generateSimple: {
      method: 'POST',
      path: '/api/antraege/generate-simple',
      body: simpleGenerationBodySchema,
      responses: {
        200: z.unknown(),
        400: textGenErrorSchema,
        401: textGenErrorSchema,
        500: textGenErrorSchema,
      },
      summary: 'Generate a simple Antrag/Anfrage using the LangGraph pipeline (non-streaming)',
    },

    /**
     * POST /api/claude_social/strategy
     *
     * Phase 1 of the social content pipeline: generate strategic framing +
     * arguments from input content and target platforms.
     */
    socialStrategy: {
      method: 'POST',
      path: '/api/claude_social/strategy',
      body: socialStrategyBodySchema,
      responses: {
        200: z.unknown(),
        400: textGenErrorSchema,
        401: textGenErrorSchema,
        500: z.object({ success: z.boolean(), error: z.string() }),
      },
      summary: 'Generate social media strategy framing (Phase 1)',
    },

    /**
     * POST /api/claude_social/production
     *
     * Phase 2 of the social content pipeline: produce finalised content from
     * an approved strategy workflow.
     */
    socialProduction: {
      method: 'POST',
      path: '/api/claude_social/production',
      body: socialProductionBodySchema,
      responses: {
        200: z.unknown(),
        400: textGenErrorSchema,
        401: textGenErrorSchema,
        500: z.object({ success: z.boolean(), error: z.string() }),
      },
      summary: 'Generate social media production content (Phase 2)',
    },
  },
  { pathPrefix: '' }
);
