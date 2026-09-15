/**
 * Speech Seconds Counter
 *
 * Daily budget of generated audio per user for Grünerator Voice, in seconds of
 * output — the unit the provider bills and `speech_seconds` in the usage tab
 * already reports. One Redis key per user and UTC day, expiring at UTC
 * midnight (the key name and the TTL agree on the same clock; the sibling
 * counters mix local and UTC and reset twice a day on a non-UTC host).
 *
 * Reserve-then-reconcile: a request books its estimate atomically with INCRBY
 * before any audio is generated, so parallel requests from one account cannot
 * all pass a read-then-act check; after synthesis the difference to the real
 * seconds is corrected — also when the request failed part-way, because the
 * provider was paid for what it delivered.
 *
 * The allowance itself is `SPEECH_DAILY_LIMIT_SECONDS` in `@gruenerator/contracts`,
 * passed in by the one caller (speechService), so the number lives in one place.
 */

import type { RedisIncrByClient } from './types.js';

export interface SpeechQuotaStatus {
  usedSeconds: number;
  limitSeconds: number;
}

export type SpeechReservation =
  | { ok: true; status: SpeechQuotaStatus }
  /** `exceeded`: nothing was booked. `unavailable`: Redis is down — fail closed. */
  | { ok: false; reason: 'exceeded' | 'unavailable' };

export class SpeechSecondsCounter {
  private redis: RedisIncrByClient;
  private limitSeconds: number;

  constructor(redisClient: RedisIncrByClient, limitSeconds: number) {
    this.redis = redisClient;
    this.limitSeconds = limitSeconds;
  }

  private key(userId: string): string {
    const today = new Date().toISOString().split('T')[0];
    return `speech_seconds:${userId}:${today}`;
  }

  private secondsUntilUtcMidnight(): number {
    const now = Date.now();
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    return Math.max(60, Math.floor((next.getTime() - now) / 1000));
  }

  private failClosed(): SpeechQuotaStatus {
    return { usedSeconds: this.limitSeconds, limitSeconds: this.limitSeconds };
  }

  async status(userId: string): Promise<SpeechQuotaStatus> {
    if (!userId || this.redis.isReady === false) return this.failClosed();
    try {
      const raw = await this.redis.get(this.key(userId));
      const used = parseInt(raw ?? '0', 10) || 0;
      return { usedSeconds: used, limitSeconds: this.limitSeconds };
    } catch (error) {
      console.error('[SpeechSecondsCounter] Error reading quota:', error);
      return this.failClosed();
    }
  }

  /** Books `seconds` up front; rolled back and refused when that crosses the limit. */
  async reserve(userId: string, seconds: number): Promise<SpeechReservation> {
    if (!userId || this.redis.isReady === false) return { ok: false, reason: 'unavailable' };
    const amount = Math.max(0, Math.round(seconds));
    try {
      const key = this.key(userId);
      const used = await this.redis.incrBy(key, amount);
      await this.redis.expire(key, this.secondsUntilUtcMidnight());
      if (used > this.limitSeconds) {
        await this.redis.incrBy(key, -amount);
        return { ok: false, reason: 'exceeded' };
      }
      return { ok: true, status: { usedSeconds: used, limitSeconds: this.limitSeconds } };
    } catch (error) {
      console.error('[SpeechSecondsCounter] Error reserving seconds:', error);
      return { ok: false, reason: 'unavailable' };
    }
  }

  /** Corrects a reservation by the real outcome; a negative delta gives seconds back. */
  async adjust(userId: string, deltaSeconds: number): Promise<SpeechQuotaStatus> {
    const delta = Math.round(deltaSeconds);
    if (!userId || this.redis.isReady === false || delta === 0) return this.status(userId);
    try {
      const key = this.key(userId);
      const used = await this.redis.incrBy(key, delta);
      await this.redis.expire(key, this.secondsUntilUtcMidnight());
      return { usedSeconds: Math.max(0, used), limitSeconds: this.limitSeconds };
    } catch (error) {
      console.error('[SpeechSecondsCounter] Error adjusting seconds:', error);
      return this.failClosed();
    }
  }
}
