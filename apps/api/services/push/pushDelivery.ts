/**
 * Fan-out of notifications to app push: throttle, look up live devices, seal
 * per device, hand to APNs or FCM, drop devices Apple/Google report as gone.
 *
 * Callers (NotificationService) have already decided that the push channel is
 * on for each row; this module only knows how to deliver.
 */
import { pushPriorityOf, type NotificationType } from '@gruenerator/contracts';
import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';

import { ba_sessions, pushDevices } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';
import { ensureConnected, redisClient } from '../../utils/redis/client.js';

import { apnsConfigured, sendApns, type SendResult } from './apnsSender.js';
import { fcmConfigured, sendFcm } from './fcmSender.js';
import { buildPlaintext, collapseIdFor, sealForDevice } from './pushCrypto.js';
import { removePushDevices } from './pushDevices.js';

const log = createLogger('pushDelivery');

/** A push that waited a day is stale; the bell still has the entry. */
export const PUSH_TTL_SECONDS = 24 * 60 * 60;
/** One push per user and thread (groupKey) in this window; the rest stays in-app. */
export const PUSH_THROTTLE_SECONDS = 120;
const SEND_SLICE = 20;

export interface PushInput {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  group_key: string | null;
}

/**
 * Leading-edge throttle per (user, groupKey). Notifications without a
 * groupKey (mentions, task results) are personal and never throttled.
 * Fail-open: a Redis hiccup must not swallow a push.
 */
async function passesThrottle(row: PushInput): Promise<boolean> {
  if (!row.group_key) return true;
  try {
    await ensureConnected();
    const claimed = await redisClient.set(`push:throttle:${row.user_id}:${row.group_key}`, '1', {
      NX: true,
      EX: PUSH_THROTTLE_SECONDS,
    });
    return claimed !== null;
  } catch (err) {
    log.warn('Push throttle unavailable, sending anyway', {
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

let warnedUnconfigured = false;

export async function deliverPush(rows: PushInput[]): Promise<void> {
  const eligible = rows.filter((r) => pushPriorityOf(r.type as NotificationType) !== null);
  const passed = (
    await Promise.all(eligible.map(async (r) => ((await passesThrottle(r)) ? r : null)))
  ).filter((r): r is PushInput => r !== null);
  if (passed.length === 0) return;

  const db = getDrizzleInstance();
  // A device only receives pushes while the session that registered it lives.
  // session_id IS NULL exists only for dev-bypass registrations (the router
  // refuses it everywhere else).
  const devices = await db
    .select({
      id: pushDevices.id,
      user_id: pushDevices.user_id,
      platform: pushDevices.platform,
      token: pushDevices.token,
      key: pushDevices.key,
      apns_environment: pushDevices.apns_environment,
    })
    .from(pushDevices)
    .leftJoin(ba_sessions, eq(ba_sessions.id, pushDevices.session_id))
    .where(
      and(
        inArray(pushDevices.user_id, [...new Set(passed.map((r) => r.user_id))]),
        or(isNull(pushDevices.session_id), gt(ba_sessions.expires_at, sql`now()`))
      )
    );
  // Without credentials a platform is off (local dev, half-done setup).
  const usable = devices.filter((d) => (d.platform === 'ios' ? apnsConfigured() : fcmConfigured()));
  if (usable.length < devices.length && !warnedUnconfigured) {
    warnedUnconfigured = true;
    log.warn('App push partly unconfigured', { apns: apnsConfigured(), fcm: fcmConfigured() });
  }
  if (usable.length === 0) return;

  const expiresAt = Math.floor(Date.now() / 1000) + PUSH_TTL_SECONDS;
  const jobs = passed.flatMap((row) => {
    const priority = pushPriorityOf(row.type as NotificationType) ?? 'normal';
    return usable
      .filter((d) => d.user_id === row.user_id)
      .map((device) => ({ device, row, priority }));
  });

  const gone: string[] = [];
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < jobs.length; i += SEND_SLICE) {
    const results = await Promise.allSettled(
      jobs.slice(i, i + SEND_SLICE).map(async ({ device, row, priority }): Promise<SendResult> => {
        const collapse = row.group_key ? collapseIdFor(device.key, row.group_key) : null;
        const sealed = sealForDevice(device.key, buildPlaintext(row, collapse));
        const result =
          device.platform === 'ios'
            ? await sendApns({
                token: device.token,
                environment: device.apns_environment ?? 'production',
                priority,
                collapseId: collapse,
                sealed,
                expiresAt,
              })
            : await sendFcm({
                token: device.token,
                priority,
                sealed,
                ttlSeconds: PUSH_TTL_SECONDS,
              });
        if (!result.ok && result.unregistered) gone.push(device.id);
        return result;
      })
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.ok) sent++;
      else {
        failed++;
        log.warn('Push send failed', {
          reason:
            r.status === 'rejected'
              ? String(r.reason)
              : r.value.ok
                ? ''
                : `${r.value.status} ${r.value.reason}`,
        });
      }
    }
  }

  await removePushDevices(gone);
  log.info('Push delivered', {
    notifications: passed.length,
    sent,
    failed,
    removed: gone.length,
  });
}
