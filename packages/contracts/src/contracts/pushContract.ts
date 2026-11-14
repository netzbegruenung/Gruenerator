/**
 * ts-rest contract for app push devices (`/api/push/devices`).
 *
 * Mirrors apps/api/routes/push/pushContractRouter.ts. Auth sits on the prefix
 * in routes.ts; a device always belongs to the authenticated user and lives
 * only as long as the session that registered it.
 */
import { initContract } from '@ts-rest/core';

import {
  pushDeviceParamsSchema,
  pushErrorResponseSchema,
  pushOkResponseSchema,
  registerPushDeviceBodySchema,
  registerPushDeviceResponseSchema,
} from '../schemas/push.js';

const c = initContract();

const errors = {
  401: pushErrorResponseSchema,
  500: pushErrorResponseSchema,
} as const;

export const pushContract = c.router(
  {
    /** Register (or refresh) this device. Upserts on the token. */
    register: {
      method: 'POST',
      path: '/api/push/devices',
      body: registerPushDeviceBodySchema,
      responses: { 200: registerPushDeviceResponseSchema, ...errors },
      summary: 'Register a device for app push',
    },
    /** Stop pushing to this device. Only the owner's own rows are touched. */
    unregister: {
      method: 'DELETE',
      path: '/api/push/devices/:id',
      pathParams: pushDeviceParamsSchema,
      body: c.noBody(),
      responses: { 200: pushOkResponseSchema, ...errors },
      summary: 'Unregister a device from app push',
    },
  },
  { pathPrefix: '' }
);
