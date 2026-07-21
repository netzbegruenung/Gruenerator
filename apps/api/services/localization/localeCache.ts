/**
 * Short-TTL, DB-backed locale cache.
 *
 * `req.user.locale` is served by Better Auth from its 300s `ba.session_data`
 * cookie cache, which lags the DB after a locale change (settings toggle,
 * login-sync hook, backfill) and — with SSO — may not rotate on re-login. The
 * DB (`profiles.locale`) is the source of truth. The auth middleware overlays
 * `req.user.locale` with `getUserLocale()` so every downstream reader
 * (extractLocaleFromRequest, chat, sharepic, subtitler) sees the current value
 * without touching call sites. Redis-backed so a locale write invalidates all
 * cluster workers; TTL bounds staleness to ~60s on the read-through path.
 */
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';
import { getProfileService } from '../user/index.js';

const log = createLogger('localeCache');

type Locale = 'de-DE' | 'de-AT';
const TTL_SECONDS = 60;
const key = (userId: string): string => `locale:${userId}`;

function isLocale(value: unknown): value is Locale {
  return value === 'de-DE' || value === 'de-AT';
}

/**
 * Resolve a user's locale from Redis (fast path) or the DB (read-through,
 * cached for {@link TTL_SECONDS}). Returns null only on total failure so the
 * caller can fall back to whatever it had (e.g. the session snapshot).
 */
export async function getUserLocale(userId: string): Promise<Locale | null> {
  try {
    const cached = (await redisClient.get(key(userId))) as string | null;
    if (isLocale(cached)) return cached;
  } catch (err) {
    log.warn(`redis get failed for ${userId}: ${(err as Error).message}`);
  }

  try {
    const profile = await getProfileService().getProfileById(userId);
    const locale: Locale = isLocale(profile?.locale) ? profile.locale : 'de-DE';
    try {
      await redisClient.set(key(userId), locale, { EX: TTL_SECONDS });
    } catch {
      // best-effort cache write
    }
    return locale;
  } catch (err) {
    log.warn(`db locale read failed for ${userId}: ${(err as Error).message}`);
    return null;
  }
}

/** Write-through: set the cached locale immediately after a DB write. */
export async function setUserLocale(userId: string, locale: Locale): Promise<void> {
  try {
    await redisClient.set(key(userId), locale, { EX: TTL_SECONDS });
  } catch (err) {
    log.warn(`redis set failed for ${userId}: ${(err as Error).message}`);
  }
}

/** Drop the cached locale (next read re-reads the DB). */
export async function invalidateUserLocale(userId: string): Promise<void> {
  try {
    await redisClient.del(key(userId));
  } catch (err) {
    log.warn(`redis del failed for ${userId}: ${(err as Error).message}`);
  }
}
