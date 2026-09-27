/**
 * Mobile/Desktop App Authentication Routes
 *
 * Thin surface that covers mobile-specific flows NOT handled by the
 * generic Better Auth routes:
 *   - POST /auth/mobile/logout             — invalidate the caller's Better Auth session
 *   - POST /auth/mobile/register-push-token — tombstone for shipped binaries (no-op)
 *
 * Login/session/refresh flows are all handled by Better Auth itself:
 *   - OAuth entry: apps/api/routes/auth/appLogin.ts
 *   - Session exchange: apps/api/plugins/mobileTokenExchange.ts (/auth/v2/token-exchange-code)
 *   - Session read: /auth/v2/get-session (via bearer() plugin)
 */

import { fromNodeHeaders } from 'better-auth/node';
import express, { type Response, type Request } from 'express';

import { auth } from '../../config/betterAuth.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('mobileAuth');
const router = express.Router();

/**
 * POST /auth/mobile/logout
 *
 * Invalidate the caller's Better Auth session via auth.api.signOut.
 * The `bearer()` plugin teaches signOut to accept the Authorization
 * header, so the session row is deleted server-side rather than
 * sitting live until natural expiry. Always responds success so the
 * client can proceed with local cleanup even when there's no session
 * to invalidate.
 */
router.post('/mobile/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    await auth.api.signOut({ headers: fromNodeHeaders(req.headers) });
  } catch (err) {
    log.debug('[MobileAuth] signOut skipped', { reason: (err as Error).message });
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * POST /auth/mobile/register-push-token
 *
 * Tombstone. Push notifications were removed — nothing is stored and nothing
 * is sent. The route stays because every already-installed binary calls it on
 * **every app start** (`useAppInitialization`), and a 404 there would print an
 * error on a path the user cannot update away from. It answers 200 and drops
 * the token on the floor.
 *
 * Delete once the install base for pre-removal builds is negligible.
 */
router.post('/mobile/register-push-token', requireAuth, (_req: Request, res: Response): void => {
  res.json({ success: true, message: 'Push notifications are disabled' });
});

export default router;
