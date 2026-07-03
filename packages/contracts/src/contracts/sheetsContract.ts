import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  sheetAiRequestBodySchema,
  sheetAiResponseSchema,
  sheetErrorResponseSchema,
} from '../schemas/sheets.js';

const c = initContract();

/**
 * Sheets (Univer spreadsheets, collaborative_documents subtype 'sheets').
 * CRUD/share/permissions run through the polymorphic /api/docs/* endpoints;
 * this contract only owns the sheet-specific AI planning route.
 * Mirrors apps/api/routes/sheets/sheetsContractRouter.ts.
 */
export const sheetsContract = c.router({
  /**
   * POST /api/sheets/:id/ai
   * Plan sheet operations from a natural-language request (applied
   * client-side via the Univer Facade API). Returns operations as JSON.
   */
  ai: {
    method: 'POST',
    path: '/api/sheets/:id/ai',
    pathParams: z.object({ id: z.string() }),
    body: sheetAiRequestBodySchema,
    responses: {
      200: sheetAiResponseSchema,
      401: sheetErrorResponseSchema,
      403: sheetErrorResponseSchema,
      404: sheetErrorResponseSchema,
      500: sheetErrorResponseSchema,
    },
    summary: 'Generate sheet operations from a natural-language request',
  },
});
