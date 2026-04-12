/**
 * ts-rest contract for notifications endpoints.
 *
 * Covers 6 contractable routes from apps/api/routes/notifications/index.ts.
 * The SSE /stream endpoint is excluded — ts-rest cannot model text/event-stream.
 *
 * All routes are auth-protected (requireAuth at prefix in routes.ts).
 *
 * Notification preferences (GET/PATCH /api/auth/profile/notification-preferences)
 * are also contracted here as they are logically notification-related and live
 * under the same user-facing domain.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  notificationsListResponseSchema,
  unreadCountResponseSchema,
  notificationSuccessResponseSchema,
  notificationsErrorResponseSchema,
  notificationPreferencesResponseSchema,
  updateNotificationPreferencesBodySchema,
} from '../schemas/notifications.js';

const c = initContract();

export const notificationsContract = c.router(
  {
    /**
     * GET /api/notifications
     * Paginated list of notifications for the authenticated user.
     */
    list: {
      method: 'GET',
      path: '/api/notifications',
      query: z.object({
        limit: z.string().nullish(),
        offset: z.string().nullish(),
        unread_only: z.string().nullish(),
      }),
      responses: {
        200: notificationsListResponseSchema,
        401: notificationsErrorResponseSchema,
        500: notificationsErrorResponseSchema,
      },
      summary: 'List notifications',
    },

    /**
     * GET /api/notifications/unread-count
     */
    getUnreadCount: {
      method: 'GET',
      path: '/api/notifications/unread-count',
      responses: {
        200: unreadCountResponseSchema,
        401: notificationsErrorResponseSchema,
        500: notificationsErrorResponseSchema,
      },
      summary: 'Get unread notification count',
    },

    /**
     * PATCH /api/notifications/:id/read
     * Mark a single notification as read.
     */
    markAsRead: {
      method: 'PATCH',
      path: '/api/notifications/:id/read',
      body: z.object({}),
      responses: {
        200: notificationSuccessResponseSchema,
        401: notificationsErrorResponseSchema,
        500: notificationsErrorResponseSchema,
      },
      summary: 'Mark notification as read',
    },

    /**
     * PATCH /api/notifications/read-all
     * Mark all notifications as read.
     */
    markAllAsRead: {
      method: 'PATCH',
      path: '/api/notifications/read-all',
      body: z.object({}),
      responses: {
        200: notificationSuccessResponseSchema,
        401: notificationsErrorResponseSchema,
        500: notificationsErrorResponseSchema,
      },
      summary: 'Mark all notifications as read',
    },

    /**
     * DELETE /api/notifications/:id
     * Dismiss a single notification.
     */
    dismiss: {
      method: 'DELETE',
      path: '/api/notifications/:id',
      body: z.object({}),
      responses: {
        200: notificationSuccessResponseSchema,
        401: notificationsErrorResponseSchema,
        500: notificationsErrorResponseSchema,
      },
      summary: 'Dismiss a notification',
    },

    /**
     * DELETE /api/notifications
     * Dismiss all notifications.
     */
    dismissAll: {
      method: 'DELETE',
      path: '/api/notifications',
      body: z.object({}),
      responses: {
        200: notificationSuccessResponseSchema,
        401: notificationsErrorResponseSchema,
        500: notificationsErrorResponseSchema,
      },
      summary: 'Dismiss all notifications',
    },

    /**
     * GET /api/auth/profile/notification-preferences
     * Get per-category, per-channel notification preferences.
     */
    getPreferences: {
      method: 'GET',
      path: '/api/auth/profile/notification-preferences',
      responses: {
        200: notificationPreferencesResponseSchema,
        401: notificationsErrorResponseSchema,
        500: notificationsErrorResponseSchema,
      },
      summary: 'Get notification preferences',
    },

    /**
     * PATCH /api/auth/profile/notification-preferences
     * Update notification preferences for a category.
     */
    updatePreferences: {
      method: 'PATCH',
      path: '/api/auth/profile/notification-preferences',
      body: updateNotificationPreferencesBodySchema,
      responses: {
        200: notificationPreferencesResponseSchema,
        400: notificationsErrorResponseSchema,
        401: notificationsErrorResponseSchema,
        500: notificationsErrorResponseSchema,
      },
      summary: 'Update notification preferences',
    },
  },
  { pathPrefix: '' }
);
