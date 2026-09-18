/**
 * ts-rest router for /api/trees (read-only).
 *
 * Serves the authenticated user's own daily "Bäume" budget. `status()` fails
 * CLOSED on a Redis outage (used = limit) rather than throwing, so the 503 of
 * the contract is not reachable from here — a thrown error is unexpected and
 * maps to 500.
 */

import { treesContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getTreeBudget, toTreeBudgetStatusDto } from '../../services/trees/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('treesContract');

const s = initServer();

export const treesContractRouter = s.router(treesContract, {
  getMyTrees: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const status = await getTreeBudget().status(userId);
      return { status: 200 as const, body: toTreeBudgetStatusDto(status) };
    } catch (error) {
      log.error('[Trees Contract] Error retrieving budget:', error);
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'Failed to retrieve tree budget' },
      };
    }
  },
});

/** Mount the ts-rest contract router onto an Express app instance. */
export function mountTreesContractRouter(app: Application): void {
  createExpressEndpoints(treesContract, treesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'treesContract'),
  });
}
