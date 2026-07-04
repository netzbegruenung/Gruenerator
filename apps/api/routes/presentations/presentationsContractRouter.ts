/**
 * ts-rest contract router for presentations (reveal.js decks).
 *
 * Presentations are collaborative_documents rows (subtype 'presentations');
 * CRUD, sharing and permissions run through the polymorphic /api/docs/*
 * endpoints. This router only owns the deck-specific AI planning route,
 * mirroring the sheets plan-then-apply pattern.
 */

import { presentationsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { checkDocumentWriteAccess } from '../docs/documentAccess.js';

import { generatePresentationOperations } from './presentationAiService.js';

import type { Application } from 'express';

const log = createLogger('PresentationsContract');
const s = initServer();

export const presentationsContractRouter = s.router(presentationsContract, {
  ai: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;
      const { userPrompt, presentationContext, referenceContent } = args.body;

      // Re-enforce write access server-side — never trust the client.
      const canEdit = await checkDocumentWriteAccess(id, userId);
      if (!canEdit) {
        return { status: 403 as const, body: { error: 'No write access to this presentation' } };
      }

      const operations = await generatePresentationOperations({
        userPrompt,
        presentationContext,
        referenceContent: referenceContent ?? null,
      });

      return { status: 200 as const, body: { operations } };
    } catch (error) {
      log.error('[Presentations Contract] Error generating presentation operations:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to generate presentation operations',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },
});

/** Mount the ts-rest presentations contract router onto an Express app. */
export function mountPresentationsContractRouter(app: Application): void {
  createExpressEndpoints(presentationsContract, presentationsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'presentationsContract'),
  });
}
