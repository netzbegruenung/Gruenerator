/**
 * Deep Research Counter
 *
 * Tracks daily usage of Linkup's deep-research endpoint per user in Redis.
 * This is the most expensive call in the product (Linkup bills per deep
 * research, not per search) — the daily quota is a hard 1-per-user gate,
 * reset at midnight.
 */

import type { RedisClient, DeepResearchStatus, DeepResearchResult } from './types.js';

const DEFAULT_DAILY_RESEARCHES = 1;

export class DeepResearchCounter {
  private redis: RedisClient;
  private dailyLimit: number;

  /**
   * `dailyLimit` is a parameter because the two paths behind `@deepresearch`
   * cost very different amounts. Linkup's `sourcedAnswer` (the fallback) is
   * billed per deep research and stays at one per day; the research agent only
   * ever buys ordinary searches plus at most two `deep` ones, so it is allowed
   * three. Both share ONE Redis key on purpose — a user cannot spend their
   * agent runs and then still get a free sourcedAnswer.
   */
  constructor(redisClient: RedisClient, dailyLimit: number = DEFAULT_DAILY_RESEARCHES) {
    this.redis = redisClient;
    this.dailyLimit = dailyLimit;
  }

  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
  }

  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  private statusFromCount(count: number): DeepResearchStatus {
    return {
      count,
      remaining: Math.max(0, this.dailyLimit - count),
      limit: this.dailyLimit,
      canResearch: count < this.dailyLimit,
    };
  }

  /**
   * Fail-closed status for the empty-userId / dead-Redis / error paths.
   * A blocked-open quota on the most expensive endpoint in the product is
   * worse than a false negative, so every failure mode here reports
   * `canResearch: false` rather than letting the request through.
   */
  private failClosedStatus(): DeepResearchStatus {
    return {
      count: this.dailyLimit,
      remaining: 0,
      limit: this.dailyLimit,
      canResearch: false,
    };
  }

  async checkLimit(userId: string): Promise<DeepResearchStatus> {
    if (!userId) {
      return this.failClosedStatus();
    }

    // A dead Redis connection doesn't reject — node-redis queues the command
    // and retries reconnecting forever, hanging the whole request. Checking
    // `=== false` (not `!this.redis.isReady`) matters because a client that
    // doesn't expose `isReady` at all (e.g. a minimal test double) must not
    // be treated as "not ready".
    if (this.redis.isReady === false) {
      console.error('[DeepResearchCounter] Redis not ready, failing closed');
      return this.failClosedStatus();
    }

    try {
      const today = this.getTodayDateString();
      const redisKey = `deep_research:${userId}:${today}`;

      const raw = await this.redis.get(redisKey);
      const count = parseInt(raw ?? '0') || 0;
      return this.statusFromCount(count);
    } catch (error) {
      console.error('[DeepResearchCounter] Error checking limit:', error);
      return this.failClosedStatus();
    }
  }

  async incrementCount(userId: string): Promise<DeepResearchResult> {
    if (!userId) {
      return { success: false, ...this.failClosedStatus() };
    }

    if (this.redis.isReady === false) {
      console.error('[DeepResearchCounter] Redis not ready, failing closed');
      return { success: false, ...this.failClosedStatus() };
    }

    try {
      const today = this.getTodayDateString();
      const redisKey = `deep_research:${userId}:${today}`;

      const currentStatus = await this.checkLimit(userId);
      if (!currentStatus.canResearch) {
        console.log(
          `[DeepResearchCounter] User ${userId} has no deep research left today (${currentStatus.count}/${currentStatus.limit})`
        );
        return { success: false, ...currentStatus };
      }

      const newCount = await this.redis.incr(redisKey);

      if (newCount === 1) {
        const ttlSeconds = this.getSecondsUntilMidnight();
        await this.redis.expire(redisKey, ttlSeconds);
        console.log(
          `[DeepResearchCounter] Set TTL for user ${userId}: ${ttlSeconds} seconds until midnight`
        );
      }

      const status = this.statusFromCount(newCount);
      console.log(
        `[DeepResearchCounter] User ${userId}: +1 deep research, total ${status.count}/${status.limit}`
      );

      return { success: true, ...status };
    } catch (error) {
      console.error('[DeepResearchCounter] Error incrementing count:', error);
      return { success: false, ...this.failClosedStatus() };
    }
  }

  getTimeUntilReset(): string {
    const secondsUntilMidnight = this.getSecondsUntilMidnight();
    const hours = Math.floor(secondsUntilMidnight / 3600);
    const minutes = Math.floor((secondsUntilMidnight % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}

// Deliberately no default export, unlike ImageGenerationCounter: that one carries
// one only for call sites predating the barrel. A second name for the same class
// is a second thing to keep in sync, for no gain.
