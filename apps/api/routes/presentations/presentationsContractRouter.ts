/**
 * ts-rest contract router for presentations (reveal.js decks).
 *
 * Presentations are collaborative_documents rows (subtype 'presentations');
 * CRUD, sharing and permissions run through the polymorphic /api/docs/*
 * endpoints. Deck EDITING is tool-based (the agentic loop's edit_document tool →
 * presentationAiService → `editor_operations` SSE) — this router only owns the
 * direct generator.
 */

import { presentationsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';
import { checkDocumentWriteAccess } from '../docs/documentAccess.js';

import { generatePresentationOperations } from './presentationAiService.js';

import type { Application } from 'express';

const log = createLogger('PresentationsContract');
const s = initServer();

export const presentationsContractRouter = s.router(presentationsContract, {
  getContent: async (args) => {
    try {
      const { id } = args.params;
      const userId = getAuthedUser(args.req).id;

      const { loadPresentationState } =
        await import('../../services/presentations/PresentationGenerationService.js');
      // Access control lives inside the loader (owner / permissions / group
      // share); null covers both not-found and no-access → 404.
      const state = await loadPresentationState(id, userId);
      if (!state) {
        return { status: 404 as const, body: { error: 'Presentation not found' } };
      }

      return {
        status: 200 as const,
        body: {
          id: state.id,
          title: state.title,
          slides: state.slides,
          accentColor: state.accentColor,
        },
      };
    } catch (error) {
      log.error('[Presentations Contract] Error loading presentation content:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to load presentation content',
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },

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

      const {
        PRESENTATION_GENERATION_PROMPT,
        parsePresentationStructure,
        createPresentationDocument,
      } = await import('../../services/presentations/PresentationGenerationService.js');

      const genResult = await getAIWorkerPool(args.req).processRequest(
        {
          type: 'doc_generation',
          systemPrompt: PRESENTATION_GENERATION_PROMPT,
          messages: [{ role: 'user', content: description }],
          options: { temperature: 0.4, max_tokens: 4000 },
        },
        args.req
      );

      const structure =
        genResult.success && genResult.content
          ? parsePresentationStructure(genResult.content)
          : null;
      if (!structure) {
        return { status: 500 as const, body: { error: 'Failed to generate presentation' } };
      }

      const presentation = await createPresentationDocument(structure, userId);
      return { status: 201 as const, body: { id: presentation.id, title: presentation.title } };
    } catch (error) {
      log.error('[Presentations Contract] Error generating presentation:', error);
      return {
        status: 500 as const,
        body: {
          error: 'Failed to generate presentation',
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
