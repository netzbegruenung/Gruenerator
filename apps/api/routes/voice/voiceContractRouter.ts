/**
 * ts-rest contract router for voice endpoints.
 *
 * Covers:
 *   POST /api/voice/protokoll
 *   POST /api/voice/todo-list
 *
 * Mount BEFORE the legacy voiceController router in routes.ts so ts-rest
 * matches its own routes first; unmatched paths fall through to the
 * legacy router (which handles multer/multipart routes).
 *
 * requireAuth + the rate limiter are applied on the /api/voice prefix in
 * routes.ts, before this router is mounted — createExpressEndpoints registers
 * handlers straight on the app, so prefix middleware added afterwards would
 * not cover them.
 */

import { voiceContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { generateProtokoll, extractTodoList } from '../../services/voice/protokollService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('voiceContractRouter');

const s = initServer();

export const voiceContractRouter = s.router(voiceContract, {
  protokoll: async (args) => {
    const { inputText, protokollTyp } = args.body;

    try {
      const content = await generateProtokoll({
        inputText,
        protokollTyp: protokollTyp ?? 'Sitzungsprotokoll',
      });
      return { status: 200 as const, body: { success: true, content } };
    } catch (error) {
      log.error('[voiceContract.protokoll] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Fehler bei der Protokoll-Erstellung: ' + (error as Error).message,
        },
      };
    }
  },

  todoList: async (args) => {
    const { text, title } = args.body;

    try {
      const todo = await extractTodoList(text, title ?? undefined);
      return {
        status: 200 as const,
        body: {
          success: true,
          content: todo.content,
          truncated: todo.truncated,
          coveredChars: todo.coveredChars,
          totalChars: todo.totalChars,
        },
      };
    } catch (error) {
      log.error('[voiceContract.todoList] Error:', error);
      return {
        status: 500 as const,
        body: {
          success: false,
          error: 'Fehler bei der Aufgaben-Extraktion: ' + (error as Error).message,
        },
      };
    }
  },
});

/**
 * Mount the ts-rest voice contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy voiceController router.
 */
export function mountVoiceContractRouter(app: Application): void {
  createExpressEndpoints(voiceContract, voiceContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'voiceContract'),
  });
}
