/**
 * ts-rest router for /api/transparency (public, read-only).
 *
 * Deliberately thin: everything that decides what may be published — the
 * suppression threshold, the aggregation, the caching — lives in
 * services/usage/platformUsageStats.ts, so the rules are in one auditable place
 * rather than spread between a service and a handler.
 */

import { transparencyContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getPlatformUsageStats } from '../../services/usage/platformUsageStats.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('transparencyContract');

const s = initServer();

export const transparencyContractRouter = s.router(transparencyContract, {
  getTransparencyStats: async (args) => {
    try {
      const days = args.query.days ?? 30;
      const locale = args.query.locale ?? null;
      return { status: 200 as const, body: await getPlatformUsageStats(days, locale) };
    } catch (error) {
      log.error('[Transparency Contract] Error retrieving platform usage:', error);
      // No internals in the message: this endpoint answers the open internet.
      return { status: 500 as const, body: { error: 'Failed to retrieve transparency data' } };
    }
  },
});

/** Mount the ts-rest contract router onto an Express app instance. */
export function mountTransparencyContractRouter(app: Application): void {
  createExpressEndpoints(transparencyContract, transparencyContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'transparencyContract'),
  });
}
