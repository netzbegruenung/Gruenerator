/**
 * ts-rest router for /api/user-library — „Zu meinen Grüneratoren".
 * Every operation is scoped to the authenticated user; there is no way to
 * read or change someone else's list.
 */

import { userLibraryContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  addToUserLibrary,
  listUserLibrary,
  removeFromUserLibrary,
} from '../../services/user/userLibraryService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('userLibraryContract');

const s = initServer();

function failure(action: string, error: unknown) {
  log.error(`[UserLibrary Contract] ${action} failed:`, error);
  return {
    status: 500 as const,
    body: { error: 'Deine Grüneratoren konnten gerade nicht gespeichert werden.' },
  };
}

export const userLibraryContractRouter = s.router(userLibraryContract, {
  list: async ({ req }) => {
    try {
      const items = await listUserLibrary(getAuthedUser(req).id);
      return { status: 200 as const, body: { success: true as const, items } };
    } catch (error) {
      return failure('list', error);
    }
  },
  add: async ({ req, params }) => {
    try {
      const added = await addToUserLibrary(getAuthedUser(req).id, params.kind, params.ref);
      if (!added) {
        return {
          status: 409 as const,
          body: { error: 'Du hast schon sehr viele Grüneratoren — nimm zuerst welche heraus.' },
        };
      }
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      return failure('add', error);
    }
  },
  remove: async ({ req, params }) => {
    try {
      await removeFromUserLibrary(getAuthedUser(req).id, params.kind, params.ref);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      return failure('remove', error);
    }
  },
});

/** Mount the ts-rest contract router onto an Express app instance. */
export function mountUserLibraryContractRouter(app: Application): void {
  createExpressEndpoints(userLibraryContract, userLibraryContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'userLibraryContract'),
  });
}
