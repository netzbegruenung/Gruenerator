/**
 * Push Notification Service
 * Sends Expo Push Notifications to mobile devices registered via app_refresh_tokens.
 */

import { eq, and, isNotNull, isNull, gt, sql } from 'drizzle-orm';
import { getDrizzleInstance } from '../database/services/DrizzleService.js';
import { appRefreshTokens } from '../database/schema/index.js';
import { type AppRefreshTokenRow } from '../database/types.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('push');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

type DeviceRow = Pick<
  AppRefreshTokenRow,
  'id' | 'device_name' | 'device_type' | 'push_token' | 'last_used_at'
>;

type DrizzleDeviceRow = typeof appRefreshTokens.$inferSelect;

/**
 * Map Drizzle result (camelCase fields) to DeviceRow (snake_case fields)
 */
function toDeviceRow(row: DrizzleDeviceRow): DeviceRow {
  return {
    id: row.id,
    device_name: row.deviceName,
    device_type: row.deviceType,
    push_token: row.pushToken,
    last_used_at: row.lastUsedAt,
  };
}

interface ExpoPushResponse {
  data: Array<{
    id?: string;
    status: 'ok' | 'error';
    message?: string;
    details?: { error?: string };
  }>;
}

/**
 * Register or update an Expo push token for a device (identified by refresh token hash).
 */
export async function registerPushToken(
  userId: string,
  refreshTokenHash: string,
  expoPushToken: string
): Promise<void> {
  const db = getDrizzleInstance();

  const result = await db
    .update(appRefreshTokens)
    .set({ pushToken: expoPushToken, pushTokenUpdatedAt: new Date() })
    .where(
      and(
        eq(appRefreshTokens.tokenHash, refreshTokenHash),
        eq(appRefreshTokens.userId, userId),
        isNull(appRefreshTokens.revokedAt)
      )
    )
    .returning({ id: appRefreshTokens.id });

  if (result.length === 0) {
    log.warn('[Push] No matching active refresh token found for push registration', { userId });
    return;
  }

  log.info('[Push] Push token registered', { userId, deviceId: result[0].id });
}

/**
 * Get all devices with active push tokens for a user.
 */
export async function getUserDevicesWithPush(userId: string): Promise<DeviceRow[]> {
  const db = getDrizzleInstance();

  const result = await db
    .select()
    .from(appRefreshTokens)
    .where(
      and(
        eq(appRefreshTokens.userId, userId),
        isNotNull(appRefreshTokens.pushToken),
        isNull(appRefreshTokens.revokedAt),
        gt(appRefreshTokens.expiresAt, new Date())
      )
    )
    .orderBy(appRefreshTokens.lastUsedAt);

  return result.map(toDeviceRow);
}

/**
 * Get all devices (with or without push tokens) for a user.
 */
interface DeviceInfo {
  id: string;
  device_name: string | null;
  device_type: string;
  has_push_token: boolean;
  last_used_at: string | null;
}

export async function getUserDevices(userId: string): Promise<DeviceInfo[]> {
  const db = getDrizzleInstance();

  const result = await db
    .select({
      id: appRefreshTokens.id,
      device_name: appRefreshTokens.deviceName,
      device_type: appRefreshTokens.deviceType,
      has_push_token: sql<boolean>`(${appRefreshTokens.pushToken} IS NOT NULL)`,
      last_used_at: appRefreshTokens.lastUsedAt,
    })
    .from(appRefreshTokens)
    .where(
      and(
        eq(appRefreshTokens.userId, userId),
        isNull(appRefreshTokens.revokedAt),
        gt(appRefreshTokens.expiresAt, new Date())
      )
    )
    .orderBy(appRefreshTokens.lastUsedAt);

  return result.map((row) => ({
    id: row.id,
    device_name: row.device_name,
    device_type: row.device_type,
    has_push_token: row.has_push_token,
    last_used_at: row.last_used_at ? row.last_used_at.toISOString() : null,
  }));
}

/**
 * Send a push notification to all of a user's registered devices.
 * Returns the number of devices the notification was sent to.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const devices = await getUserDevicesWithPush(userId);

  if (devices.length === 0) {
    log.info('[Push] No devices with push tokens for user', { userId });
    return 0;
  }

  const messages = devices.map((device) => ({
    to: device.push_token,
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

    // Handle per-token errors (e.g. DeviceNotRegistered)
    let sentCount = 0;
    for (let i = 0; i < result.data.length; i++) {
      const ticket = result.data[i];
      if (ticket.status === 'ok') {
        sentCount++;
      } else if (ticket.details?.error === 'DeviceNotRegistered') {
        log.info('[Push] Device no longer registered, clearing push token', {
          deviceId: devices[i].id,
        });
        await clearPushToken(devices[i].id);
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

async function clearPushToken(deviceId: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .update(appRefreshTokens)
    .set({ pushToken: null, pushTokenUpdatedAt: new Date() })
    .where(eq(appRefreshTokens.id, deviceId));
}
