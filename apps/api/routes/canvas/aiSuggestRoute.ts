/**
 * POST /api/canvas/ai-suggest
 *
 * ts-rest contract handler for the synchronous canvas AI suggestions
 * endpoint. The prompt construction, LLM call, retry/validation logic
 * lives in `services/runCanvasSuggest.ts` so the streaming chat-edit
 * controller (`canvasChatEditController.ts`) can reuse it with
 * research context injected.
 */
import { canvasAiContract } from '@gruenerator/contracts';
import { initServer, createExpressEndpoints } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';

import { runCanvasSuggest } from './services/runCanvasSuggest.js';

import type { Application } from 'express';

const log = createLogger('canvasAiSuggest');

const s = initServer();

export const canvasAiContractRouter = s.router(canvasAiContract, {
  suggest: async (args) => {
    const { req } = args;
    const { prompt, snapshot, capabilities, referenceContent } = args.body;

    const result = await runCanvasSuggest({
      prompt,
      snapshot,
      capabilities,
      // Ground the suggestion in the chat loop's gathered research (compound
      // "recherchiere X und bau es ins Sharepic ein" turns).
      ...(referenceContent ? { contextHints: { prose: referenceContent } } : {}),
      aiWorkerPool: getAIWorkerPool(req),
      req,
    });

    if (result.ok) {
      return { status: 200 as const, body: { suggestions: result.suggestions } };
    }

    return {
      status: 500 as const,
      body: { error: `Konnte keine Vorschläge erzeugen (${result.error})` },
    };
  },
});

export function mountCanvasAiContractRouter(app: Application): void {
  createExpressEndpoints(canvasAiContract, canvasAiContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'canvasAiContract'),
  });
}
