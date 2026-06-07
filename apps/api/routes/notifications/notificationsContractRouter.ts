/**
 * ts-rest contract router for notification endpoints.
 *
 * Covers 8 routes:
 *   - GET  /api/notifications
 *   - GET  /api/notifications/unread-count
 *   - PATCH /api/notifications/:id/read
 *   - PATCH /api/notifications/read-all
 *   - DELETE /api/notifications/:id
 *   - DELETE /api/notifications
 *   - GET  /api/auth/profile/notification-preferences
 *   - PATCH /api/auth/profile/notification-preferences
 *   - PUT  /api/auth/profile/notification-preferences/level
 *
 * NOT contracted: GET /api/notifications/stream (SSE — text/event-stream).
 *
 * All routes require authentication — enforced via requireAuth middleware in
 * routes.ts before the contract router is mounted.
 */

import { notificationsContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import {
  getNotificationsForUser,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  dismissNotification,
  dismissAllNotifications,
} from '../../services/notifications/index.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('notificationsContractRouter');

const PAGE_SIZE = 50;

const s = initServer();

export const notificationsContractRouter = s.router(notificationsContract, {
  list: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const limit = Math.min(parseInt(String(args.query.limit ?? '20')) || 20, PAGE_SIZE);
      const offset = parseInt(String(args.query.offset ?? '0')) || 0;
      const unreadOnly = args.query.unread_only === 'true';

      const rows = await getNotificationsForUser(userId, { limit, offset, unreadOnly });
      const body = rows.map((n) => ({
        ...n,
        read_at: n.read_at instanceof Date ? n.read_at.toISOString() : n.read_at,
        created_at: n.created_at instanceof Date ? n.created_at.toISOString() : n.created_at,
      }));
      return { status: 200 as const, body };
    } catch (error) {
      log.error('[notificationsContract.list] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to get notifications' } };
    }
  },

  getUnreadCount: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const count = await getUnreadCount(userId);
      return { status: 200 as const, body: { count } };
    } catch (error) {
      log.error('[notificationsContract.getUnreadCount] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to get unread count' } };
    }
  },

  markAsRead: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      await markAsRead(args.params.id, userId);
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[notificationsContract.markAsRead] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to mark as read' } };
    }
  },

  markAllAsRead: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      await markAllAsRead(userId);
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[notificationsContract.markAllAsRead] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to mark all as read' } };
    }
  },

  dismiss: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      await dismissNotification(args.params.id, userId);
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[notificationsContract.dismiss] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to dismiss notification' } };
    }
  },

  dismissAll: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      await dismissAllNotifications(userId);
      return { status: 200 as const, body: { success: true } };
    } catch (error) {
      log.error('[notificationsContract.dismissAll] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to dismiss all' } };
    }
  },

  getPreferences: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { getPreferencesForUser, getDefaultPreferences, deriveLevel } =
        await import('../../services/notifications/notificationPreferences.js');
      const preferences = await getPreferencesForUser(userId);
      const defaults = getDefaultPreferences();
      const level = deriveLevel(preferences);
      return { status: 200 as const, body: { success: true, level, preferences, defaults } };
    } catch (error) {
      log.error('[notificationsContract.getPreferences] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to load notification preferences' } };
    }
  },

  updatePreferences: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { category, channels } = args.body;

      const { ALL_NOTIFICATION_TYPES } = await import('../../services/notifications/types.js');
      if (!(ALL_NOTIFICATION_TYPES as readonly string[]).includes(category)) {
        return {
          status: 400 as const,
          body: { error: `Unbekannter Benachrichtigungstyp: ${category}` },
        };
      }

      const { getPreferencesForUser, getDefaultPreferences, deriveLevel } =
        await import('../../services/notifications/notificationPreferences.js');
      const { getProfileService } = await import('../../services/user/ProfileService.js');

      const profileService = getProfileService();
      const profile = await profileService.getProfileById(userId);
      const currentNotifications = profile?.user_defaults?.notifications ?? {};
      const defaults = getDefaultPreferences();
      const currentChannels = currentNotifications[category];

      let base: { email: boolean; push: boolean; in_app: boolean };
      if (
        currentChannels &&
        typeof currentChannels === 'object' &&
        !Array.isArray(currentChannels)
      ) {
        base = currentChannels as { email: boolean; push: boolean; in_app: boolean };
      } else if (typeof currentChannels === 'boolean') {
        base = {
          email: currentChannels,
          push: defaults[category as keyof typeof defaults]?.push ?? true,
          in_app: defaults[category as keyof typeof defaults]?.in_app ?? true,
        };
      } else {
        base = {
          ...(defaults[category as keyof typeof defaults] ?? {
            email: true,
            push: true,
            in_app: true,
          }),
        };
      }

      const merged = {
        email: typeof channels.email === 'boolean' ? channels.email : base.email,
        push: typeof channels.push === 'boolean' ? channels.push : base.push,
        in_app: typeof channels.in_app === 'boolean' ? channels.in_app : base.in_app,
      };

      await profileService.updateUserDefault(userId, 'notifications', category, merged);

      const preferences = await getPreferencesForUser(userId);
      const level = deriveLevel(preferences);
      return { status: 200 as const, body: { success: true, level, preferences, defaults } };
    } catch (error) {
      log.error('[notificationsContract.updatePreferences] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to update notification preferences' } };
    }
  },

  setPreferenceLevel: async (args) => {
    try {
      const userId = getAuthedUser(args.req).id;
      const { level } = args.body;

      const { applyLevelForUser, getDefaultPreferences, deriveLevel } =
        await import('../../services/notifications/notificationPreferences.js');

      const preferences = await applyLevelForUser(userId, level);
      const defaults = getDefaultPreferences();
      const resolvedLevel = deriveLevel(preferences);
      return {
        status: 200 as const,
        body: { success: true, level: resolvedLevel, preferences, defaults },
      };
    } catch (error) {
      log.error('[notificationsContract.setPreferenceLevel] Error:', error);
      return { status: 500 as const, body: { error: 'Failed to apply notification level' } };
    }
  },
});

/**
 * Mount the ts-rest notifications contract router onto an Express app.
 * Call from routes.ts BEFORE the legacy notifications router and BEFORE
 * the legacy authRouter so ts-rest handles matched routes first.
 *
 * requireAuth must be applied at both /api/notifications and
 * /api/auth/profile before this mount call (or per-middleware in routes.ts).
 */
export function mountNotificationsContractRouter(app: Application): void {
  createExpressEndpoints(notificationsContract, notificationsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'notificationsContract'),
  });
}
