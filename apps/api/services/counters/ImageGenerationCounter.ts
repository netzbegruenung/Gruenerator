/**
 * Image Generation Counter
 * Manages Redis-based daily limits for image generation per user
 */

import type { RedisClient, ImageGenerationStatus, ImageGenerationResult } from './types.js';

export class ImageGenerationCounter {
  private redis: RedisClient;
  private DAILY_LIMIT = 10; // Maximum images per day per user

  constructor(redisClient: RedisClient) {
    this.redis = redisClient;
  }

  /**
   * Get seconds until next midnight (for TTL)
   */
  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
  }

  /**
   * Get today's date string for Redis key
   */
  private getTodayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Check current count and remaining generations for user
   */
  async checkLimit(userId: string): Promise<ImageGenerationStatus> {
    if (!userId) {
      return { count: 0, remaining: 0, limit: this.DAILY_LIMIT, canGenerate: false };
    }

    try {
      const today = this.getTodayDateString();
      const redisKey = `image_generation:${userId}:${today}`;

      const count = await this.redis.get(redisKey);
      const currentCount = parseInt(count || '0') || 0;
      const remaining = Math.max(0, this.DAILY_LIMIT - currentCount);
      const canGenerate = remaining > 0;

      return {
        count: currentCount,
        remaining,
        limit: this.DAILY_LIMIT,
        canGenerate
      };
    } catch (error) {
      console.error('[ImageGenerationCounter] Error checking limit:', error);
      // On error, deny generation to be safe
      return { count: this.DAILY_LIMIT, remaining: 0, limit: this.DAILY_LIMIT, canGenerate: false };
    }
  }

  /**
   * Increment counter for user and return new status
   */
  async incrementCount(userId: string): Promise<ImageGenerationResult> {
    if (!userId) {
      return { success: false, count: 0, remaining: 0, limit: this.DAILY_LIMIT, canGenerate: false };
    }

    try {
      const today = this.getTodayDateString();
      const redisKey = `image_generation:${userId}:${today}`;

      // Check current limit before incrementing
      const currentStatus = await this.checkLimit(userId);
      if (!currentStatus.canGenerate) {
        console.log(
          `[ImageGenerationCounter] User ${userId} has reached daily limit (${currentStatus.count}/${this.DAILY_LIMIT})`
        );
        return { success: false, ...currentStatus };
      }

      // Increment counter atomically
      const newCount = await this.redis.incr(redisKey);

      // Set TTL only on first request (when count becomes 1)
      if (newCount === 1) {
        const ttlSeconds = this.getSecondsUntilMidnight();
        await this.redis.expire(redisKey, ttlSeconds);
        console.log(
          `[ImageGenerationCounter] Set TTL for user ${userId}: ${ttlSeconds} seconds until midnight`
        );
      }

      const remaining = Math.max(0, this.DAILY_LIMIT - newCount);
      const canGenerate = remaining > 0;

      console.log(
        `[ImageGenerationCounter] User ${userId}: Image #${newCount}/${this.DAILY_LIMIT}, remaining: ${remaining}`
      );

      return {
        success: true,
        count: newCount,
        remaining,
        limit: this.DAILY_LIMIT,
        canGenerate
      };
    } catch (error) {
      console.error('[ImageGenerationCounter] Error incrementing count:', error);
      return { success: false, count: 0, remaining: 0, limit: this.DAILY_LIMIT, canGenerate: false };
    }
  }

  /**
   * Get remaining generations for user
   */
  async getRemainingGenerations(userId: string): Promise<number> {
    const status = await this.checkLimit(userId);
    return status.remaining;
  }

  /**
   * Reset counter for a user (useful for testing/admin)
   */
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

  /**
   * Get time until reset (for UI display)
   */
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
