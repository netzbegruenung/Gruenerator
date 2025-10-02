/**
 * Rate Limit Status API Routes
 * Provides endpoints for checking rate limit status for any resource type
 * Works for both authenticated and anonymous users
 *
 * Endpoints:
 * - GET /api/rate-limit/:resourceType - Get status for a specific resource
 * - POST /api/rate-limit/bulk - Get status for multiple resources at once
 * - POST /api/rate-limit/reset/:resourceType - Reset counter (admin/dev only)
 */

const express = require('express');
const { rateLimiter } = require('../middleware/rateLimitMiddleware');

const router = express.Router();

/**
 * GET /api/rate-limit/:resourceType
 * Get current rate limit status for a specific resource type
 *
 * @param {string} resourceType - Type of resource (text, image, pdf_export, etc.)
 * @returns {Object} Rate limit status with remaining count and time until reset
 *
 * @example
 * GET /api/rate-limit/text
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "count": 3,
 *     "limit": 5,
 *     "remaining": 2,
 *     "canGenerate": true,
 *     "unlimited": false,
 *     "resourceType": "text",
 *     "userType": "anonymous",
 *     "window": "daily",
 *     "timeUntilReset": "18h 23m"
 *   }
 * }
 */
router.get('/:resourceType', async (req, res) => {
  try {
    const { resourceType } = req.params;

    // Validate resource type
    if (!resourceType || typeof resourceType !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Invalid resource type'
      });
    }

    // Get user type and identifier
    const userType = rateLimiter.getUserType(req);
    const identifier = rateLimiter.getIdentifier(req, userType);

    // Check rate limit status
    const status = await rateLimiter.checkLimit(resourceType, identifier, userType);

    // Add time until reset for display
    const timeUntilReset = status.window
      ? rateLimiter.getTimeUntilReset(status.window)
      : null;

    return res.json({
      success: true,
      data: {
        ...status,
        timeUntilReset
      }
    });
  } catch (error) {
    console.error('[RateLimitAPI] Error getting status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get rate limit status'
    });
  }
});

/**
 * POST /api/rate-limit/bulk
 * Get rate limit status for multiple resource types at once
 * Useful for dashboard views or multi-resource pages
 *
 * @body {string[]} resourceTypes - Array of resource types to check
 * @returns {Object} Map of resource types to their status
 *
 * @example
 * POST /api/rate-limit/bulk
 * Body: { "resourceTypes": ["text", "image", "pdf_export"] }
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "text": { count: 3, limit: 5, ... },
 *     "image": { count: 0, limit: 5, ... },
 *     "pdf_export": { count: 1, limit: 2, ... }
 *   }
 * }
 */
router.post('/bulk', async (req, res) => {
  try {
    const { resourceTypes } = req.body;

    // Validate input
    if (!Array.isArray(resourceTypes) || resourceTypes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'resourceTypes must be a non-empty array'
      });
    }

    if (resourceTypes.length > 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 10 resource types per bulk request'
      });
    }

    // Get user type and identifier
    const userType = rateLimiter.getUserType(req);
    const identifier = rateLimiter.getIdentifier(req, userType);

    // Check status for all requested resources
    const results = {};

    for (const resourceType of resourceTypes) {
      if (typeof resourceType !== 'string') {
        console.warn(`[RateLimitAPI] Skipping invalid resource type: ${resourceType}`);
        continue;
      }

      const status = await rateLimiter.checkLimit(resourceType, identifier, userType);
      const timeUntilReset = status.window
        ? rateLimiter.getTimeUntilReset(status.window)
        : null;

      results[resourceType] = {
        ...status,
        timeUntilReset
      };
    }

    return res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('[RateLimitAPI] Error in bulk status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get bulk rate limit status'
    });
  }
});

/**
 * POST /api/rate-limit/reset/:resourceType
 * Reset rate limit counter for current user (admin/testing)
 *
 * @param {string} resourceType - Type of resource to reset
 * @returns {Object} Success status
 *
 * @example
 * POST /api/rate-limit/reset/text
 * Response: { "success": true, "message": "Counter reset successfully" }
 */
router.post('/reset/:resourceType', async (req, res) => {
  try {
    const { resourceType } = req.params;

    // Get user type and identifier
    const userType = rateLimiter.getUserType(req);
    const identifier = rateLimiter.getIdentifier(req, userType);

    // In production, you might want to restrict this to admins only
    // For now, allow users to reset their own counters
    if (process.env.NODE_ENV === 'production' && userType === 'anonymous') {
      return res.status(403).json({
        success: false,
        error: 'Anonymous users cannot reset counters in production'
      });
    }

    // Get the window for this resource
    const limitConfig = rateLimiter.getLimitConfig(resourceType, userType);
    const window = limitConfig?.window || 'daily';

    // Reset counter
    const success = await rateLimiter.resetUserCounter(resourceType, identifier, window);

    if (success) {
      return res.json({
        success: true,
        message: `Counter reset successfully for ${resourceType}`
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Failed to reset counter'
      });
    }
  } catch (error) {
    console.error('[RateLimitAPI] Error resetting counter:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reset counter'
    });
  }
});

/**
 * GET /api/rate-limit/config/:resourceType (optional - for debugging)
 * Get rate limit configuration for a resource type
 * Only available in development mode
 */
if (process.env.NODE_ENV === 'development') {
  router.get('/config/:resourceType', (req, res) => {
    const { resourceType } = req.params;
    const userType = rateLimiter.getUserType(req);
    const config = rateLimiter.getLimitConfig(resourceType, userType);

    res.json({
      success: true,
      data: {
        resourceType,
        userType,
        config: config || 'No configuration found',
        allConfigs: rateLimiter.config.resources[resourceType]
      }
    });
  });
}

module.exports = router;
