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

import type { RedisClient, RateLimiterConfig, RateLimitStatus, RateLimitIncrementResult, RequestWithUser, ResourceLimitConfig } from './types.js';

class RateLimiter {
  private redis: RedisClient;
  private config: RateLimiterConfig;

  constructor(redisClient: RedisClient, config: RateLimiterConfig) {
    this.redis = redisClient;
    this.config = config;
  }

  /**
   * Get identifier for rate limiting
   * For authenticated users: use user ID
   * For anonymous users: try sessionID, fall back to IP
   */
  getIdentifier(req: RequestWithUser, userType: string): string {
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
        const forwardedFor = req.headers['x-forwarded-for'];
        const forwardedIp = Array.isArray(forwardedFor)
          ? forwardedFor[0]
          : forwardedFor?.split(',')[0]?.trim();
        const ip = req.ip || forwardedIp;
        if (ip) return `ip:${ip}`;
      }
    }

    // Fallback: use 'unknown' (will share quota across all unknown users - not ideal)
    console.warn('[RateLimiter] Could not determine identifier for anonymous user');
    return 'unknown';
  }

  /**
   * Automatically determine user type from request
   */
  getUserType(req: RequestWithUser): string {
    if (req.user && req.user.id) return 'authenticated';
    // Future: Check for premium tier
    // if (req.user && req.user.tier === 'premium') return 'premium';
    return 'anonymous';
  }

  /**
   * Get limit configuration for resource and user type
   */
  getLimitConfig(resourceType: string, userType: string): ResourceLimitConfig | null {
    return this.config.resources[resourceType]?.[userType] || null;
  }

  /**
   * Check current rate limit status for a resource
   */
  async checkLimit(resourceType: string, identifier: string, userType: string = 'anonymous'): Promise<RateLimitStatus> {
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
      const count = (countStr && typeof countStr === 'string') ? parseInt(countStr) || 0 : 0;

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
   */
  async incrementCount(resourceType: string, identifier: string, userType: string = 'anonymous'): Promise<RateLimitIncrementResult> {
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
      const redisKey = this.buildRedisKey(resourceType, identifier, status.window!);
      const newCount = await this.redis.incr(redisKey);

      // Set TTL only on first request (when count becomes 1)
      if (newCount === 1) {
        const ttl = this.getTTLForWindow(status.window!);
        await this.redis.expire(redisKey, ttl);
        console.log(`[RateLimiter] Set TTL for ${redisKey}: ${ttl}s (window: ${status.window})`);
      }

      const remaining = Math.max(0, status.limit! - newCount);
      const canGenerate = newCount < status.limit!;

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
   */
  private buildRedisKey(resourceType: string, identifier: string, window: string): string {
    const dateStr = this.getDateStringForWindow(window);
    return `${this.config.redisKeyPrefix}:${resourceType}:${identifier}:${dateStr}`;
  }

  /**
   * Get date string for time window
   */
  private getDateStringForWindow(window: string): string {
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
   */
  private getTTLForWindow(window: string): number {
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
   */
  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return Math.floor((tomorrow.getTime() - now.getTime()) / 1000);
  }

  /**
   * Get seconds until next month
   */
  private getSecondsUntilNextMonth(): number {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    return Math.floor((nextMonth.getTime() - now.getTime()) / 1000);
  }

  /**
   * Get human-readable time until reset
   */
  getTimeUntilReset(window: string = 'daily'): string {
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
   */
  private async trackUsage(resourceType: string, userType: string, identifier: string): Promise<void> {
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
   */
  async resetUserCounter(resourceType: string, identifier: string, window: string = 'daily'): Promise<boolean> {
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
   */
  async getRemainingGenerations(resourceType: string, identifier: string, userType: string = 'anonymous'): Promise<number> {
    const status = await this.checkLimit(resourceType, identifier, userType);
    return status.unlimited ? Infinity : status.remaining || 0;
  }
}

export default RateLimiter;

// Named export for modern imports
export { RateLimiter };
