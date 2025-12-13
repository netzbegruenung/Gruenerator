/**
 * Privacy Mode Counter Utility
 * Manages Redis-based request counting for privacy mode provider selection
 */

class PrivacyCounter {
  constructor(redisClient) {
    this.redis = redisClient;
    this.TTL_HOURS = 24; // 24-hour window for counter reset
  }

  /**
   * Get the appropriate provider for privacy mode
   * @param {string} userId - User ID for tracking
   * @returns {Promise<string>} Provider name (always 'litellm', ionos fallback handled by aiWorker)
   */
  async getProviderForUser(userId) {
    if (!userId) {
      console.warn('[PrivacyCounter] No userId provided, defaulting to litellm');
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
      
      console.log(`[PrivacyCounter] User ${userId}: Request #${count}, using provider: ${provider}`);
      
      return provider;
      
    } catch (error) {
      console.error('[PrivacyCounter] Redis error:', error);
      // Fallback to litellm on any error - ionos fallback happens in aiWorker on failure
      return 'litellm';
    }
  }

  /**
   * Get current request count for a user (for debugging/monitoring)
   * @param {string} userId - User ID
   * @returns {Promise<number>} Current count or 0 if not found
   */
  async getCurrentCount(userId) {
    if (!userId) return 0;
    
    try {
      const redisKey = `privacy_mode:${userId}:counter`;
      const count = await this.redis.get(redisKey);
      return parseInt(count) || 0;
    } catch (error) {
      console.error('[PrivacyCounter] Error getting count:', error);
      return 0;
    }
  }

  /**
   * Reset counter for a user (useful for testing)
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async resetUserCounter(userId) {
    if (!userId) return false;
    
    try {
      const redisKey = `privacy_mode:${userId}:counter`;
      await this.redis.del(redisKey);
      console.log(`[PrivacyCounter] Reset counter for user ${userId}`);
      return true;
    } catch (error) {
      console.error('[PrivacyCounter] Error resetting counter:', error);
      return false;
    }
  }
}

module.exports = PrivacyCounter;