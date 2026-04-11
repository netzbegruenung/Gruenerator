/**
 * ts-rest router for /api/recent-values
 *
 * This is a PILOT demonstrating how ts-rest coexists with existing Express routes.
 * It wraps the same service calls as recentValuesController.ts using a
 * contract-driven router from @ts-rest/express.
 *
 * Adoption pattern:
 *   1. New endpoints → write here first (contract-first)
 *   2. Existing endpoints → migrate one-by-one when touching the handler
 *   3. Keep the old Express router mounted until migration is complete, then remove it
 *
 * To activate: in routes.ts, mount this router BEFORE the legacy router:
 *   app.use(createExpressEndpoints(recentValuesContract, recentValuesContractRouter, app));
 *
 * ts-rest will match its own routes first; unmatched paths fall through to the
 * legacy Express router automatically.
 */

import { recentValuesContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  saveRecentValue,
  getRecentValues,
  clearRecentValues,
  getFieldTypesWithCounts,
} from '../../services/chat/RecentValuesService.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { Express } from 'express';

const log = createLogger('recentValuesContract');

const s = initServer();

export const recentValuesContractRouter = s.router(recentValuesContract, {
  listFieldTypes: async ({ req }) => {
    try {
      const userId = (req as unknown as AuthenticatedRequest).user!.id;
      const fieldTypes = await getFieldTypesWithCounts(userId);
      return {
        status: 200,
        body: {
          success: true as const,
          data: fieldTypes,
          count: fieldTypes.length,
        },
      };
    } catch (error) {
      log.error('[RecentValues Contract] Error retrieving field types:', error);
      return {
        status: 500,
        body: { error: (error as Error).message || 'Failed to retrieve field types' },
      };
    }
  },

  getByFieldType: async ({ params, query, req }) => {
    try {
      const { fieldType } = params;
      const userId = (req as unknown as AuthenticatedRequest).user!.id;
      const limit = query.limit ? parseInt(query.limit, 10) : undefined;

      const values = await getRecentValues(userId, fieldType, limit);

      return {
        status: 200,
        body: {
          success: true as const,
          data: values,
          fieldType,
          count: values.length,
        },
      };
    } catch (error) {
      log.error('[RecentValues Contract] Error retrieving values:', error);
      return {
        status: 500,
        body: { error: (error as Error).message || 'Failed to retrieve recent values' },
      };
    }
  },

  save: async ({ body, req }) => {
    try {
      const userId = (req as unknown as AuthenticatedRequest).user!.id;
      const { fieldType, fieldValue, formName } = body;

      const result = await saveRecentValue(userId, fieldType, fieldValue, formName ?? null);

      return {
        status: 201,
        body: {
          success: true as const,
          data: result,
          message: 'Recent value saved successfully',
        },
      };
    } catch (error) {
      log.error('[RecentValues Contract] Error saving value:', error);
      return {
        status: 500,
        body: { error: (error as Error).message || 'Failed to save recent value' },
      };
    }
  },

  clearByFieldType: async ({ params, req }) => {
    try {
      const { fieldType } = params;
      const userId = (req as unknown as AuthenticatedRequest).user!.id;

      const deletedCount = await clearRecentValues(userId, fieldType);

      return {
        status: 200,
        body: {
          success: true as const,
          message: `Cleared ${deletedCount} recent values for ${fieldType}`,
          deletedCount,
        },
      };
    } catch (error) {
      log.error('[RecentValues Contract] Error clearing values:', error);
      return {
        status: 500,
        body: { error: (error as Error).message || 'Failed to clear recent values' },
      };
    }
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 * Call this from routes.ts after importing this module.
 *
 * @example
 * // In routes.ts:
 * import { mountRecentValuesContractRouter } from './routes/user/recentValuesContractRouter.js';
 * mountRecentValuesContractRouter(app);
 *
 * // Then keep the legacy router as fallback (or remove it when migration is complete):
 * // app.use('/api/recent-values', requireAuth, legacyRecentValuesRouter);
 */
export function mountRecentValuesContractRouter(app: Express): void {
  createExpressEndpoints(recentValuesContract, recentValuesContractRouter, app, {
    // ts-rest will parse and validate request bodies against the Zod schemas
    // in the contract. This replaces the manual validateBody() middleware.
    requestValidationErrorHandler: 'combined',
  });
}
