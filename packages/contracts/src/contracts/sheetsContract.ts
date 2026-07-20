import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  generateSheetBodySchema,
  generateSheetResponseSchema,
  sheetErrorResponseSchema,
} from '../schemas/sheets.js';

const c = initContract();

/**
 * Sheets (Univer spreadsheets, collaborative_documents subtype 'sheets').
 * CRUD/share/permissions run through the polymorphic /api/docs/* endpoints.
 * Sheet EDITING is tool-based: the agentic loop's edit_document tool plans ops
 * server-side (sheetAiService) and streams them as `editor_operations` — there
 * is no client-called planning route anymore.
 * Mirrors apps/api/routes/sheets/sheetsContractRouter.ts.
 */
export const sheetsContract = c.router({
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
