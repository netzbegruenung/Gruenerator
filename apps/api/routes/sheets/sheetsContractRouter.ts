/**
 * ts-rest contract router for sheets (Univer spreadsheets).
 *
 * Sheets are collaborative_documents rows (subtype 'sheets'); CRUD, sharing
 * and permissions run through the polymorphic /api/docs/* endpoints. This
 * router only owns the sheet-specific AI planning route, mirroring the boards
 * plan-then-apply pattern.
 */

import { sheetsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { checkDocumentWriteAccess } from '../docs/documentAccess.js';

import { generateSheetOperations } from './sheetAiService.js';

import type { Application } from 'express';

const log = createLogger('SheetsContract');
const s = initServer();

export const sheetsContractRouter = s.router(sheetsContract, {
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
});

/** Mount the ts-rest sheets contract router onto an Express app instance. */
export function mountSheetsContractRouter(app: Application): void {
  createExpressEndpoints(sheetsContract, sheetsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'sheetsContract'),
  });
}
