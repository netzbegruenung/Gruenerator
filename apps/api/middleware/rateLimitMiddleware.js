/**
 * Rate Limiting Middleware
 * Express middleware for universal rate limiting across all resource types
 *
 * Usage:
 * ```javascript
 * import { rateLimitMiddleware, incrementRateLimit } from './middleware/rateLimitMiddleware.js';
 *
 * router.post('/api/text/generate',
 *   rateLimitMiddleware('text'),  // One line adds rate limiting!
 *   async (req, res) => {
 *     // ... do generation
 *     await incrementRateLimit(req);  // Increment after success
 *     res.json({ result });
 *   }
 * );
 * ```
 */

import RateLimiter from '../utils/RateLimiter.js';
import rateLimitConfig from '../config/rateLimits.js';
import redisClient from '../utils/redisClient.js';

// Create singleton instance
const rateLimiter = new RateLimiter(redisClient, rateLimitConfig);

/**
 * Create rate limit middleware for a specific resource type
 *
 * @param {string} resourceType - Type of resource ('text', 'image', 'pdf_export', etc.)
 * @param {Object} options - Middleware options
 * @param {boolean} options.autoIncrement - Auto-increment on success (default: false)
 * @param {boolean} options.soft - Soft limit (warn but allow, default: false)
 * @returns {Function} Express middleware function
 *
 * @example
 * // Hard limit (default): Block request if limit reached
 * router.post('/generate', rateLimitMiddleware('text'), handler);
 *
 * // Soft limit: Allow request but include warning
 * router.post('/generate', rateLimitMiddleware('text', { soft: true }), handler);
 *
 * // Auto-increment: Automatically increment after handler completes successfully
 * router.post('/generate', rateLimitMiddleware('text', { autoIncrement: true }), handler);
 */
function rateLimitMiddleware(resourceType, options = {}) {
  const {
    autoIncrement = false,
    soft = false
  } = options;

  return async (req, res, next) => {
    try {
      // Determine user type and identifier
      const userType = rateLimiter.getUserType(req);
      const identifier = rateLimiter.getIdentifier(req, userType);

      // Check current rate limit status
      const status = await rateLimiter.checkLimit(resourceType, identifier, userType);

      // Log rate limit check
      if (!status.unlimited && !status.error) {
        console.log(`[RateLimit] ${resourceType} check for ${userType} ${identifier}: ${status.count}/${status.limit} used, ${status.remaining} remaining`);
      }

      // Handle limit exceeded (hard limit)
      if (!status.canGenerate && !status.unlimited && !soft) {
        console.warn(`[RateLimit] Blocked ${resourceType} request: ${userType} ${identifier} exceeded limit (${status.count}/${status.limit})`);

        return res.status(429).json({
          success: false,
          error: `Rate limit exceeded for ${resourceType} generation`,
          message: userType === 'anonymous'
            ? `Du hast dein Tageslimit von ${status.limit} kostenlosen Generierungen erreicht. Melde dich an für unbegrenzte Nutzung.`
            : `Du hast dein Tageslimit von ${status.limit} Generierungen erreicht. Das Limit wird um Mitternacht zurückgesetzt.`,
          requiresLogin: userType === 'anonymous',
          rateLimitStatus: {
            ...status,
            timeUntilReset: rateLimiter.getTimeUntilReset(status.window)
          }
        });
      }

      // Handle soft limit (warn but allow)
      if (!status.canGenerate && !status.unlimited && soft) {
        console.warn(`[RateLimit] Soft limit warning for ${resourceType}: ${userType} ${identifier} exceeded limit but allowed`);
        req.rateLimitWarning = {
          message: 'Rate limit exceeded but request allowed (soft limit)',
          ...status
        };
      }

      // Attach rate limit context to request
      // This allows routes to increment the counter after successful generation
      req.rateLimitContext = {
        resourceType,
        identifier,
        userType,
        shouldIncrement: autoIncrement,
        status
      };

      // If autoIncrement is enabled, wrap the response to increment on success
      if (autoIncrement) {
        const originalJson = res.json.bind(res);
        res.json = function(body) {
          // Only increment if response is successful (2xx status)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            incrementRateLimit(req).catch(err => {
              console.error('[RateLimit] Auto-increment failed:', err);
            });
          }
          return originalJson(body);
        };
      }

      next();
    } catch (error) {
      console.error(`[RateLimit] Middleware error for ${resourceType}:`, error);

      // On error, allow request but log (fail-open strategy)
      // This ensures rate limiting failures don't break the application
      req.rateLimitError = error;
      next();
    }
  };
}

/**
 * Helper function to increment rate limit after successful generation
 * Call this in your route handler after the resource has been successfully generated
 *
 * @param {Object} req - Express request object
 * @returns {Promise<Object|null>} Increment result or null if not applicable
 *
 * @example
 * router.post('/generate', rateLimitMiddleware('text'), async (req, res) => {
 *   const result = await generateText();
 *
 *   // Increment counter on success
 *   await incrementRateLimit(req);
 *
 *   res.json({ result });
 * });
 */
async function incrementRateLimit(req) {
  if (!req.rateLimitContext) {
    console.warn('[RateLimit] incrementRateLimit called without rateLimitContext');
    return null;
  }

  const { resourceType, identifier, userType } = req.rateLimitContext;

  try {
    const result = await rateLimiter.incrementCount(resourceType, identifier, userType);

    if (!result.success && !result.unlimited) {
      console.error(`[RateLimit] Failed to increment ${resourceType} for ${userType} ${identifier}:`, result);
    }

    return result;
  } catch (error) {
    console.error('[RateLimit] Error in incrementRateLimit:', error);
    return null;
  }
}

/**
 * Middleware to check rate limit and attach status without blocking
 * Useful for informational purposes (e.g., showing remaining count in UI)
 *
 * @param {string} resourceType - Type of resource
 * @returns {Function} Express middleware function
 */
function rateLimitInfo(resourceType) {
  return async (req, res, next) => {
    try {
      const userType = rateLimiter.getUserType(req);
      const identifier = rateLimiter.getIdentifier(req, userType);
      const status = await rateLimiter.checkLimit(resourceType, identifier, userType);

      req.rateLimitInfo = status;
    } catch (error) {
      console.error('[RateLimit] Info middleware error:', error);
    }

    next();
  };
}

// Export singleton instance for direct use if needed
export { rateLimitMiddleware, incrementRateLimit, rateLimitInfo, rateLimiter };