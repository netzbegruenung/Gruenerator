/**
 * ts-rest contract router for AI model preferences.
 *
 *   - GET   /api/auth/profile/model-preferences
 *   - PATCH /api/auth/profile/model-preferences
 *
 * Auth: requireAuth must be applied at /api/auth/profile before this mount.
 */

import { modelPreferencesContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  getModelPreferencesForUser,
  getDefaultModelPreferences,
  setModelPreference,
} from '../../services/user/modelPreferences.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('modelPreferencesContractRouter');

const s = initServer();

export const modelPreferencesContractRouter = s.router(modelPreferencesContract, {
  getPreferences: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const preferences = await getModelPreferencesForUser(userId);
      const defaults = getDefaultModelPreferences();
      return { status: 200 as const, body: { success: true, preferences, defaults } };
    } catch (error) {
      log.error('[modelPreferencesContract.getPreferences] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to load model preferences' } };
    }
  },

  updatePreference: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { modelId, enabled } = args.body;
      const preferences = await setModelPreference(userId, modelId, enabled);
      const defaults = getDefaultModelPreferences();
      return { status: 200 as const, body: { success: true, preferences, defaults } };
    } catch (error) {
      log.error('[modelPreferencesContract.updatePreference] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to update model preferences' } };
    }
  },
});

export function mountModelPreferencesContractRouter(app: Application): void {
  createExpressEndpoints(modelPreferencesContract, modelPreferencesContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'modelPreferencesContract'),
  });
}
