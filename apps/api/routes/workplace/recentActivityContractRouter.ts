/**
 * ts-rest contract router for GET /api/recent-activity.
 *
 * Wraps the same `aggregateRecentActivity` used by the legacy Express route
 * (and by /auth/init's cache seed), so all three return identical data. Mount
 * BEFORE the legacy recentActivityRouter in routes.ts — ts-rest matches its
 * own route first; the legacy router stays as a fall-through.
 *
 * `requireAuth` is applied at the /api/recent-activity prefix in routes.ts, so
 * `req.user` is always present here.
 */
import { recentActivityContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import { aggregateRecentActivity } from './recentActivityController.js';

import type { Application } from 'express';

const log = createLogger('recentActivityContract');

const s = initServer();

export const recentActivityContractRouter = s.router(recentActivityContract, {
  getRecentActivity: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const limitParam = Number(args.query.limit);
      const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 30) : 12;

      const items = await aggregateRecentActivity(userId, limit);
      return { status: 200 as const, body: { items } };
    } catch (error) {
      log.error('[recentActivityContract.getRecentActivity] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to fetch recent activity' } };
    }
  },
});

export function mountRecentActivityContractRouter(app: Application): void {
  createExpressEndpoints(recentActivityContract, recentActivityContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'recentActivityContract'),
  });
}
