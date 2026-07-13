import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  generateSheetBodySchema,
  generateSheetResponseSchema,
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
  /**
   * POST /api/sheets/generate
   * Direct, non-chat generator: build a full spreadsheet from a description,
   * create the sheet document and seed its Y.Doc. Returns the new id/title.
   */
  generate: {
    method: 'POST',
    path: '/api/sheets/generate',
    body: generateSheetBodySchema,
    responses: {
      201: generateSheetResponseSchema,
      400: sheetErrorResponseSchema,
      500: sheetErrorResponseSchema,
    },
    summary: 'Generate a complete spreadsheet from a description',
  },
});
