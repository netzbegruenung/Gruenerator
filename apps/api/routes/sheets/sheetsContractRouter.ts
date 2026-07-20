/**
 * ts-rest contract router for sheets (Univer spreadsheets).
 *
 * Sheets are collaborative_documents rows (subtype 'sheets'); CRUD, sharing
 * and permissions run through the polymorphic /api/docs/* endpoints. Sheet
 * EDITING is tool-based (the agentic loop's edit_document tool → sheetAiService
 * → `editor_operations` SSE) — this router only owns the direct generator.
 */

import { sheetsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('SheetsContract');
const s = initServer();

export const sheetsContractRouter = s.router(sheetsContract, {
  generate: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const description = args.body.description.trim();
      if (description.length < 3) {
        return {
          status: 400 as const,
          body: { error: 'Description is required (min 3 characters)' },
        };
      }

      const { SHEET_GENERATION_PROMPT, parseSheetStructure, createSheetDocument } =
        await import('../../services/sheets/SheetGenerationService.js');

      const genResult = await getAIWorkerPool(args.req).processRequest(
        {
          type: 'doc_generation',
          systemPrompt: SHEET_GENERATION_PROMPT,
          messages: [{ role: 'user', content: description }],
          options: { temperature: 0.4, max_tokens: 4000 },
        },
        args.req
      );

      const structure =
        genResult.success && genResult.content ? parseSheetStructure(genResult.content) : null;
      if (!structure) {
        return { status: 500 as const, body: { error: 'Failed to generate sheet' } };
      }

      const sheet = await createSheetDocument(structure, userId);
      return { status: 201 as const, body: { id: sheet.id, title: sheet.title } };
    } catch (error) {
      log.error('[Sheets Contract] Error generating sheet:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to generate sheet',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },
});

/** Mount the ts-rest sheets contract router onto an Express app instance. */
export function mountSheetsContractRouter(app: Application): void {
  createExpressEndpoints(sheetsContract, sheetsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sheetsContract'),
  });
}
