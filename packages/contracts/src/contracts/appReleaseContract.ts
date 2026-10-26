/**
 * ts-rest contract for store release information of the mobile app. Public:
 * the answer is the same for everyone and served from a cache.
 */
import { initContract } from '@ts-rest/core';

import { iosStoreReleaseResponseSchema } from '../schemas/appRelease.js';

const c = initContract();

export const appReleaseContract = c.router(
  {
    getIosStoreRelease: {
      method: 'GET',
      path: '/api/app/ios-store-release',
      responses: {
        200: iosStoreReleaseResponseSchema,
      },
      summary: 'Version of the iOS app currently live in the App Store',
    },
  },
  { pathPrefix: '' }
);
