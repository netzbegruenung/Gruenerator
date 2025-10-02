/**
 * Universal Rate Limiter
 * Manages rate limiting for ANY resource type with ANY user tier
 * Replaces the old imageGenerationCounter with a universal, config-driven approach
 *
 * Features:
 * - Configuration-driven (no hardcoded limits)
 * - Works for authenticated and anonymous users
 * - Smart identifier resolution (sessionID → IP fallback)
 * - Supports multiple time windows (daily, hourly, monthly)
 * - Optional analytics tracking
 * - Handles Redis errors gracefully
 *
 * @example
 * const limiter = new RateLimiter(redisClient, config);
 * const status = await limiter.checkLimit('text', userId, 'authenticated');
 * if (status.canGenerate) {
 *   await limiter.incrementCount('text', userId, 'authenticated');
 * }
 */

class RateLimiter {
  constructor(redisClient, config) {
    this.redis = redisClient;
    this.config = config;
  }

  /**
   * Get identifier for rate limiting
   * For authenticated users: use user ID
   * For anonymous users: try sessionID, fall back to IP
   *
   * @param {Object} req - Express request object
   * @param {string} userType - 'authenticated' or 'anonymous'
   * @returns {string} Identifier for rate limiting
   */
  getIdentifier(req, userType) {
    // Authenticated users always use their user ID
    if (userType === 'authenticated' && req.user?.id) {
      return `user:${req.user.id}`;
    }

    // For anonymous users, try strategies in order
    for (const strategy of this.config.anonymousIdentifierStrategy) {
      if (strategy === 'sessionID' && req.sessionID) {
        return `session:${req.sessionID}`;
      }
      if (strategy === 'ip') {
        const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim();
        if (ip) return `ip:${ip}`;
      }
    }

    // Fallback: use 'unknown' (will share quota across all unknown users - not ideal)
    console.warn('[RateLimiter] Could not determine identifier for anonymous user');
    return 'unknown';
  }

  /**
   * Automatically determine user type from request
   *
   * @param {Object} req - Express request object
   * @returns {string} User type ('authenticated' or 'anonymous')
   */
  getUserType(req) {
    if (req.user && req.user.id) return 'authenticated';
    // Future: Check for premium tier
    // if (req.user && req.user.tier === 'premium') return 'premium';
    return 'anonymous';
  }

  /**
   * Get limit configuration for resource and user type
   *
   * @param {string} resourceType - Type of resource (e.g., 'text', 'image')
   * @param {string} userType - User type ('authenticated', 'anonymous', 'premium')
   * @returns {Object|null} Limit config or null if not found
   */
  getLimitConfig(resourceType, userType) {
    return this.config.resources[resourceType]?.[userType] || null;
  }

  /**
   * Check current rate limit status for a resource
   *
   * @param {string} resourceType - Type of resource (e.g., 'text', 'image')
   * @param {string} identifier - User/session/IP identifier
   * @param {string} userType - User type
   * @returns {Promise<Object>} Rate limit status
   */
  async checkLimit(resourceType, identifier, userType = 'anonymous') {
    // Development override: disable rate limits
    if (process.env.NODE_ENV === 'development' && !this.config.development.enabled) {
      return { canGenerate: true, unlimited: true, development: true };
    }

    try {
      const limitConfig = this.getLimitConfig(resourceType, userType);

      // If no config exists for this resource, allow unlimited
      if (!limitConfig) {
        console.warn(`[RateLimiter] No limit config found for ${resourceType}:${userType}, allowing unlimited`);
        return { canGenerate: true, unlimited: true, resourceType, userType };
      }

      const { limit, window = 'daily' } = limitConfig;

      // Handle unlimited resources (Infinity)
      if (limit === Infinity || limit === Number.MAX_SAFE_INTEGER) {
        return {
          canGenerate: true,
          unlimited: true,
          resourceType,
          userType,
          window
        };
      }

      // Apply development multiplier if configured
      const effectiveLimit = process.env.NODE_ENV === 'development'
        ? limit * (this.config.development.multiplier || 1)
        : limit;

      // Get current count from Redis
      const redisKey = this.buildRedisKey(resourceType, identifier, window);
      const countStr = await this.redis.get(redisKey);
      const count = parseInt(countStr) || 0;

      const remaining = Math.max(0, effectiveLimit - count);
      const canGenerate = count < effectiveLimit;

      return {
        count,
        limit: effectiveLimit,
        remaining,
        canGenerate,
        unlimited: false,
        resourceType,
        userType,
        window,
        identifier
      };
    } catch (error) {
      console.error('[RateLimiter] Error checking limit:', error);

      // Fail-open strategy: if Redis is down, allow the request (configurable)
      if (this.config.allowOnRedisError) {
        console.warn('[RateLimiter] Redis error, allowing request (fail-open mode)');
        return { canGenerate: true, unlimited: true, error: true };
      }

      // Fail-closed strategy: if Redis is down, deny the request
      return { canGenerate: false, unlimited: false, error: true };
    }
  }

  /**
   * Increment counter after successful resource generation
   *
   * @param {string} resourceType - Type of resource
   * @param {string} identifier - User/session/IP identifier
   * @param {string} userType - User type
   * @returns {Promise<Object>} Updated rate limit status
   */
  async incrementCount(resourceType, identifier, userType = 'anonymous') {
    try {
      // Check limit first
      const status = await this.checkLimit(resourceType, identifier, userType);

      // Don't increment if unlimited
      if (status.unlimited) {
        return { success: true, unlimited: true, ...status };
      }

      // Don't increment if limit reached
      if (!status.canGenerate) {
        console.log(`[RateLimiter] Increment blocked: ${resourceType} limit reached for ${userType} ${identifier}`);
        return { success: false, limitReached: true, ...status };
      }

      // Increment counter atomically
      const redisKey = this.buildRedisKey(resourceType, identifier, status.window);
      const newCount = await this.redis.incr(redisKey);

      // Set TTL only on first request (when count becomes 1)
      if (newCount === 1) {
        const ttl = this.getTTLForWindow(status.window);
        await this.redis.expire(redisKey, ttl);
        console.log(`[RateLimiter] Set TTL for ${redisKey}: ${ttl}s (window: ${status.window})`);
      }

      const remaining = Math.max(0, status.limit - newCount);
      const canGenerate = newCount < status.limit;

      console.log(`[RateLimiter] ${resourceType} generation #${newCount}/${status.limit} for ${userType} ${identifier}, remaining: ${remaining}`);

      // Optional: Track analytics
      if (this.config.enableAnalytics) {
        await this.trackUsage(resourceType, userType, identifier);
      }

      return {
        success: true,
        count: newCount,
        limit: status.limit,
        remaining,
        canGenerate,
        resourceType,
        userType,
        window: status.window
      };
    } catch (error) {
      console.error('[RateLimiter] Error incrementing count:', error);
      return { success: false, error: true };
    }
  }

  /**
   * Build Redis key for rate limiting
   * Format: rate_limit:{resourceType}:{identifier}:{date}
   *
   * @param {string} resourceType - Type of resource
   * @param {string} identifier - User/session/IP identifier
   * @param {string} window - Time window
   * @returns {string} Redis key
   */
  buildRedisKey(resourceType, identifier, window) {
    const dateStr = this.getDateStringForWindow(window);
    return `${this.config.redisKeyPrefix}:${resourceType}:${identifier}:${dateStr}`;
  }

  /**
   * Get date string for time window
   *
   * @param {string} window - Time window ('daily', 'hourly', 'monthly')
   * @returns {string} Date string for Redis key
   */
  getDateStringForWindow(window) {
    const now = new Date();

    switch (window) {
      case 'hourly':
        return now.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      case 'monthly':
        return now.toISOString().slice(0, 7); // YYYY-MM
      case 'daily':
      default:
        return now.toISOString().slice(0, 10); // YYYY-MM-DD
    }
  }

  /**
   * Get TTL (time to live) in seconds for time window
   *
   * @param {string} window - Time window
   * @returns {number} TTL in seconds
   */
  getTTLForWindow(window) {
    switch (window) {
      case 'hourly':
        return 3600; // 1 hour
      case 'monthly':
        return this.getSecondsUntilNextMonth();
      case 'daily':
      default:
        return this.getSecondsUntilMidnight();
    }
  }

  /**
   * Get seconds until next midnight
   *
   * @returns {number} Seconds until midnight
   */
  getSecondsUntilMidnight() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return Math.floor((tomorrow - now) / 1000);
  }

  /**
   * Get seconds until next month
   *
   * @returns {number} Seconds until first day of next month
   */
  getSecondsUntilNextMonth() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return Math.floor((nextMonth - now) / 1000);
  }

  /**
   * Get human-readable time until reset
   *
   * @param {string} window - Time window
   * @returns {string} Human-readable time (e.g., "5h 23m")
   */
  getTimeUntilReset(window = 'daily') {
    const seconds = this.getTTLForWindow(window);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Track usage for analytics (optional)
   *
   * @param {string} resourceType - Type of resource
   * @param {string} userType - User type
   * @param {string} identifier - User identifier
   * @returns {Promise<void>}
   */
  async trackUsage(resourceType, userType, identifier) {
    try {
      const analyticsKey = `${this.config.redisKeyPrefix}:analytics:${resourceType}:${userType}:${this.getDateStringForWindow('daily')}`;
      await this.redis.incr(analyticsKey);
      await this.redis.expire(analyticsKey, 30 * 24 * 60 * 60); // Keep for 30 days
    } catch (error) {
      console.error('[RateLimiter] Error tracking analytics:', error);
      // Don't fail the request if analytics fail
    }
  }

  /**
   * Reset counter for a user (admin/testing)
   *
   * @param {string} resourceType - Type of resource
   * @param {string} identifier - User identifier
   * @param {string} window - Time window
   * @returns {Promise<boolean>} Success status
   */
  async resetUserCounter(resourceType, identifier, window = 'daily') {
    try {
      const redisKey = this.buildRedisKey(resourceType, identifier, window);
      await this.redis.del(redisKey);
      console.log(`[RateLimiter] Reset counter for ${resourceType}:${identifier}`);
      return true;
    } catch (error) {
      console.error('[RateLimiter] Error resetting counter:', error);
      return false;
    }
  }

  /**
   * Get remaining generations for display
   *
   * @param {string} resourceType - Type of resource
   * @param {string} identifier - User identifier
   * @param {string} userType - User type
   * @returns {Promise<number>} Remaining generations
   */
  async getRemainingGenerations(resourceType, identifier, userType = 'anonymous') {
    const status = await this.checkLimit(resourceType, identifier, userType);
    return status.unlimited ? Infinity : status.remaining;
  }
}

module.exports = RateLimiter;
