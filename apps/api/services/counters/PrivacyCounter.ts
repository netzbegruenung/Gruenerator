/**
 * Privacy Mode Counter
 * Manages Redis-based request counting for privacy mode provider selection
 */

import { createLogger } from '../../utils/logger.js';

import type { RedisClient } from './types.js';

const log = createLogger('PrivacyCounter');

export class PrivacyCounter {
  private redis: RedisClient;
  private TTL_HOURS = 24; // 24-hour window for counter reset

  constructor(redisClient: RedisClient) {
    this.redis = redisClient;
  }

  /**
   * Get the appropriate provider for privacy mode
   * Always returns 'litellm' - ionos fallback is handled by aiWorker on failure
   */
  async getProviderForUser(userId: string): Promise<string> {
    if (!userId) {
      log.warn('[PrivacyCounter] No userId provided, defaulting to litellm');
      return 'litellm';
    }

    try {
      const redisKey = `privacy_mode:${userId}:counter`;

      // Increment counter atomically
      const count = await this.redis.incr(redisKey);

      // Set TTL only on first request (when count becomes 1)
      if (count === 1) {
        await this.redis.expire(redisKey, this.TTL_HOURS * 3600);
      }

      // Always use litellm for privacy mode - ionos is fallback on error only
      const provider = 'litellm';

      log.debug(`[PrivacyCounter] User ${userId}: Request #${count}, using provider: ${provider}`);

      return provider;
    } catch (error) {
      log.error('[PrivacyCounter] Redis error:', { error });
      // Fallback to litellm on any error - ionos fallback happens in aiWorker on failure
      return 'litellm';
    }
  }

  /**
   * Get current request count for a user (for debugging/monitoring)
   */
  async getCurrentCount(userId: string): Promise<number> {
    if (!userId) return 0;

    try {
      const redisKey = `privacy_mode:${userId}:counter`;
      const countResult = await this.redis.get(redisKey);
      const count = typeof countResult === 'string' ? countResult : null;
      return parseInt(count || '0') || 0;
    } catch (error) {
      log.error('[PrivacyCounter] Error getting count:', { error });
      return 0;
    }
  }

  /**
   * Reset counter for a user (useful for testing)
   */
  async resetUserCounter(userId: string): Promise<boolean> {
    if (!userId) return false;

    try {
      const redisKey = `privacy_mode:${userId}:counter`;
      await this.redis.del(redisKey);
      log.debug(`[PrivacyCounter] Reset counter for user ${userId}`);
      return true;
    } catch (error) {
      log.error('[PrivacyCounter] Error resetting counter:', { error });
      return false;
    }
  }
}

export default PrivacyCounter;
