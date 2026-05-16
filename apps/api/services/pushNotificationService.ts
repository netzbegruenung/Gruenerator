/**
 * Push Notification Service
 *
 * Sends Expo Push Notifications to devices registered in app_push_devices.
 * Device identity is keyed by (user_id, expo_push_token) — decoupled from
 * auth tokens so that logout, session rotation, or the Better Auth
 * migration don't silently un-register a device.
 */

import { eq, and, sql } from 'drizzle-orm';

import { appPushDevices } from '../database/schema/index.js';
import { getDrizzleInstance } from '../database/services/DrizzleService.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('push');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushResponse {
  data: Array<{
    id?: string;
    status: 'ok' | 'error';
    message?: string;
    details?: { error?: string };
  }>;
}

export interface DeviceRegistrationInfo {
  deviceName?: string;
  deviceType?: string;
}

/**
 * Upsert an Expo push device for a user.
 *
 * The (user_id, expo_push_token) UNIQUE constraint means a repeat
 * registration from the same device just refreshes `last_seen_at` and
 * any device metadata instead of inserting a duplicate row.
 */
export async function registerPushToken(
  userId: string,
  expoPushToken: string,
  info: DeviceRegistrationInfo = {}
): Promise<void> {
  const db = getDrizzleInstance();
  const now = new Date();

  await db
    .insert(appPushDevices)
    .values({
      userId,
      expoPushToken,
      deviceName: info.deviceName ?? null,
      deviceType: info.deviceType ?? 'unknown',
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: [appPushDevices.userId, appPushDevices.expoPushToken],
      set: {
        deviceName: info.deviceName ?? null,
        deviceType: info.deviceType ?? 'unknown',
        lastSeenAt: now,
      },
    });

  log.info('[Push] Push device registered', { userId });
}

interface PushDeviceRow {
  id: string;
  deviceName: string | null;
  deviceType: string;
  expoPushToken: string;
  lastSeenAt: Date;
}

async function getUserPushDevices(userId: string): Promise<PushDeviceRow[]> {
  const db = getDrizzleInstance();
  return db
    .select({
      id: appPushDevices.id,
      deviceName: appPushDevices.deviceName,
      deviceType: appPushDevices.deviceType,
      expoPushToken: appPushDevices.expoPushToken,
      lastSeenAt: appPushDevices.lastSeenAt,
    })
    .from(appPushDevices)
    .where(eq(appPushDevices.userId, userId))
    .orderBy(appPushDevices.lastSeenAt);
}

interface DeviceInfo {
  id: string;
  device_name: string | null;
  device_type: string;
  has_push_token: boolean;
  last_used_at: string | null;
}

/**
 * Device listing for `/auth/mobile/devices`. Every row in
 * `app_push_devices` has a push token by definition, so `has_push_token`
 * is always true — the field is kept in the response shape for
 * backwards compatibility with existing mobile UIs.
 */
export async function getUserDevices(userId: string): Promise<DeviceInfo[]> {
  const devices = await getUserPushDevices(userId);
  return devices.map((d) => ({
    id: d.id,
    device_name: d.deviceName,
    device_type: d.deviceType,
    has_push_token: true,
    last_used_at: d.lastSeenAt.toISOString(),
  }));
}

/**
 * Send a push notification to all of a user's registered devices.
 * Returns the number of devices the notification was sent to.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const devices = await getUserPushDevices(userId);

  if (devices.length === 0) {
    log.info('[Push] No devices registered for user', { userId });
    return 0;
  }

  const messages = devices.map((device) => ({
    to: device.expoPushToken,
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    sound: 'default' as const,
    priority: 'high' as const,
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      log.error('[Push] Expo Push API returned error', {
        status: response.status,
        statusText: response.statusText,
      });
      return 0;
    }

    const result = (await response.json()) as ExpoPushResponse;

    let sentCount = 0;
    for (let i = 0; i < result.data.length; i++) {
      const ticket = result.data[i];
      if (ticket.status === 'ok') {
        sentCount++;
        await touchLastSeen(devices[i].id);
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        log.info('[Push] Device no longer registered, deleting row', {
          deviceId: devices[i].id,
        });
        await deleteDevice(devices[i].id);
      } else {
        log.warn('[Push] Failed to send to device', {
          deviceId: devices[i].id,
          error: ticket.message,
          details: ticket.details,
        });
      }
    }

    log.info('[Push] Notifications sent', { userId, sentCount, totalDevices: devices.length });
    return sentCount;
  } catch (error) {
    log.error('[Push] Failed to send push notifications', { userId, error });
    return 0;
  }
}

async function touchLastSeen(deviceId: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .update(appPushDevices)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(appPushDevices.id, deviceId));
}

async function deleteDevice(deviceId: string): Promise<void> {
  const db = getDrizzleInstance();
  await db.delete(appPushDevices).where(eq(appPushDevices.id, deviceId));
}

/**
 * Remove a user's registration for a single Expo token (e.g. explicit
 * unregister on logout). No-op if the row is already gone.
 */
export async function unregisterPushToken(userId: string, expoPushToken: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .delete(appPushDevices)
    .where(and(eq(appPushDevices.userId, userId), eq(appPushDevices.expoPushToken, expoPushToken)));
}
