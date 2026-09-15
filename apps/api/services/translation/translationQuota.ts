/**
 * Per-user daily character budget for DeepL. Text and documents share it; a
 * document is booked with DeepL's own 50 000-character minimum.
 *
 * Its own small Redis counter rather than `utils/redis/RateLimiter.ts`: that
 * one counts requests (`INCR` by one) against a fixed per-resource limit, and
 * a request cap sold as a character budget would be a lie — one request may
 * be 50 000 characters. Redis trouble lets the call through with a warning,
 * like `allowOnRedisError` elsewhere: a broken counter must not take the
 * feature down.
 *
 * Day boundary is UTC, so the reset time is the same on every host.
 */
import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';

const log = createLogger('TranslationQuota');

const TTL_SECONDS = 48 * 60 * 60;

/** DeepL bills docx/pptx/xlsx/pdf at least this much per file. */
export const DOCUMENT_MIN_CHARS = 50_000;

export interface QuotaStatus {
  used: number;
  limit: number;
}

export class TranslationQuotaExceededError extends Error {
  constructor(readonly quota: QuotaStatus) {
    super(
      `Tagesbudget für Übersetzungen erschöpft (${quota.used.toLocaleString('de-DE')} von ${quota.limit.toLocaleString('de-DE')} Zeichen).`
    );
    this.name = 'TranslationQuotaExceededError';
  }
}

function dayKey(userId: string): string {
  return `deepl:chars:${userId}:${new Date().toISOString().slice(0, 10)}`;
}

function limit(): number {
  return env.DEEPL_DAILY_CHARS_PER_USER;
}

export async function getQuota(userId: string): Promise<QuotaStatus> {
  try {
    const raw = await redisClient.get(dayKey(userId));
    const used = typeof raw === 'string' ? parseInt(raw, 10) || 0 : 0;
    return { used, limit: limit() };
  } catch (error) {
    log.warn(`[TranslationQuota] read failed, assuming 0: ${(error as Error).message}`);
    return { used: 0, limit: limit() };
  }
}

/** Throws `TranslationQuotaExceededError` when `estimate` more characters would cross the limit. */
export async function assertQuota(userId: string, estimate: number): Promise<QuotaStatus> {
  const quota = await getQuota(userId);
  if (quota.used + estimate > quota.limit) {
    throw new TranslationQuotaExceededError(quota);
  }
  return quota;
}

/** Books `billed` characters after a successful DeepL call. */
export async function settleQuota(userId: string, billed: number): Promise<QuotaStatus> {
  if (billed <= 0) return getQuota(userId);
  const key = dayKey(userId);
  try {
    const used = await redisClient.incrBy(key, billed);
    if (used === billed) await redisClient.expire(key, TTL_SECONDS);
    return { used, limit: limit() };
  } catch (error) {
    log.warn(`[TranslationQuota] settle failed for ${userId}: ${(error as Error).message}`);
    return { used: billed, limit: limit() };
  }
}
