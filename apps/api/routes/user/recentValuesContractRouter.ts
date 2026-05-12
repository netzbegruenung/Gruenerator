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
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('recentValuesContract');

const s = initServer();

export const recentValuesContractRouter = s.router(recentValuesContract, {
  listFieldTypes: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const fieldTypes = await getFieldTypesWithCounts(userId);
      return {
        status: 200 as const,
        body: {
          success: true as const,
          data: fieldTypes,
          count: fieldTypes.length,
        },
      };
    } catch (error) {
      log.error('[RecentValues Contract] Error retrieving field types:', { error });
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'Failed to retrieve field types' },
      };
    }
  },

  getByFieldType: async (args) => {
    try {
      const { fieldType } = args.params;
      const userId = getAuthedUser(args.req).id;
      const limit = args.query.limit ? parseInt(args.query.limit, 10) : undefined;

      const values = await getRecentValues(userId, fieldType, limit);
      const typedValues = values.map((v) => ({
        field_value: v.field_value ?? '',
        form_name: v.form_name ?? null,
        ...(v.id != null && { id: v.id }),
        ...(v.field_type != null && { field_type: v.field_type }),
        ...(v.created_at != null && { created_at: v.created_at }),
      }));

      return {
        status: 200 as const,
        body: {
          success: true as const,
          data: typedValues,
          fieldType,
          count: values.length,
        },
      };
    } catch (error) {
      log.error('[RecentValues Contract] Error retrieving values:', { error });
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'Failed to retrieve recent values' },
      };
    }
  },

  save: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { fieldType, fieldValue, formName } = args.body;

      const result = await saveRecentValue(userId, fieldType, fieldValue, formName ?? null);

      return {
        status: 201 as const,
        body: {
          success: true as const,
          data: result,
          message: 'Recent value saved successfully',
        },
      };
    } catch (error) {
      log.error('[RecentValues Contract] Error saving value:', { error });
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'Failed to save recent value' },
      };
    }
  },

  clearByFieldType: async (args) => {
    try {
      const { fieldType } = args.params;
      const userId = getAuthedUser(args.req).id;

      const deletedCount = await clearRecentValues(userId, fieldType);

      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: `Cleared ${deletedCount} recent values for ${fieldType}`,
          deletedCount,
        },
      };
    } catch (error) {
      log.error('[RecentValues Contract] Error clearing values:', { error });
      return {
        status: 500 as const,
        body: { error: (error as Error).message || 'Failed to clear recent values' },
      };
    }
  },
});

/**
 * Mount the ts-rest contract router onto an Express app instance.
 * Call this from routes.ts after importing this module.
 */
export function mountRecentValuesContractRouter(app: Application): void {
  createExpressEndpoints(recentValuesContract, recentValuesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'recentValuesContract'),
  });
}
