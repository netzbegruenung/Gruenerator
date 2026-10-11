import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  claimSheetOpsResponseSchema,
  generateSheetBodySchema,
  generateSheetResponseSchema,
  sheetAiRequestBodySchema,
  sheetAiResponseSchema,
  sheetContentResponseSchema,
  sheetErrorResponseSchema,
} from '../schemas/sheets.js';

const c = initContract();

/**
 * Sheets (Univer spreadsheets, collaborative_documents subtype 'sheets').
 * CRUD/share/permissions run through the polymorphic /api/docs/* endpoints.
 * Sheet EDITING is tool-based: chat plans ops server-side (sheetAiService) and
 * queues them on the doc; the open editor claims and applies them.
 * Mirrors apps/api/routes/sheets/sheetsContractRouter.ts.
 */
export const sheetsContract = c.router({
  /**
   * GET /api/sheets/:id/content
   * Decoded workbook snapshot (loadSheetState) for a read-only viewer — no
   * live collab connection. Used by the mobile Office sheet viewer.
   */
  getContent: {
    method: 'GET',
    path: '/api/sheets/:id/content',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: sheetContentResponseSchema,
      401: sheetErrorResponseSchema,
      404: sheetErrorResponseSchema,
      500: sheetErrorResponseSchema,
    },
    summary: 'Read-only workbook snapshot for the sheet viewer',
  },
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
  /**
   * POST /api/sheets/:id/pending-ops/claim
   * Hand the open editor the chat edits queued on this sheet (and drop them
   * from the queue) so it can apply them through Univer.
   */
  claimPendingOps: {
    method: 'POST',
    path: '/api/sheets/:id/pending-ops/claim',
    pathParams: z.object({ id: z.string() }),
    body: z.object({}).optional(),
    responses: {
      200: claimSheetOpsResponseSchema,
      401: sheetErrorResponseSchema,
      403: sheetErrorResponseSchema,
      500: sheetErrorResponseSchema,
    },
    summary: 'Claim queued chat edits for the open sheet editor',
  },
});
