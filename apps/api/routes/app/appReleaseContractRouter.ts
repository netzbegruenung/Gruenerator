import { appReleaseContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { getIosStoreVersion } from '../../services/appBundles/iosStoreRelease.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('appReleaseContractRouter');

const s = initServer();

export const appReleaseContractRouter = s.router(appReleaseContract, {
  getIosStoreRelease: async () => ({
    status: 200 as const,
    body: { version: await getIosStoreVersion() },
  }),
});

export function mountAppReleaseContractRouter(app: Application): void {
  createExpressEndpoints(appReleaseContract, appReleaseContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'appReleaseContract'),
  });
}
