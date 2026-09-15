/**
 * ts-rest contract for Grünerator Voice: /api/voice/speech/*
 *
 * Mounted under the `/api/voice` prefix guard (requireAuth, requireAiConsent,
 * standardMutationLimiter) — see apps/api/routes.ts. The read-aloud endpoints
 * under /api/voice/tts stay uncontracted (one returns raw WAV, one is SSE).
 */
import { initContract } from '@ts-rest/core';

import {
  generateSpeechBodySchema,
  generateSpeechResponseSchema,
  speechErrorSchema,
} from '../schemas/speech.js';

const c = initContract();

export const speechContract = c.router(
  {
    /**
     * POST /api/voice/speech/generate
     * Synthesises the text, encodes every requested format, stores each file in
     * the Mediathek and answers with the share URLs. Synchronous: a long text
     * takes the provider several requests, so the call can run for a minute.
     */
    generate: {
      method: 'POST',
      path: '/api/voice/speech/generate',
      body: generateSpeechBodySchema,
      responses: {
        200: generateSpeechResponseSchema,
        400: speechErrorSchema,
        401: speechErrorSchema,
        403: speechErrorSchema,
        // Daily speech budget used up.
        429: speechErrorSchema,
        500: speechErrorSchema,
      },
      summary: 'Generate a downloadable audio file from text',
    },
  },
  { pathPrefix: '' }
);
