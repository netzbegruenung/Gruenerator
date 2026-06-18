/**
 * useNotificationsTyped — typed ts-rest client wrappers for notification endpoints.
 *
 * Thin helper used internally by useNotifications.ts and useNotificationPreferences.ts
 * to replace raw apiClient calls with contract-typed calls.
 *
 * Throws on non-2xx responses so TanStack Query surfaces them as errors.
 */

import { getContractsClient } from '@gruenerator/shared/api';

export async function fetchNotificationsPage(limit: number, offset: number) {
  const client = getContractsClient();
  const result = await client.notifications.list({
    query: {
      limit: String(limit),
      offset: String(offset),
      // Unread-only: the popover and the bell badge both derive from this one
      // list, so the badge can never disagree with what the popover shows.
      unread_only: 'true',
    },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to fetch notifications (HTTP ${result.status})`);
  }
  return result.body;
}

export async function fetchUnreadCount(): Promise<number> {
  const client = getContractsClient();
  const result = await client.notifications.getUnreadCount();
  if (result.status !== 200) {
    throw new Error(`Failed to fetch unread count (HTTP ${result.status})`);
  }
  return result.body.count;
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const client = getContractsClient();
  const result = await client.notifications.markAsRead({
    params: { id: notificationId },
    body: {},
  });
  if (result.status !== 200) {
    throw new Error(`Failed to mark notification as read (HTTP ${result.status})`);
  }
}

export async function dismissNotificationById(notificationId: string): Promise<void> {
  const client = getContractsClient();
  const result = await client.notifications.dismiss({
    params: { id: notificationId },
    body: {},
  });
  if (result.status !== 200) {
    throw new Error(`Failed to dismiss notification (HTTP ${result.status})`);
  }
}

export async function dismissAllNotificationsClient(): Promise<void> {
  const client = getContractsClient();
  const result = await client.notifications.dismissAll({ body: {} });
  if (result.status !== 200) {
    throw new Error(`Failed to dismiss all notifications (HTTP ${result.status})`);
  }
}

export async function fetchNotificationPreferences() {
  const client = getContractsClient();
  const result = await client.notifications.getPreferences();
  if (result.status !== 200) {
    throw new Error(`Failed to fetch notification preferences (HTTP ${result.status})`);
  }
  return result.body;
}

export async function updateNotificationPreferences(
  category: string,
  channels: { email?: boolean | null; push?: boolean | null; in_app?: boolean | null }
) {
  const client = getContractsClient();
  const result = await client.notifications.updatePreferences({
    body: { category, channels },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to update notification preferences (HTTP ${result.status})`);
  }
  return result.body;
}

export async function applyNotificationLevel(level: 'low' | 'medium' | 'high') {
  const client = getContractsClient();
  const result = await client.notifications.setPreferenceLevel({
    body: { level },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to apply notification level (HTTP ${result.status})`);
  }
  return result.body;
}
