/**
 * Mobile/Desktop App Authentication Routes
 *
 * Thin surface that covers mobile-specific flows NOT handled by the
 * generic Better Auth routes:
 *   - POST /auth/mobile/logout             — invalidate the caller's Better Auth session
 *   - POST /auth/mobile/register-push-token — upsert an Expo push token into app_push_devices
 *   - GET  /auth/mobile/devices             — list push-capable devices for the caller
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
 * Upsert the caller's Expo push token into `app_push_devices`, keyed
 * by (user_id, expo_push_token).
 */
router.post(
  '/mobile/register-push-token',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: 'unauthorized' });
        return;
      }

      const { expoPushToken, deviceName, deviceType } =
        (req.body as {
          expoPushToken?: string;
          deviceName?: string;
          deviceType?: string;
        }) ?? {};

      if (!expoPushToken) {
        res.status(400).json({
          success: false,
          error: 'missing_params',
          message: 'expoPushToken is required',
        });
        return;
      }

      if (
        !expoPushToken.startsWith('ExponentPushToken[') &&
        !expoPushToken.startsWith('ExpoPushToken[')
      ) {
        res.status(400).json({
          success: false,
          error: 'invalid_push_token',
          message: 'Invalid Expo push token format',
        });
        return;
      }

      const userAgent = req.headers['user-agent'] ?? '';
      const uaLower = userAgent.toLowerCase();
      const resolvedDeviceType =
        deviceType ??
        (uaLower.includes('android')
          ? 'android'
          : uaLower.includes('iphone')
            ? 'ios'
            : uaLower.includes('tauri')
              ? 'desktop'
              : 'unknown');

      const resolvedDeviceName = deviceName ?? (userAgent ? userAgent.substring(0, 255) : null);

      const { registerPushToken } = await import('../../services/pushNotificationService.js');
      await registerPushToken(userId, expoPushToken, {
        ...(resolvedDeviceName ? { deviceName: resolvedDeviceName } : {}),
        deviceType: resolvedDeviceType,
      });

      log.info('[MobileAuth] Push token registered', { userId });
      res.json({ success: true });
    } catch (error) {
      log.error('[MobileAuth] Error registering push token:', { error });
      res.status(500).json({ success: false, error: 'server_error' });
    }
  }
);

/**
 * GET /auth/mobile/devices
 *
 * List the caller's push-capable devices.
 */
router.get('/mobile/devices', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'unauthorized' });
      return;
    }

    const { getUserDevices } = await import('../../services/pushNotificationService.js');
    const devices = await getUserDevices(userId);

    res.json({ success: true, devices });
  } catch (error) {
    log.error('[MobileAuth] Error getting devices:', { error });
    res.status(500).json({ success: false, error: 'server_error' });
  }
});

export default router;
