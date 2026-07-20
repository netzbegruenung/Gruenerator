import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  generatePresentationBodySchema,
  generatePresentationResponseSchema,
  presentationErrorResponseSchema,
} from '../schemas/presentations.js';

const c = initContract();

/**
 * Presentations (reveal.js decks, collaborative_documents subtype
 * 'presentations'). CRUD/share/permissions run through the polymorphic
 * /api/docs/* endpoints. Deck EDITING is tool-based: the agentic loop's
 * edit_document tool plans ops server-side (presentationAiService) and streams
 * them as `editor_operations` — there is no client-called planning route.
 * Mirrors apps/api/routes/presentations/presentationsContractRouter.ts.
 */
export const presentationsContract = c.router({
  /**
   * POST /api/presentations/generate
   * Direct, non-chat generator: build a full deck from a description, create
   * the presentation document and seed its Y.Doc. Returns the new id/title.
   */
  generate: {
    method: 'POST',
    path: '/api/presentations/generate',
    body: generatePresentationBodySchema,
    responses: {
      201: generatePresentationResponseSchema,
      400: presentationErrorResponseSchema,
      500: presentationErrorResponseSchema,
    },
    summary: 'Generate a complete presentation from a description',
  },
});
