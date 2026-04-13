/**
 * Typed retrieval of the authenticated user from an Express request.
 *
 * Replaces the `(req.user as UserProfile).id` casts that were scattered
 * across contract routers. Those casts were lies to the type system: they
 * silenced the compiler error but did not protect against `req.user` being
 * undefined at runtime — which was exactly the root cause of the
 * `Cannot read properties of undefined (reading 'id')` crash on the boards
 * endpoint (commits 25f8bac8 / ef92956c / the prefix-requireAuth audit).
 *
 * Usage — for prefix-protected routes only:
 *
 *   import { getAuthedUser } from '../../utils/getAuthedUser.js';
 *
 *   listBoards: async (args) => {
 *     const user = getAuthedUser(args.req);
 *     const userId = user.id;            // typed string, no cast
 *     // ...
 *   }
 *
 * Usage — for mixed-auth routes: do NOT use this helper. Use the
 * per-handler `| undefined` guard pattern instead (see shareContractRouter
 * and subtitlerContractRouter for the canonical example). Those routes
 * are *intentionally* reachable without a session, so a throwing helper
 * is the wrong shape.
 *
 * Failure mode: throws `UnauthenticatedError` if `req.user` is not set.
 * This throw is a **programming error guard**, not an expected runtime
 * branch — if it fires in production, it means a contract router was
 * mounted without `requireAuth` being applied at the prefix (as happened
 * with boardsContractRouter before commit 25f8bac8). The error should
 * propagate to Express's default handler and produce a 500; the loud
 * failure exists to make the misconfiguration obvious and traceable.
 * Auth middleware that runs before any contract handler (via
 * `app.use(prefix, requireAuth)`) ensures this path is unreachable for
 * correctly-mounted routes.
 */

import { type UserProfile } from '@gruenerator/contracts';

/**
 * Thrown by `getAuthedUser` when `req.user` is unexpectedly undefined.
 *
 * The `name` discriminant lets future error middleware convert this to
 * a typed 401 response via `instanceof` check, instead of the default
 * 500 produced by an unhandled throw.
 */
export class UnauthenticatedError extends Error {
  constructor(message = 'req.user is undefined — route is missing requireAuth middleware') {
    super(message);
    this.name = 'UnauthenticatedError';
  }
}

/**
 * Returns the authenticated user attached to the request, or throws
 * `UnauthenticatedError` if it's missing.
 *
 * Callers must have `requireAuth` middleware running earlier in the
 * Express chain — otherwise this throws.
 *
 * The parameter is intentionally typed as `{ user?: unknown }` rather than
 * Express's `Request`, because ts-rest's `TsRestRequest<Contract>` and the
 * raw `Request` type are not structurally assignable under
 * `exactOptionalPropertyTypes` when the contract's query schema includes
 * nullable fields. The helper only reads `req.user` and doesn't care about
 * the rest of the request shape, so a minimal-surface generic captures the
 * actual dependency precisely.
 */
export function getAuthedUser<R extends { user?: unknown }>(req: R): UserProfile {
  const user = req.user as UserProfile | undefined;
  if (!user) {
    throw new UnauthenticatedError();
  }
  return user;
}
