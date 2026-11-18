/**
 * ts-rest contract router for app push devices (`/api/push/devices`).
 * Auth and the mutation limiter sit on the prefix in routes.ts.
 *
 * The device row is tied to the session that registered it (FK cascade on
 * `ba_sessions`), so logging out or revoking that session ends the pushes.
 * requireAuth only attaches the user, hence the second session lookup here —
 * cheap (Redis-cached) and rare (opt-in, token change, weekly heartbeat).
 */
import { pushContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { fromNodeHeaders } from 'better-auth/node';

import { auth } from '../../config/betterAuth.js';
import { DEV_BYPASS_USER_ID } from '../../config/devAuthBypass.js';
import { env } from '../../config/env.js';
import { registerPushDevice, unregisterPushDevice } from '../../services/push/pushDevices.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application, Request } from 'express';

const log = createLogger('pushContractRouter');

const INTERNAL = { message: 'Push-Benachrichtigungen sind gerade nicht erreichbar.' };
const NO_SESSION = { message: 'Keine gültige Sitzung.' };

/** The session id, or null for the dev auth bypass (which has no session row). */
async function resolveSessionId(req: Request, userId: string): Promise<string | null | 'none'> {
  if (
    userId === DEV_BYPASS_USER_ID &&
    env.NODE_ENV === 'development' &&
    env.ALLOW_DEV_AUTH_BYPASS === true
  ) {
    return null;
  }
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  return session?.session.id ?? 'none';
}

const s = initServer();

export const pushContractRouter = s.router(pushContract, {
  register: async ({ req, body }) => {
    try {
      const user = getAuthedUser(req);
      const sessionId = await resolveSessionId(req, user.id);
      if (sessionId === 'none') return { status: 401 as const, body: NO_SESSION };
      const id = await registerPushDevice({
        userId: user.id,
        sessionId,
        platform: body.platform,
        token: body.token,
        key: Buffer.from(body.key, 'base64'),
        apnsEnvironment: body.apnsEnvironment,
      });
      return { status: 200 as const, body: { id } };
    } catch (error) {
      log.error('[push.register] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },

  unregister: async ({ req, params }) => {
    try {
      await unregisterPushDevice(getAuthedUser(req).id, params.id);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[push.unregister] Error:', error);
      return { status: 500 as const, body: INTERNAL };
    }
  },
});

export function mountPushContractRouter(app: Application): void {
  createExpressEndpoints(pushContract, pushContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'pushContract'),
  });
}
