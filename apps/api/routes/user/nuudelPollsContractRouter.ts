/**
 * ts-rest contract router for /api/auth/nuudel-polls — settings → Umfragen:
 * list and forget. Angelegt wird nur im Chat (`nuudel_umfrage_anlegen`).
 *
 * requireAuth is applied at the path prefix in routes.ts, so `req.user` is
 * always present; getUserId() throws only as a safety guard.
 */
import { nuudelPollsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { nuudelBaseUrl } from '../../services/nuudel/client.js';
import { MAX_POLLS_PER_DAY, forgetPoll, pollsOf } from '../../services/nuudel/polls.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { UserProfile } from '../../services/user/types.js';
import type { Application, Request } from 'express';

const log = createLogger('nuudelPollsContractRouter');

function getUserId(req: Request): string {
  const user = req.user as UserProfile | undefined;
  if (!user?.id) throw new Error('Authentication required');
  return user.id;
}

const internal = { status: 500 as const, body: { error: 'Interner Fehler' } };

const s = initServer();

export const nuudelPollsContractRouter = s.router(nuudelPollsContract, {
  listPolls: async ({ req }) => {
    try {
      const polls = await pollsOf(getUserId(req));
      return {
        status: 200 as const,
        body: {
          enabled: nuudelBaseUrl() !== null,
          limitPerDay: MAX_POLLS_PER_DAY,
          polls: polls.map((p) => ({
            id: p.id,
            kind: p.kind,
            title: p.title,
            pollUrl: p.pollUrl,
            adminUrl: p.adminUrl,
            createdAt: p.createdAt.toISOString(),
          })),
        },
      };
    } catch (error) {
      log.error('[listPolls] Error:', error);
      return internal;
    }
  },

  forgetPoll: async ({ req, params }) => {
    try {
      if (!(await forgetPoll(getUserId(req), params.id))) {
        return { status: 404 as const, body: { error: 'Umfrage nicht gefunden' } };
      }
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      log.error('[forgetPoll] Error:', error);
      return internal;
    }
  },
});

/** requireAuth must be applied at the prefix in routes.ts before calling this. */
export function mountNuudelPollsContractRouter(app: Application): void {
  createExpressEndpoints(nuudelPollsContract, nuudelPollsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'nuudelPollsContract'),
  });
}
