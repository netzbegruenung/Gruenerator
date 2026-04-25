/**
 * ts-rest contract router for the auth status endpoint.
 *
 *   GET /api/auth/status
 *
 * The status endpoint reports the current session and is intentionally
 * NOT protected by `requireAuth` — it must respond gracefully for
 * unauthenticated callers (with `isAuthenticated: false, user: null`),
 * since the frontend uses it to decide whether to show the login screen.
 *
 * The contract enforces the response shape end-to-end. The handler returns
 * the canonical `UserProfile` via `toBetterAuthUser()`, which is the single
 * null-strip + Zod-parse boundary shared with the auth middleware. That
 * removes the manual hand-pick step that previously dropped fields like
 * `is_admin` and broke the admin gate on the frontend.
 */

import { authStatusContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { fromNodeHeaders } from 'better-auth/node';

import { auth } from '../../config/betterAuth.js';
import { toBetterAuthUser } from '../../middleware/authMiddleware.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('authStatusContractRouter');

const s = initServer();

export const authStatusContractRouter = s.router(authStatusContract, {
  getStatus: async (args) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(args.req.headers),
      });
      if (session?.user) {
        return {
          status: 200 as const,
          body: { isAuthenticated: true, user: toBetterAuthUser(session.user) },
        };
      }
    } catch (err) {
      log.error('[authStatus.getStatus] session check failed: %s', (err as Error).message);
    }
    return { status: 200 as const, body: { isAuthenticated: false, user: null } };
  },
});

/**
 * Mount the ts-rest auth status contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy `app.use('/api/auth', authRouter)` so
 * the contract route matches first; the legacy `/status` handler can then
 * be removed.
 *
 * No `requireAuth` wrapper at the prefix — the endpoint must work for both
 * authed and unauthed callers.
 */
export function mountAuthStatusContractRouter(app: Application): void {
  createExpressEndpoints(authStatusContract, authStatusContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'authStatusContract'),
  });
}
