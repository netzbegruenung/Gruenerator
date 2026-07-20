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
import { checkDocumentWriteAccess } from '../docs/documentAccess.js';

import { generateSheetOperations } from './sheetAiService.js';

import type { Application } from 'express';

const log = createLogger('SheetsContract');
const s = initServer();

export const sheetsContractRouter = s.router(sheetsContract, {
  getContent: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;

      const { loadSheetState } = await import('../../services/sheets/SheetGenerationService.js');
      // Access control lives inside the loader (owner / permissions / group
      // share); null covers both not-found and no-access → 404.
      const state = await loadSheetState(id, userId);
      if (!state) {
        return { status: 404 as const, body: { error: 'Sheet not found' } };
      }

      return {
        status: 200 as const,
        body: {
          id: state.id,
          title: state.title,
          // Opaque Univer IWorkbookData JSON — the viewer renders it as-is.
          workbook: state.workbook as Record<string, unknown> | null,
        },
      };
    } catch (error) {
      log.error('[Sheets Contract] Error loading sheet content:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to load sheet content',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

  ai: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;
      const { userPrompt, sheetContext, referenceContent } = args.body;

      // Re-enforce write access server-side — never trust the client.
      const canEdit = await checkDocumentWriteAccess(id, userId);
      if (!canEdit) {
        return { status: 403 as const, body: { error: 'No write access to this sheet' } };
      }

      const operations = await generateSheetOperations({
        userPrompt,
        sheetContext,
        referenceContent: referenceContent ?? null,
      });

      return { status: 200 as const, body: { operations } };
    } catch (error) {
      log.error('[Sheets Contract] Error generating sheet operations:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to generate sheet operations',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

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
