/**
 * How many people run which mobile bundle — the store build or an OTA update.
 *
 * The app names its bundle in request headers (`appIdentityHeaders` in
 * apps/mobile/services/appUpdate.ts); after authentication the account is added
 * to a per-day HyperLogLog for that bundle. A HyperLogLog keeps no ids, only an
 * estimate (±0.81 %), which is all an adoption curve needs.
 *
 * Redis layout, one UTC day each, expiring after RETENTION_DAYS:
 *   app-bundles:<day>            SET of bundle keys seen that day
 *   app-bundles:<day>:<bundle>   HLL of account ids
 */
import { type InstanceAdminAppBundle } from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/client.js';

import type { IncomingHttpHeaders } from 'node:http';

const log = createLogger('appBundleUsage');

const RETENTION_DAYS = 30;
const PREFIX = 'app-bundles';
const EMBEDDED = 'embedded';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface AppBundle {
  platform: 'ios' | 'android';
  appVersion: string;
  updateId: string | null;
  updateDate: string | null;
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  return typeof value === 'string' ? value : null;
}

/** The bundle a request names, or null when it names none or anything malformed. */
export function parseAppBundle(headers: IncomingHttpHeaders): AppBundle | null {
  const update = header(headers, 'x-app-update');
  if (update === null) return null;

  const platform = header(headers, 'x-app-platform');
  const appVersion = header(headers, 'x-app-version');
  if (platform !== 'ios' && platform !== 'android') return null;
  if (appVersion === null || !VERSION_RE.test(appVersion)) return null;

  if (update === EMBEDDED) return { platform, appVersion, updateId: null, updateDate: null };
  if (!UUID_RE.test(update)) return null;

  const date = header(headers, 'x-app-update-date');
  return {
    platform,
    appVersion,
    updateId: update.toLowerCase(),
    updateDate: date !== null && DAY_RE.test(date) ? date : null,
  };
}

function bundleKey(bundle: AppBundle): string {
  return [
    bundle.platform,
    bundle.appVersion,
    bundle.updateId ?? EMBEDDED,
    bundle.updateDate ?? '',
  ].join('|');
}

function parseBundleKey(key: string): AppBundle | null {
  const [platform, appVersion, update, date] = key.split('|');
  if ((platform !== 'ios' && platform !== 'android') || !appVersion || !update) return null;
  return {
    platform,
    appVersion,
    updateId: update === EMBEDDED ? null : update,
    updateDate: date || null,
  };
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Every request of a session carries the same headers; one PFADD per account,
// bundle and day is enough. Only today's set is kept.
let seenDay = '';
let seen = new Set<string>();

export function recordAppBundleUse(bundle: AppBundle, userId: string, now = new Date()): void {
  const day = utcDay(now);
  if (day !== seenDay) {
    seenDay = day;
    seen = new Set();
  }
  const key = bundleKey(bundle);
  const marker = `${key}|${userId}`;
  if (seen.has(marker)) return;
  seen.add(marker);

  const ttl = (RETENTION_DAYS + 1) * 24 * 60 * 60;
  const dayKey = `${PREFIX}:${day}`;
  const usersKey = `${dayKey}:${key}`;
  redisClient
    .multi()
    .sAdd(dayKey, key)
    .expire(dayKey, ttl)
    .pfAdd(usersKey, userId)
    .expire(usersKey, ttl)
    .exec()
    .catch((error: unknown) => {
      // Lost counts are acceptable; retry on the next request of that account.
      seen.delete(marker);
      log.warn(
        `[appBundleUsage] record failed: ${error instanceof Error ? error.message : String(error)}`
      );
    });
}

/** Every bundle seen in the retention window, newest first. */
export async function getAppBundleUsage(now = new Date()): Promise<InstanceAdminAppBundle[]> {
  const days = Array.from({ length: RETENTION_DAYS }, (_, i) =>
    utcDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000))
  );
  const today = days[0];
  const lastWeek = new Set(days.slice(0, 7));

  const daysByBundle = new Map<string, string[]>();
  const members = await Promise.all(days.map((day) => redisClient.sMembers(`${PREFIX}:${day}`)));
  days.forEach((day, i) => {
    for (const key of members[i] ?? []) {
      const seenOn = daysByBundle.get(key) ?? [];
      seenOn.push(day);
      daysByBundle.set(key, seenOn);
    }
  });

  const rows = await Promise.all(
    [...daysByBundle].map(async ([key, seenOn]): Promise<InstanceAdminAppBundle | null> => {
      const bundle = parseBundleKey(key);
      if (!bundle) return null;
      const weekKeys = seenOn
        .filter((day) => lastWeek.has(day))
        .map((day) => `${PREFIX}:${day}:${key}`);
      const [usersToday, usersLast7Days] = await Promise.all([
        seenOn.includes(today ?? '') ? redisClient.pfCount(`${PREFIX}:${today}:${key}`) : 0,
        weekKeys.length > 0 ? redisClient.pfCount(weekKeys) : 0,
      ]);
      // `days` runs newest first, so does every `seenOn`.
      return {
        ...bundle,
        usersToday,
        usersLast7Days,
        firstSeen: seenOn[seenOn.length - 1] ?? '',
        lastSeen: seenOn[0] ?? '',
      };
    })
  );

  return rows
    .filter((row): row is InstanceAdminAppBundle => row !== null)
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || b.usersLast7Days - a.usersLast7Days);
}
