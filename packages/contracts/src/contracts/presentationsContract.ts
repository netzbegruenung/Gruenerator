import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  generatePresentationBodySchema,
  generatePresentationResponseSchema,
  presentationAiRequestBodySchema,
  presentationAiResponseSchema,
  presentationContentResponseSchema,
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
   * GET /api/presentations/:id/content
   * Decoded deck read-model (loadPresentationState) for a read-only viewer —
   * no live collab connection. Used by the mobile Office slide viewer.
   */
  getContent: {
    method: 'GET',
    path: '/api/presentations/:id/content',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: presentationContentResponseSchema,
      401: presentationErrorResponseSchema,
      404: presentationErrorResponseSchema,
      500: presentationErrorResponseSchema,
    },
    summary: 'Read-only deck read-model for the slide viewer',
  },
  /**
   * POST /api/presentations/:id/ai
   * Plan presentation operations from a natural-language request (applied
   * client-side against the deck's Y.Doc). Returns operations as JSON.
   */
  ai: {
    method: 'POST',
    path: '/api/presentations/:id/ai',
    pathParams: z.object({ id: z.string() }),
    body: presentationAiRequestBodySchema,
    responses: {
      200: presentationAiResponseSchema,
      401: presentationErrorResponseSchema,
      403: presentationErrorResponseSchema,
      404: presentationErrorResponseSchema,
      500: presentationErrorResponseSchema,
    },
    summary: 'Generate presentation operations from a natural-language request',
  },
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
