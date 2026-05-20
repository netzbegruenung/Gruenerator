/**
 * Image Generation Counter
 *
 * Tracks daily image-generation usage per user in Redis. Internally the
 * counter stores **centi-credits** (1/100 of an image) so per-model cost
 * multipliers (e.g. flux-klein = 0.5×, flux-max = 2×) can be represented
 * as integers (50 / 100 / 200) — keeping Redis INCRBY arithmetic precise.
 * Public API still speaks in image units (count / remaining / limit are
 * fractional images).
 */

import type { RedisIncrByClient, ImageGenerationStatus, ImageGenerationResult } from './types.js';

const UNITS_PER_IMAGE = 100;
const DEFAULT_DAILY_IMAGES = 10;

export class ImageGenerationCounter {
  private redis: RedisIncrByClient;
  private dailyLimitUnits = DEFAULT_DAILY_IMAGES * UNITS_PER_IMAGE;

  constructor(redisClient: RedisIncrByClient) {
    this.redis = redisClient;
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

  private toImageUnits(centiCredits: number): number {
    return Math.round((centiCredits / UNITS_PER_IMAGE) * 10) / 10;
  }

  private statusFromUnits(rawUnits: number): ImageGenerationStatus {
    const limit = this.dailyLimitUnits / UNITS_PER_IMAGE;
    const remaining = Math.max(0, this.toImageUnits(this.dailyLimitUnits - rawUnits));
    return {
      count: this.toImageUnits(rawUnits),
      remaining,
      limit,
      canGenerate: rawUnits < this.dailyLimitUnits,
    };
  }

  async checkLimit(userId: string): Promise<ImageGenerationStatus> {
    if (!userId) {
      return {
        count: 0,
        remaining: 0,
        limit: this.dailyLimitUnits / UNITS_PER_IMAGE,
        canGenerate: false,
      };
    }

    try {
      const today = this.getTodayDateString();
      const redisKey = `image_generation:${userId}:${today}`;

      const raw = await this.redis.get(redisKey);
      const rawUnits = parseInt(raw ?? '0') || 0;
      return this.statusFromUnits(rawUnits);
    } catch (error) {
      console.error('[ImageGenerationCounter] Error checking limit:', error);
      return {
        count: this.dailyLimitUnits / UNITS_PER_IMAGE,
        remaining: 0,
        limit: this.dailyLimitUnits / UNITS_PER_IMAGE,
        canGenerate: false,
      };
    }
  }

  /**
   * Increment the user's daily counter by `costUnits` centi-credits.
   * Default of 100 (= 1 image) preserves legacy call-sites that don't yet
   * pass a model-specific cost.
   */
  async incrementCount(
    userId: string,
    costUnits: number = UNITS_PER_IMAGE
  ): Promise<ImageGenerationResult> {
    if (!userId) {
      return {
        success: false,
        count: 0,
        remaining: 0,
        limit: this.dailyLimitUnits / UNITS_PER_IMAGE,
        canGenerate: false,
      };
    }

    const units = Math.max(1, Math.round(costUnits));

    try {
      const today = this.getTodayDateString();
      const redisKey = `image_generation:${userId}:${today}`;

      const currentStatus = await this.checkLimit(userId);
      const currentRawUnits = Math.round(currentStatus.count * UNITS_PER_IMAGE);
      if (currentRawUnits + units > this.dailyLimitUnits) {
        console.log(
          `[ImageGenerationCounter] User ${userId} cannot afford ${units} units (have ${this.dailyLimitUnits - currentRawUnits} left of ${this.dailyLimitUnits})`
        );
        return { success: false, ...currentStatus };
      }

      const newRawUnits = await this.redis.incrBy(redisKey, units);

      if (newRawUnits === units) {
        const ttlSeconds = this.getSecondsUntilMidnight();
        await this.redis.expire(redisKey, ttlSeconds);
        console.log(
          `[ImageGenerationCounter] Set TTL for user ${userId}: ${ttlSeconds} seconds until midnight`
        );
      }

      const status = this.statusFromUnits(newRawUnits);
      console.log(
        `[ImageGenerationCounter] User ${userId}: +${units} units (${this.toImageUnits(units)} image), total ${status.count}/${status.limit}`
      );

      return { success: true, ...status };
    } catch (error) {
      console.error('[ImageGenerationCounter] Error incrementing count:', error);
      return {
        success: false,
        count: 0,
        remaining: 0,
        limit: this.dailyLimitUnits / UNITS_PER_IMAGE,
        canGenerate: false,
      };
    }
  }

  async getRemainingGenerations(userId: string): Promise<number> {
    const status = await this.checkLimit(userId);
    return status.remaining;
  }

  async resetUserCounter(userId: string): Promise<boolean> {
    if (!userId) return false;

    try {
      const today = this.getTodayDateString();
      const redisKey = `image_generation:${userId}:${today}`;
      await this.redis.del(redisKey);
      console.log(`[ImageGenerationCounter] Reset counter for user ${userId}`);
      return true;
    } catch (error) {
      console.error('[ImageGenerationCounter] Error resetting counter:', error);
      return false;
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

export default ImageGenerationCounter;
