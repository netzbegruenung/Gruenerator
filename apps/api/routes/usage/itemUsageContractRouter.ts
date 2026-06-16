/**
 * ts-rest router for /api/item-usage (read-only).
 *
 * Exposes the current user's notebook/agent usage aggregate so static client
 * lists (system notebooks / agents) can apply the same "favourites first"
 * ordering the server applies to user notebooks / agents. Writes happen
 * server-side from the chat stream and notebook QA paths.
 */

import { itemUsageContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getUsageMap } from '../../services/usage/ItemUsageService.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('itemUsageContract');

const s = initServer();

export const itemUsageContractRouter = s.router(itemUsageContract, {
  getUsage: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const type = args.query.type;
      const usageMap = await getUsageMap(userId, type);
      const items = [...usageMap.entries()].map(([itemId, stat]) => ({
        item_id: itemId,
        use_count: stat.useCount,
        last_used_at: stat.lastUsedAt,
      }));
      return { status: 200 as const, body: { success: true as const, type, items } };
    } catch (error) {
      log.error('[ItemUsage Contract] Error retrieving usage:', error);
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'Failed to retrieve usage' },
      };
    }
  },
});

/** Mount the ts-rest contract router onto an Express app instance. */
export function mountItemUsageContractRouter(app: Application): void {
  createExpressEndpoints(itemUsageContract, itemUsageContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'itemUsageContract'),
  });
}
