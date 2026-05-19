import { imageModelPreferenceContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  getImageModelForUser,
  setImageModelForUser,
} from '../../services/user/imageModelPreference.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { ImageModelId } from '@gruenerator/shared/models';
import type { Application } from 'express';

const log = createLogger('imageModelPreferenceContractRouter');

const s = initServer();

export const imageModelPreferenceContractRouter = s.router(imageModelPreferenceContract, {
  getPreference: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const defaultImageModel = await getImageModelForUser(userId);
      return { status: 200 as const, body: { success: true, defaultImageModel } };
    } catch (error) {
      log.error('[imageModelPreferenceContract.getPreference] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to load image model preference' } };
    }
  },

  updatePreference: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const defaultImageModel = await setImageModelForUser(
        userId,
        args.body.modelId as ImageModelId
      );
      return { status: 200 as const, body: { success: true, defaultImageModel } };
    } catch (error) {
      log.error('[imageModelPreferenceContract.updatePreference] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to update image model preference' } };
    }
  },
});

export function mountImageModelPreferenceContractRouter(app: Application): void {
  createExpressEndpoints(imageModelPreferenceContract, imageModelPreferenceContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'imageModelPreferenceContract'),
  });
}
