/**
 * ts-rest contract router for GET /api/content.
 *
 * `requireAuth` is applied at the /api/content prefix in routes.ts — mount the
 * prefix middleware BEFORE this, because `createExpressEndpoints` binds
 * directly on `app` and would otherwise run without it.
 */
import { contentContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { BadContentRequest, listContent } from './contentController.js';

import type { Application } from 'express';

const log = createLogger('contentContract');

const s = initServer();

export const contentContractRouter = s.router(contentContract, {
  listContent: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const result = await listContent(userId, args.query);
      return { status: 200 as const, body: result };
    } catch (error) {
      if (error instanceof BadContentRequest) {
        return { status: 400 as const, body: { error: error.reason } };
      }
      log.error('[contentContract.listContent] Error:', error);
      return { status: 500 as const, body: { error: 'Inhalte konnten nicht geladen werden.' } };
    }
  },
});

export function mountContentContractRouter(app: Application): void {
  createExpressEndpoints(contentContract, contentContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'contentContract'),
  });
}
